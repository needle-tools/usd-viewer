import {downsamplePng, pngSize} from './pngDownsample.js';
import {Unzlib} from '../vendor/fflate/fflate.js';

self.onmessage = async ({data: {bytes, limit, blob, transform}}) => {
	try {
		if (blob) {
			const result = await transformNormalMap(blob, transform);
			self.postMessage({result});
		} else {
			const result = await resizePreview(bytes, limit) ?? downsamplePng(bytes, limit, Unzlib);
			self.postMessage({result}, [result.data.buffer]);
		}
	} catch (error) {
		self.postMessage({error: String(error?.message || error)});
	}
};

async function resizePreview(bytes, limit) {
	const size = pngSize(bytes);
	if (!size || bytes[24] !== 8 || typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return;
	const {width: sourceWidth, height: sourceHeight} = size;
	// Bound temporary decoded pixels across the two workers. Larger or higher
	// precision sources use the scanline decoder.
	if (!sourceWidth || !sourceHeight || sourceWidth * sourceHeight > 4096 ** 2) return;
	const scale = Math.min(1, limit / Math.max(sourceWidth, sourceHeight));
	const width = Math.max(1, Math.round(sourceWidth * scale));
	const height = Math.max(1, Math.round(sourceHeight * scale));
	let bitmap;
	try {
		bitmap = await createImageBitmap(new Blob([bytes], {type: 'image/png'}), {
			resizeWidth: width, resizeHeight: height, resizeQuality: 'high',
			colorSpaceConversion: 'none', premultiplyAlpha: 'none',
		});
		if (bitmap.width !== width || bitmap.height !== height) return;
		const context = new OffscreenCanvas(width, height).getContext('2d', {willReadFrequently: true});
		context.drawImage(bitmap, 0, 0);
		return {data: context.getImageData(0, 0, width, height).data, width, height, sourceWidth, sourceHeight};
	} catch {
		// Some valid PNGs fail in the browser's resize decoder.
	} finally {
		bitmap?.close();
	}
}

async function transformNormalMap(blob, {flipRows, flipRed, flipGreen}) {
	const bitmap = await createImageBitmap(blob, {colorSpaceConversion: 'none', premultiplyAlpha: 'none'});
	const {width, height} = bitmap;
	const canvas = new OffscreenCanvas(width, height);
	const context = canvas.getContext('2d', {willReadFrequently: flipRed || flipGreen});
	try {
		if (flipRows) context.setTransform(1, 0, 0, -1, 0, height);
		context.drawImage(bitmap, 0, 0);
	} finally {
		bitmap.close();
	}
	if (flipRed || flipGreen) {
		const image = context.getImageData(0, 0, width, height);
		for (let i = 0; i < image.data.length; i += 4) {
			if (flipRed) image.data[i] = 255 - image.data[i];
			if (flipGreen) image.data[i + 1] = 255 - image.data[i + 1];
		}
		context.putImageData(image, 0, 0);
	}
	return canvas.convertToBlob({type: 'image/png'});
}
