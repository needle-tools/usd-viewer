import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, ShaderMaterial } from 'three';
import { ThreeRenderDelegateInterface } from '../../src/hydra/ThreeJsRenderDelegate.js';

function setup() {
    const delegate = new ThreeRenderDelegateInterface({ usdRoot: new Group() });
    const mesh = delegate.createRPrim('mesh', '/Panel');
    mesh.updatePoints([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    mesh.updateIndices([0, 1, 2]);
    const material = new ShaderMaterial();
    material.isMaterialXMaterial = true;
    material._needsTangents = true;
    mesh._mesh.material = material;
    return { delegate, mesh, material };
}

function assertBasis(geometry) {
    const normal = geometry.getAttribute('normal'), tangent = geometry.getAttribute('tangent');
    assert.equal(tangent.count, normal.count);
    assert.equal(tangent.itemSize, 4);
    for (let i = 0; i < normal.count; i++) {
        const x = tangent.getX(i), y = tangent.getY(i), z = tangent.getZ(i);
        assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-6);
        assert.ok(Math.abs(x * normal.getX(i) + y * normal.getY(i) + z * normal.getZ(i)) < 1e-6);
        assert.equal(tangent.getW(i), 1);
    }
}

test('MaterialX without UVs gets a finite basis that follows changed normals and topology', async () => {
    const { delegate, mesh, material } = setup();
    try {
        mesh.setNormals([1, 0, 0, 0, 1, 0, 0, 0, 1], 'vertex');
        await delegate.waitForMaterialsReady();
        assertBasis(mesh._geometry);
        assert.equal(mesh._geometry.getAttribute('uv'), undefined);
        assert.equal(mesh._geometry.userData.usdHydraGeneratedTangents, true);
        mesh.setNormals([0, 0, 2, 0, -3, 0, -4, 0, 0], 'vertex');
        mesh.updateIndices([2, 0, 1, 1, 0, 2]);
        await delegate.waitForMaterialsReady();
        assertBasis(mesh._geometry);
        assert.equal(mesh._geometry.getAttribute('tangent').count, 6);
    } finally { material.dispose(); delegate.dispose(); }
});

test('MaterialX retains authored tangents and replaces the fallback with MikkTSpace when UVs arrive', async () => {
    const { delegate, mesh, material } = setup();
    try {
        mesh.setNormals([0, 0, 1], 'constant');
        await delegate.waitForMaterialsReady();
        mesh.setUV([0, 0, 0, 1, 1, 0], 2, 'vertex');
        await delegate.waitForMaterialsReady();
        const tangent = mesh._geometry.getAttribute('tangent');
        assert.ok(Math.abs(tangent.getY(0) - 1) < 1e-6, 'UV parameterization replaces the arbitrary fallback direction');
        assert.ok(Math.abs(tangent.getX(0)) < 1e-6);
        mesh.setTangents([0, -1, 0], 3, 'constant');
        const authored = mesh._geometry.getAttribute('tangent');
        delegate.prepareMeshMaterialGeometry(mesh._mesh);
        await delegate.waitForMaterialsReady();
        assert.equal(mesh._geometry.getAttribute('tangent'), authored);
        assert.equal(mesh._geometry.userData.usdHydraGeneratedTangents, undefined);
        assert.deepEqual([...authored.array], [0, -1, 0, 0, -1, 0, 0, -1, 0]);
    } finally { material.dispose(); delegate.dispose(); }
});
