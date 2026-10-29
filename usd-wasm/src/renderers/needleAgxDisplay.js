// Needle AgX from @needle-tools/engine engine_tonemapping.ts.
// MuTracer's documented display pass receives encoded RGBA. Extended output
// retains HDR values before our transform, including the completed denoiser.
import { AgXToneMapping, NoToneMapping, LinearToneMapping, ReinhardToneMapping, ACESFilmicToneMapping, NeutralToneMapping } from 'three';
const shader = /* wgsl */`
@group(0) @binding(0) var image: texture_2d<f32>;
fn decode(c: vec3f) -> vec3f {
  return select(pow((c + 0.055) / 1.055, vec3f(2.4)), c / 12.92, c <= vec3f(0.04045));
}
fn encode(c: vec3f) -> vec3f {
  return select(1.055 * pow(max(c, vec3f(0)), vec3f(1.0/2.4)) - 0.055, c * 12.92, c <= vec3f(0.0031308));
}
fn needleAgx(input: vec3f) -> vec3f {
  let inset = mat3x3f(
    0.842479062253094, 0.0423282422610123, 0.0423756549057051,
    0.0784335999999992, 0.878468636469772, 0.0784336,
    0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  let outset = mat3x3f(
    1.19687900512017, -0.0528968517574562, -0.0529716355144438,
    -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
    -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  let x = (clamp(log2(inset * max(input, vec3f(0.001))), vec3f(-12.47393), vec3f(4.026069)) + 12.47393) / 16.499999;
  let x2 = x*x; let x4 = x2*x2;
  var color = 15.5*x4*x2 - 40.14*x4*x + 31.96*x4 - 6.868*x2*x + 0.4298*x2 + 0.1191*x - 0.00232;
  let luma = dot(color, vec3f(0.2126,0.7152,0.0722));
  color = pow(color * 1.05, vec3f(1.10));
  color = vec3f(luma) + 1.15*(color-vec3f(luma));
  return pow(outset * color, vec3f(2.2));
}
// Three's ACES Filmic and Khronos PBR Neutral, operating after exposure.
fn aces(input:vec3f) -> vec3f {
  let inset=mat3x3f(0.59719,0.07600,0.02840, 0.35458,0.90834,0.13383, 0.04823,0.01566,0.83777);
  let outset=mat3x3f(1.60475,-0.10208,-0.00327, -0.53108,1.10813,-0.07276, -0.07367,-0.00605,1.07602);
  let v=inset*(input/0.6);
  let a=v*(v+0.0245786)-0.000090537;
  let b=v*(0.983729*v+0.4329510)+0.238081;
  return clamp(outset*(a/b),vec3f(0),vec3f(1));
}
fn neutral(input:vec3f) -> vec3f {
  let x=min(input.r,min(input.g,input.b));
  let offset=select(0.04,x-6.25*x*x,x<0.08);
  var color=input-vec3f(offset);
  let peak=max(color.r,max(color.g,color.b));
  if(peak<0.76){return color;}
  let newPeak=1.0-0.24*0.24/(peak+0.24-0.76);
  color*=newPeak/peak;
  let g=1.0-1.0/(0.15*(peak-newPeak)+1.0);
  return mix(color,vec3f(newPeak),g);
}
@vertex fn vertex(@builtin(vertex_index) index:u32) -> @builtin(position) vec4f {
  let x=f32((index<<1u)&2u); let y=f32(index&2u);
  return vec4f(x*2.0-1.0,1.0-y*2.0,0.0,1.0);
}
@fragment fn fragment(@builtin(position) position:vec4f) -> @location(0) vec4f {
  let pixel=textureLoad(image,vec2i(position.xy),0);
  return vec4f(encode(needleAgx(decode(pixel.rgb))),pixel.a);
}`;

/** Configure the Needle display transform through MuTracer's public GPU display-pass API. */
export function configureNeedleAgxDisplay(engine, getToneMapping = () => AgXToneMapping) {
  if (engine.backend !== 'webgpu' || !engine.device) throw new Error('MuTracer with Needle AgX requires WebGPU.');
  // MuTracer uses the same canvas capability probe to retain unclipped HDR data.
  const probe = document.createElement('canvas').getContext('webgpu');
  try {
    probe?.configure({device:engine.device,format:'rgba16float',alphaMode:'premultiplied',colorSpace:'srgb',toneMapping:{mode:'extended'}});
    if (probe?.getConfiguration()?.toneMapping?.mode !== 'extended') throw new Error('MuTracer with Needle AgX requires extended WebGPU output.');
  } finally {probe?.unconfigure();}
  engine.display.hdrOutputEnabled = true;
  engine.display.toneMapping = 'linear';
  const pipelines = new WeakMap();
  return engine.display.addPostProcess(({device,encoder,input,output}) => {
    if (input.format !== 'rgba16float') throw new Error('Needle AgX requires an HDR display image.');
    let devicePipelines = pipelines.get(device);
    if (!devicePipelines) { devicePipelines = new Map(); pipelines.set(device, devicePipelines); }
    const mode = getToneMapping();
    let pipeline = devicePipelines.get(mode);
    if (!pipeline) {
      const transforms = new Map([[AgXToneMapping,'needleAgx(decode(pixel.rgb))'],[ACESFilmicToneMapping,'aces(decode(pixel.rgb))'],[NeutralToneMapping,'neutral(decode(pixel.rgb))'],[NoToneMapping,'decode(pixel.rgb)'],[LinearToneMapping,'clamp(decode(pixel.rgb),vec3f(0),vec3f(1))'],[ReinhardToneMapping,'clamp(decode(pixel.rgb)/(vec3f(1)+decode(pixel.rgb)),vec3f(0),vec3f(1))']]);
      if (!transforms.has(mode)) throw new Error('Unsupported MuTracer display transform.');
      const code = shader.replace('needleAgx(decode(pixel.rgb))',transforms.get(mode));
      const module = device.createShaderModule({label:'Viewer display transform',code});
      pipeline = device.createRenderPipeline({label:'Needle AgX display',layout:'auto',vertex:{module,entryPoint:'vertex'},fragment:{module,entryPoint:'fragment',targets:[{format:output.format}]},primitive:{topology:'triangle-list'}});
      devicePipelines.set(mode,pipeline);
    }
    const bindings = device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:input.createView()}]});
    const pass = encoder.beginRenderPass({colorAttachments:[{view:output.createView(),loadOp:'clear',clearValue:{r:0,g:0,b:0,a:0},storeOp:'store'}]});
    pass.setPipeline(pipeline);pass.setBindGroup(0,bindings);pass.draw(3);pass.end();
  });
}
