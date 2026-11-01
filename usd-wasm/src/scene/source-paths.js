const web = path => /^https?:\/\//i.test(path);
const scheme = path => /^[a-z][a-z\d+.-]*:/i.test(path);
// Sdf layer identifiers may normalize the URL's double slash to a single slash.
const urlIdentity = path => path.replace(/^(https?):\/(?!\/)/i, '$1://');
const packageParts = path => {
  if (web(path) && !new URL(path).pathname.endsWith(']')) return null;
  const match = /\.usdz\[/i.exec(path), at = match ? match.index + 5 : -1;
  return at >= 0 && path.endsWith(']') ? [path.slice(0, at), path.slice(at + 1, -1)] : null;
};
function normalize(path) {
  const absolute = path.startsWith('/'), parts = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (part === '..' && parts.length && parts.at(-1) !== '..') parts.pop();
    else if (part === '..' && !absolute) parts.push(part);
    else if (part && part !== '.' && part !== '..') parts.push(part);
  }
  return (absolute ? '/' : '') + parts.join('/');
}
function anchor(path, root) {
  if (scheme(path) || path.startsWith('/')) return path;
  const packaged = packageParts(root);
  if (packaged) return packaged[0] + '[' + anchor(path, packaged[1]) + ']';
  if (web(root)) return new URL(path, root).href;
  return normalize(root.slice(0, root.lastIndexOf('/') + 1) + path);
}
function relative(path, root) {
  const a = packageParts(path), b = packageParts(root);
  if (a || b) {
    if (a && b && a[0] === b[0]) return relative(a[1], b[1]);
    if (a) return relative(a[0], b ? b[0] : root) + '[' + a[1] + ']';
    return path;
  }
  let suffix = '';
  if (web(path) || web(root)) {
    if (!web(path) || !web(root)) return path;
    const url = new URL(path), base = new URL(root);
    if (url.origin !== base.origin) return path;
    suffix = url.search + url.hash;
    path = url.pathname; root = base.pathname;
  } else if (scheme(path) || scheme(root)) return path;
  const target = normalize(path).split('/'), base = normalize(root).split('/').slice(0, -1);
  while (base.length && target.length && base[0] === target[0]) { base.shift(); target.shift(); }
  return '../'.repeat(base.length) + target.join('/') + suffix;
}

/** Public file paths relative to the root layer's folder. Resolver mount names
 * stay private; parent traversal and package membership remain meaningful.
 * resolve() accepts these paths for native reads without changing the root.
 * @param {string} rootIdentifier
 * @param {{resolveUrl?: (path:string) => string}} [options]
 * @returns {import('../types/sources.js').StageSourcePaths}
 */
export function createStageSourcePaths(rootIdentifier, {resolveUrl} = {}) {
  const aliases = new Map();
  function original(path) {
    path = urlIdentity(path);
    const packaged = packageParts(path);
    if (packaged) return original(packaged[0]) + '[' + packaged[1] + ']';
    if (web(path) || !resolveUrl) return path;
    try { return resolveUrl(path) || path; } catch { return path; }
  }
  // Keep archive membership explicit. A file inside a package and an external
  // file with the same name must never become the same public identity.
  const container = packageParts(rootIdentifier)?.[0] || rootIdentifier;
  const root = original(container);
  return {
    path(identifier) {
      const resolved = scheme(identifier) || identifier.startsWith('/') ? identifier : anchor(identifier, container);
      const path = relative(original(resolved), root);
      aliases.set(path, resolved);
      return path;
    },
    resolve(path) { return aliases.get(path) || anchor(urlIdentity(path), urlIdentity(container)); },
  };
}
