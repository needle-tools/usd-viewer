import assert from 'node:assert/strict';
import test from 'node:test';
import {Group, Mesh, BoxGeometry, MeshStandardMaterial} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import R from '@dimforge/rapier3d-compat';
import {registerSimreadyLoader} from '@needle-tools/simready/gltf';
import {createSimulationWorld} from '@needle-tools/simready/rapier';
import {exportSimreadyGltf} from '../usd-wasm/src/gltf/simready.js';
import {createGltfPhysicsSource} from '../public/viewer-gltf-physics.mjs';
import {holdAssemblyBases, withViewerDamping} from '../public/viewer-physics-policy.mjs';

globalThis.FileReader ||= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result=value; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(value => { this.result=`data:${blob.type};base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.(); }); }
};
globalThis.ProgressEvent ||= class {};

async function fixture() {
  const root=new Group(), q=[0,0,0,1];
  const bodies=['Base','Arm'].map((name,index)=>({path:'/'+name,position:[index,2,0],rotation:q,mass:1,rigidBodyEnabled:true}));
  for(const body of bodies){const mesh=new Mesh(new BoxGeometry(.2,.2,.2),new MeshStandardMaterial());mesh.userData.usdPath=body.path+'/Visual';mesh.position.fromArray(body.position);root.add(mesh);}
  const snapshot={metersPerUnit:1,kilogramsPerUnit:1,upAxis:'Y',scenes:[],materials:[],groups:[],unsupported:[],bodies,
    shapes:bodies.map(body=>({path:body.path+'/Collision',body:body.path,type:'cube',halfExtents:[.1,.1,.1],position:[0,0,0],rotation:q})),
    joints:[{path:'/Hinge',type:'revolute',body0:'/Base',body1:'/Arm',axis:'Z',position0:[0,0,0],position1:[-1,0,0],rotation0:q,rotation1:q,limit:{enabled:true,lower:-90,upper:90}}]};
  return exportSimreadyGltf({handle:{scene:root,ready:async()=>{},materialsReady:async()=>{},readStage:async()=>[],setPlaying(){}},snapshot,
    semantics:[{path:'/Arm/Visual',taxonomy:'class',labels:['arm']}],exporter:new GLTFExporter()});
}
const load=bytes=>registerSimreadyLoader(new GLTFLoader()).parseAsync(bytes,'');

test('direct glTF physics keeps joint visuals, simulation policy and controller ownership',async()=>{
  const asset=await load(await fixture()),physics=createGltfPhysicsSource(asset);
  assert.ok(physics);assert.deepEqual(physics.source.inspect().joints,['/Hinge']);
  const source=await physics.source.readSnapshot(),before=structuredClone(source),arm=asset.userData.simready.bindings.find(binding=>binding.body==='/Arm').object;
  const pose=()=>{physics.handle.scene.updateWorldMatrix(true,true);return arm.matrixWorld.toArray();};
  const rest=pose(),mechanism=await physics.source.createMechanism({});
  assert.equal(mechanism.setJointValue('/Hinge',45),true);assert.notDeepEqual(pose(),rest);
  await assert.rejects(physics.source.createSimulation({snapshot:source,rapier:R}),/active or pending controller/);
  mechanism.dispose();assert.deepEqual(pose(),rest);
  await R.init();const configured=holdAssemblyBases(withViewerDamping(source)).snapshot;
  const simulation=await physics.source.createSimulation({snapshot:configured,rapier:R,allowPartial:false});
  try{
    assert.equal(simulation.root,physics.handle.scene);assert.equal(simulation.bodies.get('/Base').body.isKinematic(),true);
    simulation.play();for(let frame=0;frame<120;frame++)simulation.update(1/120);
    assert.notDeepEqual(pose(),rest);assert.deepEqual(await physics.source.readSnapshot(),before);
  }finally{simulation.dispose();}
  assert.deepEqual(pose(),rest);
});

test('ordinary glTF has no SimReady controls',async()=>{
  assert.equal(createGltfPhysicsSource({scene:new Group()}),null);
});

test('direct glTF uses the supplied host world and restores visuals without disposing the host',async()=>{
  await R.init();
  const asset=await load(await fixture()),physics=createGltfPhysicsSource(asset),root=physics.handle.scene;
  root.position.x=4;root.updateWorldMatrix(true,true);
  const source=await physics.source.readSnapshot(),configured=holdAssemblyBases(source).snapshot;
  const arm=asset.userData.simready.bindings.find(binding=>binding.body==='/Arm').object;
  const rest=arm.matrixWorld.toArray(),host=createSimulationWorld({rapier:R});
  try{
    const simulation=await physics.source.createSimulation({world:host,snapshot:configured,position:[4,0,0],rotation:[0,0,0,1],allowPartial:false});
    assert.equal(host.assets.size,1);
    assert.equal(simulation.bodies.get('/Base').body.isKinematic(),true);
    assert.equal(simulation.bodies.get('/Arm').body.translation().x,5);
    simulation.play();host.step(1/120);root.updateWorldMatrix(true,true);
    simulation.dispose();root.updateWorldMatrix(true,true);
    assert.equal(host.assets.size,0);assert.deepEqual(arm.matrixWorld.toArray(),rest);
    const next=await host.addAsset({snapshot:source});assert.equal(host.assets.size,1);next.dispose();
  }finally{host.dispose();}
});

test('re-exporting a direct GLB preserves converted physics and semantic labels',async()=>{
  const asset=await load(await fixture()),source=createGltfPhysicsSource(asset);
  const bytes=await exportSimreadyGltf({handle:source.handle,snapshot:await source.source.readSnapshot(),semantics:source.semantics,exporter:new GLTFExporter()});
  const again=await load(bytes);
  assert.deepEqual(again.userData.simready.snapshot,asset.userData.simready.snapshot);
  assert.deepEqual(again.userData.simready.semantics,asset.userData.simready.semantics);

});
