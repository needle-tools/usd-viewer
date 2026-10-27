"use strict";

// Unit tests for bucketBytes (public/analytics.js). Run with: npm test.
// analytics.js is an ES module with no import-time browser access, so it loads
// fine under node via dynamic import.

const { test } = require("node:test");
const assert = require("node:assert");

const MB = 1024 * 1024;
let bucketBytes;
test.before(async () => {
  ({ bucketBytes } = await import("../public/analytics.js"));
});

test("buckets across the whole range (upper-exclusive)", () => {
  assert.strictEqual(bucketBytes(0), "<1MB");
  assert.strictEqual(bucketBytes(500 * 1024), "<1MB");
  assert.strictEqual(bucketBytes(1 * MB), "1-5MB");        // boundary lands in the upper bucket
  assert.strictEqual(bucketBytes(4.9 * MB), "1-5MB");
  assert.strictEqual(bucketBytes(5 * MB), "5-10MB");
  assert.strictEqual(bucketBytes(9.9 * MB), "5-10MB");
  assert.strictEqual(bucketBytes(10 * MB), "10-25MB");
  assert.strictEqual(bucketBytes(25 * MB), "25-50MB");
  assert.strictEqual(bucketBytes(50 * MB), "50-100MB");
  assert.strictEqual(bucketBytes(100 * MB), "100-250MB");
  assert.strictEqual(bucketBytes(250 * MB), "250-500MB");
  assert.strictEqual(bucketBytes(499 * MB), "250-500MB");
  assert.strictEqual(bucketBytes(500 * MB), "500MB+");
  assert.strictEqual(bucketBytes(5 * 1024 * MB), "500MB+"); // 5 GB
});

test("returns 'unknown' for invalid / missing input", () => {
  assert.strictEqual(bucketBytes(undefined), "unknown");
  assert.strictEqual(bucketBytes(null), "unknown");
  assert.strictEqual(bucketBytes(NaN), "unknown");
  assert.strictEqual(bucketBytes(-1), "unknown");
  assert.strictEqual(bucketBytes("123"), "unknown");
  assert.strictEqual(bucketBytes(Infinity), "unknown");
});

test("never returns a high-cardinality raw value (always one of the fixed labels)", () => {
  const labels = new Set(["<1MB", "1-5MB", "5-10MB", "10-25MB", "25-50MB", "50-100MB", "100-250MB", "250-500MB", "500MB+", "unknown"]);
  for (const b of [0, 1, 1234, 3.3 * MB, 42 * MB, 777 * MB, -5, NaN]) {
    assert.ok(labels.has(bucketBytes(b)), `unexpected label for ${b}: ${bucketBytes(b)}`);
  }
});
