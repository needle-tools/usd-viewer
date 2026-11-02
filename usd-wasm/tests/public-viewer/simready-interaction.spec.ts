import {test,expect} from '@playwright/test';
import {stageReady} from './workbench-menus';
const base='https://huggingface.co/datasets/nvidia/simready-assets/resolve/4763fbfaa4f8e97658e68b57d01b4c86659e08b5/';
const url=(name:string)=>'/?workspace=studio&viewer=three&render=beauty&file='+encodeURIComponent(`${base}${name}/simready_usd/sm_${name}_01.usd`);

test('blood bag retains a transmissive shell and visible red contents',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url('blood_bag_a01'));await stageReady(page);await page.evaluate(()=>(window as any).usdHydra.materialsReady());
 const materials=await page.evaluate(()=>{
  const result:any[]=[];(window as any).usdHydra.scene.traverseVisible((o:any)=>{if(o.isMesh)for(const m of [o.material].flat())result.push({name:m.name,transmission:m.transmission,opacity:m.opacity,color:m.color?.toArray(),family:m.userData.usdMdlApproximation});});return result;
 });
 expect(materials.some(m=>m.family==='OmniGlass'&&m.transmission===1&&m.opacity===1)).toBe(true);
 expect(materials.some(m=>m.name==='m_opaque__water__red_a01'&&m.color[0]>m.color[1]*10)).toBe(true);
 await page.screenshot({path:info.outputPath('blood-bag.png')});expect(errors).toEqual([]);
});

test('SimReady glasses drag their rendered arm within its hinge limits and keep dependencies attached',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const rapierRequests:string[]=[];page.on('request',request=>{if(request.url().includes('/rapier/'))rapierRequests.push(request.url());});
 await page.goto(url('accessory_eyeglasses_a01'));await stageReady(page);await page.evaluate(()=>(window as any).usdWorkbench.openPanel('simulation'));
 await page.getByRole('button',{name:'Interact',exact:true}).click();
 await expect(page.getByRole('button',{name:'Interact',exact:true})).toHaveAttribute('aria-pressed','true');
 const point=await page.evaluate(async()=>{
  const w=window as any,sim=w.usdPhysics.simulation,{Matrix4,Vector3,Vector2,Raycaster}=await import('three');
  const object=sim.root.children.find((o:any)=>o.visible&&o.isInstancedMesh&&sim.bodyForObject(o,0)?.data.path.endsWith('/arm_01_obj_00'));
  const instance=new Matrix4();object.getMatrixAt(0,instance);sim.root.updateWorldMatrix(true,true);
  const camera=w.usdRenderCamera||w.camera,canvas=w.renderer.domElement,rect=canvas.getBoundingClientRect(),ray=new Raycaster(),geometry=object.geometry,position=geometry.attributes.position,index=geometry.index;
  const candidates:any[]=[];sim.root.traverseVisible((o:any)=>{if(o.isMesh&&!o.userData.usdHelperFor)candidates.push(o);});
  const count=index?.count||position.count,step=Math.max(1,Math.floor(count/300))*3;let best:any,lever=0;
  for(let triangle=0;triangle+2<count;triangle+=step){
   const p=new Vector3();for(let vertex=0;vertex<3;vertex++)p.add(new Vector3().fromBufferAttribute(position,index?index.getX(triangle+vertex):triangle+vertex));
   p.multiplyScalar(1/3).applyMatrix4(instance).applyMatrix4(object.matrixWorld).project(camera);
   if(Math.abs(p.x)>.95||Math.abs(p.y)>.95)continue;
   ray.setFromCamera(new Vector2(p.x,p.y),camera);const hit=ray.intersectObjects(candidates,false)[0];
   if(hit?.object!==object)continue;
   const hinge=sim.bodies.get('/RootNode/Geometry/arm_01_obj_00').body.translation(),local=sim.root.worldToLocal(hit.point.clone()),radius=local.clone().sub(hinge).length();
   if(radius<=lever)continue;lever=radius;
   const target=sim.root.localToWorld(local.sub(hinge).applyAxisAngle(new Vector3(0,0,1),Math.PI/3).add(hinge)).project(camera);
   best={x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2,endX:rect.left+(target.x+1)*rect.width/2,endY:rect.top+(1-target.y)*rect.height/2,joints:sim.joints.size};
  }
  if(best){w.__armBefore=instance.elements.slice();w.__physicsMesh=object;return best;}
  throw new Error('No unobstructed triangle on the arm in the fitted camera');
 });
 await page.mouse.move(point.x,point.y);await page.mouse.down();
 await expect(page.locator('.usd-viewport canvas').first()).toHaveCSS('cursor','grabbing');
 await page.mouse.move(point.endX,point.endY,{steps:20});
 await expect.poll(()=>page.evaluate(async()=>{const w=window as any,{Matrix4}=await import('three'),matrix=new Matrix4();w.__physicsMesh.getMatrixAt(0,matrix);return matrix.elements.reduce((sum:number,v:number,i:number)=>sum+Math.abs(v-w.__armBefore[i]),0);})).toBeGreaterThan(.05);
 await page.mouse.up();
 const state=await page.evaluate(async()=>{
  const w=window as any,sim=w.usdPhysics.simulation,{Quaternion,Vector3}=await import('three'),arm=sim.bodies.get('/RootNode/Geometry/arm_01_obj_00').body,frame=sim.bodies.get('/RootNode/Geometry/base_01_obj_00').body,lens=sim.bodies.get('/RootNode/Geometry/glass_01_obj_00').body;
  const q=new Quaternion().copy(frame.rotation()).invert().multiply(new Quaternion().copy(arm.rotation()));
  return{angle:2*Math.atan2(q.z,q.w)*180/Math.PI,base:new Vector3().copy(frame.translation()).length(),lensDistance:new Vector3().copy(lens.translation()).distanceTo(frame.translation()),joints:sim.joints.size,unsupported:sim.unsupported};
 });
 expect(rapierRequests).toEqual([]);expect(state.joints).toBe(point.joints);expect(state.angle).toBeGreaterThanOrEqual(-1);expect(state.angle).toBeLessThanOrEqual(91);expect(state.base).toBeLessThan(.001);expect(state.lensDistance).toBeLessThan(.001);expect(state.unsupported).toEqual([]);
 await page.screenshot({path:info.outputPath('glasses-dragged.png')});
 await page.getByRole('button',{name:'Reset',exact:true}).click();expect(await page.evaluate(()=>(window as any).usdPhysics.simulation)).toBeNull();expect(errors).toEqual([]);
});

