import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Matrix4 } from 'three';
import { ThreeRenderDelegateInterface } from '../../src/hydra/ThreeJsRenderDelegate.js';
import { buildStrokeCurveGeometry, sampleStrokeCurves } from '../../src/hydra/strokeGeometry.js';

const primvar = (values, interpolation = 'constant') => ({ values, interpolation });
const bezier = { type: 'cubic', basis: 'bezier', wrap: 'nonperiodic', counts: [4],
    points: [[0, 0, 0], [0, 2, 0], [2, 2, 0], [2, 0, 0]],
    primvars: { widths: primvar([0.2]), displayColor: primvar([[1, 0, 0]]) } };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('Bezier tessellation follows its cubic shape and world-space diameter, not the control cage', () => {
    const samples = sampleStrokeCurves(bezier)[0].samples;
    assert.deepEqual(samples[0].position.toArray(), [0, 0, 0]);
    assert.deepEqual(samples.at(-1).position.toArray(), [2, 0, 0]);
    assert.deepEqual(samples[8].position.toArray(), [1, 1.5, 0]);
    const geometry = buildStrokeCurveGeometry(bezier);
    const p = geometry.attributes.position;
    for (let ring = 0; ring < samples.length; ring++) {
        const center = samples[ring].position;
        near(Math.hypot(p.getX(ring * 9) - center.x, p.getY(ring * 9) - center.y, p.getZ(ring * 9) - center.z), 0.1);
    }
    assert.equal(geometry.attributes.color.getX(0), 1);
    geometry.dispose();
});

test('periodic B-splines close smoothly and interpolate varying widths separately from vertex values', () => {
    const data = { ...bezier, basis: 'bspline', wrap: 'periodic', points: [[-1, 0, 0], [0, 1, 0], [1, 0, 0], [0, -1, 0]],
        primvars: { widths: primvar([0.1, 0.2, 0.3, 0.4], 'varying') } };
    const { samples, closed } = sampleStrokeCurves(data)[0];
    assert.equal(closed, true);
    near(samples[0].position.distanceTo(samples.at(-1).position), 0);
    near(samples[0].width, 0.1); near(samples[8].width, 0.15); near(samples[16].width, 0.2);
    near(samples.at(-1).width, 0.1);
});

test('rational NURBS uses knots and weights and honors trimmed parameter ranges', () => {
    const data = { type: 'nurbs', counts: [3], order: [3], knots: [0, 0, 0, 1, 1, 1],
        ranges: [[0, 1]], points: [[1, 0, 0], [1, 1, 0], [0, 1, 0]], weights: [1, Math.SQRT1_2, 1] };
    const samples = sampleStrokeCurves(data)[0].samples;
    near(samples[8].position.x, Math.SQRT1_2); near(samples[8].position.y, Math.SQRT1_2);
    data.ranges = [[0.5, 1]];
    near(sampleStrokeCurves(data)[0].samples[0].position.x, Math.SQRT1_2);
    assert.throws(() => sampleStrokeCurves({ ...data, knots: [0, 1] }), /invalid order or knots/);
});

test('point primitives preserve per-point widths, indexed colors, transforms and time updates', () => {
    const root = new Group(), delegate = new ThreeRenderDelegateInterface({ usdRoot: root });
    const stroke = delegate.createRPrim('points', '/Points');
    const data = { points: [[0, 0, 0], [1, 0, 0]], primvars: {
        widths: primvar([0.2, 0.5], 'vertex'),
        displayColor: { ...primvar([[1, 0, 0], [0, 0, 1]], 'vertex'), indices: [1, 0] },
        displayOpacity: primvar([1, 0.5], 'vertex'),
    } };
    stroke.setStrokeData(data); stroke.setVisibilityState(true);
    assert.equal(stroke._mesh.visible, true); assert.equal(stroke._mesh.count, 2);
    const matrix = new Matrix4(); stroke._mesh.getMatrixAt(1, matrix);
    near(matrix.elements[0], 0.5); near(matrix.elements[12], 1);
    assert.deepEqual([...stroke._mesh.instanceColor.array], [0, 0, 1, 1, 0, 0]);
    assert.deepEqual([...stroke._geometry.attributes.strokeOpacity.array], [1, 0.5]);
    assert.equal(stroke._mesh.material.transparent, true);
    assert.ok(stroke._mesh.material.customProgramCacheKey());
    data.points[1] = [2, 1, 0]; data.primvars.widths.values[1] = 0.75;
    stroke.setStrokeData(data); stroke._mesh.getMatrixAt(1, matrix);
    near(matrix.elements[0], 0.75); near(matrix.elements[12], 2); near(matrix.elements[13], 1);
    stroke.setTransform(new Matrix4().makeTranslation(3, 4, 5).toArray());
    stroke._mesh.getMatrixAt(1, matrix);
    near(matrix.elements[12], 5); near(matrix.elements[13], 5); near(matrix.elements[14], 5);
    stroke.setInstanceTransforms(new Matrix4().makeTranslation(6, 7, 8).toArray(), 1, true);
    stroke._mesh.getMatrixAt(1, matrix);
    near(matrix.elements[12], 8); near(matrix.elements[13], 8); near(matrix.elements[14], 8);
    stroke.setInstanceTransforms([], 0, true); assert.equal(stroke._mesh.visible, false);
    delegate.dispose(); assert.equal(root.children.length, 0);
});

test('malformed curve data hides the primitive without escaping the native callback and can recover', () => {
    const delegate = new ThreeRenderDelegateInterface({ usdRoot: new Group() });
    const stroke = delegate.createRPrim('basisCurves', '/Curve');
    stroke.setStrokeData(bezier); stroke.setVisibilityState(true);
    assert.equal(stroke._mesh.visible, true);
    const originalWarn = console.warn;
    console.warn = () => {};
    try { assert.doesNotThrow(() => stroke.setStrokeData({ ...bezier, points: [[0, NaN, 0]] })); }
    finally { console.warn = originalWarn; }
    assert.match(stroke._mesh.userData.usdStrokeError, /finite triples/);
    assert.equal(stroke._mesh.visible, false);
    stroke.setStrokeData(bezier);
    assert.equal(stroke._mesh.visible, true);
    assert.equal(stroke._mesh.userData.usdStrokeError, undefined);
    delegate.dispose();
});

test('node strokes combine authored opacity with widths without stacking opacity on refresh', async () => {
    const { createWebGpuSupport } = await import('../../src/renderers/webGpuSupport.js');
    const support = await createWebGpuSupport();
    const root = new Group(), delegate = new ThreeRenderDelegateInterface({ usdRoot: root, webGpuSupport: support });
    const stroke = delegate.createRPrim('points', '/Points');
    stroke.setStrokeData({ points: [[0,0,0], [1,0,0]], primvars: { widths: primvar([0.4]), displayOpacity: primvar([0,0.5], 'vertex') } });
    assert.ok(stroke._mesh.material.opacityNode.isNode);
    assert.equal(stroke._mesh.material.transparent, true);
    assert.deepEqual([...stroke._geometry.attributes.strokeOpacity.array], [0,0.5]);
    const base = stroke._mesh.material.opacityNode.aNode;
    support.configureStrokeMaterial(stroke._mesh.material);
    assert.equal(stroke._mesh.material.opacityNode.aNode, base);
    delegate.dispose();
});
