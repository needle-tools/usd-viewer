import {expect, test, type Page} from '@playwright/test';
import {openAppMenu, stageReady} from './workbench-menus';

const fixture = `#usda 1.0
(
    startTimeCode = 1
    endTimeCode = 2
)
def Cube "Test" (documentation = "metadata-doc") {
    custom string typeName = "custom-value"
    custom string documentation.timeSamples = {1: "attribute-doc", 2: "second-doc"}
    custom int[] longArray = [${Array.from({length: 150}, (_, i) => i).join(', ')}]
    custom int[] pagedArray = [${Array.from({length:4096}, (_,i)=>i).join(", ")}]
    custom rel links = [</Looks/Mat/Shader.inputs:roughness>, </Other>, </Missing>, </Other.missing>]
    ${Array.from({length: 35}, (_, i) => `custom float filler${String(i).padStart(2, '0')} = ${i}`).join('\n')}
}
def Xform "Other" {
    custom rel back = </Test.links>
}
def Scope "Looks" {
    def Material "Mat" {
        token outputs:surface.connect = </Looks/Mat/Shader.outputs:surface>
        def Shader "Shader" {
            uniform token info:id = "UsdPreviewSurface"
            float inputs:roughness = 0.4
            float inputs:roughness.connect = </Looks/Mat/Source.outputs:value>
            token outputs:surface
        }
        def Shader "Source" {
            custom float outputs:value = 0.8
        }
    }
}
`;
const host = (page: Page) => page.locator('#property-navigation-host');
const property = (page: Page, name: string) => host(page).locator('tr').filter({has: page.getByRole('rowheader', {name, exact: true})});
async function mount(page: Page, target: string, callback = false) {
  await page.evaluate(async ({target, callback}) => {
    const w = window as any;
    w.usdHydra.setPlaying(false);
    const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/usd/viewer/propertyInspector.css'; document.head.append(style);
    const container = document.createElement('div'); container.id = 'property-navigation-host';
    Object.assign(container.style, {position: 'fixed', right: '10px', top: '180px', height: '520px', width: '430px', zIndex: '200', background: 'var(--surface-panel)', overflow: 'hidden'});
    container.className = 'usd-stage-section';
    document.querySelector('.usd-workbench')!.append(container);
    const {mountPropertyInspector} = await import('/usd/viewer/propertyInspector.js');
    w.inspectorNavigations = [];
    w.testInspector = mountPropertyInspector({stage: w.usdStage, handle: w.usdHydra, container, ...(callback ? {onNavigate: (path: string, options: object) => {w.inspectorNavigations.push({path, options}); w.testInspector.show(path, options);}} : {})});
    w.testInspector.show(target);
  }, {target, callback});
}
async function openFixture(page: Page) {
  await page.goto('/?viewer=three&render=basic&file=/test-fixtures/composition/liverps_all.usda');
  await stageReady(page);
  await openAppMenu(page, 'file');
  await expect(page.getByRole('button', {name: 'Open…', exact: true})).toBeEnabled();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', {name: 'Open…', exact: true}).click();
  await (await chooser).setFiles({name: 'property-navigation.usda', mimeType: 'text/plain', buffer: Buffer.from(fixture)});
  await expect(page.locator('[data-prim-path="/Test"]')).toBeVisible();
}
const target = (page: Page) => page.evaluate(() => (window as any).testInspector.target);

test('composition relationship follows its real target, then a connected output property', async ({page}) => {
  await page.goto('/?viewer=three&render=basic&file=/test-fixtures/composition/liverps_all.usda'); await stageReady(page);
  await mount(page, '/World/Local/Shape');
  const binding = property(page, 'material:binding');
  const destination = await binding.locator('td button').first().getAttribute('data-target');
  expect(destination).toBeTruthy();
  await binding.locator('td button').first().click();
  await expect.poll(() => target(page)).toBe(destination);
  await property(page, 'outputs:surface').locator('.usd-property-connections button').click();
  await expect.poll(() => target(page)).toBe(`${destination}/Preview.outputs:surface`);
  await expect(host(page).locator('tr[data-active=true]')).toBeFocused();
  await host(page).getByRole('button', {name: 'Back', exact: true}).click();
  await expect.poll(() => target(page)).toBe(destination);
});

