import {test, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {clearStage, openAppMenu, stageReady} from './workbench-menus';

test('USD startup skips glTF tools and area-light tables, then loads the requested exporter', async ({page}) => {
  const requests: string[] = [], errors: string[] = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?viewer=three&render=beauty&file=/test-fixtures/asset-explorer/DamagedHelmet.glb.three.usdz');
  await stageReady(page);
  expect(requests.some(path => /\/(GLTFLoader|GLTFExporter|RectAreaLightTexturesLib)\.js$/.test(path))).toBe(false);
  await page.getByLabel('Download format',{exact:true}).click();
  await page.getByRole('menuitemradio',{name:'glTF',exact:true}).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', {name:'Download', exact:true}).click();
  const file = await downloaded;
  const bytes = await readFile((await file.path())!);
  expect(bytes.subarray(0, 4).toString()).toBe('glTF');
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  expect(requests.some(path => path.endsWith('/GLTFExporter.js'))).toBe(true);
  expect(errors).toEqual([]);
});

for (const viewer of ['three', 'needle']) {
  test(`${viewer}: an explicitly selected EXR environment remains available`, async ({page}) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (/error occurred loading .* environment map/i.test(message.text())) errors.push(message.text()); });
    await page.goto(`/?viewer=${viewer}&render=beauty&env=/test-fixtures/coverage/lighting-mdl/studio-panels.exr&file=/test-fixtures/asset-explorer/DamagedHelmet.glb.three.usdz`);
    await stageReady(page);
    expect(await page.evaluate(() => {
      const w = window as any;
      return !!(w.needleEngineContext?.scene || w.scene)?.environment?.isTexture;
    })).toBe(true);
    expect(errors).toEqual([]);
  });
}


test('closing a glTF load during decoder import prevents a late asset request', async ({page}) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const asset = '/test-fixtures/asset-explorer/DamagedHelmet.glb';
  let requests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === asset) requests++; });
  await page.route('**/loaders/GLTFLoader.js', async route => { await held; await route.continue(); });
  const importing = page.waitForRequest('**/loaders/GLTFLoader.js');
  await page.goto('/?viewer=three&file=' + asset, {waitUntil:'domcontentloaded'});
  await importing;
  try { await clearStage(page); } finally { release(); }
  await page.evaluate(async () => { await (await import('/viewer-runtime-three.js')).loadGltfLoader(); });
  expect(requests).toBe(0);
  await expect(page.locator('#loading-overlay')).toBeHidden();
});
