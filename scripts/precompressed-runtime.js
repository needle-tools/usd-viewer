const {stat} = require('node:fs/promises');
const {join} = require('node:path');

// Development can replace a runtime before its HTTP sidecars are regenerated.
// Serve the new original in that case, never an older compressed runtime.
function runtimeCompressionGuard(bindingsDirectory) {
  return async request => {
    let pathname;
    try { pathname = decodeURIComponent(request.url.split('?')[0]); } catch { return; }
    const match = /^\/usd\/bindings\/(emHdBindings(?:\.jspi)?\.(?:js|wasm))$/.exec(pathname);
    if (!match) return;
    try {
      const file = join(bindingsDirectory, match[1]);
      const [source, br, gzip] = await Promise.all([stat(file), stat(file + '.br'), stat(file + '.gz')]);
      if (br.mtimeMs >= source.mtimeMs && gzip.mtimeMs >= source.mtimeMs) return;
    } catch { /* Missing sidecars fall back to the current original. */ }
    request.headers['accept-encoding'] = 'identity';
  };
}

module.exports = {runtimeCompressionGuard};