test('cabinet drawers preserve every rendered attachment across repeated poses and refuse unsupported contacts',async({page},info)=>{
 const rapier:string[]=[],errors:string[]=[];page.on('request',r=>{if(r.url().includes('/rapier/'))rapier.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url('fixture_cabinet_b01'));await stageReady(page);await page.evaluate(()=>(window as any).usdHydra.materialsReady());await page.evaluate(()=>(window as any).usdWorkbench.openPanel('simulation'));
 const interact=page.locator('#usd-physics-controls').getByRole('button',{name:'Interact',exact:true});await interact.click();await expect(interact).toHaveAttribute('aria-pressed','true');
 const capture=()=>page.evaluate(async()=>{
  const w=window as any,{Matrix4}=await import('three'),root=w.usdHydra.scene;root.updateWorldMatrix(true,true);const inv=root.matrixWorld.clone().invert(),result:any[]=[];
  root.traverseVisible((object:any)=>{if(!object.isMesh||object.userData.usdHelperFor)return;for(let i=0;i<(object.isInstancedMesh?object.count:1);i++){
   const local=new Matrix4();if(object.isInstancedMesh)object.getMatrixAt(i,local);
   const world=inv.clone().multiply(object.matrixWorld);if(object.isInstancedMesh)world.multiply(local);
   result.push({key:object.uuid+':'+i,owner:w.usdPhysics?.simulation?.bodyForObject(object,i)?.data.path||'',matrix:world.elements});
  }});return result;
 });
 const baseline=await capture();expect(baseline.length).toBeGreaterThanOrEqual(3);
 const compare=async(active='',travel=0)=>{
  const current=new Map((await capture()).map((v:any)=>[v.key,v.matrix]));expect(current.size).toBe(baseline.length);
  for(const item of baseline){const after=current.get(item.key)!;for(let i=0;i<16;i++)expect(after[i],item.owner||item.key).toBeCloseTo(item.matrix[i]+(i===12&&item.owner===active?travel:0),4);}
 };
 for(let cycle=0;cycle<3;cycle++){
  if(cycle)await interact.click();
  for(const part of ['01','02']){
   const path=`/RootNode/Joints/joint_part_${part}_joint_00`,slider=page.getByRole('slider',{name:`Joint ${path}`,exact:true});
   await slider.focus();await page.keyboard.press('End');
   const travel=await page.evaluate(path=>(window as any).usdPhysics.simulation.getJointValue(path),path);expect(travel).toBeGreaterThan(.46);expect(travel).toBeLessThan(.463);
   await compare(`/RootNode/Geometry/part_${part}_obj_00`,travel);
   await page.waitForTimeout(100);await compare(`/RootNode/Geometry/part_${part}_obj_00`,travel);
   if(cycle===2&&part==='02')await page.screenshot({path:info.outputPath('cabinet-constraints.png')});
   await page.keyboard.press('Home');await compare();
  }
  await page.locator('#usd-physics-controls').getByRole('button',{name:'Reset',exact:true}).click();await compare();
 }
 await page.locator('#usd-physics-controls').getByRole('button',{name:'Simulate',exact:true}).click();
 await expect(page.locator('#usd-physics-controls [role=status]')).toContainText(/Simulation unavailable:.*sdf/i);await compare();
 expect(rapier).toEqual([]);expect(errors).toEqual([]);
});

test('cabinet chrome handle pixels move with the drawer in Beauty',async({page},info)=>{
 await page.goto(url('fixture_cabinet_b01'));await stageReady(page);
 await page.evaluate(async()=>{
  const w=window as any,{Vector3}=await import('three'),h=w.usdHydra;await h.materialsReady();
  h.scene.updateWorldMatrix(true,true);w.camera.position.copy(h.scene.localToWorld(new Vector3(2,-3,1.4)));w._controls.target.copy(h.scene.localToWorld(new Vector3(.2,0,.55)));w._controls.update();
  // Mark the actual handle surface before the first pose change, retaining its
  // original shader, draw groups and textureless material-cache behavior.
  h.scene.traverseVisible((o:any)=>{if(o.userData.usdPath?.includes('/part_01_obj_00/'))for(const m of [o.material].flat())if(m.name?.includes('chrome')){m.emissive.setRGB(4,0,0);m.emissiveIntensity=1;}});
  w.usdWorkbench.openPanel('simulation');
 });
 await page.locator('#usd-physics-controls').getByRole('button',{name:'Interact',exact:true}).click();
 const capture=async(name:string)=>{
  await page.waitForTimeout(250);
  const png=await page.locator('#usd-viewport canvas').first().screenshot({path:info.outputPath(name+'.png')});
  return page.evaluate(async b64=>{
   const image=await createImageBitmap(await(await fetch('data:image/png;base64,'+b64)).blob()),canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);
   const data=ctx.getImageData(0,0,image.width,image.height).data;let x=0,y=0,n=0;
   for(let i=0;i<data.length;i+=4)if(data[i]>100&&data[i]>data[i+1]*1.7&&data[i]>data[i+2]*1.7){x+=(i/4)%image.width;y+=Math.floor(i/4/image.width);n++;}
   return{x:x/n,y:y/n,n};
  },png.toString('base64'));
 };
 const before=await capture('handle-rest');expect(before.n).toBeGreaterThan(20);
 await page.evaluate(()=>(window as any).usdPhysics.simulation.setJointValue('/RootNode/Joints/joint_part_01_joint_00',.25));
 const after=await capture('handle-open');expect(after.n).toBeGreaterThan(20);expect(after.x-before.x).toBeGreaterThan(30);
 await page.evaluate(()=>(window as any).usdPhysics.simulation.setJointValue('/RootNode/Joints/joint_part_01_joint_00',0));
 const reset=await capture('handle-returned');expect(Math.abs(reset.x-before.x)).toBeLessThan(4);expect(Math.abs(reset.y-before.y)).toBeLessThan(4);
 const focus=()=>page.evaluate(async()=>{
  const w=window as any;w.usdStagePanel.selectPrim('/RootNode/Geometry/part_01_obj_00/part_01_mesh_00/m_opaque__metal__chrome_a01');
  return w.usdViewportInteraction.focus({instant:true});
 });
 const restBounds=(await focus()).bounds;
 expect(restBounds.max[0]-restBounds.min[0]).toBeLessThan(.1);
 await page.evaluate(()=>(window as any).usdPhysics.simulation.setJointValue('/RootNode/Joints/joint_part_01_joint_00',.25));
 const movedBounds=(await focus()).bounds;
 expect(movedBounds.min[0]-restBounds.min[0]).toBeCloseTo(.25,5);
 expect(movedBounds.max[0]-restBounds.max[0]).toBeCloseTo(.25,5);
});
