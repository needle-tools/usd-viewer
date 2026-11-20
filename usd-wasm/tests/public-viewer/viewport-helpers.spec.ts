import {test,expect,type Page} from './test';
import {stageReady,openAppMenu} from './workbench-menus';

async function openHelpers(page:Page){await openAppMenu(page,'view');const group=page.locator('[data-usd-menu=view] .usd-settings-section').filter({has:page.locator('summary',{hasText:'Helpers'})});if(await group.getAttribute('open')===null)await group.locator(':scope > summary').click();}

test('zero-width curves, control points and purpose filtering work through the Helpers menu',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?workspace=studio&viewer=three&render=beauty&file=/test-fixtures/coverage/core/bezier-curves.usda');await stageReady(page);
  await page.evaluate(async()=>{const w=window as any;w.usdHydra.setPlaying(false);w._controls.enableDamping=false;await w.usdHydra.editStage((stage:any)=>{const prim=stage.GetPrimAtPath('/World/Curves'),attribute=prim.GetAttribute('widths');try{attribute.Set([0]);}finally{attribute.delete();prim.delete();}});});
  await openHelpers(page);
  await expect(page.getByRole('checkbox',{name:'Show curve centerlines',exact:true})).toBeChecked();
  await page.getByRole('checkbox',{name:'Show control points',exact:true}).check();
  const state=await page.evaluate(()=>{const w=window as any,helpers:any[]=[];w.usdRoot.traverse((o:any)=>{if(o.userData.usdHelperFor)helpers.push({kind:o.userData.usdHelperKind,count:o.geometry.instanceCount || o.geometry.attributes.position.count,visible:o.visible});});return helpers;});
  expect(state).toHaveLength(3);expect(state.every(h=>h.visible&&h.count>0)).toBe(true);
  await page.keyboard.press('Escape');
  await page.screenshot({path:info.outputPath('zero-width-curves-and-controls.png')});
  const target=await page.evaluate(async()=>{const w=window as any,{Vector3}=await import('three');const p=new Vector3(-.5,1.5,0).applyMatrix4(w.usdRoot.matrixWorld).project(w.camera),r=w.usdWorkbench.viewport.getBoundingClientRect();return {x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2};});
  await page.mouse.click(target.x,target.y);
  await expect.poll(()=>page.evaluate(()=>(window as any).usdViewportInteraction.selectedPath)).toBe('/World/Curves');
  await page.evaluate(async()=>{await(window as any).usdHydra.setIncludedPurposes(['guide']);});
  expect(await page.evaluate(()=>{let count=0;(window as any).usdRoot.traverse((o:any)=>{if(o.userData.usdHelperFor&&o.visible)count++;});return count;})).toBe(0);
  await page.evaluate(async()=>{await(window as any).usdHydra.setIncludedPurposes(['default','render']);});
  expect(await page.evaluate(()=>{let count=0;(window as any).usdRoot.traverse((o:any)=>{if(o.userData.usdHelperFor&&o.visible)count++;});return count;})).toBe(3);
  await page.reload();await stageReady(page);await openHelpers(page);
  await expect(page.getByRole('checkbox',{name:'Show control points',exact:true})).toBeChecked();
  expect(errors).toEqual([]);
});