test('property links, history, filters, missing targets and instance context remain navigational', async ({page}, info) => {
  await openFixture(page); await mount(page, '/Test', true);
  await page.evaluate(() => (window as any).testInspector.show('/Test', {instance: {primPath: '/Test', instanceIndex: 7}}));
  await host(page).getByRole('searchbox', {name: 'Filter properties'}).fill('links');
  await property(page, 'links').locator('th').getByRole('button', {name: 'Follow /Test.links', exact: true}).click();
  expect(await page.evaluate(() => (window as any).inspectorNavigations.at(-1).options.instance)).toEqual({primPath: '/Test', instanceIndex: 7});
  const originalSelection = await page.locator('[data-prim-path][aria-selected=true]').evaluateAll(elements => elements.map(el => el.getAttribute('data-prim-path')));
  const outsideScroll = await page.evaluate(() => ({x: scrollX, y: scrollY, properties: document.querySelector('[data-panel=properties]')!.scrollTop}));
  await property(page, 'links').locator('td').getByRole('button', {name: 'Follow /Looks/Mat/Shader.inputs:roughness', exact: true}).click();
  await expect.poll(() => target(page)).toBe('/Looks/Mat/Shader.inputs:roughness');
  await expect(host(page).getByRole('searchbox')).toHaveValue('');
  await expect(property(page, 'inputs:roughness')).toHaveAttribute('data-active', 'true');
  await expect(property(page, 'inputs:roughness')).toBeFocused();
  await property(page, 'inputs:roughness').locator('.usd-property-connections button').click();
  await expect.poll(() => target(page)).toBe('/Looks/Mat/Source.outputs:value');
  await host(page).getByRole('button', {name: 'Back', exact: true}).click();
  await host(page).getByRole('button', {name: 'Back', exact: true}).click();
  await expect.poll(() => target(page)).toBe('/Test.links');
  expect(await page.evaluate(() => (window as any).inspectorNavigations.at(-1).options)).toEqual({recordHistory: false, instance: {primPath: '/Test', instanceIndex: 7}});
  await host(page).getByRole('button', {name: 'Forward', exact: true}).click();
  await expect.poll(() => target(page)).toBe('/Looks/Mat/Shader.inputs:roughness');
  await host(page).getByRole('button', {name: 'Back', exact: true}).click();
  for (const missing of ['/Missing', '/Other.missing']) {
    await property(page, 'links').locator('td').getByRole('button', {name: `Follow ${missing}`, exact: true}).click();
    await expect(host(page).getByRole('status')).toHaveText(`Unavailable target: ${missing}`);
    await expect.poll(() => target(page)).toBe('/Test.links');
  }
  await property(page, 'links').locator('td').getByRole('button', {name: 'Follow /Other', exact: true}).click();
  await property(page, 'back').locator('td button').click();
  await expect.poll(() => target(page)).toBe('/Test.links');
  expect(await page.locator('[data-prim-path][aria-selected=true]').evaluateAll(elements => elements.map(el => el.getAttribute('data-prim-path')))).toEqual(originalSelection);
  expect(await page.evaluate(() => ({x: scrollX, y: scrollY, properties: document.querySelector('[data-panel=properties]')!.scrollTop}))).toEqual(outsideScroll);
  await expect(host(page).getByRole('button', {name: 'Forward', exact: true})).toBeDisabled();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await host(page).getByRole('button', {name: 'Copy path', exact: true}).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('/Test.links');
  await host(page).getByRole('button', {name: 'Copy value', exact: true}).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('/Other.missing');
  await host(page).screenshot({path: info.outputPath('property-navigation.png')});
});

