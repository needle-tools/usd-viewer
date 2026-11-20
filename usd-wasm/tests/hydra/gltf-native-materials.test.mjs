import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group} from 'three';
import {getUsdModule} from '../runtime.mjs';
import {ThreeRenderDelegateInterface} from '../../src/hydra/ThreeJsRenderDelegate.js';

test('native glTF imports retain physical transmission and volume instead of their opacity projection',async()=>{
 const USD=await getUsdModule(),path='/tmp/gltf-physical-material.gltf';
 const data=new Float32Array([0,0,0,1,0,0,0,1,0]);
 const gltf={asset:{version:'2.0'},buffers:[{byteLength:data.byteLength,uri:'data:application/octet-stream;base64,'+Buffer.from(data.buffer).toString('base64')}],bufferViews:[{buffer:0,byteLength:data.byteLength}],accessors:[{bufferView:0,componentType:5126,type:'VEC3',count:3,min:[0,0,0],max:[1,1,0]}],
  materials:[{name:'Glass',pbrMetallicRoughness:{baseColorFactor:[.8,.9,1,1],metallicFactor:0,roughnessFactor:.12},extensions:{KHR_materials_transmission:{transmissionFactor:.8},KHR_materials_volume:{thicknessFactor:.2,attenuationColor:[.7,.8,.9],attenuationDistance:3},KHR_materials_ior:{ior:1.45}}}],extensionsUsed:['KHR_materials_transmission','KHR_materials_volume','KHR_materials_ior'],meshes:[{primitives:[{attributes:{POSITION:0},material:0}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
 USD.FS_createDataFile('/tmp','gltf-physical-material.gltf',new TextEncoder().encode(JSON.stringify(gltf)),true,true);
 const root=new Group(),delegate=new ThreeRenderDelegateInterface({usdRoot:root});let driver;
 try{
  driver=await USD.CreateHydraDriver(delegate,path);await new Promise((resolve,reject)=>driver.DrawAsync(resolve,reject));
  await delegate.waitForRprimsReady();await delegate.waitForMaterialsReady();
  const materials=new Set();root.traverseVisible(object=>{if(object.isMesh)for(const material of [object.material].flat())materials.add(material);});
  const material=[...materials].find(material=>material.name==='Glass');assert.ok(material,'the bound glass material renders');
  const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-5,`${actual} != ${expected}`);
  near(material.transmission,.8);near(material.thickness,.2);near(material.ior,1.45);near(material.opacity,1);near(material.attenuationDistance,3);
  material.attenuationColor.toArray().forEach((v,i)=>near(v,[.7,.8,.9][i]));material.color.toArray().forEach((v,i)=>near(v,[.8,.9,1][i]));
  near(material.clearcoat,0);assert.equal(delegate.getDiagnostics().materialFallbacks,0);
 }finally{driver?.delete();delegate.dispose();USD.FS_unlink(path);}
});
