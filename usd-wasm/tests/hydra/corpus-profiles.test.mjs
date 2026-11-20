import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyAssetProfile, checkProfileApproximations} from '../../scripts/corpus/profiles.mjs';

test('selected variants settle before exporting a profile', async () => {
	const events = [], handle = {ready: async () => events.push('ready'), materialsReady: async () => events.push('materials')};
	await applyAssetProfile(handle, {variantSelections: [{path: '/Root', set: 'Newton', value: 'Enabled'}, {path: '/Root', set: 'PhysX', value: 'Disabled'}]}, async (actual, ...args) => {
		assert.equal(actual, handle);
		events.push(args);
	});
	assert.deepEqual(events, [['/Root', 'Newton', 'Enabled'], ['/Root', 'PhysX', 'Disabled'], 'ready', 'materials']);
	events.length = 0;
	await applyAssetProfile(handle, {}, () => assert.fail('authored profile changes no variants'));
	assert.deepEqual(events, []);
});

test('profile validation detects a missing or incorrectly selected collision mode', () => {
	const asset = {expectedApproximations: {convexHull: 1, none: 1}};
	checkProfileApproximations({shapes: [{type: 'mesh'}, {type: 'mesh', approximation: 'convexHull'}, {type: 'box'}]}, asset);
	assert.throws(() => checkProfileApproximations({shapes: [{type: 'mesh', approximation: 'sdf'}]}, asset), /differ from the native inventory/);
});
