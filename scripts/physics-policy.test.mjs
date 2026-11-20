import assert from 'node:assert/strict';
import test from 'node:test';
import R from '@dimforge/rapier3d-compat';
import {createSimulation} from '@needle-tools/simready/rapier';
import {holdAssemblyBases, withViewerDamping} from '../public/viewer-physics-policy.mjs';

const rotation = [0, 0, 0, 1];
const body = (path, x = 0) => ({path, position: [x, 3, 0], rotation, rigidBodyEnabled: true});
const fixture = () => ({
	metersPerUnit: 1, upAxis: 'Y', scenes: [], materials: [], groups: [],
	bodies: [body('/Base'), body('/Arm', 1), body('/Loose', 4)],
	shapes: ['Base', 'Arm', 'Loose'].map(name => ({path: `/${name}/Shape`, body: `/${name}`,
		type: 'cube', halfExtents: [.5, .12, .12], position: [0, 0, 0], rotation})),
	joints: [{path: '/Hinge', type: 'revolute', body0: '/Base', body1: '/Arm', axis: 'Z',
		position0: [.5, 0, 0], position1: [-.5, 0, 0], rotation0: rotation, rotation1: rotation}],
});

test('viewer damping defaults preserve authored values, including zero', () => {
	const source = fixture();
	Object.assign(source.bodies[0], {linearDamping: 3, angularDamping: 0});
	const before = structuredClone(source);
	const result = withViewerDamping(source);
	assert.equal(result.bodies[0].linearDamping, 3);
	assert.equal(result.bodies[0].angularDamping, 0);
	assert.equal(result.bodies[1].linearDamping, 0);
	assert.equal(result.bodies[1].angularDamping, 1);
	assert.deepEqual(source, before);
});

test('holds the directed assembly base without changing the authored snapshot', () => {
	const source = fixture();
	source.bodies[0].linearVelocity = [1, 2, 3];
	source.bodies[0].angularVelocity = [4, 5, 6];
	const before = structuredClone(source);
	const result = holdAssemblyBases(source);
	assert.deepEqual(result.roots, ['/Base']);
	assert.deepEqual(source, before);
	assert.notEqual(result.snapshot.bodies, source.bodies);
	assert.equal(result.snapshot.bodies[0].kinematicBody, true);
	assert.deepEqual(result.snapshot.bodies[0].linearVelocity, [0, 0, 0]);
	assert.deepEqual(result.snapshot.bodies[0].angularVelocity, [0, 0, 0]);
	assert.equal(result.snapshot.bodies[1], source.bodies[1]);
	assert.equal(result.snapshot.shapes, source.shapes);
	assert.equal(result.snapshot.joints, source.joints);
});

test('preserves existing world, static and kinematic anchors', () => {
	for (const kind of ['world', 'static', 'kinematic']) {
		const source = fixture();
		if (kind === 'world') source.joints.push({path: '/Mount', type: 'fixed', body1: '/Base'});
		if (kind === 'static') source.bodies[0].rigidBodyEnabled = false;
		if (kind === 'kinematic') source.bodies[0].kinematicBody = true;
		assert.equal(holdAssemblyBases(source).snapshot, source);
	}
});

test('prefers authored articulation roots and ignores disabled joints', () => {
	const source = fixture();
	source.articulations = [{rootPrims: ['/Arm']}];
	assert.deepEqual(holdAssemblyBases(source).roots, ['/Arm']);
	source.joints[0].jointEnabled = false;
	assert.deepEqual(holdAssemblyBases(source).roots, []);
});

test('does not anchor components belonging to another physics scene', () => {
	const source = fixture();
	source.scenes = [{path: '/First'}, {path: '/Second'}];
	for (const item of source.bodies) item.simulationOwners = ['/First'];
	assert.deepEqual(holdAssemblyBases(source, {scenePath: '/Second'}).roots, []);
});

