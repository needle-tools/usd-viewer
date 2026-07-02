"use strict";

// Unit tests for rybbit-ip.js — the real-visitor-IP stamping for Rybbit track
// events. Run with: npm test  (node --test, no framework deps).

const { test } = require("node:test");
const assert = require("node:assert");
const { injectClientIpIntoTrackBody, maskIp, TRACK_PATH } = require("./rybbit-ip");

test("injects CF-Connecting-IP as ip_address for a track POST, preserving other fields", () => {
  const body = Buffer.from(JSON.stringify({ site_id: "6bc313ba3488", type: "pageview", pathname: "/" }));
  const out = injectClientIpIntoTrackBody("/api/track", body, "203.0.113.7");
  const parsed = JSON.parse(out.toString("utf8"));
  assert.strictEqual(parsed.ip_address, "203.0.113.7"); // the real visitor IP
  assert.strictEqual(parsed.site_id, "6bc313ba3488");    // untouched
  assert.strictEqual(parsed.type, "pageview");
  assert.strictEqual(parsed.pathname, "/");
});

test("works with a query string on the track path", () => {
  const body = Buffer.from(JSON.stringify({ site_id: "x" }));
  const out = injectClientIpIntoTrackBody(`${TRACK_PATH}?foo=bar`, body, "203.0.113.7");
  assert.strictEqual(JSON.parse(out.toString("utf8")).ip_address, "203.0.113.7");
});

test("overwrites any client-supplied ip_address (anti-spoof)", () => {
  const body = Buffer.from(JSON.stringify({ site_id: "x", ip_address: "9.9.9.9" }));
  const out = injectClientIpIntoTrackBody("/api/track", body, "203.0.113.7");
  assert.strictEqual(JSON.parse(out.toString("utf8")).ip_address, "203.0.113.7");
});

test("leaves non-track paths untouched (same buffer reference)", () => {
  const body = Buffer.from(JSON.stringify({ a: 1 }));
  assert.strictEqual(injectClientIpIntoTrackBody("/api/identify", body, "203.0.113.7"), body);
  assert.strictEqual(injectClientIpIntoTrackBody("/api/script.js", body, "203.0.113.7"), body);
});

test("forwards unchanged when CF-Connecting-IP is absent (no bogus geo)", () => {
  const body = Buffer.from(JSON.stringify({ a: 1 }));
  assert.strictEqual(injectClientIpIntoTrackBody("/api/track", body, undefined), body);
  assert.strictEqual(injectClientIpIntoTrackBody("/api/track", body, ""), body);
});

test("forwards a non-JSON body unchanged instead of dropping the event", () => {
  const body = Buffer.from("not-json");
  assert.strictEqual(injectClientIpIntoTrackBody("/api/track", body, "203.0.113.7"), body);
});

test("forwards a JSON array/primitive body unchanged (only objects get stamped)", () => {
  const arr = Buffer.from(JSON.stringify([1, 2, 3]));
  assert.strictEqual(injectClientIpIntoTrackBody("/api/track", arr, "203.0.113.7"), arr);
  const num = Buffer.from("42");
  assert.strictEqual(injectClientIpIntoTrackBody("/api/track", num, "203.0.113.7"), num);
});

test("handles empty / undefined body", () => {
  assert.strictEqual(injectClientIpIntoTrackBody("/api/track", undefined, "1.2.3.4"), undefined);
  const empty = Buffer.alloc(0);
  assert.strictEqual(injectClientIpIntoTrackBody("/api/track", empty, "1.2.3.4"), empty);
});

test("maskIp keeps only the first two octets of an IPv4 and never leaks the host", () => {
  assert.strictEqual(maskIp("212.122.56.97"), "212.122.x.x");
  assert.ok(!maskIp("212.122.56.97").includes("56"));
  assert.ok(!maskIp("212.122.56.97").includes("97"));
});

test("maskIp keeps the first two hextets of an IPv6", () => {
  assert.strictEqual(maskIp("2a01:e0a:1c2:3::abcd"), "2a01:e0a:…");
});

test("maskIp returns '' for empty/garbage input", () => {
  assert.strictEqual(maskIp(undefined), "");
  assert.strictEqual(maskIp(""), "");
  assert.strictEqual(maskIp("not-an-ip"), "");
});
