// Keep the SDK's Blob loading and concurrency path, but use the same bounded
// area filter as the USD preview. Browser bitmap resize filters can alias fine
// patterns even with resizeQuality=high.
export async function withPngBitmapPreview(load, decoder) {
	const create = globalThis.createImageBitmap;
	if (typeof create !== 'function') {
		try {return await load();} finally {decoder.dispose();}
	}
	globalThis.createImageBitmap = async (...args) => {
		const [source, options] = args;
		if (source instanceof Blob && source.type === 'image/png' && options &&
			typeof options === 'object' && options.resizeWidth > 0 && options.resizeHeight > 0) {
			const bytes = new Uint8Array(await source.arrayBuffer());
			const limit = Math.max(options.resizeWidth, options.resizeHeight);
			if (decoder.needed(bytes, limit)) {
				const image = await decoder.decode(bytes, limit);
				const {resizeWidth, resizeHeight, resizeQuality, ...remaining} = options;
				return Reflect.apply(create, globalThis, [new ImageData(image.data, image.width, image.height), remaining]);
			}
		}
		return Reflect.apply(create, globalThis, args);
	};
	try {return await load();}
	finally {globalThis.createImageBitmap = create; decoder.dispose();}
}
