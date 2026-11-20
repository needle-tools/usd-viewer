import {test} from 'node:test';import assert from 'node:assert/strict';
import {captureBrowserArgs,requireHardwareRenderer,hardwareCapture,capturePolicy,prepareHardwareCapture} from '../../scripts/corpus/rendering.mjs';
import {serveCorpus} from '../../scripts/corpus/server.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('capture requests hardware and rejects software or the wrong GPU',()=>{
 assert.ok(captureBrowserArgs('win32').includes('--force-high-performance-gpu'));
 assert.ok(captureBrowserArgs('win32').includes('--use-angle=d3d11'));
 assert.equal(captureBrowserArgs('darwin').includes('--use-angle=d3d11'),false);
 for(const renderer of ['ANGLE SwiftShader','llvmpipe','Microsoft Basic Render Driver','',undefined])assert.throws(()=>requireHardwareRenderer(renderer),/Hardware rendering required/);
 assert.throws(()=>requireHardwareRenderer(''),{code:'GPU_CONTEXT_UNAVAILABLE'});
 assert.throws(()=>requireHardwareRenderer('ANGLE SwiftShader'),{code:'GPU_SOFTWARE_RENDERER'});
 assert.throws(()=>requireHardwareRenderer('ANGLE Intel UHD Graphics','nvidia'),{code:'GPU_VENDOR_MISMATCH'});
 assert.equal(requireHardwareRenderer('ANGLE NVIDIA RTX 3060 Ti','nvidia'),'ANGLE NVIDIA RTX 3060 Ti');
 assert.equal(hardwareCapture({capturePolicy,renderer:'ANGLE NVIDIA RTX 3060 Ti'},'nvidia'),true);
 assert.equal(hardwareCapture({renderer:'ANGLE NVIDIA RTX 3060 Ti'}),false);
});
test('GPU initialization precedes the isolated WASM page without removing its isolation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'corpus-rendering-'));
 const server=await serveCorpus({build:root,assets:root,results:join(root,'results')});
 try{
  const gpu=await fetch(server.origin+'/gpu.html');
  assert.equal(gpu.headers.get('cross-origin-embedder-policy'),null);
  assert.match(await gpu.text(),/<body>/);
  const corpus=await fetch(server.origin+'/corpus.html');
  assert.equal(corpus.headers.get('cross-origin-embedder-policy'),'require-corp');
  assert.equal(corpus.headers.get('cross-origin-opener-policy'),'same-origin');
 }finally{await server.close();await rm(root,{recursive:true,force:true});}
});
test('hardware startup tolerates delayed context creation and still rejects software',async()=>{
 const previous={document:globalThis.document,requestAnimationFrame:globalThis.requestAnimationFrame};let attempts=0,renderer='ANGLE NVIDIA RTX';
 globalThis.document={body:{appendChild(){}},createElement:()=>({remove(){},getContext(){if(++attempts<3)return null;return {getExtension:()=>({UNMASKED_RENDERER_WEBGL:1}),getParameter:()=>renderer};}})};
 globalThis.requestAnimationFrame=callback=>queueMicrotask(callback);
 try{
  const page={evaluate:callback=>callback()};
  assert.equal(await prepareHardwareCapture(page,'nvidia'),renderer);assert.equal(attempts,3);
  renderer='ANGLE SwiftShader';await assert.rejects(prepareHardwareCapture(page),/Hardware rendering required/);
 }finally{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
