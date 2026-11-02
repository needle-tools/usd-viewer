import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {stageReady} from './workbench-menus';

test('large engine stays responsive with remembered geometry source and oversized PNGs',async({page},info)=>{
 const errors:string[]=[],badTextures:string[]=[],workers:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('Renderer crashed'));
 page.on('console',m=>{if(/Error loading USD material texture|PNG texture worker failed/.test(m.text()))badTextures.push(m.text());});
 page.on('worker',w=>{if(w.url().includes('pngDownsample.worker'))workers.push(w.url());});
 // Restore the source that triggered the real freeze, rather than testing a
 // fresh viewport with Code closed. Geometry expands to about 456 MB of USDA.
 await page.addInitScript(()=>{
  (window as any).__engineLongTasks=[];
  new PerformanceObserver(list=>{for(const entry of list.getEntries())(window as any).__engineLongTasks.push(entry.duration);}).observe({type:'longtask',buffered:true});
 });
 await page.goto('/?workspace=studio&viewer=three&file=/test-fixtures/coverage/core/analytic-primitives.usda');await stageReady(page);
 await page.evaluate(()=>{(window as any).usdWorkbench.openPanel('code');localStorage.setItem('needle-usd-code-source',JSON.stringify({kind:'layer',role:'layer',label:'geometries.usd'}));});
 await page.waitForTimeout(200);
 const asset='https://huggingface.co/datasets/nvidia/simready-assets/resolve/4763fbfaa4f8e97658e68b57d01b4c86659e08b5/engineAssembly_v12_engine_a01/simready_usd/sm_engineAssembly_v12_engine_a01_01.usd';
 await page.goto('/?workspace=studio&viewer=three&render=beauty&textures=preview&file='+encodeURIComponent(asset));await stageReady(page);
 const textures=await page.evaluate(async()=>{
  const w=window as any;await w.usdHydra.materialsReady();const found=new Map();
  w.usdHydra.scene.traverseVisible((o:any)=>{if(o.isMesh)for(const m of [o.material].flat())for(const t of Object.values(m) as any[])if(t?.isTexture&&t.userData.usdSourceSize)found.set(t.name,{name:t.name,source:t.userData.usdSourceSize,width:t.image.width,height:t.image.height});});return [...found.values()];
 });
 expect(workers.length).toBeGreaterThan(0);expect(textures.some(t=>t.name.includes('steelStainless')&&Math.max(...t.source)>=4096)).toBe(true);
 for(const t of textures)expect(Math.max(t.width,t.height)).toBeLessThanOrEqual(512);
 const code=page.locator('.usd-code');await expect(code.locator('.usd-code-array-button').first()).toBeVisible();
 await expect(code).not.toHaveAttribute('aria-busy','true');
 const source=await page.evaluate(()=>({bytes:(window as any).usdWorkbench.code.byteLength,nodes:document.querySelector('.usd-code-view code')?.textContent?.length,longest:Math.max(0,...(window as any).__engineLongTasks)}));
 expect(source.bytes).toBeGreaterThan(400_000_000);expect(source.nodes).toBeLessThan(1_000_000);expect(source.longest).toBeLessThan(2000);
 // Selecting real composed mesh prims must not transfer all geometry into Properties.
 const meshPaths=await page.evaluate(async()=>{const h=(window as any).usdHydra;return h.readStage(stage=>{const prims=stage.TraverseAllWithInstanceProxies(null),paths=[];try{for(let i=0;i<prims.size();i++){const prim=prims.get(i);try{if(prim.GetTypeName()==='Mesh')paths.push(prim.GetPath());}finally{prim.delete();}}}finally{prims.delete();}return paths;});});
 expect(meshPaths.length).toBeGreaterThan(0);
 await page.evaluate(path=>{(window as any).__engineLongTasks=[];(window as any).usdStagePanel.selectPrim(path);},meshPaths[0]);
 await page.evaluate(()=>(window as any).usdWorkbench.openPanel('properties'));
 await expect(page.locator('[data-panel=properties] .usd-property-array-pager').first()).toBeVisible();
 const row=page.locator('[data-panel=properties] tr[data-property-path="'+meshPaths[0]+'.points"]');
 await expect(row).toContainText('256 /');
 await row.getByRole('button',{name:'Next array values',exact:true}).click();await expect(row).toContainText('257–512 /');
 await page.evaluate(()=>(window as any).usdWorkbench.openPanel('simulation'));
 const rapier:string[]=[];page.on('request',r=>{if(r.url().includes('/rapier/'))rapier.push(r.url());});
 const interact=page.locator('#usd-physics-controls').getByRole('button',{name:'Interact',exact:true});await interact.click();await expect(interact).toHaveAttribute('aria-pressed','true');
 const physics=await page.evaluate(async()=>{const {readUsdPhysics}=await import('/usd/physics/createPhysics.js'),start=performance.now(),data=await readUsdPhysics((window as any).usdHydra);return{ms:performance.now()-start,bodies:data.bodies.length,shapes:data.shapes.map(s=>({type:s.type,points:s.points?.length,typed:s.points instanceof Float32Array})),joints:data.joints.length,longest:Math.max(0,...(window as any).__engineLongTasks)};});
 await page.waitForTimeout(100);physics.longest=await page.evaluate(()=>Math.max(0,...(window as any).__engineLongTasks));
 await writeFile(info.outputPath('engine-physics-and-inspection.json'),JSON.stringify(physics,null,2));
 expect(physics.bodies).toBe(2);expect(physics.joints).toBe(1);expect(physics.shapes.every(s=>s.type==='mesh'&&s.typed&&s.points>0)).toBe(true);expect(physics.longest).toBeLessThan(1000);expect(rapier).toEqual([]);
 await page.getByRole('button',{name:'Reset',exact:true}).click();
 // The loaded app continues responding to inspection and camera input.
 await page.evaluate(()=>(window as any).usdStagePanel.selectPrim('/RootNode/Geometry'));
 await expect(page.locator('[data-prim-path="/RootNode/Geometry"]')).toHaveAttribute('aria-selected','true');
 await page.screenshot({path:info.outputPath('engine.png')});expect(badTextures).toEqual([]);expect(errors).toEqual([]);
});
