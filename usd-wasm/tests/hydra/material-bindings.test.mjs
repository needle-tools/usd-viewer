import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group } from 'three';
import { ThreeRenderDelegateInterface } from '../../src/hydra/ThreeJsRenderDelegate.js';

function setup() {
    const delegate = new ThreeRenderDelegateInterface({ usdRoot: new Group() });
    const mesh = delegate.createRPrim('mesh', '/Panel');
    mesh.updatePoints([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
    mesh.updateIndices([0, 1, 2, 0, 2, 3]);
    mesh.setVisibilityState(true);
    return { delegate, mesh };
}

async function preview(delegate, id, color) {
    const material = delegate.createSPrim('material', id);
    material.beginMaterialSync();
    material.updateNode('surface', `${id}/Preview`, { identifier: 'UsdPreviewSurface', diffuseColor: color });
    material.updateFinished('surface', []);
    await delegate.waitForMaterialsReady();
    return material;
}

test('unsupported material bindings show geometry after draw and can resolve on a later draw', async () => {
    const { delegate, mesh } = setup();
    delegate.beginHydraDraw();
    mesh.setMaterial('/MDL');
    assert.equal(mesh._mesh.visible, false, 'wait until all sprims in this draw have arrived');
    delegate.endHydraDraw();
    assert.equal(mesh._mesh.visible, true, 'unsupported shading must not hide geometry forever');
    assert.equal(delegate.getDiagnostics().materialFallbacks, 1);
    const material = await preview(delegate, '/MDL', [0, 1, 0]);
    assert.equal(mesh._mesh.visible, true);
    assert.equal(mesh._mesh.material, material._material);
    delegate.dispose();
});

test('a supported material keeps its readiness barrier across the end of a draw', async () => {
    const { delegate, mesh } = setup();
    delegate.beginHydraDraw();
    mesh.setMaterial('/Supported');
    const material = delegate.createSPrim('material', '/Supported');
    delegate.endHydraDraw();
    assert.equal(mesh._mesh.visible, false);
    material.updateNode('surface', '/Supported/Preview', { identifier: 'UsdPreviewSurface', diffuseColor: [1, 0, 0] });
    material.updateFinished('surface', []);
    await delegate.waitForMaterialsReady();
    assert.equal(mesh._mesh.visible, true);
    assert.equal(delegate.getDiagnostics().materialFallbacks, 0);
    delegate.dispose();
});

test('subset sections keep their slots, object identity, and late material assignments', async () => {
    const { delegate, mesh } = setup();
    const object = mesh._mesh;
    delegate.beginHydraDraw();
    mesh.setGeomSubsetMaterial([
        { start: 0, length: 3, materialId: '/Late' },
        { start: 3, length: 3, materialId: '/Unsupported' },
    ]);
    const material = await preview(delegate, '/Late', [0, 0, 1]);
    delegate.endHydraDraw();
    assert.equal(mesh._mesh, object, 'material assignment must preserve mesh identity and instancing hooks');
    assert.deepEqual(mesh._geometry.groups, [
        { start: 0, count: 3, materialIndex: 1 },
        { start: 3, count: 3, materialIndex: 2 },
    ]);
    assert.equal(object.material[1], material._material);
    assert.equal(object.material[2], mesh._ownedMaterial);
    assert.equal(object.visible, true);
    delegate.dispose();
});

test('one late material can occupy multiple slots without replacing the material array', async () => {
    const { delegate, mesh } = setup();
    delegate.beginHydraDraw();
    mesh.setGeomSubsetMaterial([
        { start: 0, length: 3, materialId: '/Shared' },
        { start: 3, length: 3, materialId: '/Shared' },
    ]);
    const material = await preview(delegate, '/Shared', [1, 0, 0]);
    delegate.endHydraDraw();
    assert.equal(mesh._mesh.material[1], material._material);
    assert.equal(mesh._mesh.material[2], material._material);
    assert.equal(mesh._mesh.visible, true);
    delegate.dispose();
});

test('unsupported shading preserves face-varying display colors without tinting authored surfaces', async () => {
    const { delegate, mesh } = setup();
    const colors = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    mesh.setDisplayColor(colors, 'facevarying');
    assert.deepEqual([...mesh._geometry.attributes.color.array], colors);
    assert.equal(mesh._mesh.material.vertexColors, true);
    assert.deepEqual(mesh._mesh.material.color.toArray(), [1, 1, 1]);
    const material = await preview(delegate, '/Authored', [0, 0, 1]);
    mesh.setMaterial('/Authored');
    mesh.setDisplayColor(colors, 'facevarying');
    assert.equal(material._material.vertexColors, false);
    assert.deepEqual(material._material.color.toArray(), [0, 0, 1]);
    delegate.dispose();
});

test('displayColor arriving after material assignment only changes fallback for every interpolation', async () => {
    const { delegate, mesh } = setup();
    const authored = await preview(delegate, '/Authored', [0, 0, 1]);
    mesh.setMaterial('/Authored');
    for (const [interpolation, colors] of [
        ['constant', [1, 0, 0]],
        ['vertex', [1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1]],
        ['varying', [1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1]],
        ['facevarying', [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]],
    ]) {
        mesh.setDisplayColor(colors, interpolation);
        assert.deepEqual(authored._material.color.toArray(), [0, 0, 1], interpolation);
        assert.equal(authored._material.vertexColors, false, interpolation);
        assert.equal(mesh._ownedMaterial.vertexColors, interpolation !== 'constant');
    }
    mesh.setDisplayColor([0.5, 0.25, 0], 'constant');
    assert.deepEqual(mesh._ownedMaterial.color.toArray(), [0.5, 0.25, 0]);
    assert.equal(mesh._ownedMaterial.vertexColors, false);
    delegate.dispose();
});
