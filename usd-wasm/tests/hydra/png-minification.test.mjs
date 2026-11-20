import assert from 'node:assert/strict';
import {test} from 'node:test';
import {zlibSync, Unzlib} from '../../src/vendor/fflate/fflate.js';
import {downsamplePng} from '../../src/hydra/pngDownsample.js';

function png(width, height, pixel) {
	const u32 = value => [value >>> 24, value >>> 16 & 255, value >>> 8 & 255, value & 255];
	const chunk = (tag, data) => {
		const body = [...new TextEncoder().encode(tag), ...data];
		let crc = 0xffffffff;
		for (const value of body) {
			crc ^= value;
			for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
		}
		return [...u32(data.length), ...body, ...u32((crc ^ 0xffffffff) >>> 0)];
	};
	const rows = [];
	for (let y = 0; y < height; y++) {
		rows.push(0);
		for (let x = 0; x < width; x++) rows.push(...pixel(x, y));
	}
	return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10,
		...chunk('IHDR', [...u32(width), ...u32(height), 8, 6, 0, 0, 0]),
		...chunk('IDAT', zlibSync(new Uint8Array(rows))), ...chunk('IEND', [])]);
}

test('PNG minification averages the entire footprint instead of aliasing its centre samples', () => {
	for (const origin of [0, 4, 7, 12]) {
		const source = png(16, 16, (x, y) => x >= origin && x < origin + 2 && y >= origin && y < origin + 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]);
		assert.deepEqual([...downsamplePng(source, 1, Unzlib).data], [4, 4, 4, 255]);
	}
});

test('noninteger footprint boundaries preserve weighted alpha and do not leak transparent colors', () => {
	const source = png(5, 1, x => x === 2 ? [0, 255, 0, 255] : [255, 0, 0, 0]);
	assert.deepEqual([...downsamplePng(source, 2, Unzlib).data], [0, 255, 0, 51, 0, 255, 0, 51]);
});
