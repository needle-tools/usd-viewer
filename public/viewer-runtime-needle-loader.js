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
export { addPluginForNeedleEngine, getHydraHandleFromNeedleEngineAsset } from './usd/plugins/index.js';
export async function loadExrLoader() { return (await import('three-examples')).EXRLoader; }
export async function loadGltfExporter() { return (await import('three-examples')).GLTFExporter; }
export async function loadGltfLoader() { return (await import('three-examples')).GLTFLoader; }
export { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
export { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
export { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
export { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const runtimeViewerMode = 'needle-loader';
