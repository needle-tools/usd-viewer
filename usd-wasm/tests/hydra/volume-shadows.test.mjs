import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Matrix4, MeshBasicMaterial } from 'three';
import { ThreeRenderDelegateInterface } from '../../src/hydra/ThreeJsRenderDelegate.js';

test('bounded proxies skip opaque shadows and restore surface casting after material changes, including instances', () => {
    const delegate = new ThreeRenderDelegateInterface({ usdRoot: new Group() });
    const mesh = delegate.createRPrim('mesh', '/Medium');
    mesh.updatePoints([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    mesh.updateIndices([0, 1, 2]);
    const surface = mesh._mesh.material;
    const volume = new MeshBasicMaterial(); volume.isBoundedVolumeNodeMaterial = true;
    try {
        mesh._mesh.material = volume;
        delegate.prepareMeshMaterialGeometry(mesh._mesh);
        assert.equal(mesh._mesh.castShadow, false);
        assert.equal(mesh._mesh.receiveShadow, true, 'opaque scene occlusion still reaches the medium');
        mesh.setInstanceTransforms(new Matrix4().elements, 1);
        assert.equal(mesh._instancedMesh.castShadow, false);
        mesh._mesh.material = surface;
        delegate.prepareMeshMaterialGeometry(mesh._mesh); mesh.commit();
        assert.equal(mesh._mesh.castShadow, true);
        assert.equal(mesh._instancedMesh.castShadow, true);
        mesh._mesh.material = [volume, surface];
        delegate.prepareMeshMaterialGeometry(mesh._mesh);
        assert.equal(mesh._mesh.castShadow, true, 'mixed surface groups must keep their opaque casters');
        mesh._mesh.material = [volume, volume];
        delegate.prepareMeshMaterialGeometry(mesh._mesh);
        assert.equal(mesh._mesh.castShadow, false);
        mesh._mesh.material = surface;
        delegate.prepareMeshMaterialGeometry(mesh._mesh);
        mesh._mesh.castShadow = false;
        mesh._mesh.material = volume;
        delegate.prepareMeshMaterialGeometry(mesh._mesh);
        delegate.prepareMeshMaterialGeometry(mesh._mesh);
        mesh._mesh.material = surface;
        delegate.prepareMeshMaterialGeometry(mesh._mesh);
        assert.equal(mesh._mesh.castShadow, false, 'preserve a host-disabled surface caster');
    } finally { volume.dispose(); delegate.dispose(); }
});
