import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pngPreviewSize, previewPngTextures} from '../usd-wasm/scripts/corpus/texture-preview.mjs';

function png(width, height) {
	const bytes = new Uint8Array(24);
	bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
	const view = new DataView(bytes.buffer);
	view.setUint32(16, width); view.setUint32(20, height);
	return bytes.buffer;
}

test('comparison previews preserve atlas aspect ratio and never enlarge small maps', () => {
	assert.deepEqual(pngPreviewSize(png(20480, 8192), 512), {resizeWidth: 512, resizeHeight: 205});
	assert.deepEqual(pngPreviewSize(png(8192, 20480), 512), {resizeWidth: 205, resizeHeight: 512});
	assert.deepEqual(pngPreviewSize(png(2, 1), 512), {resizeWidth: 2, resizeHeight: 1});
	assert.equal(pngPreviewSize(new ArrayBuffer(24), 512), null);
});

test('simultaneous image loads use independent dimensions and preserve decoder options', async () => {
	const calls = [], loader = {isImageBitmapLoader: true, options: {imageOrientation: 'none'}};
	const parser = {
		json: {images: [{bufferView: 0}, {bufferView: 1}]},
		async getDependency(type, index) {assert.equal(type, 'bufferView'); return index ? png(100, 2000) : png(2000, 100);},
		async loadImageSource(index, decoder) {await new Promise(resolve => setImmediate(resolve)); calls[index] = decoder.options; return index;},
	};
	previewPngTextures(parser, 512);
	assert.deepEqual(await Promise.all([parser.loadImageSource(0, loader), parser.loadImageSource(1, loader)]), [0, 1]);
	assert.deepEqual(calls, [{imageOrientation: 'none', resizeWidth: 512, resizeHeight: 26}, {imageOrientation: 'none', resizeWidth: 26, resizeHeight: 512}]);
	assert.deepEqual(loader.options, {imageOrientation: 'none'});
});
