const assert = require('node:assert/strict');
const {test} = require('node:test');
const {mkdtemp, writeFile, utimes, rm} = require('node:fs/promises');
const {join} = require('node:path');
const {tmpdir} = require('node:os');
const {brotliCompressSync, brotliDecompressSync, gzipSync, gunzipSync} = require('node:zlib');
const {runtimeCompressionGuard} = require('./precompressed-runtime');

test('runtime delivery negotiates lossless sidecars and rejects stale ones after a native update', async () => {
  const root = await mkdtemp(join(tmpdir(), 'usd-compressed-runtime-'));
  const app = require('fastify')();
  app.addHook('onRequest', runtimeCompressionGuard(root));
  app.register(require('@fastify/static'), {root, prefix:'/usd/bindings', preCompressed:true});
  try {
    for (const name of ['emHdBindings.jspi.wasm', 'emHdBindings.js']) {
      const file = join(root, name), before = Buffer.from('old runtime '.repeat(1000)), after = Buffer.from('new runtime '.repeat(1000));
      await writeFile(file, before); await utimes(file, 1000, 1000);
      for (const [suffix, compress] of [['.br', brotliCompressSync], ['.gz', gzipSync]]) {
        await writeFile(file + suffix, compress(before)); await utimes(file + suffix, 2000, 2000);
      }
      for (const encoding of ['br', 'gzip', 'identity']) {
        const response = await app.inject({url:'/usd/bindings/' + name, headers:{'accept-encoding':encoding}});
        assert.equal(response.statusCode, 200);
        assert.equal(response.headers['content-encoding'], encoding === 'identity' ? undefined : encoding);
        const decode = encoding === 'br' ? brotliDecompressSync : encoding === 'gzip' ? gunzipSync : value => value;
        assert.deepEqual(decode(response.rawPayload), before);
      }
      // Same-size replacement: an old compressed module must never win.
      await writeFile(file, after); await utimes(file, 3000, 3000);
      for (const encodedName of [name, '%65' + name.slice(1)]) {
        const response = await app.inject({url:'/usd/bindings/' + encodedName + '?v=new', headers:{'accept-encoding':'br, gzip'}});
        assert.equal(response.statusCode, 200);
        assert.equal(response.headers['content-encoding'], undefined);
        assert.deepEqual(response.rawPayload, after);
      }
    }
  } finally { await app.close(); await rm(root, {recursive:true, force:true}); }
});
