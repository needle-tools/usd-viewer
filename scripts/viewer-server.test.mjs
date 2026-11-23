import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('the Node viewer serves its browser dependencies with an empty public directory', { timeout: 15000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'usd-viewer-server-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'public'));
  await copyFile(new URL('../server.js', import.meta.url), join(dir, 'server.js'));
  await copyFile(new URL('../package.json', import.meta.url), join(dir, 'package.json'));
  for (const name of ['scripts', 'node_modules', 'usd-wasm']) {
    await symlink(fileURLToPath(new URL('../' + name, import.meta.url)), join(dir, name), 'junction');
  }

  const revision = '1'.repeat(40);
  const server = spawn(process.execPath, ['server.js'], {
    cwd: dir, env: { ...process.env, PORT: '0', SOURCE_COMMIT: revision }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const closed = once(server, 'close');
  t.after(async () => { server.kill(); await closed; });
  let origin;
  for await (const line of createInterface({ input: server.stdout })) {
    const match = line.match(/Your app is listening on (http:\/\/localhost:\d+)/);
    if (match) { origin = match[1]; break; }
  }
  assert.ok(origin, 'server did not start');
  const build = await fetch(origin + '/viewer-build.json');
  assert.equal(build.status, 200);
  assert.equal(build.headers.get('cache-control'), 'private, no-cache');
  const metadata = await build.json();
  assert.match(metadata.viewerVersion, /^\d+\.\d+\.\d+/);
  assert.match(metadata.sdkVersion, /^\d+\.\d+\.\d+/);
  assert.equal(metadata.revision, revision);
  const assets = {
    '/dockview/package/main.esm.mjs': /javascript/,
    '/dockview/styles/dockview.css': /css/,
    '/modules/mesh-bvh.umd.js': /javascript/,
    '/modules/kinematics.js': /javascript/,
    '/modules/kinematics.js.LICENSE.txt': /text\/plain/,
    '/three-mesh-bvh/src/index.js': /javascript/,
    '/mutracer/lib/main.js': /javascript/,
    '/oidn-webgpu/dist/oidn.js': /javascript/,
    '/simready/gltf.js': /javascript/,
    '/simready/index.js': /javascript/,
    '/simready/gltf/runtimeContract.js': /javascript/,
    '/usd/gltf/simready.js': /javascript/,
    '/three/build/three.module.js': /javascript/,
  };
  for (const [path, mime] of Object.entries(assets)) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type') ?? '', mime, path);
    if (/\.(?:m?js|css)$/.test(path)) assert.equal(response.headers.get('cache-control'), 'private, no-cache', path);
    if (path.startsWith('/simready/') || path.startsWith('/usd/') || path.startsWith('/three/')) {
      const etag = response.headers.get('etag');
      assert.ok(etag, path);
      const cached = await fetch(origin + path, { cache: 'no-cache', headers: {'If-None-Match': etag} });
      assert.equal(cached.status, 304, path);
      assert.equal(cached.headers.get('cache-control'), 'private, no-cache', path);
    }
    assert.ok((await response.arrayBuffer()).byteLength > 0, path);
  }
});
