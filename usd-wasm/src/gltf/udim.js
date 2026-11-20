import {BufferAttribute, BufferGeometry, Matrix3} from 'three';
import {udimLayout} from '../hydra/udim.js';

// Larger atlases exceed browser canvas limits. Tile materials keep every
// source pixel without requiring one canvas or GPU texture for the full set.
export function needsUdimTiles(texture) {
	const layout = texture.userData?.usdUdim;
	const size = layout?.sourceTileSize || texture.userData?.usdSourceSize || (layout && texture.image && [texture.image.width / layout.columns, texture.image.height / layout.rows]);
	return !!(layout && size && (layout.columns * size[0] > 32767 || layout.rows * size[1] > 32767 || layout.columns * layout.rows * size[0] * size[1] > 268435456));
}

export function udimSamplingMatrix(texture) {
	if (texture.userData.usdUdimTransform) return new Matrix3().fromArray(texture.userData.usdUdimTransform);
	const layout = texture.userData.usdUdim;
	if (texture.matrixAutoUpdate) texture.updateMatrix();
	return udimLayout(layout.tiles.map(tile => ({tile}))).matrix.clone().invert().multiply(texture.matrix);
}

const uvName = channel => ['uv', 'uv1', 'uv2', 'uv3'][channel];
const raw = (attribute, row, column) => attribute.isInterleavedBufferAttribute
	? attribute.data.array[row * attribute.data.stride + attribute.offset + column]
	: attribute.array[row * attribute.itemSize + column];

function compactGeometry(source, indices) {
	const vertices = [], remap = new Map();
	const mapped = indices.map(index => {
		if (!remap.has(index)) {remap.set(index, vertices.length); vertices.push(index);}
		return remap.get(index);
	});
	const geometry = new BufferGeometry();
	geometry.userData = {...source.userData};
	for (const [name, attribute] of Object.entries(source.attributes)) {
		const array = new attribute.array.constructor(vertices.length * attribute.itemSize);
		for (let row = 0; row < vertices.length; row++) for (let column = 0; column < attribute.itemSize; column++) array[row * attribute.itemSize + column] = raw(attribute, vertices[row], column);
		geometry.setAttribute(name, new BufferAttribute(array, attribute.itemSize, attribute.normalized));
	}
	geometry.setIndex(new BufferAttribute(vertices.length <= 65535 ? Uint16Array.from(mapped) : Uint32Array.from(mapped), 1));
	return {geometry, vertices};
}

/** A single-material mesh renders its complete index buffer. Keep only the
 * selected sections when separating a plain surface from UDIM materials. */
export function selectGeometryRanges(source, ranges) {
	const indices = [], count = source.index?.count ?? source.attributes.position.count;
	for (const range of ranges) {
		const start = Math.max(0, range.start, source.drawRange.start);
		const end = Math.min(count, range.start + range.count, source.drawRange.start + source.drawRange.count);
		if (end <= start) continue;
		if (start % 3 || (end - start) % 3) throw new Error('Material sections require complete triangle ranges.');
		for (let offset = start; offset < end; offset++) indices.push(source.index ? source.index.getX(offset) : offset);
	}
	return compactGeometry(source, indices).geometry;
}

/** Split triangle islands into compact tile meshes. UVs stay in the authored
 * coordinate system; subtracting the inverse-transformed tile origin lets the
 * original texture transform sample each standalone image.
 * Triangles crossing tile boundaries need clipping and cannot use this path.
 */
export function partitionUdimGeometry(source, {matrix = new Matrix3(), channel = 0, targetChannel = channel, ranges} = {}) {
	const uv = source.attributes[uvName(channel)];
	if (!uv || !uvName(targetChannel)) throw new Error('UDIM export requires an available UV channel.');
	if (Math.abs(matrix.determinant()) < 1e-12) throw new Error('UDIM export requires an invertible UV transform.');
	const e = matrix.elements, inverse = matrix.clone().invert().elements;
	const vertexCount = source.index?.count ?? source.attributes.position.count;
	const drawStart = source.drawRange.start, drawEnd = Math.min(vertexCount, drawStart + source.drawRange.count);
	const tiles = new Map(), epsilon = 1e-5;
	for (const range of ranges || [{start: 0, count: vertexCount}]) {
		const start = Math.max(range.start, drawStart), end = Math.min(range.start + range.count, drawEnd);
		if (end <= start) continue;
		if (start % 3 || (end - start) % 3) throw new Error('UDIM export requires complete triangle ranges.');
		for (let offset = start; offset < end; offset += 3) {
			const indices = [0, 1, 2].map(i => source.index ? source.index.getX(offset + i) : offset + i);
			const points = indices.map(index => {
				const x = uv.getX(index), y = uv.getY(index);
				return [e[0] * x + e[3] * y + e[6], e[1] * x + e[4] * y + e[7]];
			});
			if (points.some(point => !point.every(Number.isFinite))) throw new Error('UDIM export requires finite UVs.');
			const u = Math.floor((points[0][0] + points[1][0] + points[2][0]) / 3);
			const v = Math.floor((points[0][1] + points[1][1] + points[2][1]) / 3);
			if (points.some(([x, y]) => x < u - epsilon || x > u + 1 + epsilon || y < v - epsilon || y > v + 1 + epsilon)) {
				throw new Error('Oversized UDIM export requires triangle islands contained within individual tiles.');
			}
			const key = `${u},${v}`;
			if (!tiles.has(key)) tiles.set(key, {u, v, indices: []});
			tiles.get(key).indices.push(...indices);
		}
	}
	return [...tiles.values()].map(({u, v, indices}) => {
		const {geometry, vertices} = compactGeometry(source, indices);
		const coordinates = new Float32Array(vertices.length * 2);
		const dx = inverse[0] * u + inverse[3] * v, dy = inverse[1] * u + inverse[4] * v;
		for (let row = 0; row < vertices.length; row++) {
			coordinates[row * 2] = uv.getX(vertices[row]) - dx;
			coordinates[row * 2 + 1] = uv.getY(vertices[row]) - dy;
		}
		geometry.setAttribute(uvName(targetChannel), new BufferAttribute(coordinates, 2));
		return {tile: 1001 + u + 10 * v, u, v, geometry};
	});
}
