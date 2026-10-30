import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Texture } from 'three';
import { ThreeRenderDelegateInterface } from '../../src/hydra/ThreeJsRenderDelegate.js';
import { textureFileType } from '../../src/hydra/textureFileType.js';

test('image signatures override source-document suffixes and conflicting image extensions', () => {
  assert.equal(textureFileType('psd', new Uint8Array([255, 216, 255, 224])), 'image/jpeg');
  assert.equal(textureFileType('png', new Uint8Array([255, 216, 255, 224])), 'image/jpeg');
  assert.equal(textureFileType('psd', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png');
  assert.equal(textureFileType('png', new Uint8Array([118, 47, 49, 1])), 'image/x-exr');
  assert.equal(textureFileType('psd', new Uint8Array([56, 66, 80, 83])), undefined, 'a real PSD is not claimed as decoded');
  assert.equal(textureFileType('tga'), 'image/tga');
});

test('packaged JPEG with a PSD suffix uses the image loader, correct blob MIME, and shared texture cache', async () => {
  const bytes = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70]);
  const delegate = new ThreeRenderDelegateInterface({ usdRoot: new Group(), USD: { ReadFile: () => bytes } });
  const registry = delegate.registry;
  const result = new Texture();
  let loaded = 0;
  let mime;
  registry.loader = { load: (url, resolve, _progress, reject) => {
    loaded++;
    fetch(url).then(response => response.blob()).then(blob => {
      mime = blob.type;
      resolve(result);
    }, reject);
  } };
  try {
    const pending = registry.getTexture('/package.usdz[SubUSDs/textures/Screen.psd]');
    assert.equal(registry.getTexture('/package.usdz[SubUSDs/textures/Screen.psd]'), pending);
    assert.equal(await pending, result);
    assert.equal(mime, 'image/jpeg');
    assert.equal(loaded, 1);
    assert.equal(registry.objectUrls.size, 0, 'successful decode releases its blob URL');
  } finally { delegate.dispose(); }
});

test('HTTP textures use resolver-owned URLs before any native byte read', async () => {
  const cases = [
    { path: '/tmp/hdEmscripten-http/42/url-3/1/1/1/1/1/1/albedo.png',
      mapped: 'https://assets.example/other/albedo.png', nativeQuery: true },
    { path: '/tmp/1/1/1/1/1/1/albedo.png',
      mapped: 'https://assets.example/scene/albedo.png', nativeQuery: false },
    { path: 'https://images.example/albedo.png',
      mapped: 'https://images.example/albedo.png', nativeQuery: false },
  ];
  for (const fixture of cases) {
    const reads = [];
    const queries = [];
    const urls = [];
    const driver = { getFile: (_path, callback) => callback(new Uint8Array([137, 80, 78, 71])) };
    if (fixture.nativeQuery) driver.resolveAssetUrl = path => {
      queries.push(path);
      return path === fixture.path ? fixture.mapped : '';
    };
    const delegate = new ThreeRenderDelegateInterface({ usdRoot: new Group(),
      rootFile: 'https://assets.example/scene/root.usda', driver: () => driver,
      USD: { ReadFile: path => { reads.push(path); return null; } },
    });
    const texture = new Texture();
    delegate.registry.loader = { load: (url, resolve) => { urls.push(url); resolve(texture); } };
    try {
      assert.equal(await delegate.registry.getTexture(fixture.path), texture);
      assert.deepEqual(urls, [fixture.mapped]);
      assert.deepEqual(reads, [], 'HTTP resources must not enter Asyncify-capable ReadFile');
      if (fixture.nativeQuery) assert.deepEqual(queries, [fixture.path]);
    } finally { delegate.dispose(); }
  }
});

test('KTX2 container signatures override misleading image suffixes', () => {
  const magic = new Uint8Array([0xab,0x4b,0x54,0x58,0x20,0x32,0x30,0xbb,0x0d,0x0a,0x1a,0x0a]);
  assert.equal(textureFileType('jpg', magic), 'image/ktx2');
  assert.equal(textureFileType('ktx2'), 'image/ktx2');
  assert.notEqual(textureFileType('png', magic.subarray(0, 11)), 'image/ktx2');
});
