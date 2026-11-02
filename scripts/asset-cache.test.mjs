import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

test('asset cache honors HTTP freshness and accepts large assets without ignoring no-store',async()=>{
 const requests=[],jobs=[],source=await fs.readFile('public/usd-asset-cache-sw.js','utf8');
 const context=vm.createContext({URL,Request,Response,Number,location:{origin:'http://localhost',href:'http://localhost/'},self:{addEventListener(){}},
  clients:{get:async()=>null},fetch:async request=>{requests.push(request);return new Response('cached asset');}});
 vm.runInContext(source,context);
 context.large=new Response('asset',{headers:{'content-length':String(104*1024*1024)}});
 context.privateResponse=new Response('asset',{headers:{'cache-control':'private, no-store'}});
 assert.equal(vm.runInContext('canStore(large)',context),true);
 assert.equal(vm.runInContext('canStore(privateResponse)',context),false);
 context.request=new Request('https://raw.githubusercontent.com/usd-wg/assets/main/scene.usdz');
 context.cache={match:async()=>new Response('existing asset'),put:async()=>{}};
 context.caches={open:async()=>context.cache};
 context.event={request:context.request,clientId:'',waitUntil:job=>jobs.push(job)};
 const response=await vm.runInContext('cacheFirst(event)',context);assert.equal(await response.text(),'existing asset');
 await Promise.all(jobs);assert.equal(requests.length,1);assert.equal(requests[0].cache,'default');
 context.pinned=new URL('https://huggingface.co/datasets/agibot-assets/simready-assets/resolve/'+'a'.repeat(40)+'/robot.usda');
 assert.equal(vm.runInContext('isImmutableSimreadyUrl(pinned)',context),true);
});
