import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group, Quaternion, Vector3} from 'three';
import {createSimulationJointHelpers} from '../usd-wasm/src/physics/jointHelpers.js';

for (const worldSpace of [false, true]) test(`simulation joint helpers follow live ${worldSpace ? 'world' : 'stage'} poses and retain stage units`, () => {
    const root = new Group();
    root.position.set(7, 3, -5); root.scale.setScalar(.01); root.rotation.x = -Math.PI / 2;
    root.updateWorldMatrix(true, false);
    const localPosition = new Vector3(2, 3, 4), localRotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), .4);
    const source = {path: '/Slide', type: 'prismatic', body0: '/Base', body1: '/Moving', axis: 'Z',
        position0: [1, 0, 0], limit: {enabled: true, lower: 0, upper: 10}};
    const position = worldSpace ? root.localToWorld(localPosition.clone()) : localPosition;
    const rotation = worldSpace ? root.getWorldQuaternion(new Quaternion()).multiply(localRotation) : localRotation;
    let playing = true, visible = true;
    const helpers = createSimulationJointHelpers({root,
        bodies: new Map([['/Base', {data: {}, body: {translation: () => position, rotation: () => rotation, isDynamic: () => true}}]]),
        joints: new Map([['/Slide', {}]]), isPlaying: () => playing, getJointValue: () => worldSpace ? .05 : 5,
    }, {metersPerUnit: .01, joints: [source]}, {worldSpace, visible: () => visible});
    const object = helpers.objects[0];
    try {
        const expected = root.localToWorld(new Vector3(1, 0, 0).applyQuaternion(localRotation).add(localPosition));
        assert.ok(object.getWorldPosition(new Vector3()).distanceTo(expected) < 1e-9);
        assert.equal(object.children[0].geometry.attributes.position.getZ(2), 5);
        assert.equal(object.userData.usdInteractBody, '/Moving');
        assert.equal(object.userData.usdExcludeFromBounds, true);
        position.x += worldSpace ? .02 : 2; helpers.update();
        assert.ok(object.getWorldPosition(new Vector3()).distanceTo(expected.clone().add(new Vector3(.02, 0, 0))) < 1e-9);
        visible = false; helpers.update(); assert.equal(object.visible, false);
        visible = true; playing = false; helpers.update(); assert.equal(object.visible, false);
    } finally {helpers.dispose();}
    assert.equal(root.children.length, 0);
});
