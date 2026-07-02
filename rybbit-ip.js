"use strict";

// Stamp the real visitor IP into Rybbit track events.
//
// Our self-hosted Rybbit (v2.6.0) geolocates the visitor from
// `payload.ip_address || request.ip` (see rybbit trackEvent.ts). This viewer's
// analytics reach Rybbit through Cloudflare + Coolify/Traefik, where the
// `X-Forwarded-For` / `request.ip` chain is not a reliable carrier of the real
// visitor IP (Traefik only preserves it when configured to trust Cloudflare, and
// that config can be reset). Cloudflare, however, ALWAYS provides the real
// client IP in `CF-Connecting-IP`, which passes through untouched.
//
// So for track events we read CF-Connecting-IP and write it into the event body
// as `ip_address`, which Rybbit uses directly — bypassing every header/proxy
// hop. This is deterministic and independent of any Traefik/Cloudflare config.

// The Rybbit tracker derives its API base from /api/script.js and posts events
// to <base>/track — i.e. this path on our same-origin proxy.
const TRACK_PATH = "/api/track";

/**
 * Return the request body, with `ip_address` set to the real visitor IP for
 * Rybbit track events. Never throws: an empty/non-JSON/non-object body, a
 * non-track path, or a missing CF-Connecting-IP all forward the body unchanged,
 * so analytics is never dropped.
 *
 * @param {string} url request.url (path + optional query), e.g. "/api/track?..."
 * @param {Buffer|undefined} body raw request body buffer
 * @param {string|undefined} cfConnectingIp value of the CF-Connecting-IP header
 * @returns {Buffer|undefined} the (possibly rewritten) body
 */
function injectClientIpIntoTrackBody(url, body, cfConnectingIp) {
  if (!cfConnectingIp || !body || body.length === 0) return body;
  const pathname = String(url).split("?")[0];
  if (pathname !== TRACK_PATH) return body;

  let payload;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    return body; // not JSON — forward as received
  }
  // Only stamp plain objects; leave arrays/primitives we don't understand alone.
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return body;

  payload.ip_address = cfConnectingIp; // authoritative — overwrite any client value
  return Buffer.from(JSON.stringify(payload), "utf8");
}

module.exports = { injectClientIpIntoTrackBody, TRACK_PATH };
