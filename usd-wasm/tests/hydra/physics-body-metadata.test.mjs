import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readBodyMetadata} from '../../src/physics/bodyMetadata.js';

test('body damping reads authored values, preserves zero and ignores schema fallbacks', async () => {
	const disposed = [];
	const values = {
		'/Zero': {linearDamping: 0, angularDamping: 0},
		'/Damped': {linearDamping: .5, angularDamping: 2, disableGravity:true, enableCCD:false},
		'/Fallback': {angularDamping: .05},
	};
	const snapshot = {bodies: Object.keys(values).map(path => ({path}))};
	const handle = {getTime: () => 42, readStage: callback => callback({
		GetPrimAtPath(path) {
			return {delete() {disposed.push(path);}, GetAttribute(name) {
				const field = name.split(':')[1];
				return {IsValid: () => field in values[path], HasAuthoredValueOpinion: () => path !== '/Fallback',
					Get(time) {assert.equal(time, 42); return values[path][field];}, delete() {disposed.push(`${path}:${field}`);}};
			}};
		},
	})};
	await readBodyMetadata(handle, snapshot);
	assert.deepEqual(snapshot.bodies, [
		{path: '/Zero', linearDamping: 0, angularDamping: 0},
		{path: '/Damped', linearDamping: .5, angularDamping: 2, gravityScale:0, continuousCollision:false},
		{path: '/Fallback'},
	]);
	assert.equal(disposed.length, 15);
});