test('refresh preserves table, expanded raw value, focus and scroll while updating time samples', async ({page}) => {
  await openFixture(page); await mount(page, '/Test');
  await page.evaluate(async () => {await (window as any).usdHydra.setTime(1); (window as any).testInspector.refresh();});
  await expect(property(page, 'typeName').locator('td')).toHaveText(['Cube', 'custom-value']);
  await expect(property(page, 'documentation').locator('td')).toHaveText(['metadata-doc', 'attribute-doc']);
  const cell = property(page, 'longArray').locator('td');
  await cell.dblclick(); await expect(cell).toHaveClass(/expanded/); await cell.focus();
  const table = await host(page).locator('table').elementHandle(), originalCell = await cell.elementHandle();
  const scroll = await host(page).locator('.usd-property-scroller').evaluate(el => el.scrollTop);
  await page.evaluate(async () => {await (window as any).usdHydra.setTime(2); (window as any).testInspector.refresh();});
  await expect(property(page, 'documentation').locator('td')).toHaveText(['metadata-doc', 'second-doc']);
  expect(await table!.evaluate(el => el.isConnected)).toBe(true); expect(await originalCell!.evaluate(el => el.isConnected)).toBe(true);
  await expect(cell).toHaveClass(/expanded/); await expect(cell).toBeFocused();
  expect(await host(page).locator('.usd-property-scroller').evaluate(el => el.scrollTop)).toBe(scroll);
  expect((await cell.textContent())!.length).toBeGreaterThan(200);
  await page.evaluate(() => (window as any).testInspector.show('/Test.links'));
  await expect(property(page, 'links')).toBeFocused();
  const geometry = await host(page).locator('.usd-property-scroller').evaluate(el => ({height: el.clientHeight, scroll: el.scrollHeight}));
  expect(geometry.scroll).toBeGreaterThan(geometry.height);
  await page.evaluate(() => (window as any).testInspector.show('/Test'));
  await page.evaluate(() => (window as any).testInspector.show('/Test.links'));
  await expect(host(page).locator('.usd-property-provenance summary')).toBeVisible();
  await page.evaluate(() => (window as any).testInspector.show('../Other'));
  await expect.poll(() => target(page)).toBe('/Other');
  await page.evaluate(() => (window as any).testInspector.show('.back'));
  await expect.poll(() => target(page)).toBe('/Other.back');
});

test('delayed property snapshots cannot replace a newer navigation or a disposed inspector', async ({page}) => {
  await openFixture(page); await mount(page, '/Test');
  await expect(host(page).locator('tr[data-property-path="/Test.typeName"] td')).toHaveText('custom-value');
  await page.evaluate(() => {
    const w = window as any, readStage = w.usdHydra.readStage.bind(w.usdHydra);
    let delayNext = true;
    w.usdHydra.readStage = async (action: unknown) => {
      const delay = delayNext; delayNext = false;
      const result = await readStage(action);
      if (delay) await new Promise<void>(resolve => { w.releaseInspection = resolve; });
      return result;
    };
    w.testInspector.show('/Test.documentation');
  });
  await expect.poll(() => page.evaluate(() => typeof (window as any).releaseInspection)).toBe('function');
  await page.evaluate(() => (window as any).testInspector.show('/Other'));
  await expect(host(page).locator('.usd-property-address code')).toHaveText('/Other');
  await page.evaluate(() => (window as any).releaseInspection());
  await expect(host(page).locator('.usd-property-address code')).toHaveText('/Other');
  await page.evaluate(() => {
    const w = window as any;
    w.testInspector.show('/Test'); w.testInspector.dispose();
  });
  await expect(host(page).locator('.usd-property-inspector')).toHaveCount(0);
});


test('large property arrays page without expanding the DOM, retain their page on refresh and copy the full value',async({page},info)=>{
 await openFixture(page);await mount(page,'/Test.pagedArray');
 const row=property(page,'pagedArray'),pager=row.locator('.usd-property-array-pager');
 await expect(pager).toContainText('1–256 / 4,096');
 await pager.getByRole('button',{name:'Next array values',exact:true}).click();await expect(pager).toContainText('257–512 / 4,096');
 await page.evaluate(()=>(window as any).testInspector.refresh());await expect(pager).toContainText('257–512 / 4,096');
 await pager.getByRole('button',{name:'Previous array values',exact:true}).click();await expect(pager).toContainText('1–256 / 4,096');
 expect((await row.textContent())!.length).toBeLessThan(3000);
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 await host(page).getByRole('button',{name:'Copy value',exact:true}).click();
 await expect.poll(()=>page.evaluate(async()=>JSON.parse(await navigator.clipboard.readText()).length)).toBe(4096);
 await row.scrollIntoViewIfNeeded();await host(page).screenshot({path:info.outputPath('paged-properties.png')});
});
