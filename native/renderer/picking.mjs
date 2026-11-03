import {RenderTarget, DepthTexture, FloatType, IntType, RedIntegerFormat, Uint32BufferAttribute, NearestFilter, DoubleSide, NoBlending, NodeMaterial, Color} from 'three/webgpu';
import {attribute, uniform, instanceIndex, int, select, mrt, ivec4} from 'three/tsl';

/** Hydra's integer identity attachments use the same unjittered geometry as the beauty pass. */
export function createPicking(renderer, scene, camera, identities) {
  const target = new RenderTarget(1, 1, {count:3, type:IntType, format:RedIntegerFormat,
    minFilter:NearestFilter, magFilter:NearestFilter, depthTexture:new DepthTexture(1,1,FloatType)});
  target.textures.forEach((texture, index) => { texture.name = ['output','instance','element'][index]; });
  const primId = uniform(-1, 'int').onObjectUpdate(({object}) => identities.get(object.userData.usdPath) ?? -1);
  const isInstanced = uniform(0, 'uint').onObjectUpdate(({object}) => object.isInstancedMesh ? 1 : 0);
  const material = new NodeMaterial();
  material.side=DoubleSide;material.blending=NoBlending;
  material.fragmentNode = mrt({
    output:ivec4(primId, 0, 0, 0),
    instance:ivec4(select(isInstanced.greaterThan(0), int(instanceIndex), int(-1)), 0, 0, 0),
    element:ivec4(int(attribute('needleElementId','uint')), 0, 0, 0),
  });
  const clear = new Color();
  const versions = new WeakMap();
  return {
    target,
    render(width, height) {
      const attributes = new Map();
      scene.traverse(object => {
        if (!object.isMesh || !object.geometry || !identities.has(object.userData.usdPath)) return;
        const geometry = object.geometry, position = geometry.getAttribute('position');
        if (!position || attributes.has(geometry)) return;
        const coarse = geometry.userData.usdCoarseFaceParams;
        let cached = versions.get(geometry);
        if (cached?.position !== position || cached?.coarse !== coarse) {
          const ids = new Uint32Array(position.count);
          for (let i=0;i<ids.length;i++) ids[i] = coarse?.[Math.floor(i/3)] >>> 2;
          cached = {position, coarse, attribute:new Uint32BufferAttribute(ids, 1)};
          versions.set(geometry, cached);
        }
        // Picking owns this attribute only for its draw. A stale attachment on
        // the shared beauty geometry can hide a mesh when animated holes close:
        // Hydra's visibility check correctly rejects undersized attributes.
        attributes.set(geometry, geometry.getAttribute('needleElementId'));
        geometry.setAttribute('needleElementId', cached.attribute);
      });
      target.setSize(width, height);
      const previous = {target:renderer.getRenderTarget(), mrt:renderer.getMRT(), override:scene.overrideMaterial,
        background:scene.background, backgroundNode:scene.backgroundNode,
        color:renderer.getClearColor(clear).clone(), alpha:renderer.getClearAlpha()};
      try {
        camera.clearViewOffset();
        scene.overrideMaterial = material; scene.background = null;scene.backgroundNode=null;
        renderer.setRenderTarget(target); renderer.setMRT(null);
        renderer.setClearColor(new Color(-1,-1,-1), 1);
        renderer.render(scene, camera);
      } finally {
        for (const [geometry, previous] of attributes) {
          if (previous) geometry.setAttribute('needleElementId', previous);
          else geometry.deleteAttribute('needleElementId');
        }
        renderer.setClearColor(previous.color, previous.alpha);
        renderer.setRenderTarget(previous.target);renderer.setMRT(previous.mrt);
        scene.overrideMaterial = previous.override;scene.background = previous.background;
        scene.backgroundNode=previous.backgroundNode;
      }
    },
    dispose() { target.dispose(); material.dispose(); },
  };
}
