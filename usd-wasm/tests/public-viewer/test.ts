// Shared Playwright entry point for the public viewer tests.
//
// Tests never use the network. Requests to other hosts are answered from local
// copies in tests/data/remote (`npm run test:assets` downloads the URLs listed in
// remote-assets.txt). A URL without a local copy fails the test at once.
// RECORD_TEST_ASSETS=1 downloads missing URLs once and adds them to the list.
//
// Tests that only open a stage and inspect it use the `app` fixture: one loaded
// viewer page per worker and URL query, which switches stages in place with
// app.load(path). Starting the viewer once instead of per test keeps the suite fast.
// A worker keeps one viewer at a time in its own context; asking for another
// query replaces it. (Two viewers in one context share storage and do not both
// finish starting, and idle viewers compete for the GPU.)
import {test as base, type BrowserContext, type Page} from '@playwright/test';
import {appendFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, extname} from 'node:path';
import {localPath, assetList} from './remote-assets.mjs';

export * from '@playwright/test';

const record = process.env.RECORD_TEST_ASSETS === '1';
const types: Record<string, string> = {'.json': 'application/json', '.js': 'application/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.usdz': 'model/vnd.usdz+zip'};

async function serveLocalAssets(context: BrowserContext, missing: string[]) {
  await context.route(url => url.hostname !== '127.0.0.1' && url.hostname !== 'localhost' && url.protocol.startsWith('http'), async route => {
    const href = route.request().url(), file = localPath(href);
    try {
      const body = await readFile(file);
      const meta = JSON.parse(await readFile(file + '.meta.json', 'utf8').catch(() => '{}'));
      await route.fulfill({status: meta.status || 200, body, headers: {'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin',
        'content-type': meta.contentType || types[extname(new URL(href).pathname)] || 'application/octet-stream'}});
    } catch {
      if (record) {
        const response = await route.fetch();
        await mkdir(dirname(file), {recursive: true});
        await writeFile(file, await response.body());
        await writeFile(file + '.meta.json', JSON.stringify({url: href, status: response.status(), contentType: response.headers()['content-type']}));
        await appendFile(assetList, href + '\n');
        await route.fulfill({response});
        return;
      }
      missing.push(href);
      await route.abort('internetdisconnected');
      // Fail now instead of waiting for an asset that never arrives.
      try { await route.request().frame().page().close(); } catch {} // Worker requests have no frame.
    }
  });
  // Registered last so it is matched first. Analytics events carry per-visit ids; accept them.
  await context.route(url => url.hostname === 'marketer.needle.tools' && url.pathname.startsWith('/e/'), route => route.fulfill({status: 204}));
}

const missingError = (urls: string[]) => new Error(`No local copy (add to remote-assets.txt, then npm run test:assets):\n${[...new Set(urls)].join('\n')}`);

/** Opens `path` in the running viewer, as following a file link does, and waits until it has loaded. */
export async function loadStage(page: Page, path: string) {
  const before = await page.evaluate(() => (window as any).__usdViewerLoaded?.generation ?? -1);
  await page.evaluate(file => {
    const link = document.createElement('a');
    link.className = 'file'; link.href = '/?file=' + encodeURIComponent(file); link.dataset.name = file.split('/').pop() || file;
    document.body.append(link); link.click(); link.remove();
  }, path);
  await page.waitForFunction(({before, path}) => {
    const error = document.querySelector('#load-error.visible');
    if (error) throw new Error(`Loading ${path} failed: ${error.textContent?.trim()}`);
    const loaded = (window as any).__usdViewerLoaded;
    return loaded && loaded.generation > before && loaded.file === path;
  }, {before, path});
}

export type ViewerApp = {page: Page; errors: string[]; load(path: string): Promise<void>};

export const test = base.extend<{localAssets: void; app: (query: string) => Promise<ViewerApp>},
  {appContext: {open(): Promise<Page>; current?: {query: string; page: Page}; missing: string[]}}>({
  localAssets: [async ({context}, use) => {
    const missing: string[] = [];
    await serveLocalAssets(context, missing);
    await use();
    if (missing.length) throw missingError(missing);
  }, {auto: true}],

  appContext: [async ({browser}, use, workerInfo) => {
    const {baseURL, viewport, deviceScaleFactor, storageState} = workerInfo.project.use;
    const missing: string[] = [];
    const open = async () => {
      const context = await browser.newContext({baseURL, viewport, deviceScaleFactor, storageState: storageState as any});
      await serveLocalAssets(context, missing);
      return context.newPage();
    };
    const state: {open(): Promise<Page>; current?: {query: string; page: Page}; missing: string[]} = {open, missing};
    await use(state);
    await state.current?.page.context().close().catch(() => {});
  }, {scope: 'worker'}],

  app: async ({appContext}, use) => {
    const errors: string[] = [], listening: [Page, (error: Error) => void][] = [];
    const missingBefore = appContext.missing.length;
    await use(async query => {
      let page = appContext.current?.query === query ? appContext.current.page : undefined;
      if (!page || page.isClosed()) {
        await appContext.current?.page.context().close().catch(() => {});
        appContext.current = undefined;
        page = await appContext.open();
        await page.goto('/?' + query);
        await page.waitForFunction(() => (window as any).__usdViewerRuntimeReady === true && !!(window as any).usdWorkbench);
        appContext.current = {query, page};
      }
      const onError = (error: Error) => errors.push(error.message);
      page.on('pageerror', onError); listening.push([page, onError]);
      return {page, errors, load: path => loadStage(page!, path)};
    });
    for (const [page, onError] of listening) page.off('pageerror', onError);
    const missing = appContext.missing.slice(missingBefore);
    if (missing.length) throw missingError(missing);
  },
});
