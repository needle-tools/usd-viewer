import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGaussianParticleField } from '../../src/renderers/gaussian.js';

for (const degree of [0, 1, 2, 3]) test(`WebGPU Gaussian degree ${degree} retains HDR and signed coefficients, anisotropy and owned resources`, () => {
    const coefficients = new Float32Array((degree + 1) ** 2 * 3 * 2);
    coefficients.fill(-4.5); coefficients[0] = 8;
    const data = { degree, coefficients, positions: new Float32Array([1,2,3,4,5,6]), scales: new Float32Array([1,2,3,2,3,4]), orientations: new Float32Array([0,0,0,1,0,0,0,1]), opacities: new Float32Array([0.25,0.75]) };
    const mesh = createGaussianParticleField(data);
    assert.equal(mesh.splatGeometry.userData.usdSphericalHarmonics.coefficients, coefficients);
    assert.equal(mesh._buffers.sphericalHarmonicsDegree, degree);
    const colors = mesh.splatGeometry.getAttribute('color').array;
    assert.ok(colors[0] > 1); assert.ok(colors[1] < 0);
    assert.equal(colors[3], 0.25); assert.equal(colors[7], 0.75);
    for (let band = 1; band <= degree; band++) {
        assert.equal(mesh._buffers[`sphericalHarmonics${band}Words`], -(band * 2 + 1));
        assert.ok(mesh._buffers[`sphericalHarmonics${band}Attribute`].array.includes(-4.5));
    }
    mesh.computeBoundingBox();
    assert.ok(mesh.boundingBox.min.x < 1); assert.ok(mesh.boundingBox.max.z > 6);
    let disposals = 0; for (const resource of [mesh.geometry, mesh.material, mesh.splatGeometry]) resource.addEventListener('dispose', () => disposals++);
    const released = new Set(); mesh._resourceRenderer = { _attributes: { delete(attribute) { released.add(attribute); } } };
    mesh.dispose(); mesh.dispose();
    assert.equal(disposals, 3); assert.ok(released.size >= 6);
});
