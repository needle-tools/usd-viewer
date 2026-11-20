import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateString} from 'gltf-validator';
import {getUsdModule} from '../runtime.mjs';

test('interleaved rigid primitives preserve vertex tuples and aliased UVs after indexed gathering', async () => {
	const USD = await getUsdModule();
	const points = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [100, 100, 100]];
	const rows = points.map((point, i) => [...point, Math.sin(i), 0, Math.cos(i),
		i / 8, (i + 1) / 8, Math.cos(i), 0, -Math.sin(i), i % 2 ? -1 : 1]);
	const packed = new Float32Array(rows.flat()), selections = [[2, 0, 1], [5, 3, 4]];
	const binary = new Uint8Array(packed.byteLength + 16);
	binary.set(new Uint8Array(packed.buffer));
	selections.forEach((indices, i) => binary.set(new Uint8Array(new Uint16Array(indices).buffer), packed.byteLength + i * 8));
	const bufferViews = [{buffer: 0, byteLength: packed.byteLength, byteStride: 48, target: 34962},
		...selections.map((_, i) => ({buffer: 0, byteOffset: packed.byteLength + i * 8, byteLength: 6, target: 34963}))];
	const accessors = [
		{bufferView: 0, byteOffset: 0, componentType: 5126, count: 7, type: 'VEC3', min: [0, 0, 0], max: [100, 100, 100]},
		{bufferView: 0, byteOffset: 12, componentType: 5126, count: 7, type: 'VEC3'},
		{bufferView: 0, byteOffset: 24, componentType: 5126, count: 7, type: 'VEC2'},
		{bufferView: 0, byteOffset: 32, componentType: 5126, count: 7, type: 'VEC4'},
		...selections.map((_, i) => ({bufferView: i + 1, componentType: 5123, count: 3, type: 'SCALAR'})),
	];
	const gltf = {asset: {version: '2.0'}, buffers: [{byteLength: binary.length, uri: 'data:application/octet-stream;base64,' + Buffer.from(binary).toString('base64')}],
		bufferViews, accessors, meshes: [{primitives: selections.map((_, i) => ({indices: 4 + i,
			attributes: {POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, TEXCOORD_1: 2, TANGENT: 3}}))}],
		nodes: [{mesh: 0}], scenes: [{nodes: [0]}], scene: 0};
	const validation = await validateString(JSON.stringify(gltf));
	assert.equal(validation.issues.numErrors, 0, JSON.stringify(validation.issues));
	const file = '/tmp/interleaved-primitives.gltf';
	USD.FS_createDataFile('/tmp', 'interleaved-primitives.gltf', new TextEncoder().encode(JSON.stringify(gltf)), true, true);
	const stage = await USD.OpenStage(file), prims = stage.TraverseAll();
	let meshes = 0;
	const read = async (prim, name) => {
		const attribute = prim.GetAttribute(name);
		try {assert.ok(attribute.IsValid(), name); return await attribute.Get(NaN);} finally {attribute.delete();}
	};
	const close = (actual, expected, label) => {
		const values = actual.flat(), reference = expected.flat();
		assert.equal(values.length, reference.length, label);
		values.forEach((value, i) => assert.ok(Math.abs(value - reference[i]) < 1e-6, `${label}: ${value} != ${reference[i]}`));
	};
	try {
		assert.deepEqual(stage.GetCompositionErrors(), []);
		for (let i = 0; i < prims.size(); i++) {
			const prim = prims.get(i);
			try {
				if (prim.GetTypeName() !== 'Mesh') continue;
				const selected = selections[meshes++];
				close(await read(prim, 'points'), selected.map(index => rows[index].slice(0, 3)), 'points');
				close(await read(prim, 'primvars:normals'), selected.map(index => rows[index].slice(3, 6)), 'normals');
				close(await read(prim, 'primvars:tangents'), selected.map(index => rows[index].slice(8)), 'tangents');
				for (const name of ['primvars:st', 'primvars:st1']) close(await read(prim, name), selected.map(index => [rows[index][6], 1 - rows[index][7]]), name);
				assert.deepEqual(await read(prim, 'faceVertexIndices'), [0, 1, 2]);
			} finally {prim.delete();}
		}
		assert.equal(meshes, 2);
	} finally {prims.delete(); USD.ReleaseStage(stage); USD.FS_unlink(file);}
});
