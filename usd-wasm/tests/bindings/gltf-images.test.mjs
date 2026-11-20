import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getUsdModule} from '../runtime.mjs';

for(const embedded of [false,true])for(const anisotropy of [false,true])test(`native ${embedded?'GLB':'glTF'} images remain readable across distinct samplers${anisotropy?' and anisotropy conversion':''}`,async()=>{
 const USD=await getUsdModule(),name=`image-samplers-${anisotropy}.${embedded?'glb':'gltf'}`,file='/tmp/'+name;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLo0AAAAASUVORK5CYII=','base64');
 const buffer=new Float32Array([0,0,0,1,0,0,0,1,0,0,0,1,0,0,1]);
 const binary=new Uint8Array(buffer.byteLength+(embedded?png.byteLength:0));binary.set(new Uint8Array(buffer.buffer));if(embedded)binary.set(png,buffer.byteLength);
 const gltf={asset:{version:'2.0'},buffers:[{byteLength:binary.byteLength,...(!embedded?{uri:'data:application/octet-stream;base64,'+Buffer.from(binary).toString('base64')}:{})}],
  bufferViews:[{buffer:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:24}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5126,count:3,type:'VEC2'}],
  images:[embedded?{bufferView:2,mimeType:'image/png'}:{uri:'data:image/png;base64,'+png.toString('base64')}],samplers:[{wrapS:10497},{wrapS:33071}],textures:[{source:0,sampler:0},{source:0,sampler:1}],
  materials:[0,1].map(index=>({pbrMetallicRoughness:{baseColorTexture:{index},metallicFactor:0,roughnessFactor:.5},...(anisotropy?{extensions:{KHR_materials_anisotropy:{anisotropyStrength:.5,anisotropyRotation:.2,anisotropyTexture:{index}}}}:{})})),
  ...(anisotropy?{extensionsUsed:['KHR_materials_anisotropy']}:{}),
  meshes:[{primitives:[0,1].map(material=>({attributes:{POSITION:0,TEXCOORD_0:1},material}))}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
 if(embedded)gltf.bufferViews.push({buffer:0,byteOffset:buffer.byteLength,byteLength:png.byteLength});
 const json=new TextEncoder().encode(JSON.stringify(gltf));let bytes=json;
 if(embedded){
  const jsonLength=Math.ceil(json.length/4)*4,binLength=Math.ceil(binary.length/4)*4;
  bytes=new Uint8Array(28+jsonLength+binLength);const header=new DataView(bytes.buffer);
  header.setUint32(0,0x46546c67,true);header.setUint32(4,2,true);header.setUint32(8,bytes.length,true);header.setUint32(12,jsonLength,true);header.setUint32(16,0x4e4f534a,true);
  bytes.fill(32,20,20+jsonLength);bytes.set(json,20);header.setUint32(20+jsonLength,binLength,true);header.setUint32(24+jsonLength,0x004e4942,true);bytes.set(binary,28+jsonLength);
 }
 USD.FS_createDataFile('/tmp',name,bytes,true,true);
 const stage=await USD.OpenStage(file),prims=stage.TraverseAll();let readable=0;
 const driver=await USD.CreateHydraDriver({createRPrim(){},createSPrim(){},createBPrim(){},CommitResources(){}},file);
 try{
  assert.deepEqual(stage.GetCompositionErrors(),[]);
  for(let i=0;i<prims.size();i++){
   const prim=prims.get(i),attribute=prim.GetAttribute('inputs:file');
   try{
    if(!attribute.IsValid())continue;
    const asset=await attribute.Get(NaN);
    if(typeof asset!=='string'||!asset.endsWith('.png]'))continue;
    let bytes;await driver.getFile(asset,value=>{if(value)bytes=new Uint8Array(value);});
    assert.ok(bytes?.byteLength,'native image asset remains readable: '+asset);readable++;
    assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
   }finally{attribute.delete();prim.delete();}
  }
  assert.ok(readable>=2,'both material networks reference readable images');
 }finally{driver.delete();prims.delete();USD.ReleaseStage(stage);USD.FS_unlink(file);}
});
