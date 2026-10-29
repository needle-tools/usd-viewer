import {test, expect} from '@playwright/test';
import {stageReady} from './workbench-menus';

for (const viewer of ['three','needle']) test(`${viewer}: API look variants compose distinct visible warm and cool options`, async ({page}, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/?viewer=${viewer}&file=%2Ftest-fixtures%2Fapi%2Fexamples.js%23variant-switch&render=beauty&stageVariant=%2FWorld%2FProduct%7Clook%7Cwarm`);
  await stageReady(page);
  await page.evaluate(() => (window as any).usdWorkbench.openPanel('properties'));
  const swatches = () => page.evaluate(() => {
    const result: {path: string, color: number[]}[] = [];
    (window as any).usdHydra.scene.traverseVisible((object: any) => {
      if (/\/Product\/(Warm|Cool)Swatch$/.test(object.userData.usdPath || '') && object.isMesh)
        result.push({path:object.userData.usdPath, color:object.material.color.toArray()});
    });
    return result;
  });
  const variant = page.locator('[data-stage-variant=look]');
  for (const choice of ['warm','cool','warm']) {
    await variant.selectOption(choice);
    const suffix = choice === 'warm' ? 'WarmSwatch' : 'CoolSwatch';
    await expect.poll(async () => (await swatches()).map(item => item.path)).toEqual([`/World/Product/${suffix}`]);
    const color = (await swatches())[0].color;
    expect(choice === 'warm' ? color[0] : color[2]).toBeGreaterThan(choice === 'warm' ? color[2] : color[0]);
    await page.locator('#usd-viewport').screenshot({path:info.outputPath(`variant-${choice}.png`)});
  }
  await page.reload(); await stageReady(page);
  await expect.poll(async () => (await swatches()).map(item => item.path)).toEqual(['/World/Product/WarmSwatch']);
  expect(errors).toEqual([]);
});
