import {expect,test} from './test';
import {clearStage} from './workbench-menus';

for(const legacyMoves of [false,true])test(`Needle keeps the loaded context through workspace moves${legacyMoves?' without state-preserving DOM moves':''}`,async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  if(legacyMoves)await page.addInitScript(()=>Object.defineProperty(Element.prototype,'moveBefore',{value:undefined,configurable:true}));
  await page.goto('/?viewer=needle&assetCache=0&file=/test-fixtures/coverage/lighting-mdl/studio-variants.usda');
  await page.waitForFunction(()=>!!(window as any).usdStagePanel);
  await page.evaluate(()=>{const w=window as any;w.usdHydra.setPlaying(false);w.retainedContext=w.needleEngineContext;w.retainedHydra=w.usdHydra;});
  const state=()=>page.evaluate(()=>{const w=window as any,context=(document.querySelector('needle-engine') as any).context;return{sameContext:context===w.retainedContext,sameHandle:w.usdHydra===w.retainedHydra,deleted:w.usdHydra.driver.isDeleted(),lost:context.renderer.getContext().isContextLost()};});
  const expected={sameContext:true,sameHandle:true,deleted:false,lost:false};
  await expect.poll(state).toEqual(expected);
  for(const width of [600,390,1440]){
    await page.setViewportSize({width,height:850});
    for(const panel of ['properties','stage','viewport']){
      await page.evaluate(id=>(window as any).usdWorkbench.openPanel(id),panel);
      await expect.poll(state).toEqual(expected);
    }
  }
  await page.locator('needle-engine canvas').screenshot({path:info.outputPath('retained-stage.png')});
  await clearStage(page);await expect.poll(()=>page.evaluate(()=>(window as any).retainedHydra.driver.isDeleted())).toBe(true);
  await page.locator('input[type=file]').setInputFiles({name:'replacement.usda',mimeType:'text/plain',buffer:Buffer.from('#usda 1.0\ndef Cube "Replacement" {}\n')});
  await page.waitForFunction(()=>!!(window as any).usdStagePanel);
  expect(await page.evaluate(()=>{const w=window as any;return{sameContext:w.needleEngineContext===w.retainedContext,newHandle:w.usdHydra!==w.retainedHydra,deleted:w.usdHydra.driver.isDeleted()};})).toEqual({sameContext:true,newHandle:true,deleted:false});
  expect(errors).toEqual([]);
});
