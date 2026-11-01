import {selectExampleFolder, openAppMenu, openSamples, openSettings, stageReady} from './workbench-menus';
import {expect, test, type Page} from '@playwright/test';

const fixture = '/test-fixtures/coverage/lighting-mdl/studio-variants.usda';
const bounds = (page: Page, selector: string) => page.locator(selector).evaluate(el => el.getBoundingClientRect().toJSON());
const layout = (page: Page) => page.evaluate(() => {
  const dock = (window as any).usdWorkbench.dock;
  return Object.fromEntries(dock.panels.map((p: any) => [p.id, {group: p.group.id, width: p.api.width, height: p.api.height, location: p.api.location.type}]));
});

test('first-run hierarchy, inspector columns and reopened panels stay coherent', async ({page}, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({width:1440,height:960});
  await page.goto('/?viewer=three');
  await expect(page.getByRole('button', {name:'Examples',exact:true})).toBeEnabled();
  expect(Object.keys(await layout(page))).toEqual(['viewport','examples']);
  await page.screenshot({path:info.outputPath('empty.png')});
  await page.goto(`/?viewer=three&file=${fixture}`); await stageReady(page);await page.evaluate(()=>(window as any).usdWorkbench.openPanel('stage'));
  const panels = await layout(page);
  expect(Math.abs(panels.stage.width-360)).toBeLessThan(2); expect(Math.abs(panels.properties.width-320)).toBeLessThan(2);
  expect(panels.stage.group).toBe(panels.layers.group); expect(panels.settings).toBeUndefined();
  const header = await bounds(page, '#container'), viewport = await bounds(page, '#usd-viewport');
  expect(viewport.top).toBe(header.bottom); expect(Math.abs(viewport.width-(header.width-panels.stage.width-panels.properties.width))).toBeLessThan(3);
  await openSettings(page);
  const fields = await page.locator('[data-usd-menu=view] .usd-settings-row > :is(select,input):visible').evaluateAll(nodes => nodes.map(el => el.getBoundingClientRect().toJSON()));
  expect(fields.length).toBeGreaterThan(3);
  for (const field of fields) { expect(field.height).toBe(28); expect(Math.abs(field.left-fields[0].left)).toBeLessThan(1); expect(Math.abs(field.right-fields[0].right)).toBeLessThan(1); }
  await page.keyboard.press('Escape');
  await page.evaluate(()=>(window as any).usdWorkbench.dock.getPanel('viewport').api.maximize());
  await openSettings(page); await expect(page.getByRole('spinbutton',{name:'Exposure',exact:true})).toBeVisible();
  const restored = await layout(page);
  expect(restored.settings).toBeUndefined(); expect(restored.viewport.width).toBeGreaterThan(panels.viewport.width);
  await page.keyboard.press('Escape');await page.evaluate(()=>(window as any).usdWorkbench.dock.getPanel('viewport').api.exitMaximized());
  await page.evaluate(() => (window as any).usdWorkbench.openPanel('console'));
  const console = await bounds(page, '[data-panel=console]'), view = await bounds(page, '#usd-viewport');
  expect(console.top).toBeGreaterThan(view.bottom); expect(Math.abs(console.left-view.left)).toBeLessThan(2);
  expect(console.height).toBeGreaterThan(140); expect(console.height).toBeLessThan(220);
  await page.screenshot({path:info.outputPath('desktop-console.png')});
  expect(errors).toEqual([]);
});

