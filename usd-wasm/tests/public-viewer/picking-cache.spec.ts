import {test,expect} from '@playwright/test';

test('worker picking preserves shared indexed/nonindexed geometry, instances, groups and source edits',async({page},info)=>{
 const errors:string[]=[],warnings:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='warning'&&/picking/i.test(m.text()))warnings.push(m.text());});
 await page.route('**/picking-harness.html',route=>route.fulfill({contentType:'text/html',headers:{'Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Opener-Policy':'same-origin'},body:'<script type="importmap">{"imports":{"three":"/three/build/three.module.js"}}</script>'}));
 await page.goto('/picking-harness.html');
 const result=await page.evaluate(async()=>{
  const T=await import('three'),{createPickingCache}=await import('/viewer-picking.js');let ready=0;
  const cache=createPickingCache({onReady:()=>ready++}),scene=new T.Scene(),geometries:any[]=[],meshes:any[]=[],saved:any[]=[];
  for(const indexed of [true,false]){
   const source=new T.SphereGeometry(1,512,256),geometry=indexed?source:source.toNonIndexed();if(!indexed)source.dispose();
   geometry.clearGroups();const count=geometry.index?.count||geometry.attributes.position.count,half=Math.floor(count/6)*3;
   geometry.addGroup(0,half,0);geometry.addGroup(half,count-half,1);
   const mesh=new T.InstancedMesh(geometry,[new T.MeshBasicMaterial(),new T.MeshBasicMaterial()],2);
   mesh.setMatrixAt(0,new T.Matrix4().makeTranslation(indexed?-3:3,0,0));mesh.setMatrixAt(1,new T.Matrix4().makeTranslation(indexed?-3:3,3,0));scene.add(mesh);meshes.push(mesh);geometries.push(geometry);
   saved.push({position:geometry.attributes.position,index:geometry.index,p:geometry.attributes.position.array.slice(),i:geometry.index?.array.slice(),groups:JSON.stringify(geometry.groups)});
  }
  scene.updateMatrixWorld(true);let beats=0;const timer=setInterval(()=>beats++,5);cache.prepare(scene);
  const attached=()=>geometries.every((g,i)=>g.attributes.position===saved[i].position&&g.index===saved[i].index&&g.attributes.position.array.byteLength===saved[i].p.byteLength);
  if(!attached())throw new Error('Rendered buffers detached during worker preparation');
  const wait=async(n:number)=>{const stop=performance.now()+10000;while(ready<n&&performance.now()<stop)await new Promise(r=>setTimeout(r,10));if(ready<n)throw new Error('Picking worker did not finish');};
  await wait(2);clearInterval(timer);const costs:number[]=[],comparisons:any[]=[];
  for(let n=0;n<meshes.length;n++){
   const mesh=meshes[n],ray=new T.Raycaster(new T.Vector3(n===0?-3:3,3,5),new T.Vector3(0,0,-1));
   const expected=ray.intersectObject(mesh,false)[0];
   for(let i=0;i<12;i++){const start=performance.now(),actual=cache.intersect(ray,[mesh]).hits[0];costs.push(performance.now()-start);if(!actual)throw new Error('Missing accelerated hit');if(i===0)comparisons.push({instance:actual.instanceId,expectedInstance:expected.instanceId,distance:Math.abs(actual.distance-expected.distance),uv:actual.uv.distanceTo(expected.uv),face:actual.face.materialIndex,expectedFace:expected.face.materialIndex});}
  }
  const unchanged=attached()&&geometries.every((g,i)=>g.attributes.position.array.every((v:number,j:number)=>v===saved[i].p[j])&&(!g.index||g.index.array.every((v:number,j:number)=>v===saved[i].i[j]))&&JSON.stringify(g.groups)===saved[i].groups);
  geometries[0].translate(8,0,0);const editedRay=new T.Raycaster(new T.Vector3(5,3,5),new T.Vector3(0,0,-1)),pending=cache.intersect(editedRay,[meshes[0]],{defer:true}).pending;
  await wait(3);const edited=cache.intersect(editedRay,[meshes[0]]).hits[0];cache.dispose();
  for(const mesh of meshes){mesh.geometry.dispose();for(const material of mesh.material)material.dispose();mesh.dispose();}
  return {beats,unchanged,pending,comparisons,editedInstance:edited?.instanceId,costs};
 });
 await info.attach('picking',{body:JSON.stringify(result),contentType:'application/json'});
 expect(result.beats).toBeGreaterThan(1);expect(result.unchanged).toBe(true);expect(result.pending).toBe(true);expect(result.editedInstance).toBe(1);
 for(const match of result.comparisons){expect(match.instance).toBe(match.expectedInstance);expect(match.distance).toBeLessThan(1e-5);expect(match.uv).toBeLessThan(1e-5);expect(match.face).toBe(match.expectedFace);}
 const sorted=result.costs.sort((a,b)=>a-b);expect(sorted[Math.floor(sorted.length*.9)]).toBeLessThan(10);
 expect(errors).toEqual([]);expect(warnings).toEqual([]);
});
