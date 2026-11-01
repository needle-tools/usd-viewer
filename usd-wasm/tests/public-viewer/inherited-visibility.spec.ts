import {test,expect} from '@playwright/test';
import {stageReady,openAppMenu} from './workbench-menus';

const scene=`#usda 1.0
(defaultPrim="World")
def Xform "World" {
 def Xform "Hidden" {
  token visibility="invisible"
  uniform token purpose="guide"
  def BasisCurves "Curve" {
   uniform token type="linear"
   int[] curveVertexCounts=[2]
   point3f[] points=[(-2,0,0),(2,0,0)]
   float[] widths=[.03]
  }
  def Sphere "Sibling" {}
 }
 def Cube "Subject" {}
}`;

test('showing a child unhides its ancestors, preserves hidden siblings and includes its guide purpose',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.context().route(url=>url.pathname==='/test-fixtures/inherited-visibility-test.usda',r=>r.fulfill({contentType:'text/plain',body:scene}));
 await page.goto('/?workspace=studio&viewer=three&render=beauty&file=/test-fixtures/inherited-visibility-test.usda');await stageReady(page);
 const item=page.locator('[data-prim-path="/World/Hidden/Curve"]');
 await expect(item.locator('..')).toHaveAttribute('data-visible','false');
 await item.locator('..').getByRole('button',{name:'Show /World/Hidden/Curve',exact:true}).click();
 await expect(item.locator('..')).toHaveAttribute('data-visible','true');
 await expect(page.locator('[data-prim-path="/World/Hidden/Sibling"]').locator('..')).toHaveAttribute('data-visible','false');
 expect(await page.evaluate(()=>(window as any).usdHydra.includedPurposes)).toContain('guide');
 expect(await page.evaluate(()=>{let count=0;(window as any).usdRoot.traverseVisible((o:any)=>{if(o.userData.usdPrimitiveType==='basisCurves' && o.geometry.attributes.position?.count)count++;});return count;})).toBe(1);
 await openAppMenu(page,'view');const group=page.locator('[data-usd-menu=view] .usd-settings-section').filter({has:page.locator('summary',{hasText:'Helpers'})});await group.locator(':scope > summary').click();
 await expect(page.getByRole('checkbox',{name:'Show guide geometry',exact:true})).toBeChecked();
 await page.getByRole('checkbox',{name:'Show guide geometry',exact:true}).uncheck();
 await expect.poll(()=>page.evaluate(()=>(window as any).usdHydra.includedPurposes.includes('guide'))).toBe(false);
 await page.keyboard.press('Escape');await page.screenshot({path:info.outputPath('inherited-guide-visibility.png')});expect(errors).toEqual([]);
});

test('unloaded payloads retain and visibly mark referenced children in the hierarchy',async({page})=>{
 await page.context().route(url=>url.pathname==='/test-fixtures/payload-visibility-root.usda',r=>r.fulfill({contentType:'text/plain',body:'#usda 1.0\ndef Xform "World" (prepend references=@payload-visibility-base.usda@;prepend payload=@payload-visibility-physics.usda@) {}'}));
 await page.context().route(url=>url.pathname==='/test-fixtures/payload-visibility-base.usda',r=>r.fulfill({contentType:'text/plain',body:'#usda 1.0\n(defaultPrim="Base")\ndef Xform "Base" {\n def Cube "Shape" {}\n def Scope "Empty" {}\n}'}));
 await page.context().route(url=>url.pathname==='/test-fixtures/payload-visibility-physics.usda',r=>r.fulfill({contentType:'text/plain',body:'#usda 1.0\n(defaultPrim="Physics")\ndef Xform "Physics" {\n custom float mass=2\n}'}));
 await page.goto('/?workspace=studio&viewer=three&render=basic&file=/test-fixtures/payload-visibility-root.usda');await stageReady(page);
 await page.getByRole('checkbox',{name:'Load /World',exact:true}).uncheck();
 const root=page.locator('[data-prim-path="/World"]').locator('..');await expect(root).toHaveAttribute('data-loaded','false');
 await expect(root.locator('.usd-tree-load-state')).toBeVisible();
 await expect(page.locator('[data-prim-path="/World/Shape"]').locator('..')).toHaveAttribute('data-loaded','false');
 await expect(page.locator('[data-prim-path="/World/Shape"]').locator('..').locator('[data-prim-action=visibility]')).toBeDisabled();
 await page.getByRole('checkbox',{name:'Load /World',exact:true}).check();await expect(root).toHaveAttribute('data-loaded','true');
 await expect(root.locator('.usd-tree-load-state')).toBeHidden();
});
