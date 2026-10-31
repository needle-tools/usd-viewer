import {test, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

test('the default HDR negotiates lossless compression at its original URL', async ({request}) => {
  const original = await readFile(new URL('../../../public/environments/neutral.hdr', import.meta.url));
  for (const encoding of ['br', 'gzip', 'identity']) {
    const response = await request.get('/environments/neutral.hdr', {headers:{'Accept-Encoding':encoding}});
    expect(response.ok()).toBe(true);
    expect(response.headers().vary?.toLowerCase().split(/\s*,\s*/)).toContain('accept-encoding');
    expect(response.headers()['content-encoding']).toBe(encoding === 'identity' ? undefined : encoding);
    expect(digest(await response.body())).toBe(digest(original));
    if (encoding !== 'identity') expect(Number(response.headers()['content-length'])).toBeLessThan(original.length / 4);
  }
});

test('both native runtimes negotiate compressed delivery with matching Wasm bytes and isolation headers', async ({request}) => {
  for (const name of ['emHdBindings', 'emHdBindings.jspi']) {
    const original = await readFile(new URL(`../../src/bindings/${name}.wasm`, import.meta.url));
    for (const encoding of ['br', 'gzip', 'identity']) {
      const response = await request.get(`/usd/bindings/${name}.wasm`, {headers:{'Accept-Encoding':encoding}});
      expect(response.ok()).toBe(true);
      expect(response.headers()['content-type']).toContain('application/wasm');
      expect(response.headers()['cross-origin-embedder-policy']).toBe('require-corp');
      expect(response.headers()['cross-origin-opener-policy']).toBe('same-origin');
      expect(response.headers().vary?.toLowerCase().split(/\s*,\s*/)).toContain('accept-encoding');
      expect(response.headers()['content-encoding']).toBe(encoding === 'identity' ? undefined : encoding);
      expect(digest(await response.body())).toBe(digest(original));
      if (encoding !== 'identity') expect(Number(response.headers()['content-length'])).toBeLessThan(original.length * (encoding === 'br' ? 0.25 : 0.4));
    }
  }
});
