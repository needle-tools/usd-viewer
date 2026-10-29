import { test, expect } from '@playwright/test';
import { stageReady, openSamples } from './workbench-menus';

for (const viewer of ['three', 'needle']) test(`${viewer}: API examples execute into the viewport and restore from their URL`, async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/?viewer=${viewer}`); await openSamples(page);
  await page.getByRole('combobox', { name: 'Example library' }).selectOption('needle');
  await page.locator('[data-sample-group="needle:JavaScript%20API"]').click();
  await expect(page.locator('.gallery-card')).toHaveCount(52);
  await expect.poll(() => page.locator('.gallery-card .gallery-thumb').count()).toBe(52);
  await page.locator('.gallery-card[data-name="Schema Shapes"]').click(); await stageReady(page);
  await expect.poll(() => page.evaluate(() => {
    const w = window as any, paths: string[] = [];
    (w.usdHydra?.scene || w.usdRoot).traverse((o: any) => { if (o.isMesh && o.geometry?.attributes.position?.count) paths.push(o.name); });
    return paths.length;
  })).toBeGreaterThan(1);
  expect(await page.evaluate(() => (window as any).usdStage.GetPrimAtPath('/World/Ball').IsValid())).toBe(true);
  await expect(page.locator('.usd-repl-output')).toContainText('/World/Ball');
  await expect.poll(() => page.workers().filter(worker => worker.url().endsWith('/api/worker.js')).length).toBe(0);
  await page.screenshot({ path: info.outputPath(`${viewer}-api-shapes.png`) });
  await page.reload(); await stageReady(page);
  expect(await page.evaluate(() => (window as any).usdStage.GetPrimAtPath('/World/Box').IsValid())).toBe(true);
  await openSamples(page);
  await page.locator('.gallery-card[data-name="Referenced Layer"]').click(); await stageReady(page);
  expect(await page.evaluate(() => (window as any).usdStage.GetPrimAtPath('/World').IsValid())).toBe(true);
  await page.locator('.gallery-card[data-name="Fixture: MaterialX Texture + Noise"]').click(); await stageReady(page);
  await page.evaluate(async () => (window as any).usdHydra.materialsReady());
  expect(await page.evaluate(() => (window as any).usdStage.GetPrimAtPath('/World/TexturedQuad').IsValid())).toBe(true);
  await page.screenshot({ path: info.outputPath(`${viewer}-api-materialx.png`) });
  await page.locator('.gallery-card[data-name="API Variant Sphere"]').click(); await stageReady(page);
  expect(await page.evaluate(() => (window as any).usdStage.GetPrimAtPath('/World/Shape').GetTypeName())).toBe('Sphere');
  await page.evaluate(async () => (window as any).usdStagePanel.edit((stage: any) => stage.GetPrimAtPath('/World').SetVariantSelection('shape', 'cube')));
  expect(await page.evaluate(() => (window as any).usdStage.GetPrimAtPath('/World/Shape').GetTypeName())).toBe('Cube');
  await page.locator('.gallery-card[data-name="Build Info"]').click();
  await stageReady(page);
  await page.evaluate(() => (window as any).usdWorkbench.openPanel('console'));
  await expect(page.getByRole('log', { name: 'JavaScript output' })).toContainText('openusd');
  await expect(page.locator('#loading-overlay')).toBeHidden();
  expect(await page.evaluate(() => Boolean((window as any).usdStage))).toBe(true);
  await page.screenshot({ path: info.outputPath(`${viewer}-api-output.png`) });
  await openSamples(page); await page.locator('.gallery-card[data-name="Schema Shapes"]').click(); await stageReady(page);
  expect(errors).toEqual([]);
});

test('API fixture dependency failures recover, and replacing an example terminates its worker', async ({ page, context }) => {
  await page.goto('/?viewer=three'); await openSamples(page);
  await page.getByRole('combobox', { name: 'Example library' }).selectOption('needle');
  await page.locator('[data-sample-group="needle:JavaScript%20API"]').click();
  const dependency = '**/test-fixtures/materialx/mtlxFiles/texture_noise_surface.mtlx';
  await context.route(dependency, route => route.fulfill({ status: 404, body: 'missing fixture dependency' }));
  await page.locator('.gallery-card[data-name="Fixture: MaterialX Texture + Noise"]').click();
  await expect(page.locator('#load-error')).toContainText('HTTP 404');
  await expect.poll(() => page.workers().filter(worker => worker.url().endsWith('/api/worker.js')).length).toBe(0);
  await context.unroute(dependency);
  // Hold the worker entry request so cancellation is deterministic, even on a
  // fast machine. The next sample must not wait for the worker timeout.
  let release!: () => void; const hold = new Promise<void>(resolve => { release = resolve; });
  await context.route('**/test-fixtures/api/worker.js', async route => { await hold; await route.continue().catch(() => {}); });
  const request = page.waitForRequest('**/test-fixtures/api/worker.js');
  await page.locator('.gallery-card[data-name="Hello World"]').click(); await request;
  await page.locator('.gallery-card[data-name="Schema Shapes"]').click();
  release(); await context.unroute('**/test-fixtures/api/worker.js'); await stageReady(page);
  expect(await page.evaluate(() => (window as any).usdStage.GetPrimAtPath('/World/Box').IsValid())).toBe(true);
  await expect(page.locator('#load-error')).toBeHidden();
  await expect.poll(() => page.workers().filter(worker => worker.url().endsWith('/api/worker.js')).length).toBe(0);
});
