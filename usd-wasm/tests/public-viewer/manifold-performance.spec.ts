import {test,expect} from '@playwright/test';
import {stageReady} from './workbench-menus';
const asset='https://huggingface.co/datasets/nvidia/simready-assets/resolve/4763fbfaa4f8e97658e68b57d01b4c86659e08b5/fuelSystem_intake_manifold_d01/simready_usd/sm_fuelSystem_intake_manifold_d01_01.usd';

test('large SimReady mesh has stable Beauty silhouettes and zoom does not raycast each frame',async({page},info)=>{
 const errors:string[]=[],warnings:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='warning'&&/picking/i.test(m.text()))warnings.push(m.text());});
 await page.goto('/?workspace=viewer&viewer=three&render=beauty&file='+encodeURIComponent(asset));await stageReady(page);await page.evaluate(()=>(window as any).usdHydra.materialsReady());await page.mouse.move(10,10);
 await page.evaluate(()=>new Promise<void>(resolve=>{let n=0;function frame(){if(++n===70)resolve();else requestAnimationFrame(frame);}requestAnimationFrame(frame);}));
 const canvas=page.locator('canvas.usd-viewer-three-canvas'),images:string[]=[];
 for(let i=0;i<8;i++){images.push((await canvas.screenshot()).toString('base64'));await page.waitForTimeout(75);}
 const pixels=await page.evaluate(async images=>{
  const frames=[];for(const encoded of images){const image=await createImageBitmap(await(await fetch('data:image/png;base64,'+encoded)).blob()),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);frames.push(ctx.getImageData(0,0,canvas.width,canvas.height).data);image.close();}
  return frames.slice(1).map(right=>{let changed=0;for(let i=0;i<right.length;i+=4)if(Math.max(Math.abs(right[i]-frames[0][i]),Math.abs(right[i+1]-frames[0][i+1]),Math.abs(right[i+2]-frames[0][i+2]))>10)changed++;return changed;});
 },images);
 await info.attach('silhouette-differences',{body:JSON.stringify(pixels),contentType:'application/json'});expect(Math.max(...pixels)).toBeLessThan(1000);
 const point=await page.evaluate(async()=>{
  const w=window as any,T=await import('three'),B=await import('/three-mesh-bvh/build/index.module.js'),camera=w.usdRenderCamera||w.camera;
  const stats=w.__pickStats={stock:0,bvh:[],resolve:0,frames:[]};
  for(const key of ['Mesh','InstancedMesh']){const original=T[key].prototype.raycast;T[key].prototype.raycast=function(...args:any[]){stats.stock++;return original.apply(this,args);};}
  const original=B.MeshBVH.prototype.raycastObject3D;B.MeshBVH.prototype.raycastObject3D=function(...args:any[]){const t=performance.now();try{return original.apply(this,args);}finally{stats.bvh.push(performance.now()-t);}};
  const pick=w.usdHydra.resolvePick.bind(w.usdHydra);w.usdHydra.resolvePick=async(...args:any[])=>{stats.resolve++;return pick(...args);};
  const box=new T.Box3().setFromObject(w.usdHydra.scene),center=box.getCenter(new T.Vector3()).project(camera),r=w.renderer.domElement.getBoundingClientRect();
  return{x:r.x+(center.x+1)*r.width/2,y:r.y+(1-center.y)*r.height/2};
 });
 await page.mouse.move(point.x,point.y);await expect.poll(()=>page.evaluate(()=>(window as any).usdViewportInteraction.hoveredPath)).not.toBe('');
 await page.evaluate(()=>{const w=window as any;w.__pickStats.resolve=0;w.__pickStats.bvh=[];w.__pickStats.stock=0;});
 for(let i=0;i<12;i++){await page.mouse.wheel(0,-20);await page.waitForTimeout(30);}
 const during=await page.evaluate(()=>(window as any).__pickStats.resolve);expect(during).toBe(0);
 await expect.poll(()=>page.evaluate(()=>(window as any).usdViewportInteraction.hoveredPath)).not.toBe('');
 const stats=await page.evaluate(()=>(window as any).__pickStats);expect(stats.stock).toBe(0);expect(stats.resolve).toBeLessThanOrEqual(2);expect(stats.bvh.length).toBeGreaterThan(0);expect(Math.max(...stats.bvh)).toBeLessThan(10);
 await info.attach('zoom-picking',{body:JSON.stringify(stats),contentType:'application/json'});await page.screenshot({path:info.outputPath('manifold.png')});expect(errors).toEqual([]);expect(warnings).toEqual([]);
});
