import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssetQueue} from '../usd-wasm/scripts/corpus/queue.mjs';

test('large corpus assets serialize while small work passes the blocked asset', async () => {
	const large = id => ({id,geometry:{triangles:2_000_000}});
	const take = createAssetQueue([large('a'),large('b'),{id:'c'},large('d')]);
	const a = await take(), c = await take();
	assert.equal(a.asset.id,'a'); assert.equal(c.asset.id,'c');
	let awakened = false;
	const waiting = take().then(value => {awakened = true; return value;});
	c.release(); await new Promise(resolve => setImmediate(resolve));
	assert.equal(awakened,false);
	a.release(); const b = await waiting;
	assert.equal(b.asset.id,'b');
	let nextAwakened=false;
	const next = take().then(value=>{nextAwakened=true;return value;}); a.release(); // Releasing a lease twice must not admit another large asset.
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(nextAwakened,false);
	b.release(); const d = await next; assert.equal(d.asset.id,'d'); d.release();
	assert.equal(await take(),null);
});

test('storage-heavy assets serialize even with little geometry and all waiters finish', async () => {
	const take = createAssetQueue(Array.from({length:5},(_,id)=>({id,sizes:{composedWithTexturesBytes:600*1024**2}})));
	let active=0,peak=0;const seen=[];
	await Promise.all(Array.from({length:3},async()=>{
		for(let lease;lease=await take();){
			active++;peak=Math.max(peak,active);seen.push(lease.asset.id);
			await new Promise(resolve=>setImmediate(resolve));active--;lease.release();
		}
	}));
	assert.equal(peak,1);assert.deepEqual(seen,[0,1,2,3,4]);
});
