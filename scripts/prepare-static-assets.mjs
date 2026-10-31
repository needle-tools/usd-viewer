import { readFile, writeFile, stat } from 'node:fs/promises';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

// Keep original assets available for clients without content-encoding support.
// Fastify serves these lossless sidecars at the original asset URL.
const sources = [
  new URL('../public/environments/neutral.hdr', import.meta.url),
  ...['emHdBindings', 'emHdBindings.jspi'].flatMap(name => ['js', 'wasm'].map(extension =>
    new URL(`../usd-wasm/src/bindings/${name}.${extension}`, import.meta.url))),
];
for (const source of sources) {
  const sourceStat = await stat(source);
  const [brStat, gzipStat] = await Promise.all(['.br', '.gz'].map(suffix =>
    stat(new URL(source.href + suffix)).catch(() => null)));
  if (brStat?.mtimeMs >= sourceStat.mtimeMs && gzipStat?.mtimeMs >= sourceStat.mtimeMs) continue;
  const bytes = await readFile(source);
  const brotli = brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
  const gzip = gzipSync(bytes, { level: 9 });
  await writeFile(new URL(source.href + '.br'), brotli);
  await writeFile(new URL(source.href + '.gz'), gzip);
  console.log(`Prepared ${source.pathname.split('/').pop()}: ${bytes.length} → ${brotli.length} Brotli / ${gzip.length} gzip bytes`);
}
