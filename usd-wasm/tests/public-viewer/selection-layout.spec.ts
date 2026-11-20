import {expect,test} from './test';
import {stageReady} from './workbench-menus';

for(const viewer of ['three','needle'])test(`${viewer}: viewport selection cannot scroll a dock containing a stale hidden Stage`,async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1100});
  await page.goto(`/?viewer=${viewer}&file=/test-fixtures/coverage/advanced/physics-collision-group.usda`);await stageReady(page);
  await page.getByRole('button',{name:'Examples',exact:true}).click();
  await page.setViewportSize({width:1440,height:400});
  await expect(page.locator('.usd-workspace')).toHaveCSS('height','355px');
  await expect(page.locator('.usd-viewport')).toHaveCSS('height','355px');
  // Dockview keeps inactive always-rendered panels at their last measured bounds.
  await expect(page.locator('.usd-panel-stage')).toHaveCSS('visibility','hidden');
  const before=await page.locator('.usd-viewport').boundingBox();
  const position=await page.evaluate(async()=>{
    const w=window as any,T=await import('three'),scene=w.needleEngineContext?.scene||w.scene,camera=w.needleEngineContext?.mainCamera||w.usdRenderCamera||w.camera;
    scene.updateMatrixWorld(true);camera.updateMatrixWorld();let mesh:any;scene.traverse((object:any)=>{if(object.isMesh&&object.userData.usdPath==='/World/RackTop')mesh=object;});
    const point=new T.Box3().setFromObject(mesh).getCenter(new T.Vector3()).project(camera),r=w.usdWorkbench.viewport.getBoundingClientRect();
    return{x:r.x+(point.x+1)*r.width/2,y:r.y+(1-point.y)*r.height/2};
  });
  await page.mouse.click(position.x,position.y);
  await expect.poll(()=>page.evaluate(()=>(window as any).usdViewportInteraction.selectedPath)).toBe('/World/RackTop');
  await expect(page.locator('[data-prim-path="/World/RackTop"]')).toHaveAttribute('aria-selected','true');
  expect(await page.locator('.usd-dock').evaluate(el=>el.scrollTop)).toBe(0);
  expect(await page.locator('.usd-viewport').boundingBox()).toEqual(before);
  await page.screenshot({path:info.outputPath('selected-layout.png')});
  await page.getByRole('button',{name:'Examples',exact:true}).click();
  await expect(page.locator('.usd-viewport')).toHaveCSS('height','355px');
  await page.locator('.dv-tab').filter({hasText:/^Stage/}).click();
  await expect(page.locator('[data-prim-path="/World/RackTop"]')).toBeInViewport();
  expect(await page.locator('.usd-dock').evaluate(el=>el.scrollTop)).toBe(0);
  expect(await page.locator('.usd-dock').evaluate(el=>{el.scrollTop=100;return el.scrollTop;})).toBe(0);
  await page.setViewportSize({width:640,height:400});
  await expect(page.locator('.usd-workspace')).toHaveAttribute('data-compact','true');
  await page.evaluate(()=>(window as any).usdStagePanel.selectPrim('/World/Group'));
  await page.setViewportSize({width:1440,height:400});
  await expect(page.locator('.usd-workspace')).toHaveAttribute('data-compact','false');
  expect(await page.locator('.usd-viewport').boundingBox()).toEqual(before);
  expect(await page.locator('.usd-dock').evaluate(el=>el.scrollTop)).toBe(0);
  expect(errors).toEqual([]);
});
