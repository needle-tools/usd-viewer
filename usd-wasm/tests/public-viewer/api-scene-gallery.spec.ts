import { test, expect } from '@playwright/test';
import { apiExampleAssets } from '../fixtures/api/examples.js';
import { openSamples, stageReady } from './workbench-menus';
test.describe.configure({ mode: 'parallel' });
const selectedIds = process.env.USD_API_SCENE_IDS?.split(',');
const cases = selectedIds ? apiExampleAssets.filter(asset => selectedIds.includes(asset.executable)) : apiExampleAssets;

for (const viewer of ['three', 'needle']) test(`${viewer}: every API fixture produces finite visible geometry`, async ({ page }, info) => {
  test.setTimeout(600_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/?viewer=${viewer}`); await openSamples(page);
  await page.getByRole('combobox', { name: 'Example library' }).selectOption('needle');
  await page.locator('[data-sample-group="needle:JavaScript%20API"]').click();
  const results = [];
  for (const asset of cases) {
    await test.step(asset.label, async () => {
      await page.locator(`.gallery-card[data-name=${JSON.stringify(asset.label)}]`).click();
      // This name is assigned after the API runner's stage-load barrier, so an
      // old panel cannot satisfy readiness while the next worker is starting.
      await expect(page.locator('.filename-text')).toHaveText(asset.label);
      await stageReady(page);
      const result = await page.evaluate(() => {
        const w = window as any, result = { meshes: 0, positions: 0, invalid: [] as string[] };
        w.usdHydra.scene.traverse((object: any) => {
          const attribute = object.geometry?.attributes?.position;
          if (!object.isMesh || !attribute?.count || !object.visible) return;
          result.meshes++; result.positions += attribute.count;
          if (!object.matrixWorld.elements.every(Number.isFinite) || !attribute.array.every(Number.isFinite)) result.invalid.push(object.name);
        });
        return result;
      });
      expect(result.meshes, asset.label).toBeGreaterThan(0);
      expect(result.positions, asset.label).toBeGreaterThan(2);
      expect(result.invalid, asset.label).toEqual([]);
      await expect(page.locator('#load-error')).toBeHidden();
      await expect.poll(() => page.workers().filter(worker => worker.url().endsWith('/api/worker.js')).length).toBe(0);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.locator('#usd-viewport').screenshot({ path: info.outputPath(`${asset.executable}.png`) });
      results.push({ id: asset.executable, ...result });
      console.info(`${viewer}: ${asset.executable} (${result.positions} vertices)`);
    });
  }
  await info.attach('API scene geometry', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  expect(errors).toEqual([]);
});
