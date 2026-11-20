import {test, expect} from './test';
import {clearStage, stageReady} from './workbench-menus';

const asset = '/test-fixtures/asset-explorer/DamagedHelmet.glb.three.usdz';
const url = '/?viewer=three&render=beauty&assetCache=0&file=' + encodeURIComponent(asset);

test('runtime and package requests start while the app module is still loading', async ({page}) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/viewer-app.js', async route => { await held; await route.continue(); });
  const runtime = page.waitForRequest(/\/emHdBindings(?:\.jspi)?\.wasm(?:\?|$)/);
  const model = page.waitForRequest('**' + asset);
  await page.goto(url, {waitUntil:'commit'});
  try {
    await Promise.all([runtime, model]);
    expect(await page.evaluate(() => !!(window as any).usdHydra)).toBe(false);
  } finally { release(); }
  await stageReady(page);
});

test('the requested package downloads before runtime readiness and is consumed once', async ({page}) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route(/\/emHdBindings(?:\.jspi)?\.wasm(?:\?|$)/, async route => { await held; await route.continue(); });
  page.on('request', request => { if (new URL(request.url()).pathname === asset) requests++; });
  const downloaded = page.waitForResponse(response => new URL(response.url()).pathname === asset);
  await page.goto(url, {waitUntil:'domcontentloaded'});
  try {
    const response = await downloaded;
    expect(response.ok()).toBe(true);
    await response.finished();
    expect(await page.evaluate(() => !!(window as any).usdHydra)).toBe(false);
  } finally { release(); }
  await stageReady(page);
  expect(requests).toBe(1);
  expect(await page.evaluate(() => (window as any).usdRenderModes.mode)).toBe('beauty');
  await page.reload();
  await stageReady(page);
  expect(requests).toBe(2);
});

test('a catalog bundle consumes the early USDZ download after mounting its other files', async ({page}) => {
  const sibling = '/test-fixtures/coverage/core/analytic-primitives.usda';
  const requests: string[] = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  await page.route('**/test-fixtures/test-asset-library.js', async route => {
    const response = await route.fetch();
    const entry = {group:'Composition', label:'Package with sibling', root:asset.slice('/test-fixtures/'.length), files:[sibling.slice('/test-fixtures/'.length)]};
    await route.fulfill({response, body:await response.text() + `\ntestAssetLibrary.unshift(${JSON.stringify(entry)});`});
  });
  await page.goto(url);
  await stageReady(page);
  expect(requests.filter(path => path === asset)).toHaveLength(1);
  expect(requests.filter(path => path === sibling)).toHaveLength(1);
  expect(await page.evaluate(() => (window as any).usdHydra.diagnostics().materialAssignments)).toBeGreaterThan(0);
});

test('closing a pending package aborts the request and does not resurrect the stage', async ({page}) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**' + asset, async route => { await held; await route.continue().catch(() => {}); });
  const requested = page.waitForRequest('**' + asset);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url, {waitUntil:'domcontentloaded'});
  await requested;
  await expect(page.locator('#loading-overlay')).toBeVisible();
  try {
    const aborted = page.waitForEvent('requestfailed', request => new URL(request.url()).pathname === asset);
    await clearStage(page);
    await aborted;
  } finally { release(); }
  await expect(page.locator('#loading-overlay')).toBeHidden();
  await expect.poll(() => page.evaluate(() => !!(window as any).usdHydra)).toBe(false);
  expect(errors).toEqual([]);
});

test('an early package failure preserves the load error without a second GET', async ({page}) => {
  let requests = 0;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**' + asset, route => {
    if (route.request().method() === 'GET') requests++;
    return route.fulfill({status:404, body:'Not found'});
  });
  await page.goto(url);
  await expect(page.locator('#load-error')).toBeVisible();
  await expect(page.locator('#load-error')).toContainText('was not found (404)');
  expect(requests).toBe(1);
  expect(errors).toEqual([]);
});

test('required environment download overlaps inspection while first Beauty waits for lighting', async ({page}) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/environments/neutral.hdr', async route => { await held; await route.continue(); });
  await page.goto(url, {waitUntil:'domcontentloaded'});
  try {
    await page.waitForFunction(() => !!(window as any).usdStagePanel);
    await expect(page.locator('#loading-overlay')).toBeVisible();
    expect(await page.evaluate(() => (window as any).usdRenderModes.mode)).not.toBe('beauty');
  } finally { release(); }
  await stageReady(page);
  expect(await page.evaluate(() => !!(window as any).scene.environment)).toBe(true);
  expect(await page.evaluate(() => (window as any).usdRenderModes.mode)).toBe('beauty');
});
