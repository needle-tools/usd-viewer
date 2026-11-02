import {pngSize} from './pngDownsample.js';

/** Per-registry worker: oversized PNGs never allocate a full decoded bitmap. */
export function createPngDownsampler() {
  let worker,serial=0,disposed=false;const pending=new Map();
  const fail=error=>{for(const task of pending.values())task.reject(error);pending.clear();worker?.terminate();worker=null;};
  return {
    needed(bytes,limit){const size=limit>0&&pngSize(bytes);return size&&Math.max(size.width,size.height)>limit;},
    decode(bytes,limit){
      if(disposed)return Promise.reject(new Error('Texture decoder disposed'));
      if(!worker){worker=new Worker(new URL('./pngDownsample.worker.js',import.meta.url),{type:'module'});
        worker.onmessage=({data})=>{const task=pending.get(data.id);if(!task)return;pending.delete(data.id);if(data.error)task.reject(new Error(data.error));else task.resolve(data.result);};
        worker.onerror=event=>{event.preventDefault();fail(new Error(event.message||'PNG texture worker failed'));};
      }
      return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});worker.postMessage({id,bytes,limit},[bytes.buffer]);});
    },
    dispose(){disposed=true;fail(new Error('Texture decoder disposed'));},
  };
}
