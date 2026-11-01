import {selectExampleFolder, openAppMenu, openSamples, stageReady} from './workbench-menus';
import {expect,test} from '@playwright/test';

for(const theme of ['light','dark'])test(`${theme}: icons, four navigation states, menu geometry and typography`,async({page},info)=>{
  await page.addInitScript(theme=>localStorage.setItem('needle-usd-theme',JSON.stringify(theme)),theme);
  await page.goto('/?viewer=three&file=/test-fixtures/coverage/lighting-mdl/studio-variants.usda');await stageReady(page);
  const sphere=page.locator('[data-prim-path="/World/Sphere0"]'),floor=page.locator('[data-prim-path="/World/Stage"]');
  const background=()=>sphere.evaluate(el=>getComputedStyle(el.parentElement!).backgroundColor);
  await page.locator('.usd-file-context').hover();const normal=await background();
  await sphere.hover();const hover=await background();
  await sphere.click();await floor.hover();const selected=await background();
  await sphere.hover();const selectedHover=await background();
  expect(new Set([normal,hover,selected,selectedHover]).size).toBe(4);
  await expect(sphere.locator('.usd-tree-icon svg')).toHaveAttribute('data-icon','sphere');
  await expect(page.locator('[data-prim-path="/World/Pedestal0"] .usd-tree-icon svg')).toHaveAttribute('data-icon','view_in_ar');
  await expect(page.locator('[data-prim-path="/World"] .usd-tree-icon svg')).toHaveAttribute('data-icon','transform');
  const fonts=await sphere.evaluate(el=>({name:getComputedStyle(el.querySelector('.usd-tree-name')!).fontFamily,type:getComputedStyle(el.querySelector('.usd-tree-type')!).fontFamily,path:getComputedStyle(document.querySelector('.usd-property-address > code')!).fontFamily}));
  expect(fonts.type).toBe(fonts.name);expect(fonts.path).toContain('Monaspace');
  await openAppMenu(page,'file');
  const commands=page.locator('[data-usd-menu=file] .usd-menu-body > :is(button,a)');
  for(const command of await commands.all())await expect(command.locator(':scope > svg')).toHaveCount(1);
  const layout=await commands.evaluateAll(items=>items.map(item=>{const r=item.querySelector('svg')!.getBoundingClientRect();return{left:r.left,width:r.width,height:item.getBoundingClientRect().height};}));
  expect(new Set(layout.map(item=>item.left)).size).toBe(1);expect(layout.every(item=>item.width===16&&item.height===28)).toBe(true);
  await page.getByRole('button',{name:'Open…',exact:true}).focus();await page.keyboard.press('End');await expect(page.getByRole('link',{name:'Close file',exact:true})).toBeFocused();
  await page.keyboard.press('ArrowDown');await expect(page.getByRole('button',{name:'Open…',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');await expect(page.locator('[data-usd-menu=file] > summary')).toBeFocused();
  await openAppMenu(page,'help');await page.screenshot({path:info.outputPath(`${theme}-menu.png`)});await page.keyboard.press('Escape');
  await openSamples(page);await selectExampleFolder(page,'needle');
  const folder=page.locator('.sample-group-button').filter({hasText:'Lights'}).first();await expect(folder).toBeVisible();await folder.click();
  await page.locator('#examples-search').hover();const active=await folder.evaluate(el=>getComputedStyle(el).backgroundColor);await folder.hover();const activeHover=await folder.evaluate(el=>getComputedStyle(el).backgroundColor);expect(activeHover).not.toBe(active);
  await expect(folder).toHaveClass(/active/);await page.screenshot({path:info.outputPath(`${theme}-examples.png`)});
});

test('composed def, over and class have accurate hierarchy identities',async({page})=>{
  await page.route(url=>url.pathname==='/test-fixtures/icon-specifiers.usda',route=>route.fulfill({contentType:'text/plain',body:`#usda 1.0
( defaultPrim = "World" )
def Xform "World" {
 def Sphere "Ball" {
  double radius = 1
 }
 over "Override" {}
}
class "Template" {}
`}));
  await page.goto('/?viewer=three&assetCache=0&file=/test-fixtures/icon-specifiers.usda');await stageReady(page);
  for(const [path,specifier,icon] of [['/World/Ball','def','sphere'],['/World/Override','over','override'],['/Template','class','layers']]){
    const row=page.locator(`[data-prim-path="${path}"]`);await expect(row).toHaveAttribute('data-specifier',specifier);await expect(row.locator('.usd-tree-icon svg')).toHaveAttribute('data-icon',icon);await expect(row).toHaveAttribute('aria-description',new RegExp(specifier));
  }
});