test('compact panels preserve desktop sizes, live inputs and saved presets through reload', async ({page}, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({width:1440,height:960}); await page.goto(`/?viewer=three&file=${fixture}`); await stageReady(page);
  await page.evaluate(() => { const w=window as any; w.usdWorkbench.dock.getPanel('stage').api.setSize({width:310}); w.__layoutDriver=w.usdHydra.driver; });
  await page.getByRole('searchbox',{name:'Filter prims'}).fill('Sphere');
  const original = await layout(page);
  await page.setViewportSize({width:390,height:700});
  await expect.poll(() => bounds(page,'#usd-viewport').then(b=>b.width)).toBe(390);
  await openAppMenu(page,'window'); await page.getByRole('checkbox',{name:'Show Stage',exact:true}).check();
  await expect(page.getByRole('searchbox',{name:'Filter prims'})).toHaveValue('Sphere');
  await page.getByRole('searchbox',{name:'Filter prims'}).fill('Camera');
  await openSettings(page);
  await expect(page.getByRole('spinbutton',{name:'Exposure',exact:true})).toBeVisible();
  const field=page.getByRole('spinbutton',{name:'Exposure',exact:true}); await field.fill('1.2'); await field.press('Tab');
  await page.screenshot({path:info.outputPath('compact-settings.png')});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Back to viewport',exact:true}).click();
  expect((await layout(page)).stage.width).toBe(original.stage.width);
  expect(Object.values(await layout(page)).every((p:any)=>p.location==='grid')).toBe(true);
  await openAppMenu(page,'window'); await page.getByRole('textbox',{name:'Layout name'}).fill('Compact save'); await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('combobox',{name:'Workspace layout'}).selectOption('viewport');
  await page.getByRole('combobox',{name:'Workspace layout'}).selectOption('saved:Compact save');
  await page.keyboard.press('Escape'); await page.setViewportSize({width:1440,height:960});
  await expect(page.getByRole('searchbox',{name:'Filter prims'})).toHaveValue('Camera');
  expect((await layout(page)).stage.width).toBe(original.stage.width);
  await openSettings(page);await expect(field).toHaveValue('1.2');await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>(window as any).__layoutDriver===(window as any).usdHydra.driver)).toBe(true);
  // Reload at compact width must not overwrite the saved desktop dimensions.
  await page.setViewportSize({width:390,height:700}); await page.reload(); await stageReady(page);
  await page.setViewportSize({width:1440,height:960});
  await expect(page.getByRole('searchbox',{name:'Filter prims'})).toBeVisible();
  expect((await layout(page)).stage.width).toBe(original.stage.width);
  await page.screenshot({path:info.outputPath('restored-desktop.png')}); expect(errors).toEqual([]);
});

for (const theme of ['light','dark']) test(`${theme}: Examples has bounded navigation and results at every size`, async ({page}, info) => {
  await page.addInitScript(theme=>localStorage.setItem('needle-usd-theme',JSON.stringify(theme)),theme);
  await page.goto('/?viewer=three'); await expect(page.getByRole('button',{name:'Examples',exact:true})).toBeEnabled();
  for (const [width,height] of [[1440,960],[700,750],[390,700],[390,420],[320,568]]) {
    await page.setViewportSize({width,height}); await openSamples(page);
    await selectExampleFolder(page,'needle');
    await expect(page.locator('.gallery-card').first()).toBeVisible();
    await expect.poll(async()=>(await bounds(page,'.usd-examples-browser')).bottom).toBeLessThanOrEqual(height);
    const header=await bounds(page,'#container'), gallery=await bounds(page,'.usd-examples-browser'), grid=await bounds(page,'.gallery-grid');
    expect(await page.locator('#container').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    expect(gallery.top).toBeGreaterThanOrEqual(header.bottom); expect(gallery.left).toBeGreaterThanOrEqual(0); expect(gallery.right).toBeLessThanOrEqual(width); expect(gallery.bottom).toBeLessThanOrEqual(height);
    const footer=await bounds(page,'.usd-examples-footer');
    // Preview-source controls wrap to a second row in the narrowest panels.
    expect(grid.height).toBeGreaterThan(120); expect(gallery.bottom-grid.bottom).toBeLessThanOrEqual(footer.height+1); expect(footer.height).toBeLessThan(80);
    const card=await bounds(page,'.gallery-card:first-child'); expect(card.width).toBeGreaterThan(width < 360 ? 120 : 130); expect(card.width).toBeLessThan(250);
    expect(await page.locator('.usd-examples-browser').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await page.locator('.gallery-card').last().scrollIntoViewIfNeeded();
    await expect(page.locator('.gallery-card').last()).toBeInViewport();
    await page.mouse.move(width-2,height-2); await page.waitForTimeout(350);
    await expect(page.locator('.usd-examples-browser')).toBeVisible();
    await page.screenshot({path:info.outputPath(`${theme}-examples-${width}-${height}.png`)});
    await page.keyboard.press('Escape');
  }
});

for (const viewer of ['three','needle']) test(`${viewer}: animated compact viewport retains transport and restored timeline dimensions`, async ({page}, info) => {
  const errors: string[]=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:960});
  await page.goto(`/?viewer=${viewer}&background=dark&file=${fixture.replace('studio-variants','animated-light')}`); await stageReady(page);
  await page.evaluate(() => (window as any).usdWorkbench.openPanel('timeline'));
  await expect(page.getByRole('spinbutton',{name:'Current frame',exact:true})).toBeVisible();
  await page.evaluate(() => {const w=window as any; w.usdHydra.setPlaying(false); w.usdWorkbench.dock.getPanel('timeline').api.setSize({height:130});});
  const original=await layout(page);
  await page.reload(); await stageReady(page);
  await expect.poll(async()=>(await layout(page)).timeline.height).toBe(original.timeline.height);
  await page.setViewportSize({width:390,height:700});
  await expect.poll(() => bounds(page,'#usd-viewport').then(b=>b.width)).toBe(390);
  const frame=page.getByRole('spinbutton',{name:'Current frame',exact:true}); await expect(frame).toBeVisible();
  await frame.fill('24'); await frame.press('Tab'); await expect.poll(()=>page.evaluate(()=>(window as any).usdHydra.getTime())).toBe(24);
  const timeline=await bounds(page,'.usd-timeline'), view=await bounds(page,'#usd-viewport');
  expect(view.top).toBe((await bounds(page,'#container')).bottom); expect(timeline.bottom).toBe(700); expect(timeline.top).toBeGreaterThanOrEqual(view.bottom); expect(timeline.width).toBe(390);
  expect(await page.locator('.usd-timeline').evaluate(el=>el.scrollWidth<=el.clientWidth && el.scrollHeight<=el.clientHeight)).toBe(true);
  await page.screenshot({path:info.outputPath(`${viewer}-compact-animation.png`)});
  await page.reload(); await stageReady(page);
  await expect.poll(() => bounds(page,'#usd-viewport').then(b=>b.width)).toBe(390);
  await page.setViewportSize({width:1440,height:960});
  await expect.poll(async()=>(await layout(page)).timeline.height).toBe(original.timeline.height);
  await page.screenshot({path:info.outputPath(`${viewer}-desktop-animation.png`)});
  await page.evaluate(()=>(window as any).usdWorkbench.openPanel('console'));
  expect((await bounds(page,'[data-panel=console]')).top).toBeGreaterThan((await bounds(page,'[data-panel=timeline]')).bottom);
  expect(errors).toEqual([]);
});

