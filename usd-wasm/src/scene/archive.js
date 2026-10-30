// OpenUSD packaging runs on a pthread; only bounded copies and callbacks run
// on the caller. Older native modules retain their existing synchronous fallback.
export async function packageStage(USD, stage, directory, driver, options = {}) {
  const report = (phase, completed = 0, total = 0) => {
    try { options.onProgress?.({phase, completed, total}); }
    catch (error) { console.warn('Export progress callback failed:', error); }
  };
  report('preparing');
  let bytes;
  try {
    if (typeof driver?.ExportUsdzAsync === 'function') {
      await new Promise((resolve, reject) => {
        const started = driver.ExportUsdzAsync(directory, resolve,
          error => reject(new Error('Could not package USD and its dependencies: ' + error)), report);
        if (!started) reject(new Error('USD export could not start while another operation is running'));
      });
      bytes = await readArchive(USD, `${directory}/stage.usdz`, report);
    } else {
      await yieldToUI();
      bytes = await legacyPackageStage(USD, stage, directory);
    }
  } finally { await removeDirectory(USD, directory); }
  report('complete', 1, 1);
  return bytes;
}

async function readArchive(USD, path, report) {
  const file = USD.FS_analyzePath(path).object;
  if (!ArrayBuffer.isView(file?.contents) || !Number.isFinite(file.usedBytes)) return USD.ReadFile(path).slice();
  const bytes = new Uint8Array(file.usedBytes), chunk = 1024 * 1024;
  report('reading', 0, bytes.length);
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    const end = Math.min(bytes.length, offset + chunk);
    bytes.set(file.contents.subarray(offset, end), offset);
    report('reading', end, bytes.length);
    await yieldToUI();
  }
  return bytes;
}

export const yieldToUI = () => globalThis.scheduler?.yield?.() || new Promise(resolve => setTimeout(resolve, 0));

async function removeDirectory(USD, path, state = {count: 0}) {
  const node = USD.FS_analyzePath(path).object;
  if (!node) return;
  for (const [name, child] of Object.entries(node.contents || {})) {
    const target = `${path}/${name}`;
    if (child.isFolder) await removeDirectory(USD, target, state);
    else USD.FS_unlink(target);
    if (++state.count % 128 === 0) await yieldToUI();
  }
  USD.FS_rmdir(path);
}

// Native localization preserves composition, variants, animation and relative
// asset paths. Exporting a flattened UsdStage would discard those authoring arcs.
async function legacyPackageStage(USD, stage, directory) {
  const root = stage.GetRootLayer();
  const output = `${directory}/stage.usdz`;
  USD.FS_createPath('', directory, true, true);
  let source = root.GetRealPath() || root.GetIdentifier();
  if (source.includes('[') || /\.usdz$/i.test(source)) {
    // UsdUtils copies existing packages verbatim, ignoring dirty inner layers.
    // Unpack into our private export directory and overlay live layers before
    // asking OpenUSD to localize and align the new package.
    const {unzipSync} = await import('three/addons/libs/fflate.module.js');
    const mounts = new Map();
    const unpack = path => {
      const start = path.indexOf('[');
      if (start < 0 && !/\.usdz$/i.test(path)) return path;
      const archive = start < 0 ? path : path.slice(0, start);
      let mount = mounts.get(archive);
      if (!mount) {
        const entries = unzipSync(USD.ReadFile(archive));
        mount = {path: `${directory}/package-${mounts.size}`, first: Object.keys(entries).find(name => !name.endsWith('/'))};
        if (!mount.first) throw new Error('Empty USD package');
        mounts.set(archive, mount);
        for (const [name, bytes] of Object.entries(entries)) {
          if (name.endsWith('/')) continue;
          if (name.startsWith('/') || name.split('/').includes('..') || name.includes('\\')) throw new Error('Unsafe package path');
          const target = `${mount.path}/${name}`, slash = target.lastIndexOf('/');
          USD.FS_createPath('', target.slice(0, slash), true, true);
          USD.FS_createDataFile('', target, bytes, true, true, true);
        }
      }
      const inner = start < 0 ? mount.first : path.slice(start + 1, -1);
      return unpack(`${mount.path}/${inner}`);
    };
    source = unpack(source);
    for (const info of stage.GetUsedLayers(true)) {
      const path = info.realPath || info.identifier;
      if (!path?.includes('[')) continue;
      const target = unpack(path);
      // OpenStage reuses the registered layer, including unsaved opinions.
      const dependency = await USD.OpenStage(info.identifier);
      try {
        if (!dependency.GetRootLayer().Export(target)) throw new Error(`Could not export layer ${info.identifier}`);
      } finally { USD.ReleaseStage(dependency); }
    }
    if (!root.Export(source)) throw new Error('Could not export package root');
  }
  if (!await USD.CreateUsdzPackage(source, output)) throw new Error('Could not package USD and its dependencies');
  // Copy out of MEMFS before cleanup or the handle's eventual disposal.
  return USD.ReadFile(output).slice();
}
