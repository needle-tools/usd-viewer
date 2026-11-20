import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getUsdModule } from '../runtime.mjs';

function fixture(parameters) {
	const data = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, .1, .2, .3, .4, .5, .6]);
	const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLo0AAAAASUVORK5CYII=';
	const gltf = { asset: { version: '2.0' }, buffers: [{ byteLength: data.byteLength, uri: 'data:application/octet-stream;base64,' + Buffer.from(data.buffer).toString('base64') }], bufferViews: [{ buffer: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 24 }, { buffer: 0, byteOffset: 60, byteLength: 24 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }, { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' }, { bufferView: 2, componentType: 5126, count: 3, type: 'VEC2' }], images: [{ uri: 'data:image/png;base64,' + png }], textures: [{ source: 0 }], materials: [{ name: 'Transformed', pbrMetallicRoughness: { baseColorTexture: { index: 0, extensions: { KHR_texture_transform: parameters } }, metallicFactor: 0, roughnessFactor: 1 } }], extensionsUsed: ['KHR_texture_transform'], meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1, TEXCOORD_1: 2 }, material: 0 }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0 };
	return gltf;
}

for (const parameters of [
	{ scale: [.2, .5], offset: [0, 0], rotation: 0 },
	{ scale: [.2, .5], offset: [.1, .25], rotation: .7, texCoord: 1 },
	{ scale: [1, -1], offset: [0, 1], rotation: 0 },
	{ scale: [1, 1], offset: [0, 0], rotation: 0, texCoord: 1 },
]) test(`native glTF texture transforms retain sampling after UV origin conversion ${JSON.stringify(parameters)}`, async () => {
	const USD = await getUsdModule(), name = 'texture-transform-' + (parameters.rotation ? 'rotated' : parameters.texCoord === 1 ? 'override' : parameters.scale[1] < 0 ? 'flipped' : 'atlas') + '.gltf', path = '/tmp/' + name;
	const gltf = fixture(parameters);
	let json = JSON.stringify(gltf); if (parameters.texCoord === 1 && parameters.rotation === 0) json = json.replace('"texCoord":1', '"texCoord":1.0');
	USD.FS_createDataFile('/tmp', name, new TextEncoder().encode(json), true, true);
	const stage = await USD.OpenStage(path), prims = stage.TraverseAll(), transforms = [], readers = [];
	const value = async (prim, name, fallback) => { const attr = prim.GetAttribute(name); try { return attr.IsValid() ? await attr.Get(NaN) : fallback; } finally { attr.delete(); } };
	try {
		assert.deepEqual(stage.GetCompositionErrors(), []);
		for (let i = 0; i < prims.size(); i++) {
			const prim = prims.get(i);
			try {
const id = await value(prim, 'info:id', '');
				if (id === 'UsdTransform2d') transforms.push({ scale: await value(prim, 'inputs:scale', [1, 1]), rotation: await value(prim, 'inputs:rotation', 0), offset: await value(prim, 'inputs:translation', [0, 0]) });
				if (id === 'UsdPrimvarReader_float2') readers.push(await value(prim, 'inputs:varname', ''));
			} finally { prim.delete(); }
		}
		const identity = parameters.scale.every(n => n === 1) && parameters.offset.every(n => n === 0) && parameters.rotation === 0;
		assert.ok(identity ? transforms.length === 0 : transforms.length > 0, 'the imported shader network retains the required transform');
		for (const transform of transforms) for (const [u, v] of [[0, 0], [.2, .7], [1, 1], [-1, 3]]) {
			const [sx, sy] = parameters.scale, [tx, ty] = parameters.offset, r = parameters.rotation;
			const expected = [tx + Math.cos(r) * sx * u - Math.sin(r) * sy * v, 1 - (ty + Math.sin(r) * sx * u + Math.cos(r) * sy * v)];
			const angle = transform.rotation * Math.PI / 180, [a, b] = transform.scale, [x, y] = transform.offset;
			const actual = [x + Math.cos(angle) * a * u - Math.sin(angle) * b * (1 - v), y + Math.sin(angle) * a * u + Math.cos(angle) * b * (1 - v)];
			actual.forEach((n, i) => assert.ok(Math.abs(n - expected[i]) < 1e-6, `${JSON.stringify(transform)} at ${u},${v}: ${n} != ${expected[i]}`));
		}
		if (parameters.texCoord === 1) assert.ok(readers.length > 0 && readers.every(name => name === 'st1'), 'the extension UV-set override reaches both material networks');
	} finally { prims.delete(); USD.ReleaseStage(stage); USD.FS_unlink(path); }
});


test('native USD-to-glTF writing restores texture transforms after mesh UV conversion', async () => {
	const USD = await getUsdModule();
	for (const parameters of [
		{ scale: [.2, .5], offset: [0, 0], rotation: 0 },
		{ scale: [.2, .5], offset: [.1, .25], rotation: .7, texCoord: 1 },
	]) {
		const name = 'native-uv-export-' + (parameters.rotation ? 'rotated' : 'atlas');
		USD.FS_createDataFile('/tmp', name + '.gltf', new TextEncoder().encode(JSON.stringify(fixture(parameters))), true, true);
		const stage = await USD.OpenStage('/tmp/' + name + '.gltf');
		try {
			assert.equal(await stage.Export('/tmp/' + name + '.glb'), true);
			const bytes = USD.ReadFile('/tmp/' + name + '.glb');
			const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
			const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))));
			const info = json.materials.find(material => material.pbrMetallicRoughness?.baseColorTexture).pbrMetallicRoughness.baseColorTexture;
			const transform = info.extensions?.KHR_texture_transform || {};
			const evaluate = ({ scale = [1, 1], offset = [0, 0], rotation = 0 }, [u, v]) => [
				offset[0] + Math.cos(rotation) * scale[0] * u - Math.sin(rotation) * scale[1] * v,
				offset[1] + Math.sin(rotation) * scale[0] * u + Math.cos(rotation) * scale[1] * v,
			];
			for (const uv of [[0, 0], [.3, .8], [1, 1], [-1, 2]]) {
				const expected = evaluate(parameters, uv), actual = evaluate(transform, uv);
				actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-6, `${actual} != ${expected}`));
			}
			assert.equal(transform.texCoord ?? info.texCoord ?? 0, parameters.texCoord || 0);
		} finally {
			USD.ReleaseStage(stage);
			USD.FS_unlink('/tmp/' + name + '.gltf');
			USD.FS_unlink('/tmp/' + name + '.glb');
		}
	}
});
