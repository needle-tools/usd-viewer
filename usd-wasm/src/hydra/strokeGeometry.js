import { BufferGeometry, Curve, Float32BufferAttribute, TubeGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { calcBasisFunctions, findSpan } from 'three/addons/curves/NURBSUtils.js';

const flat = values => Array.from(values || []).flat();
function pointCoordinates(data) {
    const points = flat(data.points);
    if (points.length % 3 || points.some(value => !Number.isFinite(value))) {
        throw new Error('USD point coordinates must contain finite triples');
    }
    return points;
}
const defaultColor = [0.7, 0.7, 0.7];

export function strokePrimvar(data, name, size, sample, fallback) {
    const entry = data.primvars?.[name];
    if (!entry) return fallback.slice();
    const values = flat(entry.values);
    const indices = entry.indices || [];
    const read = index => {
        const offset = (indices.length ? indices[index] : index) * size;
        return Array.from({ length: size }, (_, component) => values[offset + component] ?? fallback[component]);
    };
    if (entry.interpolation === 'constant') return read(0);
    if (entry.interpolation === 'uniform') return read(sample.curve || 0);
    const weights = entry.interpolation === 'varying' ? sample.varying : sample.weights;
    const result = new Array(size).fill(0);
    for (const [index, weight] of weights || []) {
        read(index).forEach((value, component) => result[component] += value * weight);
    }
    return result;
}

function cubicWeights(basis, t) {
    const u = 1 - t, t2 = t * t, t3 = t2 * t;
    switch (basis) {
        case 'bezier': return [u * u * u, 3 * t * u * u, 3 * t2 * u, t3];
        case 'bspline': return [u * u * u / 6, (3 * t3 - 6 * t2 + 4) / 6, (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, t3 / 6];
        case 'catmullRom': return [-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1, -1.5 * t3 + 2 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2];
        default: throw new Error(`Unsupported USD curve basis '${basis}'`);
    }
}

export function sampleStrokeCurves(data, subdivisions = 16) {
    const points = pointCoordinates(data);
    const curves = [];
    let offset = 0, varyingOffset = 0, knotOffset = 0;
    const invisible = new Set(data.invisibleCurves || []);
    for (let curve = 0; curve < (data.counts?.length || 0); curve++) {
        const count = data.counts[curve];
        const pointIndex = index => data.indices?.length ? data.indices[offset + index] : offset + index;
        const closed = data.wrap === 'periodic';
        const samples = [];
        const add = (weights, varying) => {
            const position = new Vector3();
            for (const [index, weight] of weights) {
                if (index < 0 || index * 3 + 2 >= points.length) throw new Error('USD curve index exceeds its point array');
                position.x += points[index * 3] * weight;
                position.y += points[index * 3 + 1] * weight;
                position.z += points[index * 3 + 2] * weight;
            }
            const sample = { curve, position, weights, varying };
            sample.width = Math.max(0, strokePrimvar(data, 'widths', 1, sample, [1])[0]);
            sample.color = strokePrimvar(data, 'displayColor', 3, sample, defaultColor);
            sample.opacity = strokePrimvar(data, 'displayOpacity', 1, sample, [1])[0];
            samples.push(sample);
        };
        if (data.type === 'nurbs') {
            const order = data.order?.[curve], degree = order - 1;
            const knots = (data.knots || []).slice(knotOffset, knotOffset + count + order);
            knotOffset += count + order;
            if (!(order >= 2 && count >= order && knots.length === count + order) || knots.some((v, i) => i && v < knots[i - 1])) {
                throw new Error('USD NURBS curve has invalid order or knots');
            }
            const range = data.ranges?.[curve] || [knots[degree], knots[count]];
            const min = Math.max(range[0], knots[degree]), max = Math.min(range[1], knots[count]);
            if (!(max > min)) throw new Error('USD NURBS curve has an empty parameter range');
            const spans = [...new Set([min, ...knots.filter(k => k > min && k < max), max])];
            for (let spanIndex = 0; spanIndex < spans.length - 1; spanIndex++) {
                for (let step = spanIndex ? 1 : 0; step <= subdivisions; step++) {
                    const u = spans[spanIndex] + (spans[spanIndex + 1] - spans[spanIndex]) * step / subdivisions;
                    const span = findSpan(degree, u, knots);
                    const basis = calcBasisFunctions(span, u, degree, knots);
                    const weights = basis.map((weight, j) => {
                        const index = pointIndex(span - degree + j);
                        return [index, weight * (data.weights?.[index] ?? 1)];
                    });
                    const sum = weights.reduce((total, [, weight]) => total + weight, 0);
                    if (!Number.isFinite(sum) || Math.abs(sum) < 1e-12) throw new Error('USD NURBS curve has invalid rational weights');
                    weights.forEach(pair => pair[1] /= sum);
                    const t = (u - min) / (max - min);
                    add(weights, [[varyingOffset, 1 - t], [varyingOffset + 1, t]]);
                }
            }
            varyingOffset += 2;
        } else {
            const cubic = data.type === 'cubic';
            const stride = cubic && data.basis === 'bezier' ? 3 : data.wrap === 'segmented' ? 2 : 1;
            const segmentCount = cubic ? (closed ? count / stride : (count - 4) / stride + 1)
                : data.wrap === 'segmented' ? count / 2 : closed ? count : count - 1;
            if (!Number.isInteger(segmentCount) || segmentCount < 1) throw new Error('USD curve vertex count does not match its basis');
            for (let segment = 0; segment < segmentCount; segment++) {
                const steps = cubic ? subdivisions : 1;
                for (let step = segment && data.wrap !== 'segmented' ? 1 : 0; step <= steps; step++) {
                    const t = step / steps;
                    const basis = cubic ? cubicWeights(data.basis, t) : [1 - t, t];
                    const weights = basis.map((weight, j) => [pointIndex((segment * stride + j) % count), weight]);
                    const varying = [[varyingOffset + segment, 1 - t], [varyingOffset + ((segment + 1) % (closed ? segmentCount : segmentCount + 1)), t]];
                    add(weights, varying);
                }
                if (data.wrap === 'segmented') {
                    if (!invisible.has(curve)) curves.push({ samples: samples.splice(0), closed: false });
                }
            }
            varyingOffset += closed ? segmentCount : segmentCount + 1;
        }
        if (!invisible.has(curve) && samples.length) curves.push({ samples, closed });
        offset += count;
    }
    return curves;
}

class SampledCurve extends Curve {
    constructor(samples) { super(); this.samples = samples; }
    getPoint(t, target = new Vector3()) {
        const scaled = Math.min(1, Math.max(0, t)) * (this.samples.length - 1);
        const index = Math.min(Math.floor(scaled), this.samples.length - 2);
        return target.copy(this.samples[index].position).lerp(this.samples[index + 1].position, scaled - index);
    }
    getPointAt(t, target) { return this.getPoint(t, target); }
    getTangentAt(t, target) { return this.getTangent(t, target); }
}

export function buildStrokeCurveGeometry(data) {
    const curves = sampleStrokeCurves(data, Math.max(4, Math.min(128, data.subdivisions || 16)));
    const geometries = [];
    for (const { samples, closed } of curves) {
        const geometry = new TubeGeometry(new SampledCurve(samples), samples.length - 1, 1, 8, closed);
        const positions = geometry.attributes.position, normals = geometry.attributes.normal;
        const colors = new Float32Array(positions.count * 3), opacity = new Float32Array(positions.count);
        for (let i = 0; i < positions.count; i++) {
            const sample = samples[Math.floor(i / 9)];
            positions.setXYZ(i, sample.position.x + normals.getX(i) * sample.width / 2,
                sample.position.y + normals.getY(i) * sample.width / 2,
                sample.position.z + normals.getZ(i) * sample.width / 2);
            colors.set(sample.color, i * 3);
            opacity[i] = sample.opacity;
        }
        geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
        geometry.setAttribute('primvars:displayColor', geometry.attributes.color);
        geometry.setAttribute('strokeOpacity', new Float32BufferAttribute(opacity, 1));
        geometries.push(geometry);
    }
    if (!geometries.length) return new BufferGeometry();
    const result = mergeGeometries(geometries, false);
    geometries.forEach(geometry => geometry.dispose());
    result.computeBoundingBox(); result.computeBoundingSphere();
    result.userData.usdCurveSamples = curves.map(curve => curve.samples.map(sample => sample.position.toArray()));
    return result;
}

export function pointStrokeSamples(data) {
    const points = pointCoordinates(data);
    return Array.from({ length: points.length / 3 }, (_, index) => {
        const sample = { curve: 0, weights: [[index, 1]], varying: [[index, 1]] };
        return { position: points.slice(index * 3, index * 3 + 3),
            width: Math.max(0, strokePrimvar(data, 'widths', 1, sample, [1])[0]),
            color: strokePrimvar(data, 'displayColor', 3, sample, defaultColor),
            opacity: strokePrimvar(data, 'displayOpacity', 1, sample, [1])[0] };
    });
}
