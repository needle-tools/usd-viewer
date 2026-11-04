/** Resize a packaged stage's images in isolation, retaining composition,
 * dependencies, filenames and USDZ alignment. The live USD stage is untouched. */
export function previewArchive(bytes,{maxTextureSize=512,onProgress,signal}={}) {
  if(!(maxTextureSize>0&&Number.isFinite(maxTextureSize)))throw new RangeError('Preview texture size must be positive.');
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('Export cancelled','AbortError'));return;}
    const worker=new Worker(new URL('./textureArchive.worker.js',import.meta.url),{type:'module',name:'usd-preview-textures'});
    let settled=false;
    const finish=(error,value)=>{
      if(settled)return;settled=true;worker.terminate();signal?.removeEventListener('abort',abort);
      error?reject(error):resolve(value);
    };
    const abort=()=>finish(new DOMException('Export cancelled','AbortError'));
    signal?.addEventListener('abort',abort,{once:true});
    worker.onmessage=({data})=>{if(data.progress){try{onProgress?.(data.progress);}catch(error){console.warn('Export progress callback failed:',error);}return;}finish(data.error?new Error(data.error):null,data.bytes);};
    worker.onerror=error=>finish(new Error(error.message||'Preview texture export failed'));
    try{worker.postMessage({bytes,maxTextureSize},bytes.buffer instanceof ArrayBuffer?[bytes.buffer]:[]);}catch(error){finish(error);}
  });
}
