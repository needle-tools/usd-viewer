import test from 'node:test';
import assert from 'node:assert/strict';
import {BufferAttribute,BufferGeometry,Group,Mesh,MeshBasicMaterial,Matrix4,InstancedMesh} from 'three';
import {geometryStats} from '../usd-wasm/scripts/corpus/geometry.mjs';

const positions=new Float32Array([0,0,0,1,0,0,0,1,0,2,2,0,3,2,0,2,3,0,100,100,100]);
function geometry(indices,compact=false){const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(compact?new Float32Array(indices.flatMap(i=>Array.from(positions.slice(i*3,i*3+3)))):positions,3));g.setIndex(compact?indices.map((_,i)=>i):indices);return g;}
function scene(meshes){const root=new Group(),rotated=new Group();rotated.rotation.z=Math.PI/4;root.add(rotated);for(const mesh of meshes)rotated.add(mesh);return root;}

test('world bounds are invariant under material splitting and exclude unused vertices',()=>{
	const g=geometry([0,1,2,3,4,5]);g.addGroup(0,3,0);g.addGroup(3,3,1);
	const combined=geometryStats(scene([new Mesh(g,[new MeshBasicMaterial(),new MeshBasicMaterial()])]));
	const split=geometryStats(scene([new Mesh(geometry([0,1,2],true)),new Mesh(geometry([3,4,5],true))]));
	assert.deepEqual(combined.bounds,split.bounds);assert.equal(combined.triangles,2);assert.equal(split.triangles,2);
	g.setAttribute('position',new BufferAttribute(positions.slice(0,18),3));
	assert.deepEqual(geometryStats(scene([new Mesh(g,[new MeshBasicMaterial(),new MeshBasicMaterial()])])).bounds,split.bounds);
	assert.ok(Math.abs(combined.bounds[0][0]+Math.SQRT1_2)<1e-12);
	assert.ok(Math.abs(combined.bounds[1][1]-5*Math.SQRT1_2)<1e-12);
});

test('invalid indexed and nonfinite rendered positions fail explicitly',()=>{
	assert.throws(()=>geometryStats(scene([new Mesh(geometry([0,1,99]))])),/Invalid rendered vertex/);
	const g=geometry([0,1,2],true);g.attributes.position.setX(0,NaN);
	assert.throws(()=>geometryStats(scene([new Mesh(g)])),/Nonfinite rendered position/);
});

test('bounds obey draw ranges and still expose displaced rendered geometry',()=>{
	const g=geometry([0,1,2,3,4,5]);g.setDrawRange(0,3);
	const root=scene([new Mesh(g)]),first=geometryStats(root);
	assert.equal(first.triangles,1);assert.ok(first.bounds[1][1]<1);
	root.children[0].children[0].position.x=.001;
	const moved=geometryStats(root);assert.notDeepEqual(moved.bounds,first.bounds);
});

test('instance transforms and unit conversion are measured without local box inflation',()=>{
	const mesh=new InstancedMesh(geometry([0,1,2]),new MeshBasicMaterial(),2);
	mesh.setMatrixAt(0,new Matrix4());mesh.setMatrixAt(1,new Matrix4().makeTranslation(10,0,0));
	const root=new Group();root.add(mesh);
	assert.deepEqual(geometryStats(root,new Matrix4().makeScale(.01,.01,.01)),{primitives:2,triangles:2,bounds:[[0,0,0],[.11,.01,0]]});
});
