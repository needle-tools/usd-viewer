import {selectExampleFolder, openAppMenu, openSamples, stageReady} from './workbench-menus';
import {expect, test, type Page} from '@playwright/test';

test.use({storageState: {cookies: [], origins: []}});
const fixture = '/test-fixtures/coverage/lighting-mdl/studio-variants.usda';
const mode = (page: Page) => page.getByRole('group', {name: 'Workspace mode'});
const ready = (page: Page) => expect(page.getByRole('button', {name: 'Examples', exact: true})).toBeEnabled();
const layout = (page: Page) => page.evaluate(() => (window as any).usdWorkbench.dock.toJSON());
function sameLayout(actual: any, expected: any) {
  // Dockview redistributes fractional CSS pixels when a group is laid out again.
  if (typeof expected === 'number') { expect(Math.abs(actual-expected)).toBeLessThanOrEqual(1); return; }
  if (expected && typeof expected === 'object') {
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected)) sameLayout(actual[key], expected[key]);
  } else expect(actual).toEqual(expected);
}

test('workspace switch stays separate from menus across intermediate header widths',async({page})=>{
 await page.goto('/?viewer=three&workspace=studio');await ready(page);
 for(const width of [1280,800,760,670,390,320]){
  await page.setViewportSize({width,height:800});
  const bounds=await page.locator('#container').evaluate(header=>{
   const rect=(selector:string)=>header.querySelector(selector)!.getBoundingClientRect();
   const leading=rect('.header-tool-leading'),switcher=rect('.usd-product-mode'),menus=rect('.header-tool-actions'),toggle=rect('.usd-menubar-toggle'),download=rect('.usd-download');
   const next=toggle.width?toggle:menus;
   return{overlap:leading.right-next.left,switchOverflow:switcher.right-leading.right,edge:download.right-innerWidth};
  });
  expect(bounds.overlap).toBeLessThanOrEqual(0);expect(bounds.switchOverflow).toBeLessThanOrEqual(0);expect(bounds.edge).toBeLessThanOrEqual(0);
 }
});

async function fullViewport(page: Page) {
  await expect.poll(() => page.locator('#usd-viewport').evaluate(el => {
    const box = el.getBoundingClientRect(), header = document.querySelector('#container')!.getBoundingClientRect();
    return Math.abs(box.width-innerWidth) + Math.abs(box.height-(innerHeight-header.bottom)) + Math.abs(box.top-header.bottom);
  })).toBeLessThan(2);
}

for (const theme of ['light', 'dark']) test(`${theme}: first visit opens Viewer and Examples fits desktop and mobile`, async ({page}, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(theme => localStorage.setItem('needle-usd-theme', JSON.stringify(theme)), theme);
  await page.goto('/?viewer=three'); await ready(page);
  await expect(mode(page).getByRole('button', {name: 'USD Viewer', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-usd-menu=window]')).toBeHidden();
  await expect(page.locator('#dropzone')).toBeVisible();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({width, height: 800}); await fullViewport(page);
    await expect(mode(page)).toBeVisible();
    expect(await page.locator('#container').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await openSamples(page);
    const dialog = page.getByRole('dialog', {name: 'Examples', exact: true});
    await expect(dialog).toBeVisible();
    await selectExampleFolder(page,'needle');
    await expect(page.locator('.gallery-card').first()).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x+box!.width).toBeLessThanOrEqual(width);
    expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y+box!.height).toBeLessThanOrEqual(800);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true);
    await page.screenshot({path: info.outputPath(`${theme}-viewer-examples-${width}.png`)});
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await fullViewport(page);
    await openAppMenu(page, 'view'); await expect(page.getByRole('combobox', {name: 'Color theme'})).toBeVisible();
    await page.keyboard.press('Escape'); await page.mouse.click(width-2, 790);
    await page.screenshot({path: info.outputPath(`${theme}-viewer-${width}.png`)});
  }
  expect(errors).toEqual([]);
});

