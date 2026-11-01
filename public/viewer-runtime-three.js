export {
  AgXToneMapping,
  AnimationMixer,
  AmbientLight,
  Box3,
  Color,
  CubeUVReflectionMapping,
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

export { createThreeHydra } from './usd/create.three.js';
export { getUsdModule } from './usd/bindings/index.js';
export { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
export { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
export { OrbitControls } from 'three/addons/controls/OrbitControls.js';
export { HDRLoader as RGBELoader } from 'three/addons/loaders/HDRLoader.js';

export const runtimeViewerMode = 'three';

export async function addPluginForNeedleEngine() {
  throw new Error('Needle Engine loader is not available in the three.js viewer runtime.');
}

export function getHydraHandleFromNeedleEngineAsset() {
  return null;
}

export function fitCamera() {
  return null;
}

export async function loadExrLoader() { return (await import('three/addons/loaders/EXRLoader.js')).EXRLoader; }
export async function loadGltfExporter() { return (await import('three/addons/exporters/GLTFExporter.js')).GLTFExporter; }
export async function loadGltfLoader() { return (await import('three/addons/loaders/GLTFLoader.js')).GLTFLoader; }
