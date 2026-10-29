/** Execute a curated API fixture without modifying the viewer's native module. */
export function runApiExample(id, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const worker = new Worker('/test-fixtures/api/worker.js', { type: 'module', name: 'usd-api-example' });
    const finish = (error, result) => {
      worker.terminate(); clearTimeout(timeout); signal.removeEventListener('abort', abort);
      error ? reject(error) : resolve(result);
    };
    const abort = () => finish(signal.reason || new DOMException('Example cancelled', 'AbortError'));
    const timeout = setTimeout(() => finish(new Error('API example timed out.')), 60_000);
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => finish(data.error ? new Error(data.error) : null, data.result);
    worker.onerror = event => finish(new Error(event.message || 'API example worker failed.'));
    worker.postMessage(id);
  });
}
