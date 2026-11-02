const texture = /\.(?:png|jpe?g|webp|avif|exr|hdr|ktx2?|basis|dds|tiff?|bmp|tga|tex)$/i;
const geometry = /\.(?:usd[acz]?|usdz|abc|obj|fbx|gltf|glb|bin|drc|ply|splat|spz)$/i;

/** Source-file bytes, not decoded textures or GPU buffers. Entries use public
 * stage-relative identities so resolver aliases count as one file. */
export function assetFileTotals(entries) {
  const files = new Map();
  for (const entry of entries) {
    if (!entry.path || entry.path.startsWith('anon:')) continue;
    const previous = files.get(entry.path);
    if (!previous || Number.isFinite(entry.size)) files.set(entry.path, entry);
  }
  // A package's members are already included in the archive's source bytes.
  for (const path of files.keys()) {
    const at = path.toLowerCase().indexOf('.usdz[');
    if (at >= 0 && files.has(path.slice(0, at + 5))) files.delete(path);
  }
  const result = {count:files.size, total:0, unknown:0, geometry:0, textures:0, other:0};
  for (const {path,size} of files.values()) {
    if (!(Number.isFinite(size) && size >= 0)) {result.unknown++; continue;}
    const filename = path.split(/[?#]/)[0];
    result.total += size;
    result[texture.test(filename) ? 'textures' : geometry.test(filename) ? 'geometry' : 'other'] += size;
  }
  return result;
}
