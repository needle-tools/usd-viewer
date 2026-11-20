import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {validateGltfFile} from '../usd-wasm/scripts/corpus/validate-file.mjs';

test('isolated validation preserves file hashes and returns Khronos findings from a worker',async()=>{
	const root=await mkdtemp(join(tmpdir(),'usd-corpus-validator-'));
	const bytes=Buffer.from(JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:5}}]}]}));
	const file=join(root,'invalid.gltf');await writeFile(file,bytes);
	const result=await validateGltfFile(file);
	assert.equal(result.sha256,createHash('sha256').update(bytes).digest('hex'));
	assert.ok(result.validationThreadId>0);
	assert.ok(result.issues.numErrors>0);
	assert.ok(result.issues.messages.some(message=>message.code==='UNRESOLVED_REFERENCE'));
});

test('valid GLB validation completes without retaining a worker',async()=>{
	const root=await mkdtemp(join(tmpdir(),'usd-corpus-validator-'));
	const json=Buffer.from(JSON.stringify({asset:{version:'2.0'}}).padEnd(32,' '));
	const bytes=Buffer.alloc(20+json.length);bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(json.length,12);bytes.writeUInt32LE(0x4e4f534a,16);json.copy(bytes,20);
	const file=join(root,'valid.glb');await writeFile(file,bytes);
	const result=await validateGltfFile(file);assert.equal(result.issues.numErrors,0);
});

test('validation file failures retain their actionable error code and path',async()=>{
	const root=await mkdtemp(join(tmpdir(),'usd-corpus-validator-')),file=join(root,'missing.glb');
	await assert.rejects(validateGltfFile(file),error=>error.code==='ENOENT'&&error.message.includes('missing.glb'));
});
