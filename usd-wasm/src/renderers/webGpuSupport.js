import {BufferGeometry,Float32BufferAttribute,InstancedBufferAttribute,InstancedBufferGeometry,Points,Sprite} from 'three';
import { prepareWebGlAreaLights } from '../hydra/areaLightSupport.js';
import { prepareInstancedMaterialUpdates } from './instancedMaterialUpdates.js';

/** Modern renderer support stays outside the base loader's dependency graph. */
export async function createWebGpuSupport({ lazyAreaLights = false } = {}) {
  const [{ MeshPhysicalNodeMaterial, RectAreaLightNode, PointsNodeMaterial }, TSL, { createMaterialXNodeMaterial }] = await Promise.all([
    import('three/webgpu'), import('three/tsl'), import('../hydra/materialxVolume.js'),
  ]);
  let areaLightPreparation;
  const strokeOpacity = new WeakMap();
  const support = {
    prepareMaterial: prepareInstancedMaterialUpdates,
    SurfaceMaterial: MeshPhysicalNodeMaterial,
    createPointHelper(positions, options) {
      // Native WebGPU point primitives are limited to one pixel. Instanced
      // billboards keep inspection markers legible at every zoom level.
      const attribute=new InstancedBufferAttribute(new Float32Array(positions),3);
      const material=new PointsNodeMaterial({...options,size:5,sizeAttenuation:false,positionNode:TSL.instancedBufferAttribute(attribute)});
      const sprite=new Sprite(material);
      sprite.geometry=new InstancedBufferGeometry().copy(sprite.geometry);sprite.geometry.instanceCount=positions.length/3;
      sprite.geometry.setAttribute('usdHelperPosition',attribute);sprite.frustumCulled=false;
      const hitGeometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(positions,3));
      const picking=new Points(hitGeometry);
      sprite.raycast=(ray,hits)=>{picking.matrixWorld.copy(sprite.matrixWorld);const points=[];picking.raycast(ray,points);for(const hit of points){hit.object=sprite;hits.push(hit);}};
      sprite.geometry.addEventListener('dispose',()=>{hitGeometry.dispose();picking.material.dispose();});
      return sprite;
    },
    prepareAreaLights() {
      return areaLightPreparation ??= Promise.all([
        prepareWebGlAreaLights(), import('three/addons/lights/RectAreaLightTexturesLib.js'),
      ]).then(([, { RectAreaLightTexturesLib }]) => {
        RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init());
      });
    },
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
  // Preserve ready-to-render support for host-authored lights. USD-only scenes
  // can opt into preparation when their first area-light prim arrives.
  if (!lazyAreaLights) await support.prepareAreaLights();
  return support;
}
