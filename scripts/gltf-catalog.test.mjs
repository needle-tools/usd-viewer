import assert from 'node:assert/strict';
import test from 'node:test';
import {mergeGltfSampleCards} from '../public/viewer-gltf-catalog.mjs';

const root = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/';

test('new Khronos assets are available without preconverted USD files', () => {
	const [card] = mergeGltfSampleCards([{
		name: 'NewSample', label: 'New sample', tags: ['extension'],
		variants: {'glTF': 'scene.gltf', 'glTF-Binary': 'scene.glb'},
		screenshot: 'screenshot/preview.webp',
	}], []);
	assert.equal(card.url, root + 'NewSample/glTF-Binary/scene.glb');
	assert.equal(card.thumbnail, root + 'NewSample/screenshot/preview.webp');
	assert.deepEqual(card.converterOrder, ['original-gltf']);
	assert.equal(card.conversions['original-gltf'], card.url);
});

test('JSON-only assets and filenames containing spaces resolve relative to their model', () => {
	const [card] = mergeGltfSampleCards([{
		name: 'Box With Spaces', variants: {'glTF': 'Box With Spaces.gltf'},
	}], []);
	assert.equal(card.url, root + 'Box%20With%20Spaces/glTF/Box%20With%20Spaces.gltf');
});

test('existing conversion comparisons retain their source asset and preview', () => {
	const converted = {
		name: 'Existing display name', catalogNames: ['NewSample'], url: 'https://example.com/scene.usdz',
		thumbnail: 'https://example.com/preview.webp',
		conversions: {adobe: 'https://example.com/scene.usdz', 'original-gltf': 'https://example.com/old.glb'},
		converterOrder: ['adobe', 'original-gltf'], tags: ['testing'],
	};
	const extra = {name: 'Other converted model', url: 'https://example.com/other.usdz'};
	const cards = mergeGltfSampleCards([{
		name: 'NewSample', label: 'Current name', variants: {'glTF': 'new.gltf'}, tags: ['extension'],
	}], [converted, extra]);
	assert.equal(cards.length, 2);
	assert.equal(cards[0].name, 'Existing display name');
	assert.equal(cards[0].thumbnail, converted.thumbnail);
	assert.match(cards[0].search, /Current name/);
	assert.equal(cards[0].url, converted.url);
	assert.equal(cards[0].conversions.adobe, converted.url);
	assert.equal(cards[0].conversions['original-gltf'], converted.conversions['original-gltf']);
	assert.deepEqual(cards[0].converterOrder, ['adobe', 'original-gltf']);
	assert.deepEqual(cards[0].tags, ['testing', 'extension']);
	assert.equal(cards[1], extra);
});

test('invalid entries do not create broken cards or hide existing conversions', () => {
	const converted = {name: 'Existing model', url: 'https://example.com/model.usdz'};
	assert.deepEqual(mergeGltfSampleCards([
		{name: 'MissingVariants'}, {variants: {'glTF': 'scene.gltf'}},
		{name: 'NotAModel', variants: {screenshot: 'preview.png'}},
	], [converted]), [converted]);
});
