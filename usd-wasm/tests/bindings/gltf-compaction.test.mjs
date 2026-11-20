import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateString} from 'gltf-validator';
import {getUsdModule} from '../runtime.mjs';

test('native material primitives retain only referenced vertices with aligned UVs, colors and skin weights', async () => {
	const USD = await getUsdModule(), arrays = [], accessors = [], bufferViews = [];
	let offset = 0;
	const add = (values, components, type, componentType = 5126) => {
		const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
		bufferViews.push({buffer: 0, byteOffset: offset, byteLength: bytes.length});
		arrays.push(bytes, new Uint8Array((4 - bytes.length % 4) % 4));
		offset += bytes.length + (4 - bytes.length % 4) % 4;
		return accessors.push({bufferView: bufferViews.length - 1, componentType, count: values.length / components, type}) - 1;
	};
	const points = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [100, 100, 100]];
	const normals = points.map((_, i) => {const length = Math.hypot(i + 1, 1, 1); return [(i + 1) / length, 1 / length, 1 / length];});
	const tangents = points.map((_, i) => {const length = Math.hypot(1, i + 1); return [1 / length, -(i + 1) / length, 0, i % 2 ? -1 : 1];});
	const uv = points.map((_, i) => [i / 8, (i + 1) / 8]);
	const colors = points.map((_, i) => [i / 8, 1 - i / 8, .25, .5 + i / 16]);
	const weights = points.map((_, i) => [(i + 1) / 8, 1 - (i + 1) / 8, 0, 0]);
	const joints = points.map((_, i) => [i % 2, 1 - i % 2, 0, 0]);
	const attributes = {
		POSITION: add(new Float32Array(points.flat()), 3, 'VEC3'),
		NORMAL: add(new Float32Array(normals.flat()), 3, 'VEC3'),
		TANGENT: add(new Float32Array(tangents.flat()), 4, 'VEC4'),
		TEXCOORD_0: add(new Float32Array(uv.flat()), 2, 'VEC2'),
		COLOR_0: add(new Float32Array(colors.flat()), 4, 'VEC4'),
		JOINTS_0: add(new Uint16Array(joints.flat()), 4, 'VEC4', 5123),
		WEIGHTS_0: add(new Float32Array(weights.flat()), 4, 'VEC4'),
	};
	attributes.TEXCOORD_1 = attributes.TEXCOORD_0;
	Object.assign(accessors[attributes.POSITION], {min: [0, 0, 0], max: [100, 100, 100]});
	const selections = [[2, 0, 1], [5, 3, 4]];
	const primitives = selections.map(indices => ({attributes, indices: add(new Uint16Array(indices), 1, 'SCALAR', 5123)}));
	const bytes = new Uint8Array(offset);
	let at = 0;
	for (const array of arrays) {bytes.set(array, at); at += array.length;}
	const gltf = {asset: {version: '2.0'}, buffers: [{byteLength: bytes.length, uri: 'data:application/octet-stream;base64,' + Buffer.from(bytes).toString('base64')}],
		bufferViews, accessors, meshes: [{primitives}], nodes: [{mesh: 0, skin: 0}, {name: 'Joint', children: [2]}, {name: 'Child'}],
		skins: [{joints: [1, 2], skeleton: 1}], scenes: [{nodes: [0, 1]}], scene: 0};
	const path = '/tmp/compact-material-primitives.gltf';
	const validation = await validateString(JSON.stringify(gltf));
	assert.equal(validation.issues.numErrors, 0, JSON.stringify(validation.issues));
	USD.FS_createDataFile('/tmp', 'compact-material-primitives.gltf', new TextEncoder().encode(JSON.stringify(gltf)), true, true);
	const stage = await USD.OpenStage(path), prims = stage.TraverseAll();
	const read = async (prim, name) => {
		const attribute = prim.GetAttribute(name);
		try {assert.ok(attribute.IsValid(), name); return await attribute.Get(NaN);} finally {attribute.delete();}
	};
	const close = (actual, expected, label) => {
		assert.equal(actual.flat().length, expected.flat().length, label);
		actual.flat().forEach((value, i) => assert.ok(Math.abs(value - expected.flat()[i]) < 1e-6, `${label}: ${actual} != ${expected}`));
	};
	let meshes = 0;
	try {
		assert.deepEqual(stage.GetCompositionErrors(), []);
		for (let i = 0; i < prims.size(); i++) {
			const prim = prims.get(i);
			try {
				if (prim.GetTypeName() !== 'Mesh') continue;
				const selected = selections[meshes++];
				close(await read(prim, 'points'), selected.map(index => points[index]), 'points');
				assert.deepEqual(await read(prim, 'faceVertexIndices'), [0, 1, 2]);
				close(await read(prim, 'primvars:normals'), selected.map(index => normals[index]), 'normals');
				close(await read(prim, 'primvars:tangents'), selected.map(index => tangents[index]), 'tangents');
				for (const name of ['primvars:st', 'primvars:st1']) close(await read(prim, name), selected.map(index => [uv[index][0], 1 - uv[index][1]]), name);
				close(await read(prim, 'primvars:displayColor'), selected.map(index => colors[index].slice(0, 3)), 'colors');
				close(await read(prim, 'primvars:displayOpacity'), selected.map(index => colors[index][3]), 'opacity');
				close(await read(prim, 'primvars:skel:jointWeights'), selected.flatMap(index => weights[index]), 'weights');
				assert.deepEqual(await read(prim, 'primvars:skel:jointIndices'), selected.flatMap(index => joints[index]));
			} finally {prim.delete();}
		}
		assert.equal(meshes, 2);
	} finally {prims.delete(); USD.ReleaseStage(stage); USD.FS_unlink(path);}
});
