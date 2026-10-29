import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Independent oracle: the installed Needle Engine's original GLSL, not a second
// handwritten implementation of the new TSL port.
const source = readFileSync(new URL('../../../node_modules/@needle-tools/engine/src/engine/engine_tonemapping.ts', import.meta.url), 'utf8');
// patchAGX replaces through `return color;`, keeping Three's closing brace.
const reference = source.match(/const agxToneMapping = `([\s\S]*?)`;/)![1] + '\n}';
for (const forceWebGL of [true, false]) test(`Needle AgX matches original GLSL through ${forceWebGL?'WebGL fallback':'WebGPU'}`, async ({page}) => {
  const errors: string[]=[]; page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('/?viewer=three');
  const result = await page.evaluate(async ({reference,forceWebGL}) => {
    const THREE = await import('three'), GPU = await import('three/webgpu'), TSL = await import('three/tsl');
    const {configureNeedleAgx,needleAgxToneMapping} = await import('/usd/renderers/needleAgx.js');
    const classic = new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
    const renderer = new GPU.WebGPURenderer({forceWebGL,antialias:false});
    for(const r of [classic,renderer]){r.setSize(8,8);r.outputColorSpace=THREE.SRGBColorSpace;r.toneMapping=THREE.AgXToneMapping;}
    configureNeedleAgx(renderer);await renderer.init();
    const uniform=TSL.uniform(new THREE.Vector3());
    const material=new GPU.MeshBasicNodeMaterial();material.colorNode=uniform;
    const referenceMaterial=new THREE.ShaderMaterial({
      uniforms:{testColor:{value:new THREE.Vector3()},toneMappingExposure:{value:1}},
      vertexShader:'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
      fragmentShader:`uniform vec3 testColor; uniform float toneMappingExposure;\n${reference}\nvoid main(){gl_FragColor=vec4(AgXToneMapping(testColor),1.0);\n#include <colorspace_fragment>\n}`,
      toneMapped:false,
    });
    const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=1;
    const geometry=new THREE.PlaneGeometry(2,2), a=new THREE.Scene(),b=new THREE.Scene();
    a.add(new THREE.Mesh(geometry,referenceMaterial));b.add(new THREE.Mesh(geometry,material));
    const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;const ctx=canvas.getContext('2d')!;
    function pixel(r:any){ctx.clearRect(0,0,8,8);ctx.drawImage(r.domElement,0,0);return Array.from(ctx.getImageData(4,4,1,1).data).slice(0,3);}
    const colors=[[0,0,0],[-1,-.2,0],[.001,.001,.001],[.005,.02,.1],[.18,.18,.18],[.5,.5,.5],[1,1,1],[10,10,10],[1,.01,.01],[.01,1,.01],[.01,.01,1],[12,2,.2],[.2,8,3],[20,.2,8]];
    const presentation=new GPU.RenderPipeline(renderer,TSL.renderOutput(
      TSL.toneMapping(THREE.AgXToneMapping,TSL.toneMappingExposure,TSL.vec4(uniform,1)),
      THREE.NoToneMapping,THREE.SRGBColorSpace));
    presentation.outputColorTransform=false;
    const rows=[];
    for(const exposure of [.25,1,3])for(const color of colors){
      uniform.value.fromArray(color);referenceMaterial.uniforms.testColor.value.fromArray(color);
      referenceMaterial.uniforms.toneMappingExposure.value=exposure;renderer.toneMappingExposure=exposure;
      classic.render(a,camera);const expected=pixel(classic);
      await renderer.renderAsync(b,camera);await new Promise(requestAnimationFrame);
      const actual=pixel(renderer);
      presentation.render();await new Promise(requestAnimationFrame);const presented=pixel(renderer);
      rows.push({color,exposure,expected,actual,presented,error:Math.max(...[actual,presented].flatMap(rgb=>rgb.map((v,i)=>Math.abs(v-expected[i]))))});
    }
    const mapped=renderer.library.getToneMappingFunction(THREE.AgXToneMapping)===needleAgxToneMapping;
    presentation.dispose();geometry.dispose();material.dispose();referenceMaterial.dispose();classic.dispose();renderer.dispose();
    return {rows,mapped,backend:renderer.backend.isWebGPUBackend?'webgpu':'webgl'};
  },{reference,forceWebGL});
  expect(errors).toEqual([]);
  expect(result.backend).toBe(forceWebGL?'webgl':'webgpu');
  expect(result.mapped).toBe(true);
  for(const row of result.rows)expect(row.error,JSON.stringify(row)).toBeLessThanOrEqual(2);
  expect(result.rows.some(row=>row.actual.some(channel=>channel>100))).toBe(true);
  console.log(result.backend,'Needle AgX max byte error',Math.max(...result.rows.map(row=>row.error)));
});

