const fastify = require('fastify')()
const path = require('path') 

// Headers are required for SharedArrayBuffers and WebAssembly
// Otherwise we wouldn't need a server at all.

function setHeaders(res, path, stat) {

  const normalizedPath = path.replaceAll("\\", '/');
  const needsHeaders = normalizedPath.includes('/emHd') ||
    normalizedPath.includes('/materialx/') ||
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
