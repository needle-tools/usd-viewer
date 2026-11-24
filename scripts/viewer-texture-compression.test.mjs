import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Source } from 'three';
import { createPathTracingTextureSources, supportsViewerTextureCompression } from '../public/viewer-texture-compression.js';

test('WebGPU texture compression requires a feature enabled on the renderer device', () => {
  const backend = { isWebGPUBackend: true, device: { features: new Set() } };
  assert.equal(supportsViewerTextureCompression({ backend }), false);
  backend.device.features.add('texture-compression-bc');
  assert.equal(supportsViewerTextureCompression({ backend }), true);
});

test('readable originals follow the path tracer and the loaded stage', async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  const decoded = [];
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    async value(blob) {
      const bitmap = { blob, closed: false, close() { this.closed = true; } };
      decoded.push(bitmap);
      return bitmap;
    },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'createImageBitmap', original);
    else delete globalThis.createImageBitmap;
  });

  const sources = createPathTracingTextureSources();
  const dimensions = { width: 1024, height: 1024 };
  const first = new Source(dimensions);
  const second = new Source(dimensions);
  const png = new Blob(['source PNG']);
  await sources.add(first, png);
  assert.strictEqual(first.data, dimensions);
  assert.equal(decoded.length, 0);

  const release = await sources.acquire();
  assert.strictEqual(first.data, decoded[0]);
  assert.strictEqual(first.data.blob, png);
  await sources.add(second, png);
  assert.strictEqual(second.data, decoded[1]);

  sources.remove(first);
  assert.equal(decoded[0].closed, true);
  release();
  assert.strictEqual(second.data, dimensions);
  assert.equal(decoded[1].closed, true);

  const releaseAgain = await sources.acquire();
  assert.equal(decoded.length, 3);
  assert.strictEqual(second.data, decoded[2]);
  releaseAgain();
});
