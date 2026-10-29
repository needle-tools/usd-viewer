import {test, expect} from '@playwright/test';
import {openSettings, stageReady} from './workbench-menus';

for (const viewer of ['three','needle']) test(`${viewer}: purpose round trips restore the initial visible objects`, async ({page}, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/?viewer=${viewer}&file=%2Ftest-fixtures%2Fapi%2Fexamples.js%23purpose&render=beauty`);
  await stageReady(page); await openSettings(page);
  const visible = () => page.evaluate(() => {
    const paths: string[] = [];
    (window as any).usdHydra.scene.traverseVisible((object: any) => {
      if (object.geometry?.attributes.position?.count && object.userData.usdPath) paths.push(object.userData.usdPath);
    });
    return paths.sort();
  });
  const initial = await visible();
  expect(initial).toContain('/World/RenderMesh'); expect(initial).not.toContain('/World/ProxyMesh');
  const purpose = page.getByRole('combobox',{name:'Purpose',exact:true});
  for(let round = 0; round < 2; round++) {
    await purpose.selectOption('proxy');
    await expect.poll(visible).toEqual(['/World/ProxyMesh']);
    await purpose.selectOption('default,render');
    await expect.poll(visible).toEqual(initial);
  }
  await page.keyboard.press('Escape');
  await page.locator('#usd-viewport').screenshot({path:info.outputPath('purpose-restored.png')});
  expect(errors).toEqual([]);
});

