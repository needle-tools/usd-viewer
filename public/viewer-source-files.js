import {readStageAsset, stageResources} from './usd/scene/sources.js';

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
  async function read(entry, signal) {
    signal?.throwIfAborted();
    if (entry.file) return entry.file;
    const path = entry.url || entry.path;
    if (handle) return new Blob([await readStageAsset(handle, usd, path, {signal})]);
    // Catalog examples can be inspected before they create a USD stage.
    if (!entry.url) throw new Error(`File is unavailable: ${entry.path}`);
    const response = await fetch(entry.url, {signal});
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${entry.path}`);
    return response.blob();
  }
  const describe=entry=>({...entry, read:signal=>read(entry,signal),canOpenAsRoot:/\.(?:usd[acz]?|usdz)(?:[?#]|$)/i.test(entry.path)});
  const getFiles=({includeResources = true} = {}) => {
    const current = new Map(entries);
    if (includeResources && handle) for (const path of stageResources(handle.scene)) {
      if (!current.has(path)) current.set(path,{path});
    }
    return [...current.values()].map(describe);
  };
  // Explicit source navigation can request a dependency not yet loaded by Hydra.
  getFiles.resolve=path=>{const entry={path,identifier:path,...(/^https?:\/\//i.test(path)?{url:path}:{})};add(entry);return describe(entry);};
  return getFiles;
}
