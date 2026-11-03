import * as THREE from 'three';
import {RenderPipeline} from 'three/webgpu';
import {texture} from 'three/tsl';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {ThreeRenderDelegateInterface} from '../../usd-wasm/src/hydra/ThreeJsRenderDelegate.js';
import {createWebGpuSupport} from '../../usd-wasm/src/renderers/webGpuSupport.js';
import {createBeauty} from '../../usd-wasm/src/renderers/beauty.js';
import {createBasic} from '../../usd-wasm/src/renderers/basic.js';
import {configureNeedleAgx} from '../../usd-wasm/src/renderers/needleAgx.js';
import {createViewerLighting} from '../../public/viewer-lighting.js';
import {HydraCamera} from './hydra-camera.mjs';
import {createPicking} from './picking.mjs';
import {getDomeRotation} from '../../usd-wasm/src/hydra/domeEnvironment.js';

const bloomSettings = {bloom:false,bloomStrength:.5,bloomRadius:.5,bloomThreshold:1};

/** The same scene delegate, illumination policy and Beauty pipeline as the browser. */
export async function createViewport(renderer, requestRender) {
  const scene = new THREE.Scene(), root = new THREE.Group();scene.add(root);
  const camera = new HydraCamera();
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  configureNeedleAgx(renderer);
  const support = await createWebGpuSupport({lazyAreaLights:true});
  const identities = new Map();
  const driver = {
    resolveAssetUrl:path => path.startsWith('/') ? new URL('file://'+path).href : path,
    async getFile(path, callback) {
      const response = await fetch(this.resolveAssetUrl(path));
      if(!response.ok) throw new Error('Asset unavailable: '+path);
      callback(new Uint8Array(await response.arrayBuffer()));
    },
  };
  const delegate = new ThreeRenderDelegateInterface({usdRoot:root,scenePrimitiveRoot:root,renderScene:scene,
    renderer,webGpuSupport:support,driver:()=>driver,includedPurposes:['default','render','proxy','guide'],
    scenePrimitiveLightIntensityScale:1,requestRender});
  let environment;
  const lighting = createViewerLighting({scene,loadEnvironment:async()=>{
    environment ??= new HDRLoader().loadAsync(new URL('../../public/environments/neutral.hdr',import.meta.url).href)
      .then(texture=>{texture.mapping=THREE.EquirectangularReflectionMapping;return texture;});
    return environment;
  }});
  let settings = {ssgi:true,samples:32,toneMapping:'none',exposure:1,environment:true,domeLightCameraVisibility:true};
  function updateDomeBackground() {
    const dome=Object.values(delegate.scenePrimitives).reverse().find(prim=>
      prim._domeTexture&&prim._domeState?.visible!==false&&prim._domeState?.cameraVisibility!==false);
    scene.background=settings.domeLightCameraVisibility&&dome?dome._domeTexture:null;
    if(dome){
      scene.backgroundIntensity=Number(dome._domeState.intensity??1);
      getDomeRotation(dome._object,scene.backgroundRotation);
    }
  }
  const colorTarget = new THREE.RenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});
  const displayTarget = new THREE.RenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});
  const display = new RenderPipeline(renderer, texture(colorTarget.texture));
  let pipeline = createBeauty({renderer,scene,camera,settings:bloomSettings,outputColorTransform:false});
  const picking = createPicking(renderer,scene,camera,identities);
  return {
    scene,root,camera,delegate,identities,
    get settings(){return settings;},
    async configure(next) {
      console.log('Hydra settings',JSON.stringify(next));
      next={...next};
      if(typeof next.ssgi!=='boolean')delete next.ssgi;
      if(!Number.isFinite(next.samples))delete next.samples;
      else next.samples=Math.max(1,Math.min(1024,Math.round(next.samples)));
      if(!Number.isFinite(next.exposure))delete next.exposure;
      else next.exposure=Math.max(0,Math.min(32,next.exposure));
      if(next.toneMapping!==undefined&&!['none','needle-agx'].includes(next.toneMapping))throw new Error('Unknown Hydra tone mapping: '+next.toneMapping);
      const ssgi = next.ssgi ?? settings.ssgi;
      if(ssgi!==settings.ssgi){
        pipeline.dispose();
        pipeline = (ssgi ? createBeauty : createBasic)({renderer,scene,camera,settings:bloomSettings,outputColorTransform:false});
      }
      settings={...settings,...next};
      await lighting.apply({root,suppressEnvironment:!settings.environment});
      delegate.refreshMaterialXLighting();
      updateDomeBackground();
    },
    async updateLighting(){await lighting.apply({root,suppressEnvironment:!settings.environment});delegate.refreshMaterialXLighting();updateDomeBackground();},
    reset(){pipeline.reset?.();},
    render(width,height,{updateIds=true}={}) {
      renderer.setSize(width,height,false);
      colorTarget.setSize(width,height);displayTarget.setSize(width,height);
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.setRenderTarget(colorTarget);pipeline.render();renderer.setRenderTarget(null);
      if(updateIds) picking.render(width,height);
      let color = colorTarget.texture;
      if(settings.toneMapping==='needle-agx'){
        renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=settings.exposure;
        renderer.setRenderTarget(displayTarget);display.render();renderer.setRenderTarget(null);
        renderer.toneMapping=THREE.NoToneMapping;color=displayTarget.texture;
      }
      return {color,depth:picking.target.depthTexture,ids:picking.target.textures};
    },
    dispose(){pipeline.dispose();picking.dispose();lighting.dispose();colorTarget.dispose();displayTarget.dispose();display.dispose();},
  };
}
