import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BufferGeometry,Float32BufferAttribute,MeshPhysicalMaterial,AlwaysDepth} from 'three';
import {coalesceGroups} from '../../src/gltf/groups.js';

function fixture(){
 const geometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(Array.from({length:27},(_,i)=>i),3));
 geometry.setIndex([0,1,2,3,4,5,6,7,8]);[0,1,2].forEach(i=>geometry.addGroup(i*3,3,i));
 const a=new MeshPhysicalMaterial(),b=new MeshPhysicalMaterial();return{geometry,materials:[a,b,a]};
}

test('opaque sections share primitives without changing vertex data, triangles or source slots',()=>{
 const source=fixture(),cache=new WeakMap(),result=coalesceGroups(source.geometry,source.materials,cache);
 assert.notEqual(result.geometry,source.geometry);assert.deepEqual(result.materials,source.materials.slice(0,2));
 assert.deepEqual([...result.geometry.index.array],[0,1,2,6,7,8,3,4,5]);
 assert.deepEqual(result.geometry.groups,[{start:0,count:6,materialIndex:0},{start:6,count:3,materialIndex:1}]);
 assert.equal(result.geometry.attributes.position,source.geometry.attributes.position);
 assert.deepEqual([...source.geometry.index.array],[0,1,2,3,4,5,6,7,8]);assert.equal(source.geometry.groups.length,3);
 const [a,b]=source.materials.map(m=>m.clone());
 assert.equal(coalesceGroups(source.geometry,[a,b,a],cache).geometry,result.geometry,'instance tints can reuse the reordered index buffer');
});

for(const setting of ['transparent','transmission','depthWrite','depthTest'])test(`sections preserve order when ${setting} requires it`,()=>{
 const source=fixture();source.materials[0][setting]=setting.startsWith('depth')?false:setting==='transmission'?.8:true;
 assert.equal(coalesceGroups(source.geometry,source.materials).geometry,source.geometry);
});

test('coalescing retains only the active draw range, including nonindexed geometry',()=>{
 const source=fixture();source.geometry.setIndex(null);source.geometry.setDrawRange(3,6);
 const result=coalesceGroups(source.geometry,source.materials);
 assert.deepEqual([...result.geometry.index.array],[3,4,5,6,7,8]);assert.equal(result.geometry.groups.reduce((n,g)=>n+g.count,0),6);
 assert.deepEqual(source.geometry.drawRange,{start:3,count:6});
});

test('custom depth comparisons keep section order',()=>{
 const source=fixture();source.materials[0].depthFunc=AlwaysDepth;
 assert.equal(coalesceGroups(source.geometry,source.materials).geometry,source.geometry);
});
