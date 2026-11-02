/** A worker belongs to the currently inspected document, never to a stage cache. */
export function createSourceReader() {
  const worker=new Worker(new URL('./viewer-code-data.worker.js',import.meta.url),{type:'module'});
  const pending=new Map();let serial=0,disposed=false;
  const fail=error=>{for(const task of pending.values())task.reject(error);pending.clear();};
  worker.onmessage=({data})=>{const task=pending.get(data.id);if(!task)return;pending.delete(data.id);if(data.error)task.reject(new Error(data.error));else task.resolve(data.result);};
  worker.onerror=event=>{event.preventDefault();disposed=true;worker.terminate();fail(new Error(event.message||'Source reader failed.'));};
  return {
    request(op,data={},transfer=[]){if(disposed)return Promise.reject(new Error('Source reader disposed.'));return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});try{worker.postMessage({id,op,...data},transfer);}catch(error){pending.delete(id);reject(error);}});},
    dispose(){if(disposed)return;disposed=true;worker.terminate();fail(new Error('Source reader disposed.'));},
  };
}
