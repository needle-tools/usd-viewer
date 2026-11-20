import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group, Quaternion, Vector3} from 'three';
import R from '@dimforge/rapier3d-compat';
import {createColliderOverlay} from '../public/viewer-colliders.js';

test('source collider geometry follows a mechanism pose without becoming pickable', () => {
	const parent = new Group();
	parent.position.set(7, 3, -5); parent.scale.setScalar(.01);
	const p = new Vector3(2, 3, 4), q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
	const snapshot = {bodies: [{path: '/Body', position: [0, 0, 0], rotation: [0, 0, 0, 1]}],
		shapes: [{path: '/Shape', body: '/Body', type: 'cube', halfExtents: [1, .5, .25], position: [1, 0, 0]}]};
	const overlay = createColliderOverlay({parent, snapshot, simulation: {bodies: new Map([
		['/Body', {body: {translation: () => p, rotation: () => q}}],
	])}});
	const meshes = []; overlay.group.traverse(object => {if (object.isMesh) meshes.push(object);});
	try {
		overlay.update();
		assert.equal(meshes.length, 1);
		const expected = parent.localToWorld(new Vector3(1, 0, 0).applyQuaternion(q).add(p));
		assert.ok(meshes[0].getWorldPosition(new Vector3()).distanceTo(expected) < 1e-9);
		p.x += 2; overlay.update();
		assert.ok(meshes[0].getWorldPosition(new Vector3()).distanceTo(expected.clone().add(new Vector3(.02, 0, 0))) < 1e-9);
		assert.equal(meshes[0].userData.usdHelperPickable, false);
		assert.equal(meshes[0].userData.usdExcludeFromBounds, true);
		assert.ok(meshes[0].material.transparent && meshes[0].material.opacity < .1);
	} finally {overlay.dispose();}
	assert.equal(parent.children.length, 0);
});

test('native compound collider pieces retain their world poses and dispose their geometry', async () => {
	await R.init();
	const world = new R.World({x: 0, y: 0, z: 0});
	const shape = new R.Compound([new R.Cuboid(.5, .25, .1), new R.Ball(.1)],
		[{x: 1, y: 0, z: 0}, {x: -1, y: 0, z: 0}], [{x: 0, y: 0, z: 0, w: 1}, {x: 0, y: 0, z: 0, w: 1}], 0);
	const collider = world.createCollider(new R.ColliderDesc(shape).setTranslation(2, 3, 4));
	const parent = new Group(); parent.position.set(8, 2, -3); parent.scale.setScalar(2);
	const overlay = createColliderOverlay({parent, snapshot: {bodies: [], shapes: [{path: '/Shape'}]},
		nativeCollider: () => collider, worldSpace: true});
	const meshes = []; overlay.group.traverse(object => {if (object.isMesh) meshes.push(object);});
	let disposed = 0;
	for (const object of meshes) object.geometry.addEventListener('dispose', () => disposed++);
	try {
		overlay.update();
		assert.equal(meshes.length, 2);
		assert.ok(meshes[0].getWorldPosition(new Vector3()).distanceTo(new Vector3(3, 3, 4)) < 1e-9);
		assert.ok(meshes[1].getWorldPosition(new Vector3()).distanceTo(new Vector3(1, 3, 4)) < 1e-9);
		collider.setTranslation({x: 4, y: 2, z: 1}); overlay.update();
		assert.ok(meshes[0].getWorldPosition(new Vector3()).distanceTo(new Vector3(5, 2, 1)) < 1e-9);
	} finally {overlay.dispose(); world.free();}
	assert.equal(disposed, 2);
	assert.equal(parent.children.length, 0);
});
