import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group} from 'three';
import {getUsdModule} from '../runtime.mjs';
import {createThreeHydra} from '../../src/create.three.js';
import {createSelectionDrawCache,resolveSubsetPick} from '../../src/viewer/selectionDraws.js';
const source=`#usda 1.0
(startTimeCode=1; endTimeCode=2)
def Mesh "Panel" {
 uniform token subdivisionScheme="catmullClark"
 point3f[] points=[(-3,-1,0),(-1,-1,0),(-1,1,0),(-3,1,0),(1,-1,0),(3,-1,0),(3,1,0),(1,1,0)]
 int[] faceVertexCounts=[4,4]
 int[] faceVertexIndices=[0,1,2,3,4,5,6,7]
 def GeomSubset "Side" {
  uniform token elementType="face"
  int[] indices.timeSamples={1:[0],2:[1]}
 }
}`;
async function parts(cache,mesh,handle,face){
 for(let i=0;i<200;i++){const draws=cache.get(mesh,[{path:'/Panel/Side'}],handle);if(draws.length&&[...draws[0].geometry.index.array].every(index=>(mesh.geometry.userData.usdCoarseFaceParams[Math.floor(index/3)]>>2)===face))return draws;await new Promise(r=>setTimeout(r,5));}
 throw new Error('Subset geometry did not resolve');
}
for(const complexity of ['low','medium','adaptive'])test(`${complexity}: authored face IDs select refined unbound subsets and follow time-sampled indices`,async()=>{
 const USD=await getUsdModule({print(){},printErr(){}}),handle=await createThreeHydra({USD,scene:new Group(),url:'subset-'+complexity+'.usda',buffer:new TextEncoder().encode(source),complexity});
 const cache=createSelectionDrawCache();
 try{
  await handle.setTime(1);let mesh;handle.scene.traverseVisible(o=>{if(o.isMesh)mesh=o;});const params=mesh.geometry.userData.usdCoarseFaceParams;
  assert.ok(params?.length>0);assert.ok([...params].some(p=>(p>>2)===0));assert.ok([...params].some(p=>(p>>2)===1));
  const [first]=await parts(cache,mesh,handle,0);assert.notEqual(first.geometry,mesh.geometry);assert.equal(first.geometry.attributes.position,mesh.geometry.attributes.position);
  for(const index of first.geometry.index.array)assert.equal(params[Math.floor(index/3)]>>2,0);
  assert.equal((await resolveSubsetPick(handle,{path:'/Panel',instances:[]},mesh.geometry,0)).path,'/Panel/Side');
  await handle.setTime(2);const [second]=await parts(cache,mesh,handle,1);
  for(const index of second.geometry.index.array)assert.equal(mesh.geometry.userData.usdCoarseFaceParams[Math.floor(index/3)]>>2,1);
 }finally{cache.dispose();await handle.dispose();}
});

test('different subsets on shared native instances keep their own geometry and instance masks',async()=>{
 const USD=await getUsdModule({print(){},printErr(){}}),body=source.slice(source.indexOf('def Mesh')).replace(' def GeomSubset "Side"',` def GeomSubset "Other" {
  uniform token elementType="face"
  int[] indices=[1]
 }
 def GeomSubset "Side"`);
 const text=`#usda 1.0
def Xform "Asset" {\n${body}\n}
def Xform "A" (prepend references=</Asset>; instanceable=true) {}
def Xform "B" (prepend references=</Asset>; instanceable=true) {}
`;
 const handle=await createThreeHydra({USD,scene:new Group(),url:'instance-subsets.usda',buffer:new TextEncoder().encode(text),complexity:'low'}),cache=createSelectionDrawCache();
 try{
  await handle.setTime(1);let mesh;handle.scene.traverseVisible(o=>{if(o.isInstancedMesh&&o.count===2)mesh=o;});assert.ok(mesh);
  const items=[{path:'/A/Panel/Side'},{path:'/B/Panel/Other'}];let draws;
  for(let i=0;i<200;i++){draws=cache.get(mesh,items,handle);if(draws.length===2)break;await new Promise(r=>setTimeout(r,5));}
  assert.equal(draws.length,2);assert.equal(draws[0].instances.size,1);assert.equal(draws[1].instances.size,1);assert.notDeepEqual([...draws[0].instances],[...draws[1].instances]);
  for(let face=0;face<2;face++)for(const index of draws[face].geometry.index.array)assert.equal(mesh.geometry.userData.usdCoarseFaceParams[Math.floor(index/3)]>>2,face);
 }finally{cache.dispose();await handle.dispose();}
});
