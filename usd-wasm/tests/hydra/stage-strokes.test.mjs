import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Group, Matrix4 } from 'three';
import { getUsdModule } from '../../src/bindings/index.js';
import { createThreeHydra } from '../../src/create.three.js';

async function inspect(source, callback) {
    const USD = await getUsdModule({ print() {}, printErr() {} });
    const root = new Group();
    const handle = await createThreeHydra({ USD, scene: root, url: 'stroke-regression.usda', buffer: new TextEncoder().encode(source) });
    try { await handle.ready(); await handle.materialsReady(); await callback(root, handle); }
    finally { await handle.dispose(); }
}
const find = root => { let mesh; root.traverse(object => { if (object.userData.usdPrimitiveType) mesh = object; }); return mesh; };

test('real Hydra Points preserve widths and animate point and width samples', async () => {
    await inspect(`#usda 1.0
(
startTimeCode = 1
endTimeCode = 2
)
def Points "Points" {
    point3f[] points.timeSamples = { 1: [(0, 0, 0), (1, 0, 0)], 2: [(0, 0, 0), (2, 1, 0)] }
    float[] widths.timeSamples = { 1: [0.25, 0.5], 2: [0.5, 1] }
    color3f[] primvars:displayColor = [(1, 0, 0), (0, 0, 1)] (interpolation = "vertex")
}`, async (root, handle) => {
        await handle.setTime(1);
        const mesh = find(root), matrix = new Matrix4();
        assert.ok(mesh?.visible); assert.equal(mesh.count, 2);
        mesh.getMatrixAt(1, matrix);
        assert.equal(matrix.elements[0], 0.5); assert.equal(matrix.elements[12], 1);
        assert.deepEqual([...mesh.instanceColor.array], [1, 0, 0, 0, 0, 1]);
        await handle.setTime(2); mesh.getMatrixAt(1, matrix);
        assert.equal(matrix.elements[0], 1); assert.equal(matrix.elements[12], 2); assert.equal(matrix.elements[13], 1);
        await handle.setTime(1); mesh.getMatrixAt(1, matrix);
        assert.equal(matrix.elements[0], 0.5); assert.equal(matrix.elements[12], 1);
    });
});

for (const [fixture, name, assertion] of [
    ['core/bezier-curves.usda', 'Bezier', samples => {
        assert.equal(samples.length, 2);
        assert.ok(Math.abs(samples[0][8][1] - 1.5) < 1e-6);
    }],
    ['advanced/periodic-bspline.usda', 'periodic B-spline', samples => {
        assert.deepEqual(samples[0][0], samples[0].at(-1));
        assert.ok(Math.abs(Math.hypot(...samples[0][0]) - 1.5) > 0.05, 'B-spline does not trace the control polygon');
    }],
    ['advanced/nurbs-curve.usda', 'NURBS', samples => {
        assert.equal(samples[0].length, 17);
        assert.ok(Math.abs(samples[0][4][1] - 0.5625) < 1e-6, 'NURBS evaluates its cubic basis instead of the control cage');
    }],
]) {
    test(`real Hydra supplies ${name} topology and creates visible curved geometry`, async () => {
        const source = await readFile(new URL(`../fixtures/coverage/${fixture}`, import.meta.url), 'utf8');
        await inspect(source, root => {
            const mesh = find(root);
            assert.ok(mesh?.visible); assert.ok(mesh.geometry.attributes.position.count > 100);
            assertion(mesh.geometry.userData.usdCurveSamples);
        });
    });
}

test('real point transforms retain USD translation and scale conventions', async () => {
    await inspect(`#usda 1.0
(upAxis = "Y")
def Points "Points" {
    point3f[] points = [(1, 0, 0)]
    float[] widths = [0.5]
    double3 xformOp:translate = (2, 3, 4)
    float3 xformOp:scale = (2, 2, 2)
    uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]
}`, root => {
        const mesh = find(root), matrix = new Matrix4();
        mesh.getMatrixAt(0, matrix);
        assert.deepEqual(matrix.elements.slice(12, 15), [4, 3, 4]);
        assert.equal(matrix.elements[0], 1);
    });
});
