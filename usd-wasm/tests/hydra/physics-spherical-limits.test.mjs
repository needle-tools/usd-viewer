import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group} from 'three';
import {getUsdModule} from '../runtime.mjs';
import {createThreeHydra} from '../../src/create.three.js';
import {readUsdPhysics} from '../../src/physics/createPhysics.js';
const source=`#usda 1.0
(metersPerUnit=1)
def Xform "World" {
 def Cube "Lamp" (prepend apiSchemas=["PhysicsRigidBodyAPI"]) {}
 def PhysicsSphericalJoint "Socket" {
  rel physics:body1=</World/Lamp>
  uniform token physics:axis="Y"
  float physics:coneAngle0Limit=30
  float physics:coneAngle1Limit=20
 }
 def PhysicsSphericalJoint "Free" {
  rel physics:body1=</World/Lamp>
 }
}`;
// SimReady reads a spherical joint's cone angles from its limit: lower is coneAngle0Limit, upper is coneAngle1Limit.
test('spherical joints carry their authored cone angles in their limit',async()=>{
 const USD=await getUsdModule({print(){},printErr(){}}),handle=await createThreeHydra({USD,scene:new Group(),buffer:new TextEncoder().encode(source),url:'cone.usda'});
 try{
  const snapshot=await readUsdPhysics(handle);
  assert.deepEqual(snapshot.joints.find(j=>j.path==='/World/Socket').limit,{enabled:true,lower:30,upper:20});
  // Unauthored cone angles default to -1, which means unlimited.
  assert.deepEqual(snapshot.joints.find(j=>j.path==='/World/Free').limit,{enabled:false,lower:-1,upper:-1});
 }finally{await handle.dispose();}
});
