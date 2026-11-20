import assert from 'node:assert/strict';
import {test} from 'node:test';
import {retryFileOperation} from '../../scripts/corpus/files.mjs';

test('temporary Windows file locks retry without hiding the final result',async()=>{
	let attempts=0;
	const result=await retryFileOperation(async()=>{
		if(++attempts<3)throw Object.assign(new Error('Sharing violation'),{code:'EPERM'});
		return 'published';
	});
	assert.equal(attempts,3);assert.equal(result,'published');
});

test('unrelated filesystem errors preserve their identity and fail immediately',async()=>{
	let attempts=0;const error=Object.assign(new Error('Missing temporary file'),{code:'ENOENT'});
	await assert.rejects(retryFileOperation(async()=>{attempts++;throw error;}),value=>value===error);
	assert.equal(attempts,1);
});
