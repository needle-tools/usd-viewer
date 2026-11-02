import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {getUsdModule} from '../runtime.mjs';
import {createThreeHydra} from '../../src/create.three.js';
import {inspectStageSummary,inspectStageFiles} from '../../src/scene/index.js';
const source=`#usda 1.0
(
 subLayers=[@shapes.usda@]
 metersPerUnit=0.01
 customLayerData={dictionary SimReady_Metadata={
  double mass=12.5
  float3 asset_extents=(1,2,3)
  dictionary validation={string profile="Robot-Body"}
 }}
)
def Xform "World" {
 def PhysicsPrismaticJoint "Joint" (prepend apiSchemas=["PhysicsDriveAPI:linear"]) {
 rel physics:body1=</Model/Collider>
 }
 def Xform "One" (instanceable=true
 prepend references=</Model>) {}
 def Xform "Two" (instanceable=true
 prepend references=</Model>) {}
}
`;
const shape=`#usda 1.0
def Xform "Model" {
 def Mesh "Collider" (prepend apiSchemas=["PhysicsCollisionAPI", "PhysicsRigidBodyAPI"]) {
  point3f[] points=[(0,0,0),(1,0,0),(0,1,0)]
  int[] faceVertexCounts=[3]
  int[] faceVertexIndices=[0,1,2]
 }
}
`;
test('summary inventories composed schemas and shared prototypes without reading geometry arrays',async()=>{
 const USD=await getUsdModule({print(){},printErr(){}});
 const files=[['scene.usda',source],['shapes.usda',shape]].map(([path,text])=>Object.assign(new File([text],path),{path}));
 const handle=await createThreeHydra({USD,scene:new Group(),files});
 try{
  await handle.ready();
  await handle.readStage(async stage=>{
   const summary=await inspectStageSummary(stage);
   assert.ok(summary.types.includes('PhysicsPrismaticJoint'));assert.ok(summary.types.includes('Mesh'));
   assert.deepEqual(summary.apiSchemas,['PhysicsCollisionAPI','PhysicsDriveAPI:linear','PhysicsRigidBodyAPI']);
   assert.equal(summary.profile,'Robot-Body');assert.equal(summary.massKg,12.5);assert.deepEqual(summary.dimensions,[1,2,3]);assert.equal(summary.metersPerUnit,.01);assert.equal(summary.movingParts,1);
   assert.equal(summary.constraints,1);assert.equal(summary.colliders,2); // model + one shared prototype, not two instance copies
   const inventory=inspectStageFiles(stage,USD,handle.sourcePaths);
   assert.deepEqual(inventory.map(file=>file.path).sort(),['scene.usda','shapes.usda']);
   assert.equal(inventory.reduce((sum,file)=>sum+file.size,0),files.reduce((sum,file)=>sum+file.size,0));
   const controller=new AbortController();controller.abort();
   await assert.rejects(inspectStageSummary(stage,{signal:controller.signal}),{name:'AbortError'});
  });
 }finally{await handle.dispose();}
});
