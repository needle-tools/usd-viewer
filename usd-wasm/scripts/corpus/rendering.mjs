export const capturePolicy='hardware-high-performance-v1';
export function captureBrowserArgs(platform){
 return ['--force-high-performance-gpu',...(platform==='win32'?['--use-angle=d3d11']:[])];
}
export function requireHardwareRenderer(renderer,expectedVendor){
 if(typeof renderer!=='string'||!renderer)throw Object.assign(Error('Hardware rendering required; selected renderer: '+(renderer??'')),{code:'GPU_CONTEXT_UNAVAILABLE'});
 if(/swiftshader|llvmpipe|softpipe|software|basic render|\bwarp\b/i.test(renderer))throw Object.assign(Error('Hardware rendering required; selected renderer: '+renderer),{code:'GPU_SOFTWARE_RENDERER'});
 if(expectedVendor&&!renderer.toLowerCase().includes(expectedVendor.toLowerCase()))throw Object.assign(Error('Expected '+expectedVendor+' GPU; selected renderer: '+renderer),{code:'GPU_VENDOR_MISMATCH'});
 return renderer;
}
export function hardwareCapture(report,expectedVendor){
 if(report?.capturePolicy!==capturePolicy)return false;
 try{requireHardwareRenderer(report.renderer,expectedVendor);return true;}catch{return false;}
}
// Initialize the GPU before navigating into the isolated shared-WASM document.
// On Windows, a first WebGL context in that document can fail during ANGLE startup.
export async function prepareHardwareCapture(page,expectedVendor){
 const renderer=await page.evaluate(async()=>{
  for(let attempt=0;attempt<16;attempt++){
   const canvas=document.createElement('canvas');document.body.appendChild(canvas);
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const gl=canvas.getContext('webgl2',{powerPreference:'high-performance'});
   if(gl){const debug=gl.getExtension('WEBGL_debug_renderer_info');return debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'';}
   canvas.remove();
  }
  return '';
 });
 return requireHardwareRenderer(renderer,expectedVendor);
}
