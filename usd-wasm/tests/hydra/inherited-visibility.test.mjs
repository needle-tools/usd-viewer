import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {getUsdModule} from '../runtime.mjs';
import {createThreeHydra} from '../../src/create.three.js';
import {inspectStageAsync,setPrimVisible,setPayloadLoaded} from '../../src/scene/index.js';

const source=`#usda 1.0
(defaultPrim="World")
def Xform "World" {
 def Xform "Prototype" {
  token visibility="invisible"
  def Cube "Shape" {}
 }
 def Xform "Instance" (instanceable=true;prepend references=</World/Prototype>) {
  token visibility="inherited"
 }
 def Xform "Hidden" {
  token visibility="invisible"
  uniform token purpose="guide"
  def BasisCurves "Curve" {
   uniform token type="linear"
   int[] curveVertexCounts=[2]
   point3f[] points=[(-2,0,0),(2,0,0)]
   float[] widths=[.01]
  }
  def Sphere "Sibling" {}
 }
}`;
const objects=scene=>{const result=[];scene.traverseVisible(o=>{if(o.isMesh && o.geometry.attributes.position?.count)result.push(o);});return result;};

test('native mesh instances stay hidden when the last visible instance is removed, including initially hidden instances',async()=>{
 const USD=await getUsdModule({print(){},printErr(){}}),scene=new Group();
 const handle=await createThreeHydra({USD,scene,url:'instance-visibility.usda',buffer:new TextEncoder().encode(source)});
 try {
  await handle.ready();assert.equal(objects(scene).length,1);
  await setPrimVisible(handle,'/World/Instance',false);assert.equal(objects(scene).length,0);
  await setPrimVisible(handle,'/World/Instance',true);assert.equal(objects(scene).length,1);
 }finally{await handle.dispose();}
 const hidden=new Group(),second=await createThreeHydra({USD,scene:hidden,url:'initially-hidden-instance.usda',buffer:new TextEncoder().encode(source.replace('token visibility="inherited"','token visibility="invisible"'))});
 try{await second.ready();assert.equal(objects(hidden).length,0);await setPrimVisible(second,'/World/Instance',true);assert.equal(objects(hidden).length,1);}
 finally{await second.dispose();}
});

test('computed hierarchy visibility and native MakeVisible preserve hidden siblings and inherited purpose',async()=>{
 const USD=await getUsdModule({print(){},printErr(){}}),scene=new Group();
 const handle=await createThreeHydra({USD,scene,url:'inherited-visibility.usda',buffer:new TextEncoder().encode(source),helpers:{curves:true}});
 try {
  await handle.ready();
  let info=await handle.readStage(stage=>inspectStageAsync(stage));
  let curve=info.prims.find(p=>p.path==='/World/Hidden/Curve');
  assert.equal(curve.localVisible,true);assert.equal(curve.visible,false);assert.equal(curve.hiddenBy,'/World/Hidden');assert.equal(curve.purpose,'guide');
  await setPrimVisible(handle,curve.path,true);
  await handle.setIncludedPurposes(['default','render','guide']);
  info=await handle.readStage(stage=>inspectStageAsync(stage));curve=info.prims.find(p=>p.path===curve.path);
  assert.equal(curve.visible,true);assert.equal(info.prims.find(p=>p.path==='/World/Hidden/Sibling').visible,false);
  assert.equal(objects(scene).filter(o=>o.userData.usdPrimitiveType==='basisCurves').length,1);
  await handle.readStage(async stage=>{const p=stage.GetPrimAtPath(curve.path);try{assert.equal(await p.ComputeVisibility(0),'inherited');assert.equal(await p.ComputePurpose(),'guide');}finally{p.delete();}});
 }finally{await handle.dispose();}
});

test('unloading a payload can preserve referenced hierarchy while updating its loaded state',async()=>{
 const USD=await getUsdModule({print(){},printErr(){}}),scene=new Group();
 const root='#usda 1.0\ndef Xform "World" (prepend references=@base.usda@;prepend payload=@physics.usda@) {}';
 const files=[['root.usda',root],['base.usda','#usda 1.0\n(defaultPrim="Base")\ndef Xform "Base" {\n def Cube "Shape" {}\n def Scope "Empty" {}\n}\n'],['physics.usda','#usda 1.0\n(defaultPrim="Physics")\ndef Xform "Physics" {\n custom float mass=2\n}\n']].map(([path,text])=>Object.assign(new File([text],path),{path}));
 const handle=await createThreeHydra({USD,scene,files});
 try{
  await handle.ready();const before=await handle.readStage(stage=>inspectStageAsync(stage));assert.equal(objects(scene).length,1);
  await setPayloadLoaded(handle,'/World',false);
  const after=await handle.readStage(stage=>inspectStageAsync(stage));
  assert.deepEqual(after.prims.map(p=>p.path),before.prims.map(p=>p.path));assert.ok(after.prims.every(p=>!p.loaded));assert.equal(objects(scene).length,0);
  await setPayloadLoaded(handle,'/World',true);assert.equal(objects(scene).length,1);
 }finally{await handle.dispose();}
});


test('showing a child of an animated hidden parent changes the current time sample',async()=>{
 const USD=await getUsdModule({print(){},printErr(){}}),scene=new Group();
 const source='#usda 1.0\n(startTimeCode=1;endTimeCode=2)\ndef Xform "Parent" {\n token visibility.timeSamples={1:"invisible",2:"inherited"}\n def Cube "Child" {}\n def Cube "Sibling" {}\n}';
 const handle=await createThreeHydra({USD,scene,url:'animated-parent-visibility.usda',buffer:new TextEncoder().encode(source)});
 try{
  await handle.ready();await handle.setTime(1);assert.equal(objects(scene).length,0);
  await setPrimVisible(handle,'/Parent/Child',true);assert.equal(objects(scene).length,1);
  await handle.readStage(async stage=>{const p=stage.GetPrimAtPath('/Parent'),a=p.GetAttribute('visibility');try{assert.equal(await a.GetNumTimeSamples(),2);assert.equal(await a.GetValueStringAtTime(1),'inherited');assert.equal(await a.GetValueStringAtTime(2),'inherited');}finally{a.delete();p.delete();}});
 }finally{await handle.dispose();}
});
