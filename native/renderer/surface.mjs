// Share one GPU device with Three. Only this atlas canvas enters Chromium's
// compositor; Three's logical render size remains the host AOV size.
const shader = `
struct Parameters { width:u32, height:u32, serial:u32, sample:u32, converged:u32, ids:u32, unused0:u32, unused1:u32, nearClip:f32, depthScale:f32, orthographic:u32, unused3:u32 }
@group(0) @binding(0) var color:texture_2d<f32>;
@group(0) @binding(1) var depth:texture_depth_2d;
@group(0) @binding(2) var prim:texture_2d<i32>;
@group(0) @binding(3) var instance:texture_2d<i32>;
@group(0) @binding(4) var element:texture_2d<i32>;
@group(0) @binding(5) var<uniform> parameters:Parameters;
@vertex fn vertexMain(@builtin(vertex_index) index:u32) -> @builtin(position) vec4f {
  let p=vec2f(f32((index<<1)&2), f32(index&2));return vec4f(p*2.-1.,0.,1.);
}
// Leave a precision margin for the compositor's F16 color operations. A
// linear HDR canvas preserves 8-bit binary fractions per RGB channel. Four
// low-24-bit payloads share their high bytes in two additional GPU planes.
fn pack(value:u32) -> vec4f {
  return vec4f(f32(value&255u)/256.,f32((value>>8u)&255u)/256.,f32((value>>16u)&255u)/256.,1.);
}
@fragment fn fragmentMain(@builtin(position) position:vec4f) -> @location(0) vec4f {
  let p=vec2u(position.xy);
  if(p.y>=parameters.height*2u){
    let code=(p.y-parameters.height*2u)*parameters.width*4u+p.x;
    if(parameters.unused0!=0u && code>=8u && code<1032u){
      let n=code-8u;let v=n&255u;
      return pack(v|((v^170u^((n>>8u)*37u))<<8u)|(((n*73u)&255u)<<16u));
    }
    let field=p.x/2u;
    var word=0u;
    if(field==0u){word=parameters.serial;}
    if(field==1u){word=parameters.sample;}
    if(field==2u){word=parameters.converged;}
    if(field==3u){word=0x4e484447u;}
    return pack(select(word,word>>24u,(p.x&1u)!=0u));
  }
  let q=vec2i(p%vec2u(parameters.width,parameters.height));
  let tile=p/vec2u(parameters.width,parameters.height);
  if(tile.y==0u && tile.x==0u){return textureLoad(color,q,0);}
  let d=bitcast<u32>(textureLoad(depth,q,0));
  let a=bitcast<u32>(textureLoad(prim,q,0).r);
  let b=bitcast<u32>(textureLoad(instance,q,0).r);
  let c=bitcast<u32>(textureLoad(element,q,0).r);
  let z=bitcast<f32>(d);
  let distance=select(parameters.nearClip/((1.-z)+parameters.depthScale*z),
    parameters.nearClip+parameters.depthScale*z,parameters.orthographic!=0u);
  let linear=bitcast<u32>(select(0.,distance,z<1.));
  if(tile.y==0u && tile.x==1u){return pack(d);}
  if(tile.y==0u && tile.x==2u){return pack(a);}
  if(tile.y==0u && tile.x==3u){return pack(b);}
  if(tile.y==1u && tile.x==0u){return pack(c);}
  if(tile.x==1u){return pack((d>>24u)|((a>>24u)<<8u)|((b>>24u)<<16u));}
  if(tile.x==2u){return pack((c>>24u)|((linear>>24u)<<8u));}
  return pack(linear);
}
`;

export function createSurface(renderer) {
  const device = renderer.backend.device;
  const canvas = document.createElement('canvas'); document.body.append(canvas);
  const context = canvas.getContext('webgpu');
  context.configure({device,format:'rgba16float',alphaMode:'opaque',colorSpace:'srgb-linear',toneMapping:{mode:'extended'}});
  const module = device.createShaderModule({code:shader});
  const pipeline = device.createRenderPipeline({layout:'auto',vertex:{module,entryPoint:'vertexMain'},
    fragment:{module,entryPoint:'fragmentMain',targets:[{format:'rgba16float'}]},primitive:{topology:'triangle-list'}});
  const parameters = device.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  return {
    canvas,
    render(color, depth, ids, {width,height,serial,sample,converged,projection,validate=false}) {
      const tileWidth=Math.max(4,width);
      if(canvas.width!==tileWidth*4) canvas.width=tileWidth*4;
      if(canvas.height!==height*2+2) canvas.height=height*2+2;
      const data=new ArrayBuffer(48);
      new Uint32Array(data).set([tileWidth,height,serial,sample,Number(converged),1,Number(validate),0]);
      const a=projection?.[10]??-1,b=projection?.[14]??-.2,orthographic=Math.abs(projection?.[15]??0)>.5;
      new Float32Array(data).set([orthographic?(b+1)/a:b/(a-1),orthographic?-2/a:(a+1)/(a-1)],8);
      new Uint32Array(data)[10]=Number(orthographic);
      device.queue.writeBuffer(parameters,0,data);
      const textures=[color,depth,...ids].map(texture => renderer.backend.get(texture).texture.createView());
      const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
        ...textures.map((resource,binding)=>({binding,resource})),{binding:5,resource:{buffer:parameters}}]});
      const encoder=device.createCommandEncoder();
      const pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});
      pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.draw(3);pass.end();device.queue.submit([encoder.finish()]);
    },
    dispose(){parameters.destroy();context.unconfigure();canvas.remove();},
  };
}
