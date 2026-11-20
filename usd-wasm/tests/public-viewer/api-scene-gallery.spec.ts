import { test, expect } from './test';
import { apiExampleAssets } from '../fixtures/api/examples.js';

// One test per fixture, each loaded into the worker's running viewer.
// api-examples.spec covers opening them from the Examples gallery.
const selectedIds = process.env.USD_API_SCENE_IDS?.split(',');
const cases = selectedIds ? apiExampleAssets.filter(asset => selectedIds.includes(asset.executable)) : apiExampleAssets;

for (const viewer of ['three', 'needle']) for (const asset of cases) test(`${viewer}: API fixture ${asset.executable} produces finite visible geometry`, async ({ app }) => {
  const {page, errors, load} = await app(`viewer=${viewer}`);
  await load('/test-fixtures/' + asset.root);
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
  expect(result.meshes).toBeGreaterThan(0);
  expect(result.positions).toBeGreaterThan(2);
  expect(result.invalid).toEqual([]);
  await expect(page.locator('#load-error')).toBeHidden();
  await expect.poll(() => page.workers().filter(worker => worker.url().split('?')[0].endsWith('/api/worker.js')).length).toBe(0);
  expect(errors).toEqual([]);
});
