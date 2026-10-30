/** File inventory for Code. Inspecting a file never changes the stage root.
 * Keep original files/URLs on the descriptors for a future explicit root-open action. */
export function createSourceFiles({files = [], asset, handle, usd}) {
  const entries = new Map();
  const add = entry => { if (entry.path && !entries.has(entry.path)) entries.set(entry.path, entry); };
  for (const file of files) add({path:file.path || file.name, file, size:file.size});
  for (const path of asset?.files || []) add({path, url:new URL('/test-fixtures/' + path, location.href).href});
  if (asset?.executable) for (const name of ['scene-helpers.js','pxr.js','execute.js','create-api-stage.js','worker.js']) {
    add({path:'api/' + name, url:new URL('/test-fixtures/api/' + name, location.href).href});
  }
  // Preserve local relative folder paths; HTTP resolver IDs are translated back
  // to source URLs before reading, never handed to synchronous USD.ReadFile.
  function urlFor(path) {
    if (/^https?:\/\//i.test(path)) return path;
    try { const url = handle?.driver?.resolveAssetUrl?.(path); if (/^https?:\/\//i.test(url)) return url; } catch {}
    return '';
  }
  let readQueue = Promise.resolve();
  async function read(entry, signal) {
    signal?.throwIfAborted();
    if (entry.file) return entry.file;
    const url = entry.url || urlFor(entry.path);
    if (url) {
      const response = await fetch(url, {signal});
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${entry.path}`);
      return response.blob();
    }
    const pending = readQueue.catch(() => {}).then(async () => {
      await handle?.materialsReady(); signal?.throwIfAborted();
      // Local mounted files have no resolver/network work to do.
      const node = usd?.FS_analyzePath(entry.path);
      if (node?.exists && !node.object.isFolder) return new Blob([usd.FS_readFile(entry.path)]);
      return new Promise((resolve,reject) => handle.driver.getFile(entry.path, bytes => bytes
        ? resolve(new Blob([bytes])) : reject(new Error(`File is unavailable: ${entry.path}`))));
    });
    readQueue = pending; const blob = await pending; signal?.throwIfAborted(); return blob;
  }
  const describe=entry=>({...entry, read:signal=>read(entry,signal),canOpenAsRoot:/\.(?:usd[acz]?|usdz)(?:[?#]|$)/i.test(entry.path)});
  const getFiles=({includeResources = true} = {}) => {
    const current = new Map(entries);
    if (includeResources) handle?.scene.traverse(object => {
      for (const material of [object.material].flat()) if (material) for (const value of Object.values(material)) {
        if (!value?.isTexture || !value.name || value.name.startsWith('blob:')) continue;
        const path = value.name, url = urlFor(path);
        if (!current.has(path)) current.set(path,{path,url});
      }
    });
    return [...current.values()].map(describe);
  };
  // Explicit source navigation can request a dependency not yet loaded by Hydra.
  getFiles.resolve=path=>{const entry={path,identifier:path,url:urlFor(path)};add(entry);return describe(entry);};
  return getFiles;
}
