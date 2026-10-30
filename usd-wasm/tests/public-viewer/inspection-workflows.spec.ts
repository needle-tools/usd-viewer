import {test, expect, type Page} from '@playwright/test';
import {stageReady, openAppMenu} from './workbench-menus';

async function sample(page: Page, viewer: string, file: string) {
  await page.goto(`/?viewer=${viewer}&render=basic&file=/test-fixtures/${file}`);
  await stageReady(page);
  await page.evaluate(() => (window as any).usdHydra.setPlaying(false));
}

for(const backend of ['', 'webgl'])test(`growing point outlines resize their instance allocation (${backend||'webgpu'})`,async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`/?viewer=three&render=basic&backend=${backend}`);
  await expect(page.getByRole('button',{name:'Examples',exact:true})).toBeEnabled();
  const source=`#usda 1.0
(startTimeCode=1; endTimeCode=2)
def Points "Cloud" {
 point3f[] points.timeSamples = {1:[(0,0,0)],2:[(0,0,0),(1,0,0),(2,0,0)]}
 float[] widths = [0.4]
}`;
  await page.locator('input[type=file]').setInputFiles({name:'growing-points.usda',mimeType:'text/plain',buffer:Buffer.from(source)});
  await stageReady(page);await page.evaluate(()=>{(window as any).usdHydra.setPlaying(false);(window as any).usdStagePanel.selectPrim('/Cloud');});
  await expect(page.locator('.usd-selection-overlay')).toBeVisible();await page.waitForTimeout(200);
  await page.evaluate(()=>(window as any).usdWorkbench.openPanel('timeline'));
  await page.getByRole('button',{name:'Last frame',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>{let count=0;(window as any).usdRoot.traverse((o:any)=>{if(o.isInstancedMesh&&o.userData.usdPath==='/Cloud')count=o.count;});return count;})).toBe(3);
  await page.waitForTimeout(250);expect(errors).toEqual([]);
  await page.screenshot({path:info.outputPath('grown-point-outlines.png')});
});
async function instancePoint(page: Page, name: string, index: number) {
  return page.evaluate(async ({name,index}) => {
    const w=window as any, T=await import('three');
    const scene=w.needleEngineContext?.scene||w.scene, camera=w.needleEngineContext?.mainCamera||w.usdRenderCamera||w.camera;
    scene.updateMatrixWorld(true);camera.updateMatrixWorld();let object:any;
    scene.traverse((o:any)=>{if(o.isInstancedMesh && o.userData.usdPath.includes(name))object=o;});
    if(!object)throw new Error('Missing instanced object '+name);
    object.geometry.computeBoundingBox();const matrix=new T.Matrix4();object.getMatrixAt(index,matrix);
    const point=object.geometry.boundingBox.getCenter(new T.Vector3()).applyMatrix4(matrix).applyMatrix4(object.matrixWorld).project(camera);
    const r=w.usdWorkbench.viewport.getBoundingClientRect();return{x:r.x+(point.x+1)*r.width/2,y:r.y+(1-point.y)*r.height/2};
  },{name,index});
}
for(const viewer of ['three','needle']) {
  test(`${viewer}: property following and history synchronize the real hierarchy without moving the dock`,async({page})=>{
    await sample(page,viewer,'composition/liverps_all.usda');
    await page.locator('[data-prim-path="/World/Inherits/Shape"]').click();
    const dock=await page.locator('.usd-dock').evaluate(el=>({top:el.scrollTop,left:el.scrollLeft}));
    const camera=await page.evaluate(()=>(window as any).camera.matrixWorld.toArray());
    const properties=page.locator('[data-panel=properties]');
    await properties.getByRole('button',{name:'Follow /Looks/InheritsYellow',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>(window as any).usdStagePanel.selectedPath)).toBe('/Looks/InheritsYellow');
    await properties.getByRole('button',{name:'Follow /Looks/InheritsYellow/Preview.outputs:surface',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>(window as any).usdStagePanel.selectedProperty)).toBe('/Looks/InheritsYellow/Preview.outputs:surface');
    await expect(properties.locator('[data-property-path="/Looks/InheritsYellow/Preview.outputs:surface"]')).toHaveAttribute('data-active','true');
    await properties.getByRole('button',{name:'Back',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>(window as any).usdStagePanel.selectedPath)).toBe('/Looks/InheritsYellow');
    await properties.getByRole('button',{name:'Back',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>(window as any).usdStagePanel.selectedPath)).toBe('/World/Inherits/Shape');
    await properties.getByRole('button',{name:'Forward',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>(window as any).usdStagePanel.selectedPath)).toBe('/Looks/InheritsYellow');
    expect(await page.locator('.usd-dock').evaluate(el=>({top:el.scrollTop,left:el.scrollLeft}))).toEqual(dock);
    expect(await page.evaluate(()=>(window as any).camera.matrixWorld.toArray())).toEqual(camera);
  });

  test(`${viewer}: tree toggle and range selection share viewport state and survive a composition refresh`,async({page})=>{
    await sample(page,viewer,'coverage/lighting-mdl/studio-variants.usda');
    const first=page.locator('[data-prim-path="/World/Sphere0"]'),last=page.locator('[data-prim-path="/World/Sphere2"]');
    await first.click();await last.click({modifiers:['ControlOrMeta']});
    await expect.poll(()=>page.evaluate(()=>(window as any).usdStagePanel.selection.map((x:any)=>x.path))).toEqual(['/World/Sphere0','/World/Sphere2']);
    await expect(first).toHaveAttribute('aria-selected','true');await expect(last).toHaveAttribute('aria-selected','true');
    await expect.poll(()=>page.evaluate(()=>(window as any).usdViewportInteraction.selection.map((x:any)=>x.path))).toEqual(['/World/Sphere0','/World/Sphere2']);
    await first.click();await last.click({modifiers:['Shift']});
    const count=await page.locator('[role=treeitem][aria-selected=true]').count();expect(count).toBeGreaterThanOrEqual(3);
    await page.evaluate(()=>(window as any).usdStagePanel.refresh());
    expect(await page.locator('[role=treeitem][aria-selected=true]').count()).toBe(count);
    await last.click({modifiers:['ControlOrMeta']});await expect(last).toHaveAttribute('aria-selected','false');
  });

  test(`${viewer}: point instances pick separately and native resolver masks only the selected draw instance`,async({page},info)=>{
    await sample(page,viewer,'coverage/core/point-instancer.usda');
    const a=await instancePoint(page,'proto0_',0),b=await instancePoint(page,'proto0_',3);
    await page.mouse.click(a.x,a.y);
    await expect.poll(()=>page.evaluate(()=>(window as any).usdStagePanel.selection[0]?.instances)).toEqual([{path:'/World/Instances',index:0}]);
    await page.keyboard.down('ControlOrMeta');await page.mouse.click(b.x,b.y);await page.keyboard.up('ControlOrMeta');
    await expect.poll(()=>page.evaluate(()=>(window as any).usdStagePanel.selection.map((x:any)=>x.instances[0].index))).toEqual([0,3]);
    const indices=await page.evaluate(async()=>{const w=window as any;let object:any;(w.needleEngineContext?.scene||w.scene).traverse((o:any)=>{if(o.isInstancedMesh)object=o;});return w.usdHydra.resolveSelection(object.userData.usdPath,object.count,w.usdStagePanel.selection);});
    expect(indices).toEqual([0,3]);
    await expect(page.locator('.usd-selection-overlay')).toBeVisible();await page.waitForTimeout(300);
    await page.screenshot({path:info.outputPath('two-point-instances.png')});
    await page.keyboard.press('f');await page.waitForTimeout(400);
    await expect.poll(()=>page.evaluate(()=>(window as any).usdStagePanel.selection.length)).toBe(2);
  });

  test(`${viewer}: native instance picking reaches an authored instance and hierarchy selection resolves its draw mask`,async({page})=>{
    await sample(page,viewer,'coverage/core/native-instances.usda');
    await openAppMenu(page,'view');
    const scene=page.locator('[data-usd-menu=view] .usd-settings-section').filter({hasText:'Scene'});if(await scene.getAttribute('open')===null)await scene.locator(':scope > summary').click();
    await page.getByRole('combobox',{name:'Pick',exact:true}).selectOption('instance');await page.keyboard.press('Escape');
    const point=await instancePoint(page,'proto_Body_',2);await page.mouse.click(point.x,point.y);
    await expect.poll(()=>page.evaluate(()=>(window as any).usdStagePanel.selectedPath)).toBe('/World/Instance2');
    await expect(page.locator('[data-prim-path="/World/Instance2"]')).toHaveAttribute('aria-selected','true');
    await page.locator('[data-prim-path="/World/Instance1"]').click();
    const indices=await page.evaluate(async()=>{const w=window as any;let object:any;(w.needleEngineContext?.scene||w.scene).traverse((o:any)=>{if(o.isInstancedMesh&&o.userData.usdPath.includes('proto_Body_'))object=o;});return w.usdHydra.resolveSelection(object.userData.usdPath,object.count,w.usdStagePanel.selection);});
    expect(indices).toEqual([1]);
  });

  test(`${viewer}: app REPL reads, follows, makes synchronized USD edits and rejects old document access`,async({page})=>{
    await sample(page,viewer,'coverage/lighting-mdl/studio-variants.usda');
    await page.evaluate(()=>(window as any).usdWorkbench.openPanel('console'));
    await expect(page.getByRole('textbox',{name:'JavaScript input'})).toBeVisible();
    expect(await page.evaluate(()=>(window as any).usdRepl.run('await Promise.resolve(6 * 7)'))).toBe(42);
    await page.evaluate(()=>(window as any).usdRepl.run('follow("/World/Sphere1.radius")'));
    await expect.poll(()=>page.evaluate(()=>(window as any).usdStagePanel.selectedProperty)).toBe('/World/Sphere1.radius');
    await page.evaluate(()=>(window as any).usdRepl.run('await edit(stage => { const p=stage.GetPrimAtPath("/World/Sphere1"); const a=p.GetAttribute("radius"); try { a.SetDouble(0.7, NaN); } finally { a.delete(); p.delete(); } })'));
    await expect.poll(()=>page.evaluate(()=>(window as any).usdRepl.run('inspect("/World/Sphere1").attributes.find(a => a.name === "radius").value'))).toBe('0.7');
    await page.evaluate(()=>(window as any).usdRepl.run('await edit(stage => { const p=stage.GetPrimAtPath("/World/Sphere1"); try { p.SetActive(false); } finally {p.delete();} throw new Error("after mutation"); })').catch(()=>{}));
    await expect(page.getByRole('button',{name:'Activate /World/Sphere1',exact:true})).toHaveAttribute('aria-pressed','false');
    await expect.poll(()=>page.evaluate(()=>{const w=window as any;let visible=0;(w.needleEngineContext?.scene||w.scene).traverse((o:any)=>{if(o.isMesh&&o.visible&&o.userData.usdPath==='/World/Sphere1')visible++;});return visible;})).toBe(0);
    await page.evaluate(()=>(window as any).usdRepl.run('await edit(stage => {const p=stage.GetPrimAtPath("/World/Sphere1"); try {p.SetActive(true);} finally {p.delete();}})'));
    await expect(page.getByRole('button',{name:'Deactivate /World/Sphere1',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.evaluate(()=>(window as any).usdRepl.run('scratch.oldPrim = stage.GetPrimAtPath("/World/Sphere1")'));
    await openAppMenu(page,'file');await page.getByRole('link',{name:'Close file',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>(window as any).usdRepl.run('stage.GetPrimAtPath("/World")').then(()=>false,()=>true))).toBe(true);
  });
}
