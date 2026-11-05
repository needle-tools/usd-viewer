import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3} from 'three';
import R from '@dimforge/rapier3d-compat';
import {exportFixture} from './export-simready-fixture.mjs';
import {registerSimreadyLoader} from '@needle-tools/simready/gltf';

// Explicit checkout input makes this a reproducible integration gate without
// teaching either package about a developer's private directory layout.
if(!process.argv[2])throw new Error('Usage: node scripts/test-baker-simready.mjs <baker checkout> [exported GLB]');
const alive=setInterval(()=>{},1000);
globalThis.ProgressEvent ||= class {};
try{
 await R.init();
 const baker=resolve(process.argv[2]);
 const require=createRequire(resolve(baker,'package.json')),sharp=require('sharp');
 globalThis.self||=globalThis;
 globalThis.createImageBitmap||=async blob=>{const{data,info}=await sharp(Buffer.from(await blob.arrayBuffer())).raw().toBuffer({resolveWithObject:true});return{data,width:info.width,height:info.height,close(){}};};
 const {optimizeMesh}=await import(pathToFileURL(resolve(baker,'src/public/mesh-baker-node.js')).href);
 const {useLoader}=await import(pathToFileURL(resolve(baker,'modules/three-mesh-effects/build/index.js')).href);
 const external=process.argv[3];
 const input=external?await readFile(resolve(external)):await exportFixture();
 const original=await registerSimreadyLoader(new GLTFLoader()).parseAsync(input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength),'');
 const before=original.userData.simready;
 for(const materialPolicy of ['keep','merge-bake','merge-pack']){
  const result=await optimizeMesh(input,{settings:{topologyMode:'authored',targetTriangles:120,resolution:32,padding:2,dilation:2,aoSamples:0,qualitySamples:16,bakeBackend:'cpu',materialPolicy}});
  const loader=registerSimreadyLoader(new GLTFLoader());
  useLoader(loader,{isWebGLRenderer:true});
  const loaded=await loader.parseAsync(result.glb.buffer.slice(result.glb.byteOffset,result.glb.byteOffset+result.glb.byteLength),'');
  const after=loaded.userData.simready;
  assert.deepEqual(after.snapshot,before.snapshot);assert.deepEqual(after.usdMetadata,before.usdMetadata);
  assert.equal(loaded.parser.json.extensions.NEEDLE_simready.source,undefined);
  const controllers=await Promise.allSettled([before.createSimulation({rapier:R}),after.createSimulation({rapier:R})]);
  if(controllers[0].status==='rejected'){
   assert.equal(controllers[1].status,'rejected','unsupported physics must not silently become a partial simulation');
   assert.equal(controllers[1].reason.message,controllers[0].reason.message);
   console.log(materialPolicy+': strict simulation retains the original limitation: '+controllers[0].reason.message);
  }else{
   assert.equal(controllers[1].status,'fulfilled');
   const a=controllers[0].value,b=controllers[1].value;
   try{
   a.play();b.play();
   for(let frame=0;frame<240;frame++){a.update(1/120);b.update(1/120);}
   for(const [path,{body}]of a.bodies){assert.deepEqual({...body.translation()},{...b.bodies.get(path).body.translation()});assert.deepEqual({...body.rotation()},{...b.bodies.get(path).body.rotation()});assert.equal(body.mass(),b.bodies.get(path).body.mass());}
    if(!external)assert.ok(b.bodies.get('/Assembly/Slider').body.translation().x>.2);
   }finally{a.dispose();b.dispose();}
  }
  const baseline=await before.createMechanism(),comparison=await after.createMechanism();
  try{
   assert.deepEqual(comparison.unsupported,baseline.unsupported);
   const record=[...baseline.joints.values()].find(record=>record.angular&&record.lower<record.upper);
   if(record){
    const path=record.data.path,start=baseline.getJointValue(path),target=Math.abs(start-record.upper)>1?record.upper:record.lower;
    assert.equal(baseline.setJointValue(path,target),true);assert.equal(comparison.setJointValue(path,target),true);
    assert.ok(Math.abs(comparison.getJointValue(path)-start)>1,'joint must actually move');
   }else assert.equal(before.snapshot.joints.length,0,'an articulated fixture must expose a movable joint');
   for(const [path,{body}]of baseline.bodies){assert.deepEqual({...body.translation()},{...comparison.bodies.get(path).body.translation()});assert.deepEqual({...body.rotation()},{...comparison.bodies.get(path).body.rotation()});}
   original.scene.updateWorldMatrix(true,true);loaded.scene.updateWorldMatrix(true,true);
   const bindings=original.parser.json.extensions.NEEDLE_simready.bindings,retained=loaded.parser.json.extensions.NEEDLE_simready.bindings;
   for(let i=0;i<bindings.length;i++){
    const a=await original.parser.getDependency('node',bindings[i].node),b=await loaded.parser.getDependency('node',retained[i].node);
    assert.ok(a.matrixWorld.elements.every((value,index)=>Math.abs(value-b.matrixWorld.elements[index])<1e-5),'render binding must follow the same articulated pose');
   }
  }finally{baseline.dispose();comparison.dispose();}
  if(!external){
  const mechanism=await after.createMechanism();
  try{
   assert.deepEqual(mechanism.unsupported,[]);
   assert.equal(mechanism.setJointValue('/Assembly/Hinge',120),true);
   assert.ok(Math.abs(mechanism.getJointValue('/Assembly/Hinge')-90)<1e-4);
   assert.ok(Math.abs(mechanism.bodies.get('/Assembly/Knob').body.translation().z+1)<1e-4);
   after.root.updateWorldMatrix(true,true);
   const binding=loaded.parser.json.extensions.NEEDLE_simready.bindings.find(item=>item.path==='/Assembly/Knob');
   const visual=await loaded.parser.getDependency('node',binding.node);
   assert.ok(visual.getWorldPosition(new Vector3()).distanceTo(new Vector3(0,0,-1))<1e-4,'the optimized render hierarchy follows its attached body in glTF meters/Y-up');
  }finally{mechanism.dispose();}
  }
  console.log(materialPolicy+': USD → glTF → Baker → useLoader → constraints, poses and semantic metadata passed');
 }
}finally{clearInterval(alive);}
