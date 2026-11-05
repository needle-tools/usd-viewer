import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group} from 'three';
import {getUsdModule} from '../runtime.mjs';
import {createThreeHydra} from '../../src/create.three.js';
import {readUsdPhysics,getUsdPhysicsLimitations} from '../../src/physics/createPhysics.js';
import {createUsdMechanism} from '../../src/physics/kinematics.js';
const source=`#usda 1.0
(metersPerUnit=1)
def Xform "World" {
 def Xform "Base" (prepend apiSchemas=["PhysicsRigidBodyAPI"]) {
  bool physics:kinematicEnabled=true
 }
 def Cube "Left" (prepend apiSchemas=["PhysicsRigidBodyAPI"]) {}
 def Cube "Right" (prepend apiSchemas=["PhysicsRigidBodyAPI"]) {
  double3 xformOp:translate=(0,1,0)
  uniform token[] xformOpOrder=["xformOp:translate"]
 }
 def PhysicsPrismaticJoint "LeftJoint" {
  rel physics:body0=</World/Base>
  rel physics:body1=</World/Left>
  uniform token physics:axis="X"
  float physics:lowerLimit=-1
  float physics:upperLimit=1
 }
 def PhysicsPrismaticJoint "RightJoint" {
  rel physics:body0=</World/Base>
  rel physics:body1=</World/Right>
  point3f physics:localPos0=(0,1,0)
  uniform token physics:axis="X"
  float physics:lowerLimit=-0.2
  float physics:upperLimit=0.2
  rel physxMimicJoint:transX:referenceJoint=</World/LeftJoint>
  float physxMimicJoint:transX:gearing=2
  float physxMimicJoint:transX:offset=0
 }
}`;
test('native USD relationships and typed mimic attributes drive the optional kinematics core',async()=>{
 const USD=await getUsdModule({print(){},printErr(){}}),handle=await createThreeHydra({USD,scene:new Group(),buffer:new TextEncoder().encode(source),url:'mimic.usda'});let model;
 try{const snapshot=await readUsdPhysics(handle),dependent=snapshot.joints.find(j=>j.path.endsWith('RightJoint'));
  assert.deepEqual(dependent.mimic,{joint:'/World/LeftJoint',multiplier:-2,offset:-0});
  assert.ok(!getUsdPhysicsLimitations(snapshot).some(issue=>issue.reason.includes('Mimic')),'simulation couples mimic joints');
  model=await createUsdMechanism({handle,snapshot});assert.deepEqual(model.unsupported,[]);assert.ok(model.setJointValue('/World/LeftJoint',1));
  assert.ok(Math.abs(model.getJointValue('/World/LeftJoint')-.1)<1e-5);assert.ok(Math.abs(model.getJointValue('/World/RightJoint')+.2)<1e-5);
 }finally{model?.dispose();await handle.dispose();}
});
