import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('only pinned SimReady revisions are cached, and immutable cache hits do not revalidate',async()=>{
  const source=await readFile('public/usd-asset-cache-sw.js','utf8');
  const entries=new Map(),handlers={};let downloads=0;
  const context={URL,Request,Response,location:{origin:'http://localhost'},self:{addEventListener(name,callback){handlers[name]=callback;}},clients:{get:async()=>({type:'window',url:'http://localhost/',postMessage(){}}),matchAll:async()=>[]},
    caches:{open:async()=>({match:async request=>entries.get(request.url)?.clone(),put:async(request,response)=>{entries.set(request.url,new Response(await response.arrayBuffer(),{headers:response.headers}));}})},
    fetch:async()=>{downloads++;return new Response('asset',{headers:{'content-length':'5'}});},
  };
  vm.runInNewContext(source+'\nglobalThis.cacheApi={cacheFirst,isCacheableRequest};',context);
  const url=sha=>`https://huggingface.co/datasets/nvidia/simready-assets/resolve/${sha}/asset/simready_usd/root.usd`;
  assert.equal(context.cacheApi.isCacheableRequest(new Request(url('a'.repeat(40)))) ,true);
  assert.equal(context.cacheApi.isCacheableRequest(new Request(url('main'))),false);
  async function load(value){const waits=[];const response=await context.cacheApi.cacheFirst({request:new Request(value),clientId:'test',waitUntil:promise=>waits.push(promise)});assert.equal(await response.text(),'asset');await Promise.all(waits);}
  await load(url('a'.repeat(40)));await load(url('a'.repeat(40)));assert.equal(downloads,1);
  await load(url('b'.repeat(40)));assert.equal(downloads,2);
  context.clients.get=async()=>({type:'worker',url:'http://localhost/worker.js'});
  context.clients.matchAll=async()=>[{type:'window',url:'http://localhost/?assetCache=0'}];
  let response;
  handlers.fetch({request:new Request(url('a'.repeat(40))),clientId:'worker',respondWith:value=>{response=value;},waitUntil(){}});
  assert.equal(await(await response).text(),'asset');assert.equal(downloads,3,'cache-disabled pages bypass a worker cache hit');
});
