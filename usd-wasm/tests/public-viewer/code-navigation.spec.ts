import {test,expect,type Page} from '@playwright/test';
import {openAppMenu,stageReady} from './workbench-menus';

async function openCode(page:Page){
  await openAppMenu(page,'window');await page.getByRole('checkbox',{name:'Show Code'}).check();
  await page.evaluate(()=>(window as any).usdWorkbench.dock.getPanel('code').api.maximize());
}
const code=(page:Page)=>page.locator('.usd-code-view');
const path=(page:Page)=>page.evaluate(()=>(window as any).usdWorkbench.code.sources.find((s:any)=>s.key===(window as any).usdWorkbench.code.selected)?.path);
const text=(page:Page)=>page.evaluate(()=>(window as any).usdWorkbench.code.text);
test.beforeEach(async({page})=>{const errors:string[]=[];(page as any).errors=errors;page.on('pageerror',e=>errors.push(e.message));});
test.afterEach(async({page})=>expect((page as any).errors).toEqual([]));

test('layer references open beside the same stage, with source history and external prim targets',async({page},info)=>{
  await page.goto('/?viewer=three&render=basic&assetCache=0&file=/test-fixtures/coverage/production/shot.usda');await stageReady(page);await openCode(page);
  const stageRoot=await page.evaluate(()=>(window as any).usdStage.GetRootLayer().GetIdentifier());
  const original=await text(page);
  await code(page).getByRole('link',{name:'@lighting.usda@',exact:true}).click();
  await expect.poll(()=>path(page)).toMatch(/lighting.usda$/);
  await page.getByRole('button',{name:'Previous source',exact:true}).click();
  await expect.poll(()=>text(page)).toBe(original);
  await page.getByRole('button',{name:'Next source',exact:true}).click();
  await expect.poll(()=>path(page)).toMatch(/lighting.usda$/);
  await page.getByRole('button',{name:'Previous source',exact:true}).click();
  await code(page).getByRole('link',{name:'@layout.usda@',exact:true}).click();
  await expect.poll(()=>path(page)).toMatch(/layout.usda$/);
  await code(page).locator('a[data-reference="/Robot"]').first().click();
  await expect.poll(()=>path(page)).toMatch(/model.usda$/);
  await expect(code(page).locator('[data-usd-path="/Robot"][data-target=true]')).toBeVisible();
  await code(page).getByRole('link',{name:'@geometry.usda@',exact:true}).click();
  await expect.poll(()=>path(page)).toMatch(/geometry.usda$/);
  expect(await page.evaluate(()=>(window as any).usdStage.GetRootLayer().GetIdentifier())).toBe(stageRoot);
  await page.locator('.usd-code').screenshot({path:info.outputPath('layer-links.png')});
});

test('USD connections and relative relationship targets navigate to their real properties',async({page})=>{
  const fixture=`#usda 1.0
 def Xform "World" {
  def Cube "Box" {
   rel material:binding = <../Looks/Mat>
  }
  def Scope "Looks" {
   def Material "Mat" {
    token outputs:surface.connect = <Shader.outputs:surface>
    def Shader "Shader" {
     uniform token info:id = "UsdPreviewSurface"
     token outputs:surface
    }
   }
  }
 }`;
  await page.route('**/code-links.usda',route=>route.fulfill({contentType:'text/plain',body:fixture}));
  await page.goto('/?viewer=three&render=basic&assetCache=0&file=%2Fcode-links.usda');await stageReady(page);await openCode(page);
  await code(page).getByRole('link',{name:'</World/Looks/Mat>',exact:true}).click();
  await expect(code(page).locator('[data-usd-path="/World/Looks/Mat"][data-target=true]')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).usdStagePanel.selectedPath)).toBe('/World/Looks/Mat');
  await code(page).getByRole('link',{name:'</World/Looks/Mat/Shader.outputs:surface>',exact:true}).click();
  await expect(code(page).locator('[data-usd-path="/World/Looks/Mat/Shader.outputs:surface"][data-target=true]')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).usdStagePanel.selectedProperty)).toBe('/World/Looks/Mat/Shader.outputs:surface');
  expect(await code(page).locator('code').textContent()).toBe(await text(page));
});