for (const viewer of ['three', 'needle']) test(`${viewer}: mode switches keep the scene, renderer and Studio arrangement`, async ({page}, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`/?viewer=${viewer}&file=${fixture}`); await stageReady(page);
  await expect(mode(page).getByRole('button', {name: 'USD Viewer', exact: true})).toHaveAttribute('aria-pressed', 'true'); await fullViewport(page);
  await page.evaluate(() => {
    const w = window as any; w.__modeDriver=w.usdHydra.driver; w.__modeRenderer=w.renderer;
  });
  await mode(page).getByRole('button', {name: 'USD Studio', exact: true}).click();
  await expect(page.getByRole('searchbox', {name: 'Filter prims'})).toBeVisible();
  await page.evaluate(() => {
    const dock=(window as any).usdWorkbench.dock;
    dock.getPanel('stage').api.setSize({width: 330});
    (window as any).usdWorkbench.openPanel('timeline');
  });
  await page.getByRole('searchbox', {name: 'Filter prims'}).fill('Sphere');
  await expect(page.locator('[data-panel=timeline]')).toBeVisible();
  // Let layout notifications settle before comparing the serialized topology.
  await page.waitForTimeout(250); const original = await layout(page);
  for (let i=0; i<2; i++) {
    await mode(page).getByRole('button', {name: 'USD Viewer', exact: true}).click(); await fullViewport(page);
    await expect(page.getByRole('searchbox', {name: 'Filter prims'})).toBeHidden();
    await expect(page.locator('[data-panel=timeline]')).toBeHidden();
    // Clicking a prim in Viewer must not reopen Studio's Properties panel.
    await page.evaluate(() => (window as any).usdWorkbench.selectPrim('/World'));
    await expect(mode(page).getByRole('button', {name: 'USD Viewer', exact: true})).toHaveAttribute('aria-pressed', 'true');
    await openSamples(page); await page.getByRole('button', {name: 'Close examples', exact: true}).click();
    await mode(page).getByRole('button', {name: 'USD Studio', exact: true}).click();
    await expect(page.getByRole('searchbox', {name: 'Filter prims'})).toHaveValue('Sphere');
    await expect(page.locator('[data-panel=timeline]')).toBeVisible();
    sameLayout(await layout(page), original);
    expect(await page.evaluate(() => {
      const w=window as any; return w.__modeDriver===w.usdHydra.driver && w.__modeRenderer===w.renderer;
    })).toBe(true);
  }
  await page.screenshot({path: info.outputPath(`${viewer}-studio.png`)});
  await page.setViewportSize({width: 390, height: 800});
  await mode(page).getByRole('button', {name: 'USD Viewer', exact: true}).click(); await fullViewport(page);
  await mode(page).getByRole('button', {name: 'USD Studio', exact: true}).click();
  await expect(page.locator('[data-panel=timeline]')).toBeVisible();
  await page.setViewportSize({width: 1280, height: 900});
  await expect(page.getByRole('searchbox', {name: 'Filter prims'})).toHaveValue('Sphere');
  sameLayout(await layout(page), original);
  await mode(page).getByRole('button', {name: 'USD Viewer', exact: true}).click(); await fullViewport(page);
  await page.screenshot({path: info.outputPath(`${viewer}-viewer.png`)});
  await page.reload(); await stageReady(page);
  await expect(mode(page).getByRole('button', {name: 'USD Viewer', exact: true})).toHaveAttribute('aria-pressed', 'true'); await fullViewport(page);
  await mode(page).getByRole('button', {name: 'USD Studio', exact: true}).click();
  sameLayout(await layout(page), original);
  expect(errors).toEqual([]);
});

test('Viewer hides floating Studio panels and restores their arrangement', async ({page}) => {
  await page.goto('/?viewer=three&workspace=studio'); await ready(page);
  await page.evaluate(() => {
    const dock=(window as any).usdWorkbench.dock;
    dock.addFloatingGroup(dock.getPanel('examples'), {x: 70, y: 90, width: 460, height: 500});
  });
  await expect(page.locator('.usd-examples-browser')).toBeVisible();
  const before=await layout(page);
  await mode(page).getByRole('button', {name: 'USD Viewer', exact: true}).click(); await fullViewport(page);
  await expect(page.locator('.usd-examples-browser')).toBeHidden();
  await openSamples(page); await expect(page.getByRole('dialog', {name: 'Examples', exact: true})).toBeVisible();
  await page.keyboard.press('Escape');
  await mode(page).getByRole('button', {name: 'USD Studio', exact: true}).click();
  await expect(page.locator('.usd-examples-browser')).toBeVisible();
  sameLayout(await layout(page), before);
});

test('saved workspaces migrate to Studio, and explicit URL mode overrides the remembered choice', async ({page}) => {
  await page.goto('/?viewer=three&workspace=studio'); await ready(page);
  await page.waitForFunction(() => !!localStorage.getItem('needle-usd-workspace-v2'));
  await page.evaluate(() => localStorage.removeItem('needle-usd-product-mode'));
  await page.goto('/?viewer=three'); await ready(page); await expect(mode(page).getByRole('button', {name: 'USD Studio', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await mode(page).getByRole('button', {name: 'USD Viewer', exact: true}).click();
  await page.goto('/?viewer=three'); await ready(page); await expect(mode(page).getByRole('button', {name: 'USD Viewer', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/?viewer=three&workspace=studio'); await ready(page); await expect(mode(page).getByRole('button', {name: 'USD Studio', exact: true})).toHaveAttribute('aria-pressed', 'true');
});

test('choosing an example closes the Viewer browser and keeps Viewer mode', async ({page}) => {
  await page.goto('/?viewer=three'); await ready(page); await openSamples(page);
  await selectExampleFolder(page,'needle');
  await page.locator('[data-sample-group="needle:Lights"]').click();
  await page.locator(`.gallery-card[href*="studio-variants.usda"]`).click();
  await stageReady(page); await expect(page.getByRole('dialog', {name: 'Examples', exact: true})).toBeHidden();
  await expect(mode(page).getByRole('button', {name: 'USD Viewer', exact: true})).toHaveAttribute('aria-pressed', 'true'); await fullViewport(page);
});


test('logo hover preserves header geometry and joint helpers are off on a fresh visit',async({page})=>{
  await page.goto(`/?viewer=three&workspace=studio&file=${encodeURIComponent(fixture)}`);await stageReady(page);
  await page.mouse.move(900,850);
  const logo=page.locator('.needle-logo-link'),before=await logo.boundingBox(),leading=await page.locator('.header-tool-leading').boundingBox();
  await logo.hover();expect(await logo.boundingBox()).toEqual(before);expect(await page.locator('.header-tool-leading').boundingBox()).toEqual(leading);
  expect(await page.evaluate(()=>(window as any).usdHydra.helpers.joints)).toBe(false);
});
