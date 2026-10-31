import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Matrix4 } from 'three';
import { getUsdModule } from '../runtime.mjs';
import { createThreeHydra } from '../../src/create.three.js';

test('the first ready frame samples the authored stage start time', async () => {
    const USD = await getUsdModule({ print() {}, printErr() {} });
    const root = new Group();
    const source = `#usda 1.0
(startTimeCode = 1; endTimeCode = 2)
def Points "Particles" {
 point3f[] points.timeSamples = {1: [(1, 0, 0)], 2: [(9, 0, 0)]}
 float[] widths.timeSamples = {1: [0.25], 2: [1]}
}`;
    const handle = await createThreeHydra({ USD, scene: root, url: 'initial-time.usda', buffer: new TextEncoder().encode(source) });
    try {
        await handle.ready();
        let mesh; root.traverse(object => { if (object.isInstancedMesh) mesh = object; });
        assert.ok(mesh);
        const matrix = new Matrix4(); mesh.getMatrixAt(0, matrix);
        assert.equal(matrix.elements[12], 1);
        assert.equal(matrix.elements[0], .25);
    } finally { await handle.dispose(); }
});
