export function pngPreviewSize(buffer, limit) {
	const bytes = new Uint8Array(buffer);
	if (bytes.length < 24 || [137, 80, 78, 71, 13, 10, 26, 10].some((value, i) => bytes[i] !== value)) return null;
	const view = new DataView(buffer), width = view.getUint32(16), height = view.getUint32(20);
	if (!width || !height) throw new Error('Invalid PNG dimensions.');
	const scale = Math.min(1, limit / Math.max(width, height));
	return {resizeWidth: Math.max(1, Math.round(width * scale)), resizeHeight: Math.max(1, Math.round(height * scale))};
}

// Install before the SimReady plugin so its image concurrency limit also bounds
// these bufferView reads. Each image gets independent bitmap decoding options.
export function previewPngTextures(parser, limit) {
	const load = parser.loadImageSource;
	parser.loadImageSource = async function (index, loader) {
		const source = parser.json.images[index];
		if (loader.isImageBitmapLoader && Number.isInteger(source.bufferView)) {
			const size = pngPreviewSize(await parser.getDependency('bufferView', source.bufferView), limit);
			if (size) {
				const original = loader;
				loader = Object.create(original);
				loader.options = {...original.options, ...size};
			}
		}
		return load.call(this, index, loader);
	};
}
