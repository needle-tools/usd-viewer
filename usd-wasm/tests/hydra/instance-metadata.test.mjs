import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {getUsdModule} from '../runtime.mjs';
import {createThreeHydra} from '../../src/create.three.js';
import {inspectStageAsync,inspectPrimAsync,setPrimVisible} from '../../src/scene/index.js';

const source=`#usda 1.0
class Material "MaterialSource" {
 def Shader "Surface" {
  uniform token info:id="UsdPreviewSurface"
  color3f inputs:diffuseColor=(.2,.6,.8)
  token outputs:surface
 }
 token outputs:surface.connect=</MaterialSource/Surface.outputs:surface>
}
class Xform "Source" {
 def Cube "Mesh" (prepend apiSchemas=["MaterialBindingAPI"]) {
  rel material:binding=</Source/VisualMaterials/Mat>
 }
 def Scope "VisualMaterials" {
  def Material "Mat" (instanceable=true;prepend references=</MaterialSource>) {}
 }
}
def Xform "World" {
 def Xform "Instance" (
  instanceable=true
  prepend references=</Source>
  customData={
   bool approved=true
   int[] flags=[1,2,3]
   uint64 exactId=9007199254740993
   dictionary nested={string note="material sample"}
  }
 ) {}
 def Scope "VisualMaterials" {}
}`;
const load=async()=>{const USD=await getUsdModule({print(){},printErr(){}}),scene=new Group();const handle=await createThreeHydra({USD,scene,url:'instance-materials.usda',buffer:new TextEncoder().encode(source)});await handle.ready();return handle;};

test('instance traversal exposes composed material branches and can prune unopened instances',async()=>{
 const handle=await load();
 try{
  const closed=await handle.readStage(stage=>inspectStageAsync(stage,0,{expandedInstances:[]}));
  assert.ok(closed.prims.some(p=>p.path==='/World/Instance'&&p.instance));
  assert.equal(closed.prims.some(p=>p.path==='/World/Instance/VisualMaterials/Mat'),false);
  const expanded=await handle.readStage(stage=>inspectStageAsync(stage,0,{expandedInstances:['/World/Instance']}));
  const material=expanded.prims.find(p=>p.path==='/World/Instance/VisualMaterials/Mat');assert.ok(material?.instanceProxy);assert.equal(material.instance,true);
  assert.equal(expanded.prims.some(p=>p.path===material.path+'/Surface'),false);
  const all=await handle.readStage(stage=>inspectStageAsync(stage));
  assert.ok(all.prims.some(p=>p.path===material.path+'/Surface'&&p.instanceProxy));
  const mesh=await handle.readStage(stage=>inspectPrimAsync(stage,'/World/Instance/Mesh'));
  assert.deepEqual(mesh.relationships.find(r=>r.name==='material:binding').targets,[material.path]);
  assert.equal(all.prims.some(p=>p.path.startsWith('/World/VisualMaterials/')),false);
  await assert.rejects(setPrimVisible(handle,material.path,false),/Instance proxy is read-only/);
 }finally{await handle.dispose();}
});

test('composed metadata has real arrays and nested typed values, while string metadata stays compatible',async()=>{
 const handle=await load();
 try{
  await handle.readStage(async stage=>{
   const data=await inspectPrimAsync(stage,'/World/Instance');
   assert.equal(data.metadata.instanceable,true);assert.equal(data.metadata.customData.approved,true);
   assert.deepEqual(data.metadata.customData.flags,[1,2,3]);assert.equal(data.metadata.customData.exactId,'9007199254740993');
   assert.equal(data.metadata.customData.nested.note,'material sample');
   const mesh=await inspectPrimAsync(stage,'/World/Instance/Mesh');assert.deepEqual(mesh.metadata.apiSchemas,['MaterialBindingAPI']);
   const prim=stage.GetPrimAtPath('/World/Instance');try{assert.equal(prim.GetAllMetadata().instanceable,'1');}finally{prim.delete();}
   const p=stage.GetPrimAtPath('/World/Instance/Mesh'),attribute=p.GetAttribute('size');try{assert.equal(typeof attribute.GetAllMetadataValues().custom,'boolean');}finally{attribute.delete();p.delete();}
  });
 }finally{await handle.dispose();}
});
