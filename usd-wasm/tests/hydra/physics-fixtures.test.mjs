import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Group, Quaternion, Vector3 } from 'three';
import R from '@dimforge/rapier3d-compat';
import { getUsdModule } from '../../src/bindings/index.js';
import { createThreeHydra } from '../../src/create.three.js';
import { createUsdPhysics, readUsdPhysics } from '../../src/physics/createPhysics.js';

await R.init();
for (const name of ['mass', 'scene', 'fixed-joint', 'revolute-joint', 'prismatic-joint', 'collision-group', 'dominoes', 'pendulum']) {
    test(`composed USD physics fixture: ${name}`, async () => {
        const USD = await getUsdModule({ print() {}, printErr() {} });
        const buffer = await readFile(new URL(`../fixtures/coverage/advanced/physics-${name}.usda`, import.meta.url));
        const root = new Group();
        const handle = await createThreeHydra({ USD, scene: root, url: `${name}.usda`, buffer });
        let physics;
        try {
            const snapshot = await readUsdPhysics(handle);
            physics = await createUsdPhysics({ handle, rapier: R, snapshot });
            assert.deepEqual(physics.unsupported, []);
            const worldAnchor = (path, point) => {
                const body = physics.bodies.get(path)?.body;
                const result = new Vector3(...point);
                return body ? result.applyQuaternion(new Quaternion().copy(body.rotation())).add(body.translation()) : result;
            };
            for (const joint of snapshot.joints) {
                assert.ok(worldAnchor(joint.body0, joint.position0).distanceTo(worldAnchor(joint.body1, joint.position1)) < 1e-4,
                    `${joint.path}: authored joint anchors agree`);
            }
            const initial = new Map([...physics.bodies].map(([path, { body }]) => [path, new Quaternion().copy(body.rotation())]));
            const visuals = [];
            root.updateMatrixWorld(true);
            root.traverse(object => {
                if (object.isMesh && physics.bodyForObject(object)) visuals.push({ object, before: object.getWorldPosition(new Vector3()) });
            });
            physics.play();
            for (let frame = 0; frame < 240; frame++) {
                physics.update(1 / 120);
                for (const { body } of physics.bodies.values()) {
                    const values = [...Object.values(body.translation()), ...Object.values(body.rotation())];
                    assert.ok(values.every(v => Number.isFinite(v) && Math.abs(v) < 100), 'simulation remains finite and bounded');
                }
            }
            root.updateMatrixWorld(true);
            const rotated = [...physics.bodies].filter(([path, { body }]) => initial.get(path).angleTo(new Quaternion().copy(body.rotation())) > .5);
            const movedVisuals = visuals.filter(({ object, before }) => before.distanceTo(object.getWorldPosition(new Vector3())) > .1);
            if (name === 'dominoes') {
                assert.equal(rotated.length, 9, 'the entire domino chain topples');
                assert.equal(movedVisuals.length, 9, 'all authored domino visuals follow the bodies');
            }
            if (name === 'pendulum') {
                assert.ok(rotated.some(([path]) => path.endsWith('/Pendulum')));
                assert.ok(movedVisuals.some(({ object }) => object.userData.usdPath.endsWith('/Bob')));
            }
            if (['revolute-joint', 'prismatic-joint'].includes(name)) {
                assert.ok(movedVisuals.some(({ object }) => object.userData.usdPath.includes('/BodyB/')),
                    'compound visual details follow the moving joint body');
            }
        } finally { physics?.dispose(); await handle.dispose(); }
    });
}
