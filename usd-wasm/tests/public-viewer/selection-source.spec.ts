import {expect,test} from './test';
import {stageReady} from './workbench-menus';

test('Code links hierarchy selection to the declaring layer and remembers the toggle',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/?workspace=studio&viewer=three&render=basic&assetCache=0&file=/test-fixtures/coverage/production/shot.usda');await stageReady(page);
 await page.evaluate(()=>(window as any).usdWorkbench.openPanel('code'));
 await expect(page.getByRole('button',{name:'Follow selection',exact:true})).toHaveAttribute('aria-pressed','true');
 const declaration=page.locator('.usd-code-view [data-usd-path="/Robot/Body"][data-target=true]');
 await page.evaluate(()=>(window as any).usdStagePanel.selectPrim('/World/Robots/Teal/Body'));
 await expect(declaration).toBeAttached();
 expect(await page.evaluate(()=>(window as any).usdWorkbench.code.sources.find((s:any)=>s.key===(window as any).usdWorkbench.code.selected)?.path)).toMatch(/geometry.usda$/);
 const follow=page.getByRole('button',{name:'Follow selection',exact:true});await follow.click();
 await page.evaluate(()=>(window as any).usdStagePanel.selectPrim('/World'));
 await expect(declaration).toBeAttached();
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  await page.evaluate(()=>(window as any).usdWorkbench.openPanel('code'));
  await page.locator('.usd-code-toolbar').screenshot({path:info.outputPath(`code-${theme}.png`)});
  await page.evaluate(()=>(window as any).usdWorkbench.openPanel('properties'));
  await page.locator('[data-panel=properties]').screenshot({path:info.outputPath(`properties-${theme}.png`)});
  for(const name of ['Copy path','Copy value']){
   const button=page.getByRole('button',{name,exact:true});await expect(button).toHaveText('');await expect(button.locator('svg')).toHaveCount(1);await expect(button).toHaveAttribute('title',name);
  }
 }
 await page.reload();await stageReady(page);await page.evaluate(()=>(window as any).usdWorkbench.openPanel('code'));
 await expect(page.getByRole('button',{name:'Follow selection',exact:true})).toHaveAttribute('aria-pressed','false');
 expect(errors).toEqual([]);
});

test('physics schemas use joints rather than folders in the hierarchy',async({page})=>{
 await page.goto('/?workspace=studio&viewer=three&render=basic&assetCache=0&file=/test-fixtures/coverage/advanced/physics-fixed-joint.usda');await stageReady(page);
 const names=await page.locator('.usd-tree-icon svg').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-icon')));
 expect(names).toContain('physics-fixed');
});
