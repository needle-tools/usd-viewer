/** Consumes an owned USDZ buffer and returns its files in a compressed ZIP. */
export function compressArchive(bytes, {onProgress, signal} = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Export cancelled', 'AbortError')); return; }
    const worker = new Worker(new URL('./archiveWorker.js', import.meta.url), {type:'module',name:'usd-zip-export'});
    let settled = false;
    const finish = (error, value) => {
      if (settled) return; settled = true;
      worker.onmessage = worker.onerror = null;
      worker.terminate(); signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve(value);
    };
    const abort = () => finish(new DOMException('Export cancelled', 'AbortError'));
    signal?.addEventListener('abort', abort, {once:true});
    worker.onmessage = ({data}) => {
      if (data.progress) { onProgress?.(data.progress); return; }
      finish(data.error ? new Error(data.error) : null, data.bytes);
    };
    worker.onerror = error => finish(new Error(error.message || 'ZIP export worker failed'));
    // Native export returns an owned ArrayBuffer, so transfer instead of copying
    // large archives onto the worker. Shared/custom buffers are cloned normally.
    try { worker.postMessage(bytes, bytes.buffer instanceof ArrayBuffer ? [bytes.buffer] : []); }
    catch (error) { finish(error); }
  });
}
