import * as THREE from 'three/webgpu';
import {createViewport} from '../renderer/viewport.mjs';

// Exercise the production Beauty/SSGI/TRAA graph without inspecting or replacing
// Three's history. Readback is confined to this pixel regression.
window.testTemporalAccumulation = async () => {
  const renderer = new THREE.WebGPURenderer({antialias:false});
  await renderer.init();
  if(!renderer.backend.isWebGPUBackend)throw new Error('The temporal regression requires actual WebGPU');
  renderer.setPixelRatio(1);
  const viewport = await createViewport(renderer, () => {});
  await viewport.configure({toneMapping:'none'});
  const add = (geometry,color,position) => {
    const mesh = new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.8}));
    mesh.position.set(...position);viewport.scene.add(mesh);return mesh;
  };
  add(new THREE.BoxGeometry(6,.1,4),0xaaaaaa,[0,-1.05,0]);
  add(new THREE.BoxGeometry(6,3.5,.1),0xaaaaaa,[0,.75,-1.5]);
  const red = add(new THREE.BoxGeometry(1.3,1.3,1.3),0xcc1206,[-1,-.35,0]);
  add(new THREE.SphereGeometry(.65,32,16),0x159916,[1,-.35,0]);
  const source = new THREE.PerspectiveCamera(42,1,.1,100);
  source.position.set(0,.5,8);source.lookAt(0,.5,0);source.updateMatrixWorld();
  viewport.camera.setHydraMatrices(source.matrixWorldInverse.elements,source.projectionMatrix.elements);
  const projection = viewport.camera.projectionMatrix.elements.slice();
  const target = new THREE.RenderTarget(256,256,{type:THREE.HalfFloatType,depthBuffer:false});
  async function capture(width=256,height=256) {
    target.setSize(width,height);
    renderer.initRenderTarget(target);
    const attachments = viewport.render(width,height,{updateIds:false});
    renderer.copyTextureToTexture(attachments.color,target.texture);
    const half = await renderer.readRenderTargetPixelsAsync(target,0,0,width,height);
    return Float32Array.from(half,THREE.DataUtils.fromHalfFloat);
  }
  function metrics(pixels) {
    let mean=0,squares=0,count=0;
    for(let i=0;i<pixels.length;i+=4)mean+=pixels[i]+pixels[i+1]+pixels[i+2];
    // Laplacian energy on a flat wall patch measures grain independently of the
    // image's lighting gradient. The patch excludes silhouette and shadow edges.
    for(let y=96;y<124;y++)for(let x=113;x<144;x++)for(let c=0;c<3;c++) {
      const i=(y*256+x)*4+c;
      const high=4*pixels[i]-pixels[i+4]-pixels[i-4]-pixels[i+1024]-pixels[i-1024];
      squares+=high*high;count++;
    }
    return {mean:mean/(pixels.length/4*3),grain:Math.sqrt(squares/count)};
  }
  const frames=[];
  try {
    for(let sample=1;sample<=128;sample++) {
      await new Promise(requestAnimationFrame);
      if([1,8,32,128].includes(sample))frames.push({sample,...metrics(await capture())});
      else viewport.render(256,256,{updateIds:false});
      if(!projection.every((v,i)=>v===viewport.camera.projectionMatrix.elements[i]))throw new Error('TRAA changed the host projection');
    }
    red.material.color.set(0x1244dd);viewport.reset();
    await new Promise(requestAnimationFrame);
    const reset=metrics(await capture());
    await new Promise(requestAnimationFrame);
    const resized=await capture(192,128);
    return {frames,reset,resizedMean:resized.reduce((sum,v,i)=>sum+(i%4===3?0:v),0)/(192*128*3)};
  } finally {
    viewport.scene.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
    viewport.dispose();target.dispose();renderer.dispose();
  }
};