test('dialogs stay inside short and narrow windows with a reachable close control', async ({page}, info) => {
  await page.goto(`/?viewer=three&file=${fixture}`); await stageReady(page);
  for (const [width,height] of [[1280,800],[390,540]]) {
    await page.setViewportSize({width,height});
    for (const [menu,trigger,id,close] of [
      ['help','#about-link','#about-dialog','#dialog-close-btn'],
      ['help','#feedback-link','#feedback-dialog','#feedback-dialog-close-btn'],
      ['file','#export-gltf','#export-dialog','#export-dialog-close-btn'],
    ] as const) {
      await openAppMenu(page,menu); await page.locator(trigger).click();
      await expect(page.locator(id)).toHaveClass(/is-open/);
      // Wait for the existing opening transition before inspecting geometry.
      await expect(page.locator(`${id} .dialog`)).toHaveCSS('opacity','1');
      const box=await bounds(page,`${id} .dialog`);
      expect(box.left).toBeGreaterThanOrEqual(8); expect(box.right).toBeLessThanOrEqual(width-8);
      expect(box.top).toBeGreaterThanOrEqual(0); expect(box.bottom).toBeLessThanOrEqual(height);
      expect(await page.locator(`${id} .dialog-content`).evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
      await expect(page.locator(close)).toBeInViewport();
      await page.screenshot({path:info.outputPath(`${id.slice(1)}-${width}.png`)});
      await page.locator(close).click(); await expect(page.locator(id)).toBeHidden();
    }
  }
});

test('explicit floating panels keep their bounds across compact navigation and can redock', async ({page}, info) => {
  const errors:string[]=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:960}); await page.goto(`/?viewer=three&file=${fixture}`); await stageReady(page);
  await page.locator('[data-prim-path="/World/Camera"]').click();
  await page.evaluate(() => { const d=(window as any).usdWorkbench.dock; d.addFloatingGroup(d.getPanel('properties'),{x:400,y:180,width:440,height:420}); });
  const floating=page.getByRole('dialog',{name:'Properties',exact:true}); await expect(floating).toBeVisible();
  const original=await floating.boundingBox();
  await page.screenshot({path:info.outputPath('floating-properties.png')});
  await page.setViewportSize({width:390,height:700}); await page.evaluate(()=>(window as any).usdWorkbench.openPanel('properties'));
  await page.getByRole('combobox',{name:'Active panel',exact:true}).selectOption('properties');
  await expect(page.locator('[data-panel=properties] table')).toContainText('focalLength');
  await page.setViewportSize({width:1440,height:960}); await expect(floating).toBeVisible();
  expect(await floating.boundingBox()).toEqual(original);
  await page.evaluate(() => {const d=(window as any).usdWorkbench.dock; d.getPanel('properties').api.moveTo({group:d.getPanel('viewport').group,position:'right'});});
  await expect(floating).toHaveCount(0);
  const panels=await layout(page); expect(panels.properties.location).toBe('grid');
  await page.screenshot({path:info.outputPath('redocked-properties.png')}); expect(errors).toEqual([]);
});
