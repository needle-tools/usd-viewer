import {test, expect} from './test';
import {readFile} from 'node:fs/promises';
import {unzipSync} from 'three/addons/libs/fflate.module.js';
import {stageReady, clearStage} from './workbench-menus';

for (const viewer of ['three', 'needle']) test(`${viewer}: Download packages dependencies and live edits; format choice persists and closing disables it`, async ({page}, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(theme => localStorage.setItem('needle-usd-theme', JSON.stringify(theme)), viewer === 'three' ? 'dark' : 'light');
  await page.goto(`/?viewer=${viewer}&render=basic&file=/test-fixtures/api/examples.js%23department-layers`);
  await stageReady(page);
  const download = page.getByRole('button', {name:'Download', exact:true});
  await expect(download).toBeEnabled();
  await page.evaluate(async () => {
    await (window as any).usdHydra.editStage(stage => stage.DefinePrim('/World/DownloadEdit', 'Xform').delete());
  });
  const zipEvent = page.waitForEvent('download'); await download.click(); const zip = await zipEvent;
  expect(zip.suggestedFilename()).toMatch(/\.zip$/);
  const entries = unzipSync(new Uint8Array(await readFile((await zip.path())!)));
  expect(Object.keys(entries).length).toBeGreaterThan(1);
  expect(Object.values(entries).some(bytes => new TextDecoder().decode(bytes).includes('DownloadEdit'))).toBe(true);

  await page.getByLabel('Download format', {exact:true}).click();
  await page.getByRole('menuitemradio', {name:'USDZ', exact:true}).click();
  const packageEvent = page.waitForEvent('download'); await download.click(); const usdz = await packageEvent;
  expect(usdz.suggestedFilename()).toMatch(/\.usdz$/);
  const usdzBytes = new Uint8Array(await readFile((await usdz.path())!));
  // USDZ stores every member uncompressed, on a 64-byte boundary.
  const view = new DataView(usdzBytes.buffer); let cursor = 0, count = 0;
  while (view.getUint32(cursor, true) === 0x04034b50) {
    expect(view.getUint16(cursor + 8, true)).toBe(0);
    const data = cursor + 30 + view.getUint16(cursor + 26, true) + view.getUint16(cursor + 28, true);
    expect(data % 64).toBe(0); count++; cursor = data + view.getUint32(cursor + 18, true);
  }
  expect(count).toBeGreaterThan(1);
  await page.locator('#container').screenshot({path:info.outputPath('download-dark.png')});
  await page.reload(); await stageReady(page); await expect(download).toHaveAttribute('title', 'Download USDZ');
  const formatTrigger = page.getByLabel('Download format', {exact:true});
  await formatTrigger.click();
  await page.locator('[data-usd-menu=view] > summary').hover();
  await expect(formatTrigger).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('[data-usd-menu=view]')).toHaveAttribute('open','');
  await formatTrigger.hover(); await expect(formatTrigger).toHaveAttribute('aria-expanded','true');
  await formatTrigger.focus(); await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-usd-menu=help] > summary')).toBeFocused();
  await page.keyboard.press('ArrowRight'); await expect(formatTrigger).toBeFocused();
  await expect(formatTrigger).toHaveAttribute('aria-expanded','true'); await page.keyboard.press('Escape');
  await clearStage(page); await expect(download).toBeDisabled();
  await page.getByLabel('Download format', {exact:true}).click();
  await expect(page.locator('[data-usd-menu=download]')).not.toHaveAttribute('open', '');
  expect(errors).toEqual([]);
});

test('URL texture dependencies are localized and the resulting USDZ opens offline', async ({page}) => {
  // A non-catalog URL exercises the HTTP resolver, rather than preloaded files.
  await page.route('**/download-test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/download-test/')) { await route.fallback(); return; }
    const source = path.endsWith('root.usda') ? `#usda 1.0
(subLayers=[@child.usda@])
def Xform "World" {
 custom asset data=@palette.bin@
}` : path.endsWith('child.usda') ? '#usda 1.0\ndef Xform "World" {\n def Sphere "Ball" {}\n}\n' : new Uint8Array([7, 12, 23]);
    await route.fulfill({body: typeof source === 'string' ? source : Buffer.from(source)});
  });
  await page.goto('/?viewer=three&render=basic&file=/download-test/root.usda'); await stageReady(page);
  await page.evaluate(async () => (window as any).usdHydra.editStage(stage => stage.DefinePrim('/World/HttpEdit', 'Xform').delete()));
  await page.getByLabel('Download format', {exact:true}).click();
  await page.getByRole('menuitemradio', {name:'USDZ', exact:true}).click();
  const event = page.waitForEvent('download'); await page.getByRole('button',{name:'Download',exact:true}).click();
  const file = await event, bytes = new Uint8Array(await readFile((await file.path())!)), entries = unzipSync(bytes);
  expect(Object.keys(entries).some(name => name.endsWith('child.usda'))).toBe(true);
  expect(Object.keys(entries).some(name => name.endsWith('palette.bin'))).toBe(true);
  expect(Object.values(entries).some(data => data.length === 3 && data[0] === 7)).toBe(true);
  await page.context().setOffline(true);
  expect(await page.evaluate(async data => {
    const path = '/tmp/offline-download.usdz', modulePath = '/usd/bindings/index.js';
    const USD = await (await import(modulePath)).getUsdModule();
    USD.FS_createDataFile('/tmp', 'offline-download.usdz', new Uint8Array(data), true, true, true);
    const stage = await USD.OpenStage(path);
    try { return stage.GetPrimAtPath('/World/Ball').IsValid() && stage.GetPrimAtPath('/World/HttpEdit').IsValid(); }
    finally { USD.ReleaseStage(stage); USD.FS_unlink(path); }
  }, [...bytes])).toBe(true);
});

test('closing a stage during a dependency fetch safely cancels its download', async ({page}) => {
  let release: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const errors: string[] = [], downloads: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('download', file => downloads.push(file.suggestedFilename()));
  await page.route('**/delayed-download/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/delayed-download/')) { await route.fallback(); return; }
    if (path.endsWith('.bin')) await gate;
    await route.fulfill({body: path.endsWith('.usda') ? '#usda 1.0\ndef Sphere "Ball" {\n custom asset data=@later.bin@\n}\n' : 'asset'});
  });
  await page.goto('/?viewer=three&render=basic&file=/delayed-download/root.usda'); await stageReady(page);
  const button = page.getByRole('button',{name:'Download',exact:true});
  const fetch = page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/later.bin'));
  try {
    await button.click(); await fetch;
    await clearStage(page); await expect(button).toBeDisabled();
  } finally { release!(); }
  await expect(button).toHaveAttribute('aria-busy','false');
  expect(downloads).toEqual([]); expect(errors).toEqual([]);
});
