import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { calcBasisFunctionDerivatives, findSpan } from 'three/addons/curves/NURBSUtils.js';
import { strokePrimvar } from './strokeGeometry.js';

function axis(data, prefix) {
    const count = data[`${prefix}Count`], degree = data[`${prefix}Order`] - 1;
    const knots = data[`${prefix}Knots`] || [];
    if (!Number.isInteger(count) || degree < 1 || count <= degree || knots.length !== count + degree + 1 ||
        knots.some((value, i) => !Number.isFinite(value) || (i > 0 && value < knots[i - 1]))) {
        throw new Error(`Invalid NURBS ${prefix} order, count or knots`);
    }
    const range = data[`${prefix}Range`] || [knots[degree], knots[count]];
    const min = Math.max(range[0], knots[degree]), max = Math.min(range[1], knots[count]);
    if (!(max > min)) throw new Error(`Empty NURBS ${prefix} parameter range`);
    return { count, degree, knots, min, max, breaks: [...new Set([min, ...knots.filter(k => k > min && k < max), max])] };
}

/** USD/RenderMan control rows advance in U: index = v * uCount + u. */
export function prepareNurbsPatch(data) {
    const u = axis(data, 'u'), v = axis(data, 'v');
    const points = Array.from(data.points || []).flat();
    if (points.length !== u.count * v.count * 3 || points.some(value => !Number.isFinite(value))) {
        throw new Error('NURBS control points do not match its U/V dimensions');
    }
    const weights = Array.from(data.weights || []);
    if (weights.length && (weights.length !== u.count * v.count || weights.some(value => !Number.isFinite(value)))) {
        throw new Error('NURBS rational weights do not match its control points');
    }
    if (data.trimCounts?.length) throw new Error('Trimmed NURBS patches require trim-curve tessellation');
    return { u, v, points, weights };
}

/** Exact rational position and first partial derivatives, before tessellation. */
export function evaluateNurbsPatch(patch, u, v) {
    const us = findSpan(patch.u.degree, u, patch.u.knots), vs = findSpan(patch.v.degree, v, patch.v.knots);
    const ub = calcBasisFunctionDerivatives(us, u, patch.u.degree, 1, patch.u.knots);
    const vb = calcBasisFunctionDerivatives(vs, v, patch.v.degree, 1, patch.v.knots);
    const position = new Vector3(), du = new Vector3(), dv = new Vector3(), basis = [];
    let weight = 0, wu = 0, wv = 0;
    for (let j = 0; j <= patch.v.degree; j++) for (let i = 0; i <= patch.u.degree; i++) {
        const index = (vs - patch.v.degree + j) * patch.u.count + us - patch.u.degree + i;
        const w = patch.weights[index] ?? 1;
        const b = ub[0][i] * vb[0][j] * w, bu = ub[1][i] * vb[0][j] * w, bv = ub[0][i] * vb[1][j] * w;
        const point = new Vector3().fromArray(patch.points, index * 3);
        position.addScaledVector(point, b); du.addScaledVector(point, bu); dv.addScaledVector(point, bv);
        weight += b; wu += bu; wv += bv; basis.push([index, b]);
    }
    if (!Number.isFinite(weight) || Math.abs(weight) < 1e-12) throw new Error('NURBS has zero rational denominator');
    position.divideScalar(weight);
    du.addScaledVector(position, -wu).divideScalar(weight);
    dv.addScaledVector(position, -wv).divideScalar(weight);
    return { position, du, dv, weights: basis.map(([index, b]) => [index, b / weight]) };
}

function samples(axis, subdivisions) {
    const result = [];
    for (let span = 0; span < axis.breaks.length - 1; span++) {
        for (let step = span ? 1 : 0; step <= subdivisions; step++) {
            const t = step / subdivisions;
            result.push({ value: axis.breaks[span] * (1 - t) + axis.breaks[span + 1] * t, span, t });
        }
    }
    return result;
}

export function buildNurbsPatchGeometry(data) {
    const patch = prepareNurbsPatch(data), subdivisions = Math.max(4, Math.min(128, data.subdivisions || 16));
    const us = samples(patch.u, subdivisions), vs = samples(patch.v, subdivisions);
    const positions = [], normals = [], colors = [], opacity = [], uv = [], indices = [];
    const handedness = data.orientation === 'leftHanded' ? -1 : 1;
    for (const v of vs) for (const u of us) {
        const sample = evaluateNurbsPatch(patch, u.value, v.value);
        let normal = new Vector3().crossVectors(sample.du, sample.dv);
        if (normal.lengthSq() < 1e-20) {
            const inward = (axis, value) => Math.min(axis.max - (axis.max - axis.min) * 1e-6, Math.max(axis.min + (axis.max - axis.min) * 1e-6, value));
            const nearby = evaluateNurbsPatch(patch, inward(patch.u, u.value), inward(patch.v, v.value));
            normal.crossVectors(nearby.du, nearby.dv);
        }
        normal.normalize().multiplyScalar(handedness);
        const stride = patch.u.breaks.length;
        sample.varying = [[v.span * stride + u.span, (1 - u.t) * (1 - v.t)],
            [v.span * stride + u.span + 1, u.t * (1 - v.t)],
            [(v.span + 1) * stride + u.span, (1 - u.t) * v.t], [(v.span + 1) * stride + u.span + 1, u.t * v.t]];
        positions.push(...sample.position.toArray()); normals.push(...normal.toArray());
        colors.push(...strokePrimvar(data, 'displayColor', 3, sample, [0.7, 0.7, 0.7]));
        opacity.push(strokePrimvar(data, 'displayOpacity', 1, sample, [1])[0]);
        uv.push(...strokePrimvar(data, 'st', 2, sample, [(u.value - patch.u.min) / (patch.u.max - patch.u.min), (v.value - patch.v.min) / (patch.v.max - patch.v.min)]));
    }
    for (let v = 0; v < vs.length - 1; v++) for (let u = 0; u < us.length - 1; u++) {
        const a = v * us.length + u, b = a + 1, c = b + us.length, d = a + us.length;
        indices.push(...(handedness > 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c]));
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.setAttribute('primvars:displayColor', geometry.attributes.color);
    geometry.setAttribute('strokeOpacity', new Float32BufferAttribute(opacity, 1));
    geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2)); geometry.setIndex(indices);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.userData.usdNurbsSamples = { u: us.map(sample => sample.value), v: vs.map(sample => sample.value) };
    return geometry;
}
