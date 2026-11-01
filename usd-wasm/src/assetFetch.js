/** Fetch bytes while reporting transfers whose Content-Length may be unknown. */
export async function fetchAsset(url, onProgress, options) {
  const report = detail => {
    try { onProgress?.({url, ...detail}); }
    catch (error) { console.warn('USD download progress callback failed', error); }
  };
  let loaded = 0, total = 0;
  report({state:'start', loaded, total});
  try {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    total = Number(response.headers.get('content-length')) || 0;
    const chunks = [];
    if (response.body) {
      const reader = response.body.getReader();
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        chunks.push(value); loaded += value.byteLength;
        report({state:'progress', loaded, total});
      }
    } else {
      const bytes = new Uint8Array(await response.arrayBuffer());
      chunks.push(bytes); loaded = bytes.byteLength;
    }
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    report({state:'done', loaded, total:loaded});
    return bytes;
  } catch (error) {
    report({state:'error', loaded, total, error:String(error?.message || error)});
    throw error;
  }
}