test('MuTracer HDR display pass matches Needle GLSL without clipping its input',async({page})=>{
  await page.goto('/?viewer=three');
  const result=await page.evaluate(async reference=>{
    const T=await import('three'), {configureNeedleAgxDisplay}=await import('/usd/renderers/index.js');
    const adapter=await navigator.gpu.requestAdapter(),device=await adapter!.requestDevice();
    device.pushErrorScope('validation');
    let displayPass:any;let disposed=false;
    const engine={backend:'webgpu',device,display:{hdrOutputEnabled:false,toneMapping:'agx',addPostProcess(fn:any){displayPass=fn;return()=>{disposed=true;};}}};
    const dispose=configureNeedleAgxDisplay(engine);
    const colors=[[0,0,0],[.001,.001,.001],[.005,.02,.1],[.18,.18,.18],[1,1,1],[10,10,10],[1,.01,.01],[.01,1,.01],[.01,.01,1],[12,2,.2],[.2,8,3],[20,.2,8]];
    const rows=[.25,1,3].flatMap(exposure=>colors.map(color=>({color,exposure})));
    const width=rows.length,bytesPerRow=512;
    const input=device.createTexture({size:[width,1],format:'rgba16float',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
    const output=device.createTexture({size:[width,1],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
    const data=new Float16Array(width*4);
    const encode=(v:number)=>v<=.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-.055;
    rows.forEach(({color,exposure},i)=>{for(let j=0;j<3;j++)data[i*4+j]=encode(color[j]*exposure);data[i*4+3]=1;});
    device.queue.writeTexture({texture:input},data,{bytesPerRow:width*8},{width,height:1});
    const buffer=device.createBuffer({size:bytesPerRow,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    const encoder=device.createCommandEncoder();displayPass({device,encoder,input,output});
    encoder.copyTextureToBuffer({texture:output},{buffer,bytesPerRow},{width,height:1});device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);const actual=[...new Uint8Array(buffer.getMappedRange())];buffer.unmap();
    const renderer=new T.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(1,1);renderer.outputColorSpace=T.SRGBColorSpace;
    const material=new T.ShaderMaterial({uniforms:{testColor:{value:new T.Vector3()},toneMappingExposure:{value:1}},vertexShader:'void main(){gl_Position=vec4(position.xy,0,1);}',fragmentShader:`uniform vec3 testColor;uniform float toneMappingExposure;\n${reference}\nvoid main(){gl_FragColor=vec4(AgXToneMapping(testColor),1);\n#include <colorspace_fragment>\n}`,toneMapped:false});
    const scene=new T.Scene(),geometry=new T.PlaneGeometry(2,2);scene.add(new T.Mesh(geometry,material));const camera=new T.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=1;
    const gl=renderer.getContext(),pixel=new Uint8Array(4);
    const results=rows.map(({color,exposure},i)=>{material.uniforms.testColor.value.fromArray(color);material.uniforms.toneMappingExposure.value=exposure;renderer.render(scene,camera);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);const rgb=actual.slice(i*4,i*4+3),expected=[...pixel].slice(0,3);return{color,exposure,rgb,expected,error:Math.max(...rgb.map((v,j)=>Math.abs(v-expected[j])))};});
    dispose();const validation=await device.popErrorScope();input.destroy();output.destroy();buffer.destroy();renderer.dispose();material.dispose();geometry.dispose();device.destroy();
    return{results,disposed,validation:validation?.message,hdr:engine.display.hdrOutputEnabled,tone:engine.display.toneMapping};
  },reference);
  expect(result.validation).toBeUndefined();expect(result.disposed).toBe(true);expect(result.hdr).toBe(true);expect(result.tone).toBe('linear');
  for(const row of result.results)expect(row.error,JSON.stringify(row)).toBeLessThanOrEqual(2);
  console.log('MuTracer Needle AgX max byte error',Math.max(...result.results.map(row=>row.error)));
});
