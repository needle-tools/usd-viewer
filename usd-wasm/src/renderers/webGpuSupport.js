/** Modern renderer support stays outside the base loader's dependency graph. */
export async function createWebGpuSupport() {
  const [{ MeshPhysicalNodeMaterial, RectAreaLightNode }, { RectAreaLightTexturesLib }, TSL, { createMaterialXNodeMaterial }] = await Promise.all([
    import('three/webgpu'), import('three/addons/lights/RectAreaLightTexturesLib.js'), import('three/tsl'), import('../hydra/materialxVolume.js'),
  ]);
  RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init());
  const strokeOpacity = new WeakMap();
  return {
    SurfaceMaterial: MeshPhysicalNodeMaterial,
    async createParticleField(data) { return (await import('./gaussian.js')).createGaussianParticleField(data); },
    createMaterialXMaterial: createMaterialXNodeMaterial,
    configureStrokeMaterial(material) {
      const previous = strokeOpacity.get(material);
      const base = previous && material.opacityNode === previous.node ? previous.base
        : material.opacityNode || TSL.reference('opacity', 'float', material);
      const node = base.mul(TSL.attribute('strokeOpacity', 'float'));
      strokeOpacity.set(material, { base, node }); material.opacityNode = node;
    },
    configurePreviewPrimvars(material) {
      const properties = { diffuseColor: 'colorNode', emissiveColor: 'emissiveNode', roughness: 'roughnessNode', metallic: 'metalnessNode', opacity: 'opacityNode' };
      for (const binding of material.userData.usdPreviewPrimvars || []) {
        const size = ['diffuseColor', 'emissiveColor'].includes(binding.input) ? 3 : 1;
        material[properties[binding.input]] = TSL.attribute(binding.attribute, size === 1 ? 'float' : `vec${size}`);
        if (binding.input === 'diffuseColor') material.vertexColors = false;
      }
    },
  };
}
