import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {Group,Vector3,Matrix4} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createSimulationWorld} from '@needle-tools/simready/rapier';
import {registerSimreadyLoader} from '@needle-tools/simready/gltf';
import R from '@dimforge/rapier3d-compat';
import {getUsdModule} from '../runtime.mjs';
import {createThreeHydra} from '../../src/create.three.js';
import {createUsdPhysics,readUsdPhysics} from '../../src/physics/createPhysics.js';
import {exportSimreadyGltf} from '../../src/gltf/simready.js';
globalThis.FileReader ||= class {readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}};
globalThis.ProgressEvent ||= class {};
await R.init();
test('USD and GLB attach to host worlds in the same physical/render frame and restore their roots',async()=>{
 const USD=await getUsdModule({print(){},printErr(){}}),buffer=await readFile(new URL('../fixtures/simready/assembly.usda',import.meta.url));
 const handle=await createThreeHydra({USD,scene:new Group(),url:'assembly.usda',buffer,autoPlay:false});
 const originalRoot=handle.scene.matrix.clone(),originalAuto=handle.scene.matrixAutoUpdate;
 const a=createSimulationWorld({rapier:R,gravity:[0,0,0]}),b=createSimulationWorld({rapier:R,gravity:[0,0,0]});
 try{
  const snapshot=await readUsdPhysics(handle),bytes=await exportSimreadyGltf({handle,snapshot,exporter:new GLTFExporter()});
  const gltf=await registerSimreadyLoader(new GLTFLoader()).parseAsync(bytes,''),runtime=gltf.userData.simready;
  const options={id:'assembly',position:[2,1,0],rotation:[0,Math.SQRT1_2,0,Math.SQRT1_2]};
  const native=await createUsdPhysics({handle,snapshot,world:a,...options,allowPartial:false});
  const converted=await runtime.createSimulation({world:b,...options});
  assert.deepEqual(native.unsupported,[]);assert.deepEqual(converted.unsupported,[]);
  native.setJointTarget('/Assembly/Slide',{position:.4});converted.setJointTarget('/Assembly/Slide',{position:.4});
  for(let frame=0;frame<1200;frame++){a.step();b.step();}
  for(const [path,{body}]of native.bodies){
   const other=converted.bodies.get(path).body;
   assert.deepEqual({...other.translation()},{...body.translation()});assert.deepEqual({...other.rotation()},{...body.rotation()});
  }
  assert.ok(Math.abs(converted.getJointValue('/Assembly/Slide')-.4)<.01,'motor target uses world metres: '+converted.getJointValue('/Assembly/Slide'));
  const binding=gltf.parser.json.extensions.NEEDLE_simready.bindings.find(item=>item.path==='/Assembly/Slider');
  const object=await gltf.parser.getDependency('node',binding.node);
  runtime.root.updateWorldMatrix(true,true);
  assert.ok(object.getWorldPosition(new Vector3()).distanceTo(new Vector3().copy(converted.bodies.get('/Assembly/Slider').body.translation()))<1e-5);
  let nativeObject;
  handle.scene.traverse(child=>{if(child.isMesh&&native.bodyForObject(child,0)?.data.path==='/Assembly/Slider')nativeObject=child;});
  assert.ok(nativeObject);
  handle.scene.updateWorldMatrix(true,true);
  const transform=nativeObject.matrixWorld.clone();if(nativeObject.isInstancedMesh){const instance=new Matrix4();nativeObject.getMatrixAt(0,instance);transform.multiply(instance);}
  assert.ok(new Vector3().setFromMatrixPosition(transform).distanceTo(new Vector3().copy(native.bodies.get('/Assembly/Slider').body.translation()))<1e-5,'USD visuals share the normalized collision frame');
  native.dispose();converted.dispose();assert.deepEqual(handle.scene.matrix.elements,originalRoot.elements);assert.equal(handle.scene.matrixAutoUpdate,originalAuto);
 }finally{a.dispose();b.dispose();await handle.dispose();}
});
