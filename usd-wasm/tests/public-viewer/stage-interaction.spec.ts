import {test,expect,type Page} from './test';
import {stageReady,openAppMenu} from './workbench-menus';
const asset='/test-fixtures/coverage/lighting-mdl/studio-variants.usda';
async function point(page:Page,path:string){return page.evaluate(async path=>{const w=window as any,T=await import('three'),state={scene:w.needleEngineContext?.scene||w.scene,camera:w.needleEngineContext?.mainCamera||w.usdRenderCamera||w.camera};state.scene.updateMatrixWorld(true);state.camera.updateMatrixWorld();let mesh:any;state.scene.traverse((o:any)=>{if(o.isMesh&&o.userData.usdPath===path)mesh=o;});const p=new T.Box3().setFromObject(mesh).getCenter(new T.Vector3()).project(state.camera),r=w.usdWorkbench.viewport.getBoundingClientRect();return{x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2};},path);}
for(const [viewer,backend] of [['three',''],['needle',''],['three','webgl']]){
  const name=viewer+(backend?' WebGL2 fallback':'');
  test(`${name}: viewport hover and click outline real prims; dragging does not select`,async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`/?viewer=${viewer}&backend=${backend}&file=${asset}`);await stageReady(page);await page.evaluate(()=>(window as any).usdHydra.setPlaying(false));
    const position=await point(page,'/World/Sphere1');await page.mouse.move(position.x,position.y);
    await expect.poll(()=>page.evaluate(()=>(window as any).usdViewportInteraction.hoveredPath)).toBe('/World/Sphere1');
    await expect(page.locator('.usd-selection-overlay')).toBeVisible();
    await page.waitForTimeout(200);await page.screenshot({path:info.outputPath('hover.png')});
    await page.mouse.click(position.x,position.y);
    await expect(page.locator('[data-prim-path="/World/Sphere1"]')).toHaveAttribute('aria-selected','true');
    await expect(page.locator('[data-panel=properties] table')).toContainText('radius');
    const png=await page.locator('.usd-selection-overlay').screenshot();
    const outlined=await page.evaluate(async data=>{const image=await createImageBitmap(await(await fetch('data:image/png;base64,'+data)).blob()),c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;let pixels=0;for(let i=0;i<d.length;i+=4)if(Math.abs(d[i]-116)<12&&Math.abs(d[i+1]-175)<12&&Math.abs(d[i+2]-82)<12)pixels++;return pixels;},png.toString('base64'));
    expect(outlined).toBeGreaterThan(20);await page.screenshot({path:info.outputPath('selected.png')});
    await page.mouse.move(position.x,position.y);await page.mouse.down();await page.mouse.move(position.x+80,position.y+20,{steps:6});await page.mouse.up();
    expect(await page.evaluate(()=>(window as any).usdViewportInteraction.selectedPath)).toBe('/World/Sphere1');
    await page.mouse.click(900,120);await expect.poll(()=>page.evaluate(()=>(window as any).usdViewportInteraction.selectedPath)).toBe('');
    await expect(page.locator('.usd-selection-overlay')).toBeHidden();expect(errors).toEqual([]);
  });
  test(`${name}: visibility and activation edit USD and can be reversed`,async({page})=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`/?viewer=${viewer}&backend=${backend}&file=${asset}`);await stageReady(page);
    await page.locator('[data-prim-path="/World/Sphere1"]').hover();
    await page.getByRole('button',{name:'Hide /World/Sphere1',exact:true}).click();
    await expect.poll(()=>page.evaluate(async()=>{const p=(window as any).usdStage.GetPrimAtPath('/World/Sphere1'),a=p.GetAttribute('visibility');try{return await a.GetValueStringAtTime(0);}finally{a.delete();p.delete();}})).toBe('invisible');
    const show=page.getByRole('button',{name:'Show /World/Sphere1',exact:true});await expect(show).toBeFocused();await show.press('Enter');await expect(page.getByRole('button',{name:'Hide /World/Sphere1',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.locator('[data-prim-path="/World"]').hover();await page.getByRole('button',{name:'Deactivate /World',exact:true}).click();await expect(page.locator('[data-prim-path="/World/Sphere1"]')).toHaveCount(0);const activate=page.getByRole('button',{name:'Activate /World',exact:true});await expect(activate).toHaveAttribute('aria-pressed','false');
    await activate.click();await expect(page.locator('[data-prim-path="/World/Sphere1"]')).toBeVisible();expect(errors).toEqual([]);
  });
}
test('stage hierarchy scrolls independently while filter and headings stay fixed',async({page},info)=>{
  await page.setViewportSize({width:1280,height:650});await page.goto('/?viewer=three');await expect(page.getByRole('button',{name:'Examples',exact:true})).toBeEnabled();
  const text='#usda 1.0\ndef Xform "World" {\n'+Array.from({length:160},(_,i)=>`def Cube "Cube${String(i).padStart(3,'0')}" {\n double size = 0.1\n }`).join('\n')+'\n}';
  await page.locator('input[type=file]').setInputFiles({name:'tree.usda',mimeType:'text/plain',buffer:Buffer.from(text)});await stageReady(page);
  await openAppMenu(page,'window');if(!await page.getByRole('checkbox',{name:'Show Stage',exact:true}).isChecked())await page.getByRole('checkbox',{name:'Show Stage',exact:true}).check();await page.keyboard.press('Escape');
  await page.locator('.dv-tab').filter({hasText:/^Stage/}).click();
  const filter=await page.getByRole('searchbox',{name:'Filter prims'}).boundingBox(),tree=page.getByRole('tree',{name:'Stage hierarchy'});
  expect(await tree.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  await tree.hover();await page.mouse.wheel(0,4000);await expect.poll(()=>tree.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  await page.locator('[data-prim-path="/World/Cube159"]').scrollIntoViewIfNeeded();await expect(page.locator('[data-prim-path="/World/Cube159"]')).toBeInViewport();
  expect(await page.getByRole('searchbox',{name:'Filter prims'}).boundingBox()).toEqual(filter);await page.screenshot({path:info.outputPath('scrolled-stage.png')});
});

for(const viewer of ['three','needle'])test(`${viewer}: first-load framing uses the final docked viewport`,async({page})=>{
  await page.setViewportSize({width:1440,height:900});await page.goto(`/?viewer=${viewer}`);await expect(page.getByRole('button',{name:'Examples',exact:true})).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles({name:'wide.usda',mimeType:'text/plain',buffer:Buffer.from('#usda 1.0\ndef Cube "Wide" {\n double size = 2\n double3 xformOp:scale = (8, 1, 1)\n uniform token[] xformOpOrder = ["xformOp:scale"]\n}\n')});await stageReady(page);
  await expect.poll(()=>page.evaluate(async()=>{const w=window as any,T=await import('three'),scene=w.needleEngineContext?.scene||w.scene,camera=w.needleEngineContext?.mainCamera||w.camera,box=new T.Box3();scene.updateMatrixWorld(true);camera.updateMatrixWorld();scene.traverse((o:any)=>{if(o.isMesh&&o.userData.usdPath)box.expandByObject(o);});let extent=0;for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new T.Vector3(x,y,z).project(camera);extent=Math.max(extent,Math.abs(p.x),Math.abs(p.y));}return extent;})).toBeLessThan(1);
});
