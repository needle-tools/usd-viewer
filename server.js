const fastify = require('fastify')()
const path = require('path') 

// Headers are required for SharedArrayBuffers and WebAssembly
// Otherwise we wouldn't need a server at all.

function setHeaders(res, path, stat) {

  const normalizedPath = path.replaceAll("\\", '/');
  const needsHeaders = normalizedPath.includes('/emHd') ||
    normalizedPath.includes('/materialx/') ||
    normalizedPath.includes('/needle-engine/') ||
    path.endsWith('index.html');
  if (!needsHeaders) return;

  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
}

// ---------------------------------------------------------------------------
// Same-origin proxy for Rybbit analytics (analytics-2.needle.tools).
//
// index.html is served with COEP: require-corp (mandatory for SharedArrayBuffer,
// which the USD WASM runtime needs). Under that policy the browser blocks any
// cross-origin subresource that doesn't return Cross-Origin-Resource-Policy —
// and the Rybbit endpoint does not send it. Rather than weaken COEP (which would
// break SharedArrayBuffer on Safari), we proxy Rybbit through this origin so the
// script and its event beacons are same-origin and CORP no longer applies.
//
// The Rybbit script derives its API base from its own <script src> by splitting
// on "/script.js", then calls "<base>/track", "<base>/identify",
// "<base>/site/tracking-config/<id>", etc. Serving the script at /api/script.js
// keeps every one of those calls under /api/* on this origin, so the single
// wildcard proxy below forwards all of them.
const RYBBIT_ORIGIN = "https://analytics-2.needle.tools";

// This server has no other body-consuming routes, so treat every request body
// as a raw Buffer and forward it verbatim — avoids re-serializing JSON beacons
// (and handles sendBeacon's text/plain content type) without mangling them.
fastify.removeAllContentTypeParsers();
fastify.addContentTypeParser("*", { parseAs: "buffer" }, (req, body, done) => done(null, body));

async function proxyToRybbit(request, reply) {
  // request.url is the full path + query (e.g. "/api/track?...") — forward as-is.
  const target = RYBBIT_ORIGIN + request.url;

  const headers = {};
  for (const h of ["content-type", "user-agent", "accept", "accept-language"]) {
    if (request.headers[h]) headers[h] = request.headers[h];
  }
  // Preserve the real client IP so Rybbit attributes / geolocates correctly.
  const fwd = request.headers["x-forwarded-for"];
  headers["x-forwarded-for"] = fwd ? `${fwd}, ${request.ip}` : request.ip;

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  let upstream;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
    });
  } catch (err) {
    // Analytics must never break the viewer: surface the failure in the log but
    // respond softly so the client script just sees an empty success.
    request.log.warn({ err: err && err.message, target }, "Rybbit proxy upstream failed");
    return reply.code(204).send();
  }

  reply.code(upstream.status);
  for (const h of ["content-type", "cache-control"]) {
    const v = upstream.headers.get(h);
    if (v) reply.header(h, v);
  }
  return reply.send(Buffer.from(await upstream.arrayBuffer()));
}

// ---------------------------------------------------------------------------
// Feedback → Discord webhook.
//
// A small "Feedback" dialog in the viewer POSTs here; we forward the message to
// a Discord channel via an incoming webhook. The webhook URL is a SECRET and
// must never reach the client — it lives only in this env var, set in the
// deployment environment (Coolify / Glitch):
//
//   DISCORD_FEEDBACK_WEBHOOK_URL=https://discord.com/api/webhooks/<id>/<token>
//
// This endpoint is public and unauthenticated, so it is guarded against
// drive-by spam with: a hidden honeypot field, per-IP rate limiting, and
// length caps on every field. Being a static route, Fastify's router matches it
// with higher priority than the "/api/*" wildcard proxy (registered just below),
// regardless of registration order — so feedback never hits the Rybbit proxy.
const DISCORD_FEEDBACK_WEBHOOK_URL = process.env.DISCORD_FEEDBACK_WEBHOOK_URL;

// Field length caps. Message stays under Discord's 4096-char embed-description
// limit; the rest under the 1024-char embed-field-value limit (with margin).
const MAX_MESSAGE = 4000;
const MAX_EMAIL = 320;
const MAX_PAGE_URL = 1000;
const MAX_FILE = 500;
const MAX_USER_AGENT = 400;

// Per-IP sliding-window rate limit: at most N submissions per window.
const FEEDBACK_RATE_LIMIT = 5;
const FEEDBACK_RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
// ip -> array of submission timestamps (ms) within the current window.
const feedbackHits = new Map();

// The real client IP. request.ip is the socket peer (the proxy/CDN in
// production), so for rate limiting we prefer the forwarded client address.
// Cloudflare sets cf-connecting-ip; otherwise take the left-most x-forwarded-for
// entry (the original client), falling back to the socket address.
function clientIp(request) {
  const cf = request.headers["cf-connecting-ip"];
  if (cf) return String(cf).trim();
  const fwd = request.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return request.ip;
}

