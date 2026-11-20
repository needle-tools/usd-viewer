// Local copies of the remote assets the browser tests use, stored in
// tests/data/remote/<host>/<path>. `npm run test:assets` downloads the URLs listed
// in remote-assets.txt; tests read only the local copies (see test.ts).
import {createHash} from 'node:crypto';
import {mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const remoteRoot = join(here, '../data/remote');
export const assetList = join(here, 'remote-assets.txt');

export function localPath(href) {
  const url = new URL(href);
  // Query strings select different content, so they get their own file.
  const query = url.search ? '.' + createHash('sha256').update(url.search).digest('hex').slice(0, 12) : '';
  const path = url.pathname.endsWith('/') ? url.pathname + 'index' : url.pathname;
  return join(remoteRoot, url.host, decodeURIComponent(path) + query);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const urls = (await readFile(assetList, 'utf8')).split('\n').map(line => line.trim()).filter(Boolean);
  const queue = [...urls];
  let failed = 0;
  await Promise.all(Array.from({length: 8}, async () => {
    for (let href; (href = queue.shift());) {
      const file = localPath(href);
      if (await stat(file).then(() => true, () => false)) continue;
      try {
        const response = await fetch(href);
        // Client errors such as 404 are part of what the app sees; keep them.
        if (!response.ok && response.status < 400 || response.status >= 500) throw new Error(`HTTP ${response.status}`);
        await mkdir(dirname(file), {recursive: true});
        await writeFile(file, response.ok ? Buffer.from(await response.arrayBuffer()) : '');
        await writeFile(file + '.meta.json', JSON.stringify({url: href, status: response.status, contentType: response.headers.get('content-type')}));
      } catch (error) { failed++; console.error(`${href}: ${error.message}`); }
    }
  }));
  console.log(`${urls.length - failed} of ${urls.length} test assets available.`);
  if (failed) process.exitCode = 1;
}
