export {
  AgXToneMapping,
  AnimationMixer,
  AmbientLight,
  Box3,
  Color,
  EquirectangularReflectionMapping,
  Group,
  NeutralToneMapping,
  PMREMGenerator,
  PerspectiveCamera,
  PointLight,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';

export { createThreeHydra, getUsdModule } from './usd/index.js';
export { addPluginForNeedleEngine, getHydraHandleFromNeedleEngineAsset } from './usd/plugins/index.js';
import {
  getComponent,
  OrbitControls as EngineOrbitControls,
} from '@needle-tools/engine';
export { GLTFExporter, GLTFLoader, RGBELoader } from 'three-examples';
export { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const runtimeViewerMode = 'needle-loader';

export function fitNeedleCameraToObjects(context, objects, options = {}) {
  const camera = context?.mainCamera;
  if (!context || !camera) return false;

  const targets = Array.isArray(objects)
    ? objects.filter(Boolean)
    : objects
      ? [objects]
      : undefined;

  const orbitControls = getComponent(camera, EngineOrbitControls)
    || camera.getComponent?.(EngineOrbitControls)
    || null;

  const fitOptions = {
    objects: targets?.length ? targets : undefined,
    fitOffset: options.fitOffset,
    fitDirection: options.fitDirection,
    centerCamera: options.centerCamera,
    immediate: true,
  };

  if (orbitControls && typeof orbitControls.fitCamera === 'function') {
    orbitControls.fitCamera(fitOptions);
    return true;
  }

  return false;
}
