"use strict";

// Stamp the real visitor IP into same-origin analytics track events.
const TRACK_PATH = "/api/track";

/**
 * Return the request body, with `ip_address` set to the real visitor IP for
 * analytics track events. Never throws: an empty/non-JSON/non-object body, a
 * non-track path, or a missing CF-Connecting-IP all forward the body unchanged,
 * so analytics is never dropped.
 *
 * @param {string} url request.url (path + optional query), e.g. "/api/track?..."
 * @param {Buffer|undefined} body raw request body buffer
 * @param {string|undefined} cfConnectingIp value of the CF-Connecting-IP header
 * @returns {Buffer|undefined} the (possibly rewritten) body
 */
function injectClientIpIntoAnalyticsTrackBody(url, body, cfConnectingIp) {
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

/**
 * Mask an IP for debug logging — enough to tell a real/diverse address from a
 * leaking datacenter IP (e.g. a Hetzner prefix), without logging the full,
 * PII-carrying host. IPv4 keeps the first two octets (`212.122.x.x`); IPv6 keeps
 * the first two hextets (`2a01:e0a:…`). Returns "" for anything unrecognisable.
 *
 * @param {string|undefined} ip
 * @returns {string}
 */
function maskIpForLog(ip) {
  if (!ip || typeof ip !== "string") return "";
  const trimmed = ip.trim();
  if (trimmed.includes(":")) {
    const hextets = trimmed.split(":").filter(Boolean);
    if (hextets.length < 2) return "";
    return `${hextets[0]}:${hextets[1]}:…`;
  }
  const octets = trimmed.split(".");
  if (octets.length !== 4) return "";
  return `${octets[0]}.${octets[1]}.x.x`;
}

module.exports = { injectClientIpIntoAnalyticsTrackBody, maskIpForLog, TRACK_PATH };