// Returns true if `ip` is allowed to submit now; records the hit when it is.
function rateLimitOk(ip) {
  const now = Date.now();
  const cutoff = now - FEEDBACK_RATE_WINDOW_MS;
  const hits = (feedbackHits.get(ip) || []).filter((t) => t > cutoff);
  if (hits.length >= FEEDBACK_RATE_LIMIT) {
    feedbackHits.set(ip, hits); // persist the pruned list
    return false;
  }
  hits.push(now);
  feedbackHits.set(ip, hits);
  // Opportunistic sweep so the map can't grow unbounded across many IPs.
  if (feedbackHits.size > 5000) {
    for (const [k, v] of feedbackHits) {
      if (!v.some((t) => t > cutoff)) feedbackHits.delete(k);
    }
  }
  return true;
}

// Coerce to a trimmed string and hard-cap its length.
function clip(value, max) {
  if (typeof value !== "string") return "";
  const s = value.trim();
  return s.length > max ? s.slice(0, max) : s;
}

fastify.post("/api/feedback", async (request, reply) => {
  // Not configured → surface it clearly instead of silently doing nothing.
  if (!DISCORD_FEEDBACK_WEBHOOK_URL) {
    request.log.error("Feedback received but DISCORD_FEEDBACK_WEBHOOK_URL is not set");
    return reply.code(503).send({ error: "Feedback is not configured on this server." });
  }

  // The global "*" content-type parser hands us the raw body as a Buffer.
  let payload;
  try {
    payload = JSON.parse(request.body ? request.body.toString("utf8") : "{}");
  } catch {
    return reply.code(400).send({ error: "Invalid request body." });
  }

  // Honeypot: a hidden field no human ever fills. If it has content, it's a bot.
  // Pretend success (200) so the bot doesn't learn it was filtered — but don't
  // post to Discord.
  if (clip(payload.website, 200)) {
    request.log.warn({ ip: clientIp(request) }, "Feedback honeypot triggered — dropped");
    return reply.code(200).send({ ok: true });
  }

  const message = clip(payload.message, MAX_MESSAGE);
  if (!message) {
    return reply.code(400).send({ error: "Message is required." });
  }

  const ip = clientIp(request);
  if (!rateLimitOk(ip)) {
    request.log.warn({ ip }, "Feedback rate limit exceeded");
    return reply
      .code(429)
      .send({ error: "Too many feedback submissions. Please try again later." });
  }

  const email = clip(payload.email, MAX_EMAIL);
  const pageUrl = clip(payload.pageUrl, MAX_PAGE_URL);
  const file = clip(payload.file, MAX_FILE);
  const userAgent = clip(payload.userAgent, MAX_USER_AGENT);

  const discordPayload = {
    username: "USD Viewer Feedback",
    embeds: [
      {
        title: "New feedback",
        description: message,
        color: 0x74af52, // Needle green
        fields: [
          { name: "Email", value: email || "—", inline: true },
          { name: "File", value: file || "—", inline: true },
          { name: "Page", value: pageUrl || "—" },
          { name: "Browser", value: userAgent || "—" },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  let res;
  try {
    res = await fetch(DISCORD_FEEDBACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(discordPayload),
    });
  } catch (err) {
    request.log.error({ err: err && err.message }, "Feedback Discord webhook request failed");
    return reply.code(502).send({ error: "Could not deliver feedback. Please try again later." });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    request.log.error(
      { status: res.status, detail: detail.slice(0, 500) },
      "Feedback Discord webhook returned an error"
    );
    return reply.code(502).send({ error: "Could not deliver feedback. Please try again later." });
  }

  return reply.code(200).send({ ok: true });
});

fastify.route({
  method: ["GET", "POST", "OPTIONS"],
  url: "/api/*",
  handler: proxyToRybbit,
});

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'usd-wasm/src'),
  prefix: '/usd',
  setHeaders,
});

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'node_modules/@needle-tools/materialx'),
  prefix: '/materialx',
  setHeaders,
  decorateReply: false,
});

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'node_modules/@needle-tools/engine'),
  prefix: '/needle-engine',
  setHeaders,
  decorateReply: false,
});

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'node_modules/@needle-tools/engine/node_modules/three'),
  prefix: '/needle-three',
  setHeaders,
  decorateReply: false,
});

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'node_modules/three'),
  prefix: '/three',
  setHeaders,
  decorateReply: false,
});

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'usd-wasm/tests/fixtures'),
  prefix: '/test-fixtures',
  setHeaders,
  decorateReply: false,
});

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/',
  setHeaders,
  decorateReply: false,
})

const port = process.env.PORT || 3003;

fastify.listen({port, host: '0.0.0.0'}, function(err, address) {
  if (err) {
    fastify.log.error(err);
    console.error(`Error starting server on port ${port}`, err);
    process.exit(1);
  }
  // We bind to 0.0.0.0 (all interfaces) so the server is reachable from other
  // devices, but 0.0.0.0 isn't a browsable address — print a clickable
  // localhost URL for local development instead.
  console.log(`Your app is listening on http://localhost:${port}`);
  fastify.log.info(`server listening on ${address}`);
});