test('holds an isolated rigid asset while preserving authored scenes and environments', () => {
	const source = fixture();
	source.bodies = [source.bodies[0]]; source.shapes = [source.shapes[0]]; source.joints = [];
	const before = structuredClone(source);
	assert.deepEqual(holdAssemblyBases(source).roots, ['/Base']);
	assert.equal(holdAssemblyBases(source).snapshot.bodies[0].kinematicBody, true);
	assert.deepEqual(source, before);
	source.scenes = [{path: '/Physics'}];
	assert.deepEqual(holdAssemblyBases(source).roots, []);
	source.scenes = [];
	source.shapes.push({path: '/Ground', type: 'cube', halfExtents: [2, .1, 2], position: [0, 0, 0], rotation});
	assert.deepEqual(holdAssemblyBases(source).roots, []);
});

test('real simulation keeps the base in place while the arm swings and loose bodies fall', async () => {
	await R.init();
	const source = fixture();
	const {snapshot} = holdAssemblyBases(source);
	const simulation = await createSimulation({snapshot, rapier: R});
	try {
		simulation.play();
		let baseDrift = 0, lowestArm = 3;
		for (let i = 0; i < 120; i++) {
			simulation.step();
			baseDrift = Math.max(baseDrift, Math.abs(simulation.bodies.get('/Base').body.translation().y - 3));
			lowestArm = Math.min(lowestArm, simulation.bodies.get('/Arm').body.translation().y);
		}
		const loose = simulation.bodies.get('/Loose').body.translation();
		assert.ok(baseDrift < .005, `base drifted by ${baseDrift}`);
		assert.ok(lowestArm < 2.8, `arm did not swing: ${lowestArm}`);
		assert.ok(loose.y < 2, `loose body was unexpectedly held: ${loose.y}`);
	} finally { simulation.dispose(); }
});

test('driving any of three world-mounted gears transfers motion through tooth contacts', async () => {
	await R.init();
	for (const input of [0, 1, 2]) {
		const snapshot = {metersPerUnit: 1, upAxis: 'Y', scenes: [{path: '/Scene', gravityMagnitude: 0}],
			materials: [], groups: [], bodies: [], joints: [], shapes: []};
		for (let gear = 0; gear < 3; gear++) {
			const path = `/Gear${gear}`, angle = gear === 1 ? Math.PI / 12 : 0;
			const position = [gear * 1.9, 0, 0];
			snapshot.bodies.push({path, position, rotation: [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)],
				mass: 1, diagonalInertia: [1, 1, .5]});
			snapshot.joints.push({path: path + '/Axle', type: 'revolute', body1: path,
				position0: position, position1: [0, 0, 0], rotation0: rotation, rotation1: rotation, axis: 'Z',
				...(gear === input ? {drive: {enabled: true, targetPosition: 0, targetVelocity: 90,
					stiffness: 0, damping: 100, acceleration: true, forceLimit: 100}} : {})});
			snapshot.shapes.push({path: path + '/Hub', body: path, type: 'cylinder', axis: 'Z',
				radius: .78, halfHeight: .1, position: [0, 0, 0], rotation});
			for (let tooth = 0; tooth < 12; tooth++) {
				const a = tooth * Math.PI / 6;
				snapshot.shapes.push({path: `${path}/Tooth${tooth}`, body: path, type: 'cube',
					halfExtents: [.16, .08, .1], position: [.9 * Math.cos(a), .9 * Math.sin(a), 0],
					rotation: [0, 0, Math.sin(a / 2), Math.cos(a / 2)]});
			}
		}
		const held = holdAssemblyBases(snapshot);
		assert.deepEqual(held.roots, [], 'world-mounted axles must remain free to rotate');
		const simulation = await createSimulation({snapshot: held.snapshot, rapier: R});
		try {
			simulation.play();
			for (let frame = 0; frame < 360; frame++) simulation.step(1 / 120);
			const angles = [0, 1, 2].map(gear => simulation.getJointValue(`/Gear${gear}/Axle`));
			for (let gear = 0; gear < 3; gear++) {
				const direction = Math.abs(gear - input) % 2 ? -1 : 1;
				assert.ok(angles[gear] * direction > 90, `input ${input}: gear ${gear} failed to follow (${angles})`);
			}
		} finally { simulation.dispose(); }
	}
});
