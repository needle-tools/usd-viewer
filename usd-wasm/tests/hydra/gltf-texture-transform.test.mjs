import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BufferAttribute, BufferGeometry, DataTexture, Group, Mesh, MeshStandardMaterial, SRGBColorSpace, Vector2} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {NeedleSimreadyLoaderPlugin} from '@needle-tools/simready/gltf';
import {exportSimreadyGltf} from '../../src/gltf/simready.js';

const close = (actual, expected) => actual.forEach((value, i) =>
	assert.ok(Math.abs(value - expected[i]) < 1e-10, `${actual} != ${expected}`));

// Evaluate the extension's GLSL equation directly, independent of Three's APIs.
function sample({scale = [1, 1], offset = [0, 0], rotation = 0}, [u, v]) {
	const [x, y] = [scale[0] * u, scale[1] * v];
	return [offset[0] + Math.cos(rotation) * x - Math.sin(rotation) * y,
		offset[1] + Math.sin(rotation) * x + Math.cos(rotation) * y];
}

test('USD export serializes clockwise texture fields as glTF counter-clockwise rotation', async () => {
	const texture = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
	texture.colorSpace = SRGBColorSpace;
	texture.offset.set(.15, .3);
	texture.repeat.set(.2, .5);
	texture.rotation = -.7;
	const exporter = new GLTFExporter();
	// Image encoding is independent of the textureInfo transform under test.
	exporter.register(writer => ({name: 'TEST_image', beforeParse() {
		writer.processImage = () => {
			writer.json.images = [{uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLo0AAAAASUVORK5CYII='}];
			return 0;
		};
	}}));
	const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
	geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2));
	const mesh = new Mesh(geometry, new MeshStandardMaterial({map: texture}));
	mesh.userData.usdPath = '/Triangle';
	const scene = new Group();
	scene.add(mesh);
	const snapshot = {metersPerUnit: 1, kilogramsPerUnit: 1, upAxis: 'Y', scenes: [], bodies: [], shapes: [], joints: [], materials: [], groups: [], unsupported: []};
	const bytes = await (await exportSimreadyGltf({handle: {scene, ready() {}}, exporter, snapshot,
		output: 'blob'})).arrayBuffer();
	const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, new DataView(bytes).getUint32(12, true))));
	const transform = json.materials[0].pbrMetallicRoughness.baseColorTexture.extensions.KHR_texture_transform;
	for (const uv of [[0, 0], [.3, .8], [1, 1], [-1, 2]]) {
		close(sample(transform, uv), sample({offset: [.15, .3], scale: [.2, .5], rotation: .7}, uv));
	}
	assert.equal(texture.rotation, -.7, 'serialization preserves the source texture');
});

test('the SimReady loader samples rotated, nonuniform transforms by the glTF equation', async () => {
	const parameters = {offset: [.15, .3], scale: [.2, .5], rotation: .7, texCoord: 1};
	const data = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1]);
	const json = {
		asset: {version: '2.0'},
		buffers: [{byteLength: data.byteLength, uri: 'data:application/octet-stream;base64,' + Buffer.from(data.buffer).toString('base64')}],
		bufferViews: [{buffer: 0, byteLength: 36}, {buffer: 0, byteOffset: 36, byteLength: 24}],
		accessors: [{bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0]},
			{bufferView: 1, componentType: 5126, count: 3, type: 'VEC2'}],
		textures: [{source: 0}], images: [{uri: 'unused.png'}],
		materials: [{pbrMetallicRoughness: {baseColorTexture: {index: 0, extensions: {KHR_texture_transform: parameters}}}}],
		extensionsUsed: ['KHR_texture_transform'],
		meshes: [{primitives: [{attributes: {POSITION: 0, TEXCOORD_0: 1, TEXCOORD_1: 1}, material: 0}]}],
		nodes: [{mesh: 0}], scenes: [{nodes: [0]}], scene: 0,
	};
	const loader = new GLTFLoader();
	loader.register(parser => ({
		name: 'TEST_simready_texture',
		beforeRoot() {
			// Exercise the actual SimReady parser adapter without creating a physics runtime.
			parser.json.extensions = {NEEDLE_simready: {}};
			new NeedleSimreadyLoaderPlugin(parser);
		},
		loadTexture() {return Promise.resolve(new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1));},
	}));
	globalThis.ProgressEvent ||= class {};
	const result = await loader.parseAsync(JSON.stringify(json), '');
	const texture = result.scene.children[0].material.map;
	assert.equal(texture.channel, 1);
	assert.equal(texture.matrixAutoUpdate, false);
	for (const uv of [[0, 0], [.3, .8], [1, 1], [-1, 2]]) {
		close(new Vector2(...uv).applyMatrix3(texture.matrix).toArray(), sample(parameters, uv));
	}
});
