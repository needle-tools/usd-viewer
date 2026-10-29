import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Scene, Vector3 } from 'three';
import { ThreeRenderDelegateInterface } from '../../src/hydra/ThreeJsRenderDelegate.js';

function setup() {
    const scene = new Scene(), root = new Group(); scene.add(root);
    return { scene, delegate: new ThreeRenderDelegateInterface({ usdRoot: root, scenePrimitiveRoot: root, renderScene: scene }) };
}

test('rect lights retain their authored area and directional targets follow local -Z', () => {
    const { delegate } = setup();
    const area = delegate.createSPrim('rectLight', '/Softbox');
    area.updateLightState({ intensity: 300, width: 4, height: 2 });
    assert.equal(area._object.isRectAreaLight, true);
    assert.equal(area._object.width, 4); assert.equal(area._object.height, 2);
    const key = delegate.createSPrim('distantLight', '/Key');
    key.updateLightState({ intensity: 200, transform: [1,0,0,0, 0,1,0,0, 0,0,1,0, 3,4,5,1] });
    key._object.updateMatrixWorld(true);
    const direction = key._object.target.getWorldPosition(new Vector3()).sub(key._object.getWorldPosition(new Vector3())).normalize();
    assert.ok(direction.distanceTo(new Vector3(0, 0, -1)) < 1e-6);
    delegate.dispose();
});

test('solid dome lights illuminate the scene and restore its environment on disposal', async () => {
    const { scene, delegate } = setup();
    const dome = delegate.createSPrim('domeLight', '/Sky');
    dome.updateLightState({ intensity: 2, color: [0.25, 0.5, 1], visible: true });
    await delegate.waitForMaterialsReady();
    assert.equal(dome._object.isGroup, true);
    assert.notEqual(dome._object.isLight, true);
    assert.equal(dome._object.userData.usdPath, '/Sky');
    assert.equal(dome._object.visible, true);
    assert.ok(scene.environment?.isDataTexture);
    assert.equal(scene.environmentIntensity, 2);
    assert.ok(scene.environment.image.data[2] > scene.environment.image.data[0]);
    delegate.destroySPrim('/Sky');
    assert.equal(scene.environment, null);
    delegate.dispose();
});

test('orthographic cameras use Hydra world aperture units and preserve authored clipping and transforms', () => {
    const { delegate } = setup();
    const camera = delegate.createSPrim('camera', '/Camera');
    camera.updateCameraState({ projection: 'orthographic', horizontalAperture: 8, verticalAperture: 4, near: 0.2, far: 250,
        transform: [1,0,0,0, 0,1,0,0, 0,0,1,0, 3,4,5,1] });
    assert.equal(camera._object.isOrthographicCamera, true);
    assert.deepEqual([camera._object.left, camera._object.right, camera._object.top, camera._object.bottom], [-4, 4, 2, -2]);
    assert.deepEqual(camera._object.position.toArray(), [3,4,5]);
    assert.equal(camera._object.near, 0.2); assert.equal(camera._object.far, 250);
    camera.updateCameraState({ projection: 'perspective', focalLength: 50, verticalAperture: 24 });
    assert.equal(camera._object.isPerspectiveCamera, true);
    assert.ok(Math.abs(camera._object.fov - 26.99146656) < 0.00001);
    delegate.dispose();
});
