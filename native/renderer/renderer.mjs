import {WebGPURenderer} from 'three/webgpu';
import {HalfFloatType} from 'three';
import {createViewport} from './viewport.mjs';
import {createSurface} from './surface.mjs';

const bridge = window.needleNative;
let failed=false,updating=false;
function fail(error){if(!failed){failed=true;bridge.error(error?.stack||String(error));}}
window.addEventListener('unhandledrejection',event=>fail(event.reason));
window.addEventListener('error',event=>fail(event.message));
// Keep Three's logical resolution separate from the compositor atlas size.
const adapter = await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
if(!adapter)throw new Error('Native Hydra requires a WebGPU adapter');
const renderer = new WebGPURenderer({canvas:document.createElement('canvas'),alpha:false,antialias:false,outputType:HalfFloatType,
  powerPreference:'high-performance',requiredLimits:{maxTextureDimension2D:adapter.limits.maxTextureDimension2D}});
renderer.setPixelRatio(1);await renderer.init();
renderer.onError = fail;
renderer.backend.device.lost.then(info=>fail(new Error('WebGPU device lost: '+info.message)));
if(!renderer.backend.isWebGPUBackend)throw new Error('Native Hydra requires WebGPU');
let dirty=false,frame=null,samples=0,commands=Promise.resolve(),attachments=null,presentRequested=false,gpuInFlight=0;
const viewport=await createViewport(renderer,()=>{dirty=true;});
const surface=createSurface(renderer);
bridge.onPresent(request=>{if(request.serial===frame?.serial)presentRequested=true;});
console.log('Native viewport initialized');

function unpack(value,binary) {
  if(Array.isArray(value))return value.map(entry=>unpack(entry,binary));
  if(value&&typeof value==='object'){
    if(value.$buffer!==undefined){
      if(!['Float32Array','Int32Array','Uint32Array'].includes(value.type))throw new Error('Invalid buffer type');
      return new globalThis[value.type](binary.buffer,binary.byteOffset+value.$buffer,value.length);
    }
    return Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,unpack(entry,binary)]));
  }
  return value;
}

bridge.onCommand(message=>{commands=commands.then(async()=>{
  if(failed)return;
  updating=true;
  try {
  console.log('Hydra update',message.frame?.serial,message.commands?.length);
  const delegate=viewport.delegate;
  delegate.beginHydraDraw();
  try {
    for(const [kind,id,method,raw] of message.commands||[]){
      const args=unpack(raw,message.binary);
      if(kind==='native'){
        if(method==='identity')viewport.identities.set(id,args[0]);
        else if(method==='settings')await viewport.configure(args[0]);
        else throw new Error('Unknown native command: '+method);
        continue;
      }
      if(kind==='delegate'){delegate[method](...args);if(method==='destroyRPrim')viewport.identities.delete(args[0]);continue;}
      const object=kind==='rprim'?delegate.meshes[id]:delegate.materials[id]||delegate.scenePrimitives[id];
      if(!object||typeof object[method]!=='function')throw new Error(`Unknown Hydra update ${kind}:${id}:${method}`);
      object[method](...args);
    }
  } finally {delegate.endHydraDraw();}
  if(message.frame){frame=message.frame;viewport.camera.setHydraMatrices(frame.view,frame.projection);samples=0;attachments=null;presentRequested=false;viewport.reset();}
  delegate.CommitResources();await delegate.waitForRprimsReady();await delegate.waitForMaterialsReady();
  await viewport.updateLighting();dirty=true;
  console.log('Hydra update ready',frame?.serial);
  } finally {updating=false;}
}).catch(fail);});

function submittedWork() {
  // RAF can submit faster than WebGPU finishes. Bound render-ahead so orbit
  // input updates the next frame instead of waiting behind old camera views.
  // Two submissions can overlap to keep the GPU busy without a long queue.
  // Hydra commands continue to apply while this work is in flight.
  gpuInFlight++;
  const work=renderer.backend.device.queue.onSubmittedWorkDone();
  work.then(()=>{gpuInFlight--;},error=>{gpuInFlight--;fail(error);});
  return work;
}

function render(){
  requestAnimationFrame(render);
  const wantedSamples=viewport.settings.ssgi?viewport.settings.samples:1;
  if(failed||updating||gpuInFlight>=2||!frame)return;
  if(!dirty&&samples>=wantedSamples){
    if(presentRequested&&attachments){
      presentRequested=false;
      try{surface.render(attachments.color,attachments.depth,attachments.ids,{...frame,sample:samples,converged:true});submittedWork();}
      catch(error){fail(error);}
    }
    return;
  }
  dirty=false;
  presentRequested=false;
  try {
    if(samples===0)console.log('Beauty frame start',frame.serial);
    attachments=viewport.render(frame.width,frame.height,{updateIds:samples===0});
    if(samples===0)console.log('Beauty frame complete',frame.serial);
    samples++;
    surface.render(attachments.color,attachments.depth,attachments.ids,{...frame,sample:samples,converged:samples>=wantedSamples});
    const work=submittedWork();
    const completed={serial:frame.serial,sample:samples,converged:samples>=wantedSamples};
    // The final notification must follow GPU completion. The host may have
    // released its previous paint before this last canvas submission arrived.
    if(completed.converged)work
      .then(()=>bridge.rendered(completed)).catch(fail);
    else bridge.rendered(completed);
  } catch(error){fail(error);}
}
requestAnimationFrame(render);bridge.ready();
