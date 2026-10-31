function assertCurrent({ signal, isCurrent } = {}) {
  signal?.throwIfAborted();
  if (isCurrent && !isCurrent()) throw new Error('USD stage is no longer current.');
}

const copyBytes = bytes => ArrayBuffer.isView(bytes)
  ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength).slice()
  : new Uint8Array(bytes).slice();

function isPackageMember(path) {
  // Examine only the path component of HTTP URLs: IPv6 authorities and query
  // parameters can contain ordinary brackets. Encoded brackets remain literal
  // filename characters, not USD package delimiters.
  const pathname = /^https?:\/\//i.test(path) ? new URL(path).pathname : path;
  const start = /\.usdz\[/i.exec(pathname);
  if (!start || !pathname.endsWith(']')) return false;
  let depth = 0;
  for (let i = start.index + start[0].length - 1; i < pathname.length; i++) {
    if (pathname[i] === '[') depth++;
    if (pathname[i] === ']' && --depth === 0) return i === pathname.length - 1;
  }
  return false;
}

/** Read a resolver identity, mounted file or package member without changing the
 * stage root. Copies native bytes before releasing the handle's read boundary.
 * @param {import('../types/create.three.js').NeedleThreeHydraHandle} handle
 * @param {import('../types/bindings.js').USD} usd
 * @param {string} path
 * @param {import('../types/sources.js').StageReadOptions} [options]
 */
export async function readStageAsset(handle, usd, path, options = {}) {
  assertCurrent(options);
  const resource = await handle.readStage(async (_stage, driver) => {
    assertCurrent(options);
    // Package members are resolver identities, even when their containing
    // archive is an HTTP URL; they cannot be fetched as ordinary web URLs.
    if (!isPackageMember(path)) {
      let url = /^https?:\/\//i.test(path) ? path : '';
      if (!url) {
        try {
          const resolved = driver.resolveAssetUrl?.(path);
          if (/^https?:\/\//i.test(resolved || '')) url = resolved;
        } catch { /* A local identity may have no HTTP resolver mapping. */ }
      }
      if (url) return { url };
    }
    const node = usd.FS_analyzePath(path);
    if (node?.exists && !node.object.isFolder) return { bytes: copyBytes(usd.FS_readFile(path)) };
    const bytes = await new Promise((resolve, reject) => {
      Promise.resolve(driver.getFile(path, bytes => bytes == null
        ? reject(new Error(`File is unavailable: ${path}`)) : resolve(copyBytes(bytes)))).catch(reject);
    });
    assertCurrent(options);
    return { bytes };
  });
  assertCurrent(options);
  if (resource.bytes) return resource.bytes;
  // Network-only work need not hold the native stage or stop animation. Reenter
  // the read boundary before returning so closing a stage rejects pending reads.
  const response = await fetch(resource.url, { signal: options.signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return handle.readStage(() => { assertCurrent(options); return bytes; });
}

/** Export current authored text, including unsaved opinions, without changing
 * the displayed stage. Temporary stage wrappers never escape this operation.
 * @param {import('../types/create.three.js').NeedleThreeHydraHandle} handle
 * @param {import('../types/bindings.js').USD} usd
 * @param {string} identifier
 * @param {import('../types/sources.js').StageLayerReadOptions} [options]
 */
export async function readStageLayer(handle, usd, identifier, options = {}) {
  assertCurrent(options);
  return handle.readStage(async stage => {
    assertCurrent(options);
    const root = stage.GetRootLayer();
    if (root.GetIdentifier() === identifier) return root.ExportToString();
    let temporary = await stage.OpenLayerStage(identifier);
    if (!temporary && options.allowUncomposed) temporary = await usd.OpenStage(identifier);
    if (!temporary) throw new Error(`Layer ${identifier} is not available.`);
    try {
      assertCurrent(options);
      return temporary.GetRootLayer().ExportToString();
    } finally { usd.ReleaseStage(temporary); }
  });
}

/** Texture resource identities currently present in the rendered stage. This is
 * a snapshot of loaded resources, not an inventory of every authored dependency.
 * @param {import('three').Object3D} root
 * @returns {string[]}
 */
export function stageResources(root) {
  const paths = new Set();
  root?.traverse(object => {
    for (const material of [object.material].flat()) if (material) {
      for (const value of Object.values(material)) {
        if (value?.isTexture && value.name && !value.name.startsWith('blob:')) paths.add(value.name);
      }
    }
  });
  return [...paths];
}
