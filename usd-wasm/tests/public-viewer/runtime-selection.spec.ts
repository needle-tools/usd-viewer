import {test, expect, type Page} from './test';
import {readFile} from 'node:fs/promises';

async function mountLoader(page: Page, {supports = true, failJspi = false, missingFactory = false} = {}) {
  const source = await readFile(new URL('../../src/bindings/index.js', import.meta.url), 'utf8');
  const requests: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/__runtime/')) requests.push(path);
  });
  await page.route('**/runtime-loader.html', route => route.fulfill({contentType:'text/html', body:'<!doctype html><title>Runtime loader test</title>'}));
  await page.route('**/__runtime/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/index.js')) return route.fulfill({contentType:'text/javascript', body:source});
    if (path.endsWith('.wasm')) return route.fulfill({contentType:'application/wasm', body:Buffer.from([0,97,115,109])});
    const jspi = path.endsWith('emHdBindings.jspi.js');
    const key = jspi ? 'NEEDLE:USD:GET:JSPI' : 'NEEDLE:USD:GET';
    const stem = jspi ? 'emHdBindings.jspi' : 'emHdBindings';
    return route.fulfill({contentType:'text/javascript', body:missingFactory ? 'export {};' : `
      globalThis[${JSON.stringify(key)}] = async options => {
        globalThis.__factoryCalls = (globalThis.__factoryCalls || 0) + 1;
        ${jspi && failJspi ? "throw new Error('JSPI test initialization failure');" : ''}
        const wasm = options.locateFile(${JSON.stringify(stem + '.wasm')});
        await fetch(wasm);
        options.setStatus?.('Downloading data... (2/4)');
        options.onAssetFetchProgress?.({url:'texture.png',state:'start',loaded:1,total:4});
        options.onAssetFetchProgress?.({url:'texture.png',state:'done',loaded:4,total:4});
        return {runtime:${JSON.stringify(jspi ? 'jspi' : 'asyncify')}, wasm, script:options.mainScriptUrlOrBlob, owner:options.owner};
      };`});
  });
  await page.goto('/runtime-loader.html');
  await page.evaluate(supported => {
    for (const key of ['Suspending','promising']) Object.defineProperty(WebAssembly, key, {value:supported ? function () {} : undefined, configurable:true});
  }, supports);
  return requests;
}

for (const supports of [true, false]) {
  for (const runtime of [undefined, 'auto', 'asyncify'] as const) {
    test(`browser ${runtime || 'default'} selects one runtime (JSPI support: ${supports})`, async ({page}) => {
      const requests = await mountLoader(page, {supports});
      const module = await page.evaluate(async runtime => {
        const path = '/__runtime/index.js';
        const {getUsdModule} = await import(path);
        return getUsdModule(runtime ? {asyncRuntime:runtime} : undefined);
      }, runtime);
      const expected = runtime === 'auto' && supports ? 'jspi' : 'asyncify';
      const stem = expected === 'jspi' ? 'emHdBindings.jspi' : 'emHdBindings';
      expect(module.runtime).toBe(expected);
      expect(new URL(module.script).pathname).toBe('/__runtime/' + stem + '.js');
      expect(new URL(module.wasm).pathname).toBe('/__runtime/' + stem + '.wasm');
      expect(requests.filter(path => path.includes('emHdBindings'))).toEqual(['/__runtime/' + stem + '.js', '/__runtime/' + stem + '.wasm']);
    });
  }
}

test('browser overrides, progress hooks and concurrent first caller options survive selection', async ({page}) => {
  await mountLoader(page);
  const result = await page.evaluate(async () => {
    const path = '/__runtime/index.js';
    const {getUsdModule} = await import(path);
    const worker = new Blob(['worker']);
    const downloads: number[][] = [], assets: any[] = [], statuses: string[] = [];
    const [first, second] = await Promise.all([
      getUsdModule({asyncRuntime:'jspi', owner:'first', mainScriptUrlOrBlob:worker,
        locateFile:() => '/__runtime/custom.wasm',
        onDownloadProgress:(loaded:number,total:number) => downloads.push([loaded,total]),
        onAssetFetchProgress:(progress:any) => assets.push(progress),
        setStatus:(status:string) => statuses.push(status)}),
      getUsdModule({asyncRuntime:'asyncify',owner:'second'}),
    ]);
    return {same:first === second, script:first.script === worker, runtime:first.runtime, owner:first.owner, wasm:first.wasm,
      calls:(window as any).__factoryCalls, downloads, assets, statuses};
  });
  expect(result).toMatchObject({same:true, script:true, runtime:'jspi', owner:'first', wasm:'/__runtime/custom.wasm', calls:1, downloads:[[2,4]]});
  expect(result.assets.map(({active,loadedTotal,totalBytes}) => ({active,loadedTotal,totalBytes}))).toEqual([{active:1,loadedTotal:1,totalBytes:4},{active:0,loadedTotal:0,totalBytes:0}]);
  expect(result.statuses).toEqual(['Downloading data... (2/4)']);
});

test('auto honors an application-provided legacy global factory', async ({page}) => {
  const requests = await mountLoader(page);
  const result = await page.evaluate(async () => {
    (globalThis as any)['NEEDLE:USD:GET'] = async () => ({provided:true});
    const path = '/__runtime/index.js';
    return (await import(path)).getUsdModule({asyncRuntime:'auto'});
  });
  expect(result).toEqual({provided:true});
  expect(requests).toEqual(['/__runtime/index.js']);
});

for (const failure of ['unsupported', 'initialize', 'missing factory'] as const) {
  test(`JSPI ${failure} errors propagate without downloading Asyncify`, async ({page}) => {
    const requests = await mountLoader(page, {supports:failure !== 'unsupported', failJspi:failure === 'initialize', missingFactory:failure === 'missing factory'});
    const result = await page.evaluate(async () => {
      const path = '/__runtime/index.js';
      const {getUsdModule} = await import(path);
      const settled = await Promise.allSettled([getUsdModule({asyncRuntime:'jspi'}), getUsdModule({asyncRuntime:'asyncify'})]);
      return settled.map(item => item.status === 'rejected' ? item.reason.message : 'unexpected success');
    });
    expect(result[0]).toBe(result[1]);
    expect(result[0]).toContain(failure === 'unsupported' ? 'requires WebAssembly.Suspending and WebAssembly.promising' : failure === 'initialize' ? 'JSPI test initialization failure' : 'did not register the NEEDLE:USD:GET:JSPI factory');
    expect(requests.some(path => /\/emHdBindings\.(js|wasm)$/.test(path))).toBe(false);
  });
}
