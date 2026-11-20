import assert from 'node:assert/strict';
import {test} from 'node:test';
import {withPngBitmapPreview} from '../usd-wasm/scripts/corpus/bitmap-preview.mjs';

test('comparison decoding preserves image options, bounds pixels and restores the browser API', async t => {
	const originalCreate = globalThis.createImageBitmap, originalImageData = globalThis.ImageData;
	t.after(() => {globalThis.createImageBitmap = originalCreate; globalThis.ImageData = originalImageData;});
	const calls = [];
	globalThis.ImageData = class {constructor(data, width, height) {Object.assign(this, {data, width, height});}};
	const create = async (...args) => {calls.push(args); return args[0];};
	globalThis.createImageBitmap = create;
	let disposed = false;
	const decoder = {
		needed(bytes, limit) {assert.deepEqual([...bytes], [1, 2, 3]); assert.equal(limit, 2); return true;},
		async decode(bytes, limit) {assert.equal(limit, 2); return {data: new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]), width: 2, height: 1};},
		dispose() {disposed = true;},
	};
	const options = {resizeWidth: 2, resizeHeight: 1, resizeQuality: 'high', imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none'};
	const result = await withPngBitmapPreview(() => createImageBitmap(new Blob([new Uint8Array([1, 2, 3])], {type: 'image/png'}), options), decoder);
	assert.equal(result.width, 2); assert.equal(result.height, 1);
	assert.deepEqual([...result.data], [10, 20, 30, 255, 40, 50, 60, 255]);
	assert.deepEqual(calls[0][1], {imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none'});
	assert.equal(globalThis.createImageBitmap, create);
	assert.equal(disposed, true);
	assert.deepEqual(options.resizeWidth, 2, 'caller options remain unchanged');
});

test('decoder errors propagate and restore the original API; other bitmap overloads pass through', async t => {
	const original = globalThis.createImageBitmap;
	t.after(() => {globalThis.createImageBitmap = original;});
	const calls = [], create = async (...args) => {calls.push(args); return 'original';};
	globalThis.createImageBitmap = create;
	let disposed = false;
	const decoder = {needed: () => true, async decode() {throw new Error('Bad PNG');}, dispose() {disposed = true;}};
	await assert.rejects(withPngBitmapPreview(async () => {
		assert.equal(await createImageBitmap('image', 0, 0, 2, 2), 'original');
		return createImageBitmap(new Blob(['bad'], {type: 'image/png'}), {resizeWidth: 1, resizeHeight: 1});
	}, decoder), /Bad PNG/);
	assert.deepEqual(calls, [['image', 0, 0, 2, 2]]);
	assert.equal(globalThis.createImageBitmap, create);
	assert.equal(disposed, true);
});
