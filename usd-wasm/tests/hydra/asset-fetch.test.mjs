import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchAsset} from '../../src/assetFetch.js';

test('streaming progress includes bytes with unknown lengths and reports HTTP failures',async()=>{
  const events=[];
  const bytes=await fetchAsset('data:application/octet-stream;base64,AAECAw==',event=>events.push(event));
  assert.deepEqual([...bytes],[0,1,2,3]);assert.equal(events[0].state,'start');
  assert.ok(events.some(event=>event.state==='progress' && event.loaded===4));
  assert.deepEqual(events.at(-1),{url:'data:application/octet-stream;base64,AAECAw==',state:'done',loaded:4,total:4});
  const controller=new AbortController();controller.abort();
  await assert.rejects(fetchAsset('data:text/plain,hello',event=>events.push(event),{signal:controller.signal}));
  assert.equal(events.at(-1).state,'error');
});

test('length is reported when headers arrive, and compressed lengths are not treated as decoded totals',async()=>{
  const originalFetch=globalThis.fetch;
  try {
    for(const encoding of [null,'gzip']){
      globalThis.fetch=async()=>new Response(new Uint8Array([0,1,2,3]),{headers:{'content-length':'4',...(encoding?{'content-encoding':encoding}:{})}});
      const events=[];await fetchAsset('https://assets.test/file',event=>events.push(event));
      assert.equal(events[1].state,'progress');assert.equal(events[1].loaded,0);
      assert.equal(events[1].total,encoding?0:4);
      assert.equal(events.at(-1).total,4);
    }
  } finally {globalThis.fetch=originalFetch;}
});
