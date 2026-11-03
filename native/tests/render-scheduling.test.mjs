// node --experimental-vm-modules --test native/tests/render-scheduling.test.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SourceTextModule,SyntheticModule,createContext} from 'node:vm';

const source=await readFile(new URL('../renderer/renderer.mjs',import.meta.url),'utf8');
const settle=()=>new Promise(setImmediate);

async function setup(samples=2) {
  const raf=[],fences=[],draws=[],surfaces=[],reported=[],errors=[],updates=[];
  const bridge={onCommand:fn=>bridge.command=fn,onPresent:fn=>bridge.present=fn,
    ready(){},rendered:frame=>reported.push(frame),error:value=>errors.push(value)};
  const viewport={settings:{ssgi:true,samples},identities:new Map(),
    camera:{setHydraMatrices:view=>viewport.view=view},
    delegate:{beginHydraDraw(){},endHydraDraw(){},CommitResources(){},
      waitForRprimsReady:async()=>{},waitForMaterialsReady:async()=>{},
      record:value=>updates.push(value)},
    async updateLighting(){},reset(){},
    render(){draws.push(viewport.view);return {color:1,depth:2,ids:3};}};
  const renderer={init:async()=>{},backend:{isWebGPUBackend:true,
    device:{lost:new Promise(()=>{}),queue:{onSubmittedWorkDone(){
      let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});
      fences.push({resolve,reject});return promise;
    }}}},setPixelRatio(){}};
  const context=createContext({window:{needleNative:bridge,addEventListener(){}},
    navigator:{gpu:{requestAdapter:async()=>({limits:{maxTextureDimension2D:16384}})}},
    document:{createElement:()=>({})},requestAnimationFrame:fn=>raf.push(fn),
    console:{log(){}},Uint8Array,Float32Array,Int32Array,Uint32Array});
  const exports={
    'three/webgpu':{WebGPURenderer:function(){return renderer;}},
    'three':{HalfFloatType:1016},
    './viewport.mjs':{createViewport:async()=>viewport},
    './surface.mjs':{createSurface:()=>({render:(_c,_d,_i,frame)=>surfaces.push(frame)})},
  };
  const module=new SourceTextModule(source,{context});
  await module.link(specifier=>{
    const values=exports[specifier];assert.ok(values,specifier);
    return new SyntheticModule(Object.keys(values),function(){
      for(const [name,value] of Object.entries(values))this.setExport(name,value);
    },{context});
  });
  await module.evaluate();
  async function command(serial,view,commands=[]) {
    bridge.command({commands,frame:{serial,view,projection:[],width:64,height:64}});
    await settle();
  }
  return {command,tick:()=>raf.shift()(),bridge,fences,draws,surfaces,reported,errors,updates};
}

test('slow GPU work does not queue old camera renders or block Hydra updates',async()=>{
  const h=await setup(128);
  await h.command(1,'camera-A');h.tick();h.tick();
  for(let i=0;i<12;i++)h.tick();
  assert.deepEqual(h.draws,['camera-A','camera-A']);
  await h.command(2,'camera-B',[['delegate','','record',['mesh-B']]]);
  await h.command(3,'camera-C',[['delegate','','record',['mesh-C']]]);
  assert.deepEqual(h.updates,['mesh-B','mesh-C']);
  h.tick();assert.equal(h.draws.length,2);
  h.fences[0].resolve();await settle();h.tick();
  assert.deepEqual(h.draws,['camera-A','camera-A','camera-C']);
  assert.equal(h.surfaces.at(-1).serial,3);
  assert.equal(h.surfaces.at(-1).sample,1);
});

test('final convergence and cached republishing respect GPU completion',async()=>{
  const h=await setup();
  await h.command(1,'camera');h.tick();
  assert.equal(h.reported.at(-1).converged,false);
  h.fences[0].resolve();await settle();h.tick();
  assert.equal(h.surfaces.at(-1).converged,true);
  assert.equal(h.reported.length,1,'Final frame was reported before GPU completion');
  h.fences[1].resolve();await settle();
  assert.equal(h.reported.at(-1).converged,true);
  h.bridge.present({serial:1});h.tick();
  const count=h.surfaces.length;
  h.bridge.present({serial:1});h.tick();
  assert.equal(h.surfaces.length,count+1);
  h.bridge.present({serial:1});h.tick();
  assert.equal(h.surfaces.length,count+1,'Cached republishing bypassed backpressure');
  h.fences[2].resolve();await settle();h.tick();
  assert.equal(h.surfaces.length,count+2);
  assert.equal(h.draws.length,2,'Republishing restarted temporal rendering');
});

test('GPU failure stops rendering without reporting final convergence',async()=>{
  const h=await setup(1);
  await h.command(1,'camera');h.tick();
  h.fences[0].reject(new Error('device failed'));await settle();h.tick();
  assert.equal(h.errors.length,1);
  assert.match(h.errors[0],/device failed/);
  assert.equal(h.reported.length,0);
  assert.equal(h.draws.length,1);
});
