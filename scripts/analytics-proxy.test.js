"use strict";

// Unit tests for analytics proxy body handling and masked IP logging.

const { test } = require("node:test");
const assert = require("node:assert");
const { injectClientIpIntoAnalyticsTrackBody, maskIpForLog, TRACK_PATH } = require("./analytics-proxy");

test("injects CF-Connecting-IP as ip_address for a track POST, preserving other fields", () => {
  const body = Buffer.from(JSON.stringify({ site_id: "6bc313ba3488", type: "pageview", pathname: "/" }));
  const out = injectClientIpIntoAnalyticsTrackBody("/api/track", body, "203.0.113.7");
  const parsed = JSON.parse(out.toString("utf8"));
  assert.strictEqual(parsed.ip_address, "203.0.113.7"); // the real visitor IP
  assert.strictEqual(parsed.site_id, "6bc313ba3488");    // untouched
  assert.strictEqual(parsed.type, "pageview");
  assert.strictEqual(parsed.pathname, "/");
});

test("works with a query string on the track path", () => {
  const body = Buffer.from(JSON.stringify({ site_id: "x" }));
  const out = injectClientIpIntoAnalyticsTrackBody(`${TRACK_PATH}?foo=bar`, body, "203.0.113.7");
  assert.strictEqual(JSON.parse(out.toString("utf8")).ip_address, "203.0.113.7");
});

test("overwrites any client-supplied ip_address (anti-spoof)", () => {
  const body = Buffer.from(JSON.stringify({ site_id: "x", ip_address: "9.9.9.9" }));
  const out = injectClientIpIntoAnalyticsTrackBody("/api/track", body, "203.0.113.7");
  assert.strictEqual(JSON.parse(out.toString("utf8")).ip_address, "203.0.113.7");
});

test("leaves non-track paths untouched (same buffer reference)", () => {
  const body = Buffer.from(JSON.stringify({ a: 1 }));
  assert.strictEqual(injectClientIpIntoAnalyticsTrackBody("/api/identify", body, "203.0.113.7"), body);
  assert.strictEqual(injectClientIpIntoAnalyticsTrackBody("/api/script.js", body, "203.0.113.7"), body);
});

test("forwards unchanged when CF-Connecting-IP is absent (no bogus geo)", () => {
  const body = Buffer.from(JSON.stringify({ a: 1 }));
  assert.strictEqual(injectClientIpIntoAnalyticsTrackBody("/api/track", body, undefined), body);
  assert.strictEqual(injectClientIpIntoAnalyticsTrackBody("/api/track", body, ""), body);
});

test("forwards a non-JSON body unchanged instead of dropping the event", () => {
  const body = Buffer.from("not-json");
  assert.strictEqual(injectClientIpIntoAnalyticsTrackBody("/api/track", body, "203.0.113.7"), body);
});

test("forwards a JSON array/primitive body unchanged (only objects get stamped)", () => {
  const arr = Buffer.from(JSON.stringify([1, 2, 3]));
  assert.strictEqual(injectClientIpIntoAnalyticsTrackBody("/api/track", arr, "203.0.113.7"), arr);
  const num = Buffer.from("42");
  assert.strictEqual(injectClientIpIntoAnalyticsTrackBody("/api/track", num, "203.0.113.7"), num);
});

test("handles empty / undefined body", () => {
  assert.strictEqual(injectClientIpIntoAnalyticsTrackBody("/api/track", undefined, "1.2.3.4"), undefined);
  const empty = Buffer.alloc(0);
  assert.strictEqual(injectClientIpIntoAnalyticsTrackBody("/api/track", empty, "1.2.3.4"), empty);
});

test("maskIpForLog keeps only the first two octets of an IPv4 and never leaks the host", () => {
  assert.strictEqual(maskIpForLog("212.122.56.97"), "212.122.x.x");
  assert.ok(!maskIpForLog("212.122.56.97").includes("56"));
  assert.ok(!maskIpForLog("212.122.56.97").includes("97"));
});

test("maskIpForLog keeps the first two hextets of an IPv6", () => {
  assert.strictEqual(maskIpForLog("2a01:e0a:1c2:3::abcd"), "2a01:e0a:…");
});

test("maskIpForLog returns '' for empty/garbage input", () => {
  assert.strictEqual(maskIpForLog(undefined), "");
  assert.strictEqual(maskIpForLog(""), "");
  assert.strictEqual(maskIpForLog("not-an-ip"), "");
});