test('JavaScript imports and texture paths open their source files without executing them',async({page})=>{
  await page.goto('/?viewer=three&render=basic&assetCache=0&file=%2Ftest-fixtures%2Fapi%2Fexamples.js%23hello-world');await stageReady(page);await openCode(page);
  await page.getByRole('treeitem',{name:'execute.js',exact:true}).click();
  await code(page).getByRole('link',{name:"'./scene-helpers.js'",exact:true}).click();
  await expect.poll(()=>path(page)).toMatch(/scene-helpers.js$/);
  await expect.poll(()=>text(page)).toContain('export function createSceneHelpers');
  await page.getByRole('button',{name:'Previous source',exact:true}).click();
  await expect.poll(()=>path(page)).toMatch(/execute.js$/);
  await page.goto('/?viewer=three&render=basic&assetCache=0&file=/test-fixtures/coverage/textures/ktx2-mosaic.usda');await stageReady(page);await openCode(page);
  const texture=code(page).locator('a[data-reference$=".ktx2"]').first();
  await expect(texture).toBeVisible();await texture.click();
  await expect(page.locator('.usd-code-file-info')).toContainText('KTX2');
});

test('an unloaded dependency opens on demand using its layer URL as the anchor',async({page})=>{
  let requests=0;
  await page.route('**/source-navigation/root.usda',route=>route.fulfill({contentType:'text/plain',body:`#usda 1.0
def Cube "Box" {
 custom asset notes = @extras/notes.txt@
 custom asset missing = @extras/missing.txt@
}
`}));
  await page.route('**/source-navigation/extras/notes.txt',route=>{requests++;return route.fulfill({contentType:'text/plain',body:'Notes from the layer’s own folder.'});});
  await page.route('**/source-navigation/extras/missing.txt',route=>route.fulfill({status:404,body:'Missing'}));
  await page.goto('/?viewer=three&render=basic&assetCache=0&file=%2Fsource-navigation%2Froot.usda');await stageReady(page);await openCode(page);
  const stageRoot=await page.evaluate(()=>(window as any).usdStage.GetRootLayer().GetIdentifier());
  expect(requests).toBe(0);
  await code(page).getByRole('link',{name:'@extras/notes.txt@',exact:true}).click();
  await expect.poll(()=>text(page)).toBe('Notes from the layer’s own folder.');
  expect(requests).toBe(1);
  await page.getByRole('button',{name:'Previous source',exact:true}).click();
  await code(page).getByRole('link',{name:'@extras/missing.txt@',exact:true}).click();
  await expect(page.locator('.usd-code-status')).toContainText('HTTP 404');
  expect(await page.evaluate(()=>(window as any).usdStage.GetRootLayer().GetIdentifier())).toBe(stageRoot);
});

test('clicking Code does not frame its pane; keyboard focus uses a neutral cue',async({page},info)=>{
  await page.goto('/?viewer=three&render=basic&assetCache=0&file=/test-fixtures/coverage/production/shot.usda');await stageReady(page);await openCode(page);
  for(const theme of ['light','dark']){
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    await code(page).click({position:{x:20,y:15}});
    expect(await code(page).evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('none');
    expect(await page.locator('.dockview-theme-needle-usd').evaluate(el=>getComputedStyle(el).getPropertyValue('--dv-paneview-active-outline-color').trim())).toBe('transparent');
    await page.getByRole('treeitem',{name:'shot.usda',exact:true}).focus();
    await page.keyboard.press('ArrowDown');
    const color=await page.locator('.usd-code-files [tabindex="0"]').evaluate(el=>getComputedStyle(el).outlineColor);
    expect(color).not.toMatch(/116, 175, 82|153, 204, 51/);
    await page.locator('.usd-code').screenshot({path:info.outputPath(`code-focus-${theme}.png`)});
  }
});
