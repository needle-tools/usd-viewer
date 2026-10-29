/**
 * Use the existing MaterialX bounded-medium renderer. This requires the node
 * renderer's opaque color/depth pass; the legacy WebGLNodesHandler cannot supply it.
 * The medium occupies the assigned box geometry, in inverse world units.
 */
export async function createVdbVolumeMesh(state, options) {
  if (!options?.renderer?.isWebGPURenderer || options.renderer.samples > 1) {
    throw new Error('USD VDB fields require WebGPURenderer (WebGPU or forceWebGL), with antialias: false.');
  }
  const module = await import('./vdbVolumeMaterial.js');
  return module.createVdbVolumeMesh(state, options);
}

export async function createMaterialXVolumeMaterial(xml, target, { renderer, getTexture }) {
  if (!renderer?.isWebGPURenderer) {
    throw new Error('MaterialX bounded volumes require WebGPURenderer (WebGPU or forceWebGL), with antialias: false. The legacy WebGLRenderer does not provide the required opaque color/depth pass.');
  }
  if (renderer.samples > 1) {
    throw new Error('MaterialX bounded volumes require a single-sample depth buffer; construct WebGPURenderer with antialias: false.');
  }
  const material = await createMaterialXNodeMaterial(xml, target, { renderer, getTexture });
  if (!material?.isBoundedVolumeNodeMaterial) {
    material?.dispose();
    throw new Error('The selected MaterialX material is not a supported bounded volume.');
  }
  return material;
}

/** Translate MaterialX surfaces and bounded media to the existing TSL implementation. */
export async function createMaterialXNodeMaterial(xml, target, { renderer, getTexture }) {
  if (!renderer?.isWebGPURenderer) throw new Error('MaterialX node materials require WebGPURenderer.');
  const [{ MaterialXLoader }, { LoadingManager, DoubleSide }] = await Promise.all([
    import('../vendor/materialx/loaders/MaterialXLoader.js'),
    import('three'),
  ]);
  const manager = new LoadingManager();
  if (getTexture) {
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    const references = new Set();
    for (const input of document.querySelectorAll('input[type="filename"]')) {
      const value = input.getAttribute('value')?.trim();
      if (!value) continue;
      let prefix = '';
      for (let element = input; element; element = element.parentElement) {
        if (element.hasAttribute('fileprefix')) {
          prefix = element.getAttribute('fileprefix') || '';
          break;
        }
      }
      references.add(prefix + value);
    }
    for (const reference of references) {
      const texture = await getTexture(reference);
      if (!texture) continue;
      const pattern = new RegExp(`^${reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
      manager.addHandler(pattern, { load(_url, onLoad) { onLoad(texture); return texture; } });
    }
  }
  const result = new MaterialXLoader(manager).parse(xml, { throwOnErrors: true });
  const entries = Object.values(result.materials);
  const material = typeof target === 'number' ? entries[target] : result.materials[target] || entries[0];
  for (const other of entries) if (other !== material) other.dispose();
  if (!material) throw new Error('The selected MaterialX document contains no material.');
  // Bounded media integrate the complete ray at the exit face. Surface sidedness
  // would shade the same ray twice and double the expensive scattering work.
  if (!material.isBoundedVolumeNodeMaterial) material.side = DoubleSide;
  material.userData.usdMaterialX = { target };
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  material.userData.usdMaterialXPrimvars = [...document.querySelectorAll('geompropvalue, [nodedef^="ND_geompropvalue_"]')].map(node => ({
    name: node.querySelector('input[name="geomprop"]')?.getAttribute('value'),
    size: { float: 1, integer: 1, vector2: 2, vector3: 3, vector4: 4, color3: 3, color4: 4 }[node.getAttribute('type')] || 3,
  })).filter(binding => binding.name);
  return material;
}
