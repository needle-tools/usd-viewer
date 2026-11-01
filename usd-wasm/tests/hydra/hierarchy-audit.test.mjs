import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {getUsdModule} from '../runtime.mjs';
import {createThreeHydra} from '../../src/create.three.js';
import {inspectStageAsync,inspectPrimAsync,setVariant,setPayloadLoaded,setPrimActive} from '../../src/scene/index.js';
import {hierarchyFiles} from '../fixtures/hierarchy-audit.mjs';
async function load(){const USD=await getUsdModule({print(){},printErr(){}}),files=Object.entries(hierarchyFiles).map(([path,source])=>({path,name:path,arrayBuffer:async()=>new TextEncoder().encode(source).buffer}));const handle=await createThreeHydra({USD,scene:new Group(),files});await handle.ready();return handle;}
const snapshot=(handle,options={})=>handle.readStage(stage=>inspectStageAsync(stage,1,options));
const prim=(info,path)=>info.prims.find(item=>item.path===path);

test('hierarchy includes classes, undefined overs and composed instance proxies, and distinguishes generated prototypes',async()=>{
 const handle=await load();try{
  const info=await snapshot(handle),closed=await snapshot(handle,{expandedInstances:[]});
  assert.equal(prim(info,'/Template').abstract,true);assert.equal(prim(info,'/Template/Animated').abstract,true);
  assert.equal(prim(info,'/World/Undefined/Deeper').defined,false);
  assert.equal(prim(info,'/World/Inactive').active,false);assert.equal(prim(info,'/World/Inactive/AuthoredChild'),undefined);
  assert.equal(prim(info,'/World/FlagOnly').instanceable,true);assert.equal(prim(info,'/World/FlagOnly').instance,false);
  const a=prim(info,'/World/A'),b=prim(info,'/World/B');assert.ok(a.instance);assert.equal(a.prototypePath,b.prototypePath);assert.equal(a.prototypeInstanceCount,2);
  assert.equal(prim(info,'/World/A/Nested/Ball').instanceProxy,true);assert.ok(prim(info,'/World/A/Nested/Ball').prototypePrimPath);
  assert.equal(info.prims.some(item=>item.inPrototype),false);
  const hidden=prim(closed,'/World/HiddenParent/HiddenChild');assert.equal(hidden.visible,false);assert.equal(hidden.localVisible,true);assert.equal(hidden.hiddenBy,'/World/HiddenParent');
  assert.equal(prim(closed,'/World/A/Animated'),undefined);
  assert.deepEqual(closed.time,{start:1,end:10});assert.deepEqual(info.time,closed.time);
  const roots=await snapshot(handle,{includePrototypes:true,expandedInstances:[]});assert.ok(roots.prims.some(item=>item.prototype));
  const full=await snapshot(handle,{includePrototypes:true});const source=prim(full,a.prototypePath+'/Animated');assert.ok(source.inPrototype);assert.equal(source.instanceProxy,false);
  await assert.rejects(setPrimActive(handle,source.path,false),/Prototype prim is read-only/);
  const selected=await handle.readStage(stage=>inspectPrimAsync(stage,a.prototypePath));assert.deepEqual(selected.instancing.instances.sort(),['/World/A','/World/B']);
  const points=await handle.readStage(stage=>inspectPrimAsync(stage,'/World/Scatter'));assert.deepEqual(points.instancing,{kind:'point-instancer',instanceCount:3,prototypes:['/World/Shapes/Red','/World/Shapes/Blue']});
 }finally{await handle.dispose();}
});

test('variant and payload hierarchy changes match native composition while inactive descendants stay uncomposed',async()=>{
 const handle=await load();try{
  let info=await snapshot(handle);assert.ok(prim(info,'/World/Product/Warm'));assert.equal(prim(info,'/World/Product/Cool'),undefined);
  assert.ok(prim(info,'/World/WithPayload/PayloadOnly'));assert.ok(prim(info,'/World/WithPayload/Referenced'));
  await setVariant(handle,'/World/Product','look','cool');info=await snapshot(handle);assert.ok(prim(info,'/World/Product/Cool'));assert.equal(prim(info,'/World/Product/Warm'),undefined);
  await setPayloadLoaded(handle,'/World/WithPayload',false);info=await snapshot(handle);assert.equal(prim(info,'/World/WithPayload/PayloadOnly'),undefined);assert.equal(prim(info,'/World/WithPayload').loaded,false);assert.ok(prim(info,'/World/WithPayload/Referenced'));
  await setPrimActive(handle,'/World/Inactive',true);info=await snapshot(handle);assert.ok(prim(info,'/World/Inactive/AuthoredChild'));
  await setPayloadLoaded(handle,'/World/WithPayload',true);info=await snapshot(handle);assert.ok(prim(info,'/World/WithPayload/PayloadOnly'));
 }finally{await handle.dispose();}
});

test('animation inside a closed shared prototype is detected without counting unused abstract source animation',async()=>{
 const USD=await getUsdModule({print(){},printErr(){}}),source=`#usda 1.0
class Xform "Source" {
 def Cube "Animated" {
  double size.timeSamples={2:1,8:2}
 }
}
def Xform "A" (instanceable=true;prepend references=</Source>) {}
def Xform "B" (instanceable=true;prepend references=</Source>) {}
`;
 const handle=await createThreeHydra({USD,scene:new Group(),url:'instance-time.usda',buffer:new TextEncoder().encode(source)});
 try {
  await handle.ready();let info=await snapshot(handle,{expandedInstances:[]});
  assert.deepEqual(info.time,{start:2,end:8});assert.equal(prim(info,'/A/Animated'),undefined);
  await setPrimActive(handle,'/A',false);await setPrimActive(handle,'/B',false);
  info=await snapshot(handle,{expandedInstances:[]});assert.equal(info.time,null);
 }finally{await handle.dispose();}
});
