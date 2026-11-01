import {readStageAsset, stageResources} from './usd/scene/sources.js';
import {createStageSourcePaths} from './usd/scene/source-paths.js';

/** File inventory for Code. Inspecting a file never changes the stage root.
 * Keep original files/URLs on the descriptors for a future explicit root-open action. */
export function createSourceFiles({files = [], asset, handle, usd}) {
  const entries = new Map();
  const sourcePaths = handle?.sourcePaths;
  const uploadPaths = files.length ? createStageSourcePaths('/' + (files[0].path || files[0].name).replace(/^\/+/, '')) : null;
  const add = entry => { if (entry.path && !entries.has(entry.path)) entries.set(entry.path, entry); };
  for (const file of files) add({path:uploadPaths.path('/' + (file.path || file.name).replace(/^\/+/, '')), file, size:file.size});
  for (const path of asset?.files || []) {
    const url = new URL('/test-fixtures/' + path, location.href).href;
    add({path:uploadPaths ? uploadPaths.path('/' + path.replace(/^\/+/, '')) : sourcePaths ? sourcePaths.path(url) : path, url});
  }
  if (asset?.executable) for (const name of ['scene-helpers.js','pxr.js','execute.js','create-api-stage.js','worker.js']) {
    const url = new URL('/test-fixtures/api/' + name, location.href).href;
    add({path:uploadPaths ? uploadPaths.path('/api/' + name) : sourcePaths ? sourcePaths.path(url) : 'api/' + name, url});
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
    if (includeResources && handle) for (const path of stageResources(handle.scene, sourcePaths)) {
      if (!current.has(path)) current.set(path,{path});
    }
    return [...current.values()].map(describe);
  };
  // Explicit source navigation can request a dependency not yet loaded by Hydra.
  getFiles.resolve=identifier=>{const path=sourcePaths ? sourcePaths.path(identifier) : identifier;
    const entry={path,identifier:path,...(/^https?:\/\//i.test(identifier)?{url:identifier}:{})};add(entry);return describe(entry);};
  return getFiles;
}