test('light and camera gizmos render in raster and both path tracers without entering their geometry',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('net::'))errors.push(message.text());});
  await page.goto('/?workspace=studio&viewer=three&render=basic&file=/test-fixtures/coverage/lighting-mdl/studio-variants.usda');await stageReady(page);
  await openHelpers(page);await page.getByRole('checkbox',{name:'Show lights',exact:true}).check();await page.getByRole('checkbox',{name:'Show cameras',exact:true}).check();await page.keyboard.press('Escape');
  const helpers=await page.evaluate(()=>{const w=window as any,items:string[]=[];w.usdRoot.traverseVisible((o:any)=>{if(o.userData.usdHelperFor)items.push(o.userData.usdHelperKind);});return items;});
  expect(helpers).toContain('lights');expect(helpers).toContain('cameras');
  await page.screenshot({path:info.outputPath('light-camera-helpers.png')});
  for(const mode of ['pathtraced','pathtraced-gk']) {
    await page.evaluate(async mode=>{const w=window as any;await w.usdRenderModes.setSettings({denoiser:null,gkDenoiser:null,maxSamples:2});await w.usdRenderModes.setMode(mode);},mode);
    await expect.poll(()=>page.evaluate(()=>document.querySelectorAll('canvas[data-usd-helper-overlay]').length)).toBe(1);
    await page.waitForTimeout(1000);await page.screenshot({path:info.outputPath(`${mode}-helpers.png`)});
    expect(await page.evaluate(()=>(window as any).usdRenderModes.mode)).toBe(mode);
  }
  expect(errors).toEqual([]);
});

for(const viewer of ['three','needle']) {
  test(`${viewer}: selecting lights and cameras reveals their helpers with global helpers off`,async({page})=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`/?workspace=studio&viewer=${viewer}&render=beauty&file=/test-fixtures/coverage/lighting-mdl/studio-variants.usda`);await stageReady(page);
    await page.evaluate(()=>{const w=window as any;w.usdStagePanel.selectPrim('');w.usdHydra.setHelpers({curves:false,controlPoints:false,points:false,lights:false,cameras:false,joints:false});});
    const visibleHelpers=()=>page.evaluate(()=>{const result:{path:string;kind:string}[]=[];(window as any).usdHydra.scene.traverseVisible((o:any)=>{if(o.userData.usdHelperFor)result.push({path:o.userData.usdHelperFor,kind:o.userData.usdHelperKind});});return result;});
    expect(await visibleHelpers()).toEqual([]);
    await page.locator('[data-prim-path="/World/Camera"]').click();
    await expect.poll(visibleHelpers).toEqual([{path:'/World/Camera',kind:'cameras'}]);
    await page.locator('[data-prim-path="/World/Lights"]').click();
    await expect.poll(async()=>{const helpers=await visibleHelpers();return helpers.length>0&&helpers.every(h=>h.kind==='lights'&&h.path.startsWith('/World/Lights/'));}).toBe(true);
    expect(await page.evaluate(()=>Object.values((window as any).usdHydra.helpers).every(value=>value===false))).toBe(true);
    await page.evaluate(()=>{(window as any).usdStagePanel.selectPrim('');});
    await expect.poll(visibleHelpers).toEqual([]);
    expect(errors).toEqual([]);
  });
  test(`${viewer}: selecting a zero-width curve reveals its centerline and controls without changing preferences`,async({page})=>{
    await page.goto(`/?workspace=studio&viewer=${viewer}&render=beauty&file=/test-fixtures/coverage/core/bezier-curves.usda`);await stageReady(page);
    await page.evaluate(async()=>{const w=window as any;w.usdStagePanel.selectPrim('');w.usdHydra.setHelpers({curves:false,controlPoints:false,points:false,lights:false,cameras:false,joints:false});await w.usdHydra.editStage((stage:any)=>{const prim=stage.GetPrimAtPath('/World/Curves'),widths=prim.GetAttribute('widths');try{widths.Set([0]);}finally{widths.delete();prim.delete();}});});
    await page.locator('[data-prim-path="/World/Curves"]').click();
    const kinds=()=>page.evaluate(()=>{const result:string[]=[];(window as any).usdHydra.scene.traverseVisible((o:any)=>{if(o.userData.usdHelperFor==='/World/Curves')result.push(o.userData.usdHelperKind);});return result.sort();});
    await expect.poll(kinds).toEqual(['controlPoints','controlPoints','curves']);
    expect(await page.evaluate(()=>Object.values((window as any).usdHydra.helpers).every(value=>value===false))).toBe(true);
    await page.evaluate(()=>{(window as any).usdStagePanel.selectPrim('');});
    await expect.poll(kinds).toEqual([]);
  });
}
