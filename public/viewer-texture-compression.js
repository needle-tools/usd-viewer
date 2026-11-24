import * as THREE from 'three';

function samplerWrap(gl, wrapping) {
	if (wrapping === THREE.RepeatWrapping) return gl.REPEAT;
	if (wrapping === THREE.MirroredRepeatWrapping) return gl.MIRRORED_REPEAT;
	return gl.CLAMP_TO_EDGE;
}

export function supportsViewerTextureCompression(renderer) {
	if (!THREE.ExternalTexture) return false;
	if (renderer?.isWebGLRenderer || renderer?.backend?.isWebGLBackend) return true;
	const features = renderer?.backend?.isWebGPUBackend && renderer.backend.device?.features;
	return !!(features && ['bc', 'etc2', 'astc'].some(format => features.has('texture-compression-' + format)));
}

// MuTracer builds its own atlas from readable images, on a separate device.
// Decode only while a path tracer is using the scene. Raster rendering samples
// the existing GPU texture even when a readable image is attached to its Source.
export function createPathTracingTextureSources() {
	const entries = new Map();
	let readers = 0;

	async function decode(entry) {
		if (entry.image) return;
		entry.pending ??= createImageBitmap(entry.blob).then(image => {
			if (readers && entries.get(entry.source) === entry) {
				entry.image = image;
				entry.source.data = image;
			} else image.close();
		}).finally(() => { entry.pending = undefined; });
		await entry.pending;
	}

	function releaseImage(entry) {
		entry.source.data = entry.dimensions;
		entry.image?.close();
		entry.image = undefined;
	}

	return {
		async add(source, blob) {
			const entry = {source, blob, dimensions: source.data};
			entries.set(source, entry);
			if (readers) await decode(entry);
		},
		remove(source) {
			const entry = entries.get(source);
			entries.delete(source);
			if (entry) releaseImage(entry);
		},
		async acquire() {
			readers++;
			const release = () => {
				if (--readers === 0) for (const entry of entries.values()) releaseImage(entry);
			};
			try {
				await Promise.all([...entries.values()].map(decode));
				return release;
			} catch (error) {
				release();
				throw error;
			}
		},
	};
}

function webglEncoder(gl) {
	return {
		create: ({SparkGL}) => SparkGL.create(gl, {cacheTempResources: true}),
		async encode(spark, image, {srgb, wrapS, wrapT}) {
			if (gl.isContextLost()) return;
			const result = await spark.encodeTexture(image, {format: 'rgba', srgb, flipY: true, mips: true});
			const previous = gl.getParameter(gl.TEXTURE_BINDING_2D);
			try {
				gl.bindTexture(gl.TEXTURE_2D, result.texture);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, samplerWrap(gl, wrapS));
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, samplerWrap(gl, wrapT));
			} finally {
				gl.bindTexture(gl.TEXTURE_2D, previous);
			}
			return result;
		},
		destroy: texture => gl.deleteTexture(texture),
	};
}

function webgpuEncoder(device) {
	return {
		create: ({Spark}) => Spark.create(device, {cacheTempResources: true}),
		async encode(spark, image, {srgb}) {
			const texture = await spark.encodeTexture(image, {format: 'rgba', srgb, flipY: true, mips: true});
			return {texture, width: texture.width, height: texture.height, srgb: texture.format.endsWith('-srgb')};
		},
		destroy: texture => texture.destroy(),
	};
}

/** A stage owns one encoder and the textures it creates. */
export function createViewerTextureCompressor(renderer, readableSources) {
	if (!supportsViewerTextureCompression(renderer)) return;
	const backend = renderer.backend?.isWebGPUBackend
		? webgpuEncoder(renderer.backend.device)
		: webglEncoder(renderer.getContext());
	let encoder, disposed = false, pending = Promise.resolve();

	return {
		encode(image, options) {
			// Spark reuses its scratch textures. Queue encodes on this instance.
			const task = pending.then(async () => {
				if (disposed) return;
				encoder ??= import('/spark-textures/spark.esm.js').then(backend.create).catch(() => undefined);
				const spark = await encoder;
				if (!spark || disposed) return;
				// Preserve all channels, including Z in normal maps and source alpha.
				const result = await backend.encode(spark, image, options);
				if (!result) return;
				const {width, height, srgb} = options;
				if (disposed || result.width !== width || result.height !== height || result.srgb !== srgb) {
					backend.destroy(result.texture);
					return;
				}
				const texture = new THREE.ExternalTexture(result.texture);
				texture.image = {width, height};
				texture.generateMipmaps = false;
				texture.addEventListener('dispose', function release() {
					texture.removeEventListener('dispose', release);
					readableSources?.remove(texture.source);
					backend.destroy(result.texture);
				});
				try {
					await readableSources?.add(texture.source, image);
				} catch (error) {
					texture.dispose();
					throw error;
				}
				if (disposed) {
					texture.dispose();
					return;
				}
				return texture;
			});
			pending = task.then(() => {}, () => {});
			return task;
		},
		dispose() {
			disposed = true;
			void pending.then(async () => { await (await encoder)?.dispose(); }).catch(() => {});
		},
	};
}
