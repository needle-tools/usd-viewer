import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BufferAttribute, BufferGeometry, Float32BufferAttribute, InterleavedBuffer, InterleavedBufferAttribute, Matrix3, Texture, Vector2} from 'three';
import {needsUdimTiles, partitionUdimGeometry, selectGeometryRanges, udimSamplingMatrix} from '../../src/gltf/udim.js';
import {udimLayout} from '../../src/hydra/udim.js';

function fixture() {
	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new Float32BufferAttribute([0,0,0, 1,0,0, 0,1,0, 2,0,0, 3,0,0, 2,1,0], 3));
	geometry.setAttribute('uv', new Float32BufferAttribute([0,0, 1,0, 0,1, 1,0, 2,0, 1,1], 2));
	geometry.setAttribute('label', new BufferAttribute(new Int16Array([1,2,3,4,5,6]), 1));
	geometry.setIndex([0,1,2,3,4,5]); geometry.userData = {source: 'islands'};
	return geometry;
}

test('oversized full-resolution atlases require tiles while small atlases retain their layout', () => {
	const texture = new Texture(); texture.userData = {usdSourceSize: [4096,4096], usdUdim: {columns: 10, rows: 2}};
	assert.equal(needsUdimTiles(texture), true);
	texture.userData.usdUdim.columns = 5; assert.equal(needsUdimTiles(texture), false);
	texture.userData.usdUdim.sourceTileSize = [8192,8192]; assert.equal(needsUdimTiles(texture), true);
	assert.equal(needsUdimTiles(new Texture()), false);
});

test('tile partition preserves triangles and exact vertex attributes including UV edges', () => {
	const source = fixture(), before = Array.from(source.attributes.uv.array);
	const parts = partitionUdimGeometry(source);
	assert.deepEqual(parts.map(part => part.tile), [1001,1002]);
	assert.equal(parts.reduce((count,part) => count + part.geometry.index.count / 3, 0), 2);
	assert.deepEqual(parts.map(part => Array.from(part.geometry.attributes.label.array)), [[1,2,3],[4,5,6]]);
	for (const part of parts) {
		assert.equal(part.geometry.attributes.position.count, 3);
		assert.deepEqual(Array.from(part.geometry.index.array), [0,1,2]);
		assert.deepEqual(Array.from(part.geometry.attributes.uv.array), [0,0,1,0,0,1]);
		assert.deepEqual(part.geometry.userData, source.userData);
	}
	assert.deepEqual(Array.from(source.attributes.uv.array), before); assert.equal(source.index.count, 6);
});

test('tile-local UVs preserve rotated nonuniform authored transforms and other texture channels', () => {
	const source = fixture(), angle = .4;
	const matrix = new Matrix3().set(Math.cos(angle)*2,-Math.sin(angle)*3,.2, Math.sin(angle)*2,Math.cos(angle)*3,-.3, 0,0,1);
	const inverse = matrix.clone().invert(), original = source.attributes.uv;
	for (let i = 0; i < original.count; i++) {const uv = new Vector2(original.getX(i),original.getY(i)).applyMatrix3(inverse);original.setXY(i,uv.x,uv.y);}
	const untouched = Array.from(original.array), parts = partitionUdimGeometry(source,{matrix,targetChannel:1});
	for (const part of parts) for (let i = 0; i < part.geometry.attributes.uv1.count; i++) {
		const uv = new Vector2().fromBufferAttribute(part.geometry.attributes.uv1,i).applyMatrix3(matrix);
		assert.ok(uv.x > -1e-5 && uv.x < 1+1e-5 && uv.y > -1e-5 && uv.y < 1+1e-5);
	}
	assert.deepEqual(Array.from(source.attributes.uv.array), untouched);
	assert.deepEqual(Array.from(parts[1].geometry.attributes.uv.array), untouched.slice(6));
});

test('atlas sampling matrix excludes the packing transform', () => {
	const texture = new Texture(), tiles = [1003,1014]; texture.matrixAutoUpdate = false;
	const authored = new Matrix3().set(2,0,.3, 0,3,.4, 0,0,1);
	texture.userData.usdUdim = {tiles};texture.matrix.copy(udimLayout(tiles.map(tile=>({tile}))).matrix).multiply(authored);
	udimSamplingMatrix(texture).elements.forEach((value,index)=>assert.ok(Math.abs(value-authored.elements[index])<1e-9));
});

test('material ranges and interleaved normalized attributes remain precise after compaction', () => {
	const source = fixture(), bytes = new Uint8Array([1,99,2,99,3,99,4,99,5,99,6,99]);
	source.setAttribute('mask',new InterleavedBufferAttribute(new InterleavedBuffer(bytes,2),1,0,true));
	const [part] = partitionUdimGeometry(source,{ranges:[{start:3,count:3}]});
	assert.equal(part.tile,1002);assert.deepEqual(Array.from(part.geometry.attributes.mask.array),[4,5,6]);assert.equal(part.geometry.attributes.mask.normalized,true);
	source.setDrawRange(0,3);assert.equal(partitionUdimGeometry(source).length,1);
});

test('cross-tile triangles reject without changing geometry', () => {
	const source = fixture(); source.attributes.uv.setXY(1,1.2,0);
	assert.throws(()=>partitionUdimGeometry(source),/contained within individual tiles/);
	assert.equal(source.attributes.uv.getX(1),Math.fround(1.2));
});

test('preview black borders do not change the authored UDIM partition coordinates', () => {
	const texture = new Texture(), authored = new Matrix3().set(2,0,.3,0,3,.4,0,0,1), tiles = [1001,1014];
	texture.matrixAutoUpdate = false;
	texture.userData = {usdUdim: {tiles}, usdUdimTransform: authored.toArray()};
	texture.matrix.copy(udimLayout(tiles.map(tile=>({tile}))).matrix).multiply(authored)
		.premultiply(new Matrix3().set(510/542,0,16/542,0,102/134,16/134,0,0,1));
	assert.deepEqual(udimSamplingMatrix(texture).toArray(), authored.toArray());
	assert.notDeepEqual(udimSamplingMatrix(texture).toArray(), udimLayout(tiles.map(tile=>({tile}))).matrix.invert().multiply(texture.matrix).toArray());
});


test('plain sections mixed with UDIM materials keep only their selected triangles', () => {
	const source = fixture();source.addGroup(0,3,0);source.addGroup(3,3,1);
	const selected = selectGeometryRanges(source,[source.groups[1]]);
	assert.equal(selected.index.count,3);assert.equal(selected.attributes.position.count,3);
	assert.deepEqual(Array.from(selected.attributes.position.array),[2,0,0,3,0,0,2,1,0]);
	assert.deepEqual(Array.from(selected.attributes.label.array),[4,5,6]);
	assert.deepEqual(Array.from(selected.index.array),[0,1,2]);assert.deepEqual(selected.groups,[]);
	assert.equal(source.index.count,6);assert.equal(source.groups.length,2);
	source.setDrawRange(0,3);assert.equal(selectGeometryRanges(source,[source.groups[1]]).index.count,0);
});
