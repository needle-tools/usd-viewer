import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {Group, DoubleSide} from 'three';
import {getUsdModule} from '../runtime.mjs';
import {createThreeHydra} from '../../src/create.three.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
async function inspect(source, callback){
 const errors=[],USD=await getUsdModule({print(){},printErr(message){errors.push(message)}}),root=new Group();
 const handle=await createThreeHydra({USD,scene:root,url:'nurbs-patch-regression.usda',buffer:new TextEncoder().encode(source)});
 try{await handle.ready();await handle.materialsReady();await callback(root,handle);assert.deepEqual(errors,[])}finally{await handle.dispose()}
}
const find=root=>{let mesh;root.traverse(object=>{if(object.userData.usdPrimitiveType==='nurbsPatch')mesh=object});return mesh};
test('real Hydra evaluates NURBS surface and derivative normals, and responds to complexity',async()=>{
 const source=await readFile(new URL('../fixtures/coverage/advanced/nurbs-patch.usda',import.meta.url),'utf8');
 await inspect(source,async(root,handle)=>{
  const mesh=find(root);assert.ok(mesh?.visible);assert.equal(mesh.material.side,DoubleSide);
  assert.equal(mesh.geometry.attributes.position.count,17*17);
  near(mesh.geometry.attributes.position.getY(8*17+8),.2109375);
  near(mesh.geometry.attributes.normal.getY(8*17+8),-1);
  await handle.setComplexity(1.2);
  assert.equal(mesh.geometry.attributes.position.count,65*65);
  near(mesh.geometry.attributes.position.getY(32*65+32),.2109375);
  assert.equal(mesh.userData.usdStrokeError,undefined);
 });
});
test('real Hydra rational patch updates animated weights without animated points',async()=>{
 await inspect(`#usda 1.0
(startTimeCode = 1
endTimeCode = 2)
def NurbsPatch "Patch" {
 bool doubleSided = true
 point3f[] points = [(1,0,0),(1,1,0),(0,1,0),(1,0,2),(1,1,2),(0,1,2)]
 int uVertexCount = 3
 int vVertexCount = 2
 int uOrder = 3
 int vOrder = 2
 double[] uKnots = [0,0,0,1,1,1]
 double[] vKnots = [0,0,1,1]
 double2 uRange = (0,1)
 double2 vRange = (0,1)
 double[] pointWeights.timeSamples = {1:[1,0.7071067811865476,1,1,0.7071067811865476,1],2:[1,1,1,1,1,1]}
}`,async(root,handle)=>{
  const mesh=find(root),index=8*17+8;assert.ok(mesh?.visible);
  near(mesh.geometry.attributes.position.getX(index),Math.SQRT1_2);
  near(mesh.geometry.attributes.normal.getX(index),Math.SQRT1_2);
  await handle.setTime(2);near(mesh.geometry.attributes.position.getX(index),.75);
  await handle.setTime(1);near(mesh.geometry.attributes.position.getX(index),Math.SQRT1_2);
 });
});
