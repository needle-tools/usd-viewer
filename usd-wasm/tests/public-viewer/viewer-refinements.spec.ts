import {test,expect} from './test';
import {stageReady,openAppMenu,openSettings} from './workbench-menus';
const file='/test-fixtures/coverage/lighting-mdl/studio-variants.usda';
for(const viewer of ['three','needle'])test(`${viewer}: F frames selection and all, preserves direction and ignores text input`,async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`/?viewer=${viewer}&file=${file}`);await stageReady(page);await page.evaluate(()=>(window as any).usdHydra.setPlaying(false));
  await page.locator('[data-prim-path="/World/Sphere0"]').click();
  const before=await page.evaluate(()=>{const w=window as any,c=w.needleEngineContext?.mainCamera||w.camera;return c.getWorldDirection(c.position.clone()).toArray();});
  await page.keyboard.press('f');await page.waitForTimeout(450);
  const fit=await page.evaluate(async()=>{const w=window as any,T=await import('three'),s=w.needleEngineContext?.scene||w.scene,c=w.needleEngineContext?.mainCamera||w.camera;let mesh:any;s.traverse((o:any)=>{if(o.isMesh&&o.userData.usdPath==='/World/Sphere0')mesh=o;});const b=new T.Box3().setFromObject(mesh),center=b.getCenter(new T.Vector3()).project(c);let extent=0;for(let k=0;k<8;k++){const p=new T.Vector3(k&1?b.max.x:b.min.x,k&2?b.max.y:b.min.y,k&4?b.max.z:b.min.z).project(c);extent=Math.max(extent,Math.abs(p.x),Math.abs(p.y));}return{center:center.toArray(),extent,direction:c.getWorldDirection(new T.Vector3()).toArray(),pose:c.position.toArray()};});
  expect(Math.abs(fit.center[0])).toBeLessThan(.01);expect(Math.abs(fit.center[1])).toBeLessThan(.01);expect(fit.extent).toBeGreaterThan(.5);expect(fit.extent).toBeLessThan(.95);for(let i=0;i<3;i++)expect(fit.direction[i]).toBeCloseTo(before[i],3);
  const search=page.getByRole('searchbox',{name:'Filter prims'});await search.fill('');await search.press('f');await page.waitForTimeout(350);expect(await page.evaluate(()=>{const w=window as any;return(w.needleEngineContext?.mainCamera||w.camera).position.toArray();})).toEqual(fit.pose);
  await search.fill('');await page.locator('[data-prim-path="/World"]').click();await page.keyboard.press('f');await page.waitForTimeout(450);await page.screenshot({path:info.outputPath('framed.png')});
  await openSettings(page);await page.getByRole('combobox',{name:'Camera',exact:true}).selectOption('/World/Camera');await page.keyboard.press('Escape');
  const authored=await page.evaluate(()=>{const w=window as any,c=w.needleEngineContext?.mainCamera||w.usdRenderCamera;w.testAuthoredCamera=c;return{position:c.position.toArray(),quaternion:c.quaternion.toArray()};});
  await page.keyboard.press('f');await page.waitForTimeout(450);expect(await page.evaluate(()=>{const c=(window as any).testAuthoredCamera;return{position:c.position.toArray(),quaternion:c.quaternion.toArray()};})).toEqual(authored);
  await openSettings(page);await expect(page.getByRole('combobox',{name:'Camera',exact:true})).toHaveValue('');await page.keyboard.press('Escape');expect(errors).toEqual([]);
});
test('open menubar follows pointer across menus; Examples opens a persistent panel',async({page})=>{
  await page.goto(`/?viewer=three&file=${file}`);await stageReady(page);
  await page.locator('[data-usd-menu=view]>summary').hover();await expect(page.locator('[data-usd-menu=view]')).not.toHaveAttribute('open','');
  await openAppMenu(page,'file');await page.locator('[data-usd-menu=view]>summary').hover();await expect(page.locator('[data-usd-menu=view]')).toHaveAttribute('open','');await expect(page.locator('[data-usd-menu=file]')).not.toHaveAttribute('open','');
  await page.getByRole('button',{name:'Examples',exact:true}).click();await expect(page.locator('.usd-examples-browser')).toHaveAttribute('data-visible','true');
  await openAppMenu(page,'view');
  await page.locator('[data-usd-menu=window]>summary').hover();await expect(page.locator('[data-usd-menu=window]')).toHaveAttribute('open','');await expect(page.locator('.usd-examples-browser')).toHaveAttribute('data-visible','true');
  await page.keyboard.press('Escape');await page.locator('[data-usd-menu=help]>summary').hover();await expect(page.locator('[data-usd-menu=help]')).not.toHaveAttribute('open','');
});
test('Stage fits full type names and Simulation has its own pane',async({page},info)=>{
  await page.goto(`/?viewer=three&file=${file}`);await stageReady(page);
  const types=await page.locator('.usd-tree-row .usd-tree-type').evaluateAll(nodes=>nodes.map(node=>({text:node.textContent,clipped:node.scrollWidth>node.clientWidth,width:node.getBoundingClientRect().width})));
  expect(types.some(t=>t.text==='RectLight')).toBe(true);expect(types.every(t=>!t.clipped)).toBe(true);expect(new Set(types.map(t=>t.width)).size).toBe(1);
  await openAppMenu(page,'view');expect(await page.locator('[data-usd-menu=view] #usd-physics-controls').count()).toBe(0);await page.keyboard.press('Escape');
  await openAppMenu(page,'window');await page.getByRole('checkbox',{name:'Show Simulation',exact:true}).check();await expect(page.locator('[data-panel=simulation]')).toBeVisible();await expect(page.locator('[data-panel=simulation]')).toContainText('No simulation');
  await page.screenshot({path:info.outputPath('types-simulation.png')});
});
test('gkjohnson does not turn a bright backdrop into environment illumination',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.setViewportSize({width:640,height:480});await page.goto(`/?viewer=three&file=${file}`);await stageReady(page);
  await page.evaluate(async()=>{const w=window as any,T=await import('three');w.usdHydra.setPlaying(false);w.scene.clear();w.scene.environment=null;w.scene.background=new T.Color(1,1,1);const sphere=new T.Mesh(new T.SphereGeometry(1,32,24),new T.MeshStandardMaterial({color:'white',roughness:1}));w.scene.add(sphere);w.camera.position.set(0,0,4);w.camera.lookAt(0,0,0);w._controls.target.set(0,0,0);w.renderer.toneMapping=T.NoToneMapping;w.renderer.setPixelRatio(.3);await w.usdRenderModes.setSettings({maxSamples:8,bounces:2,denoiser:null,gkDenoiser:null});await w.usdRenderModes.setMode('pathtraced-gk');});
  await expect.poll(()=>page.evaluate(()=>(window as any).usdRenderModes.samples)).toBe(8);
  const png=await page.locator('canvas.usd-viewer-three-canvas').screenshot();const pixel=await page.evaluate(async data=>{const img=await createImageBitmap(await(await fetch('data:image/png;base64,'+data)).blob()),c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d')!;ctx.drawImage(img,0,0);return{center:[...ctx.getImageData(c.width/2,c.height/2,1,1).data],background:[...ctx.getImageData(2,2,1,1).data]};},png.toString('base64'));
  expect(pixel.center.slice(0,3).every(v=>v<3),JSON.stringify(pixel)).toBe(true);expect(pixel.background.slice(0,3).every(v=>v>250)).toBe(true);await info.attach('pixels',{body:JSON.stringify(pixel),contentType:'application/json'});expect(errors).toEqual([]);
});
