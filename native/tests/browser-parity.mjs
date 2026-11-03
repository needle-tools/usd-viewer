import * as THREE from 'three/webgpu';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {getUsdModule} from '../../usd-wasm/src/bindings/index.js';
import {createThreeHydra} from '../../usd-wasm/src/create.three.js';
import {createBeauty} from '../../usd-wasm/src/renderers/beauty.js';
import {createBasic} from '../../usd-wasm/src/renderers/basic.js';
import {createWebGpuSupport} from '../../usd-wasm/src/renderers/webGpuSupport.js';
import {createViewerLighting} from '../../public/viewer-lighting.js';

window.captureParity = async ({ssgi=true,url='/native/tests/fixtures/parity.usda'}={}) => {
  const renderer = new THREE.WebGPURenderer({antialias:false});
  await renderer.init();
  if(!renderer.backend.isWebGPUBackend)throw new Error('The parity test requires actual WebGPU');
  renderer.setPixelRatio(1);renderer.setSize(256,256);renderer.shadowMap.enabled=true;
  renderer.toneMapping=THREE.NoToneMapping;renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
  const scene=new THREE.Scene(), root=new THREE.Group();scene.add(root);
  const camera=new THREE.PerspectiveCamera(42,1,.1,100);
  camera.position.set(0,.5,8);camera.lookAt(0,.5,0);camera.updateMatrixWorld(true);
  const USD=await getUsdModule();
  const webGpuSupport=await createWebGpuSupport();
  const handle=await createThreeHydra({USD,scene:root,renderScene:scene,renderer,url,
    complexity:1,scenePrimitiveLightIntensityScale:1,webGpuSupport});
  await handle.ready();await handle.materialsReady();
  const lighting=createViewerLighting({scene,loadEnvironment:async()=>{
    const texture=await new HDRLoader().loadAsync('/environments/neutral.hdr');
    texture.mapping=THREE.EquirectangularReflectionMapping;return texture;
  }});
  await lighting.apply({root});
  const pipeline=(ssgi?createBeauty:createBasic)({renderer,scene,camera,
    settings:{bloom:false},outputColorTransform:false});
  const target=new THREE.RenderTarget(256,256,{type:THREE.HalfFloatType,depthBuffer:false});
  renderer.setRenderTarget(target);
  for(let i=0;i<(ssgi?32:1);i++) {
    await new Promise(requestAnimationFrame);
    pipeline.render();
  }
  const pixels=await renderer.readRenderTargetPixelsAsync(target,0,0,256,256);
  const geometry=[];root.traverse(object=>{
    if(object.isMesh)geometry.push({path:object.userData.usdPath,vertices:object.geometry.attributes.position.count,
      normals:Array.from(object.geometry.attributes.normal?.array?.slice(0,9)||[])});
  });
  const result={pixels:Array.from(new Uint16Array(pixels.buffer,pixels.byteOffset,pixels.byteLength/2)),
    diagnostics:handle.diagnostics(),geometry};
  pipeline.dispose();target.dispose();lighting.dispose();await handle.dispose();renderer.dispose();
  return result;
};
