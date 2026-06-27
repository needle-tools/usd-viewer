export {
  AgXToneMapping,
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
export { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
export { OrbitControls } from 'three/addons/controls/OrbitControls.js';
export { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

export const runtimeViewerMode = 'three';

export async function addPluginForNeedleEngine() {
  throw new Error('Needle Engine loader is not available in the three.js viewer runtime.');
}

export function getHydraHandleFromNeedleEngineAsset() {
  return null;
}
