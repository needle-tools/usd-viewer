import {expect,test} from './test';
import {openSettings,stageReady} from './workbench-menus';

for(const mode of ['basic','beauty'])test(`${mode}: compact properties pauses hidden drawing and returning resumes it`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:700});
  await page.goto('/?viewer=three&file=/test-fixtures/coverage/lighting-mdl/studio-variants.usda');
  await stageReady(page);
  await page.evaluate(async mode=>{
    const w=window as any;w.usdHydra.setPlaying(false);await w.usdRenderModes.setMode(mode);
    w.__draws=0;const render=w.renderer.render;
    w.renderer.render=function(...args:any[]){w.__draws++;return render.apply(this,args);};
  },mode);
  await expect.poll(()=>page.evaluate(()=>(window as any).__draws)).toBeGreaterThan(0);
  await page.evaluate(()=>(window as any).usdWorkbench.openPanel('properties'));
  await expect.poll(()=>page.evaluate(()=>(window as any).usdViewportVisible)).toBe(false);
  await page.waitForTimeout(100);
  await page.evaluate(()=>(window as any).__draws=0);
  await page.waitForTimeout(160);
  expect(await page.evaluate(()=>(window as any).__draws)).toBe(0);
  await openSettings(page);
  const exposure=page.getByRole('spinbutton',{name:'Exposure',exact:true});
  await exposure.fill('1.7');await exposure.press('Tab');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Back to viewport',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).usdViewportVisible)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as any).__draws)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>(window as any).renderer.toneMappingExposure)).toBe(1.7);
  expect(errors).toEqual([]);
});
