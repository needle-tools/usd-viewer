import { Color, DataTexture, LinearFilter, EquirectangularReflectionMapping } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

// Snapshot public Three properties: edits reset accumulation, unchanged animation ticks do not.
function valueKey(value) {
  if (value?.isTexture) { if (value.matrixAutoUpdate) value.updateMatrix(); return [value.id, value.version, value.matrix?.elements]; }
  if (value?.isColor) return value.toArray();
  if (value?.isVector2 || value?.isVector3 || value?.isVector4 || value?.isEuler) return value.toArray();
  if (value?.elements) return value.elements;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string' || value === null) return value;
  return undefined;
}
function properties(object) { return Object.entries(object).map(([key, value]) => [key, valueKey(value)]).filter(([, value]) => value !== undefined); }
const ids = new WeakMap(); let nextId = 0;
function identity(object) { if (!object) return null; if (!ids.has(object)) ids.set(object, ++nextId); return ids.get(object); }
const attributeKey = attribute => attribute && [identity(attribute), attribute.version ?? attribute.data?.version, attribute.count, attribute.itemSize];
const clearColor = new Color();
function snapshot(scene, renderer) {
  scene.updateMatrixWorld(true);
  const shape = [], transforms = [], materials = [], lights = [];
  scene.traverse(object => {
    if (object.userData.usdHelperFor) return;
    shape.push([object.id, object.parent?.id, object.visible, object.geometry?.id, object.material && [object.material].flat().map(m => m.id)]);
    transforms.push([object.id, object.matrixWorld.elements, attributeKey(object.instanceMatrix), attributeKey(object.instanceColor)]);
    const geometry = object.geometry;
    if (geometry) {
      shape.push([attributeKey(geometry.index), Object.entries(geometry.attributes).map(([name, attribute]) => [name, attributeKey(attribute)]), Object.entries(geometry.morphAttributes).map(([name, attributes]) => [name, attributes.map(attributeKey)]), geometry.drawRange, geometry.groups]);
      if (object.isSkinnedMesh || object.morphTargetInfluences?.some(Boolean)) shape.push([object.morphTargetInfluences, object.skeleton?.bones.map(bone => bone.matrixWorld.elements)]);
      for (const material of [object.material].flat()) materials.push([material.id, properties(material)]);
    }
    if (object.isLight) { object.target?.updateWorldMatrix(true,false); lights.push([object.id, properties(object), object.matrixWorld.elements, object.target?.matrixWorld.elements]); }
  });
  return { shape: JSON.stringify(shape), transforms: JSON.stringify(transforms), materials: JSON.stringify(materials), lights: JSON.stringify(lights), environment: JSON.stringify([valueKey(scene.environment), scene.environmentIntensity, valueKey(scene.environmentRotation), valueKey(scene.background || renderer.getClearColor(clearColor)), renderer.getClearAlpha(), scene.backgroundIntensity, scene.backgroundBlurriness, valueKey(scene.backgroundRotation)]) };
}

/** A private geometry copy keeps BVH index reordering and generated attributes out of the host scene. */
export async function createGkjohnsonTracer({ api, renderer, scene, camera, settings = {maxSamples:512,bounces:8}, loadDenoiser, denoiserWeightsBaseUrl, onError = () => {} }) {
  const tracer = new api.WebGPUPathTracer(renderer);
  tracer.maxSamples = settings.maxSamples; tracer.maxBounces = settings.bounces; tracer.renderDelay = 150;
  tracer.fadeDuration = 150;
  let staging, geometries = [], pairs = [], previous, cameraKey = '', activeCamera;
  let samples = 0, pending = false, lastRead = 0, generation = 0, disposed = false;
  const originalAutoClear = renderer.autoClear;
  // Upstream's null-environment cache falls back to the renderer clear color.
  // A viewport backdrop must never become an unrequested light source.
  const unlitEnvironment = new DataTexture(new Uint8Array([0,0,0,255]),1,1);
  unlitEnvironment.minFilter = unlitEnvironment.magFilter = LinearFilter;
  unlitEnvironment.mapping = EquirectangularReflectionMapping; unlitEnvironment.needsUpdate = true;
  let denoiser, denoiserType;
  async function setDenoiser(type) {
    if (type === denoiserType) return;
    let next;
    if (type) {
      if (!loadDenoiser || !denoiserWeightsBaseUrl) throw new Error('OIDN requires loadDenoiser and denoiserWeightsBaseUrl.');
      const {initUNetFromURL} = await loadDenoiser();
      if (disposed) return;
      const file = type === 'oidn-fast' ? 'rt_hdr_alb_nrm_small.tza' : 'rt_hdr_alb_nrm.tza';
      next = new api.OIDNDenoiser({initUNetFromURL, auxWeightsUrl:new URL(file,new URL(denoiserWeightsBaseUrl,globalThis.location?.href || import.meta.url)).href, maxTileSize:type === 'oidn-fast' ? 128 : 256});
      // The upstream update method starts denoise asynchronously without awaiting it.
      const denoise = next.denoise.bind(next);
      next.denoise = (...args) => denoise(...args).catch(error => { if (!disposed) { tracer.setDenoiser(null); onError(error); } });
    }
    tracer.setDenoiser(next || null);denoiser?.dispose();denoiser=next;denoiserType=type;
  }
  try { await setDenoiser(settings.gkDenoiser || null); }
  catch (error) { tracer.dispose(); throw error; }
  function clearGeometry() { for (const geometry of geometries) geometry.dispose(); geometries = []; pairs = []; }
  function rebuild() {
    const old = geometries;
    geometries = []; pairs = [];
    staging = clone(scene);
    const copied = new Map();
    function pair(source, target) {
      if (source.userData.usdHelperFor) { target.removeFromParent(); return; }
      const children = target.children.slice();
      pairs.push([source, target]);
      if (source.geometry) {
        if (!copied.has(source.geometry)) { const geometry = source.geometry.clone(); delete geometry.boundsTree; copied.set(source.geometry, geometry); geometries.push(geometry); }
        target.geometry = copied.get(source.geometry);
        if (source.isSkinnedMesh) delete target.boundsTree;
      }
      source.children.forEach((child, i) => pair(child, children[i]));
    }
    pair(scene, staging);
    copyLightTargets();
    environment();
    try { tracer.setScene(staging, camera); } finally { for (const geometry of old) geometry.dispose(); }
    activeCamera = camera;
  }
  function copyTransforms() {
    for (const [source, target] of pairs) {
      target.position.copy(source.position); target.quaternion.copy(source.quaternion); target.scale.copy(source.scale);
      target.matrix.copy(source.matrix); target.matrixWorld.copy(source.matrixWorld); target.matrixAutoUpdate = source.matrixAutoUpdate;
      if (source.instanceMatrix) { target.instanceMatrix.copy(source.instanceMatrix); target.instanceMatrix.needsUpdate = true; }
      if (source.instanceColor) { target.instanceColor ||= source.instanceColor.clone(); target.instanceColor.copy(source.instanceColor); target.instanceColor.needsUpdate = true; }
    }
  }
  function copyLightTargets() {
    const copies=new Map(pairs);
    for(const [source,target] of pairs)if(source.isLight && source.target){
      // Light.copy clones its target without its ancestors. Preserve targets
      // inside the private scene, and world-space targets outside that tree.
      if(copies.has(source.target))target.target=copies.get(source.target);
      else {
        source.target.updateWorldMatrix(true,false);
        target.target.matrixAutoUpdate=target.target.matrixWorldAutoUpdate=false;
        target.target.matrix.copy(source.target.matrixWorld);target.target.matrixWorld.copy(source.target.matrixWorld);
      }
    }
  }
  function environment() {
    staging.environment = scene.environment || unlitEnvironment; staging.background = scene.background;
    staging.environmentIntensity = scene.environment ? scene.environmentIntensity : 0; staging.environmentRotation.copy(scene.environmentRotation);
    staging.backgroundIntensity = scene.backgroundIntensity; staging.backgroundBlurriness = scene.backgroundBlurriness; staging.backgroundRotation.copy(scene.backgroundRotation);
  }
  function resetCount() { samples = 0; generation++; }
  return {
    get samples() { return samples; },
    get status() { return denoiser?.running ? 'denoising' : denoiser?.complete ? 'finished' : 'converging'; },
    render(nextCamera) {
      if (disposed) return;
      camera = nextCamera; camera.updateMatrixWorld();
      const next = snapshot(scene, renderer);
      let changed = false;
      if (!previous || next.shape !== previous.shape) { rebuild(); changed = true; }
      else {
        if (next.transforms !== previous.transforms) { copyTransforms(); tracer.updateTransforms(); changed = true; }
        if (next.materials !== previous.materials) { tracer.updateMaterials(); changed = true; }
        if (next.lights !== previous.lights) {
          for (const [source, target] of pairs) if (source.isLight) target.copy(source, false);
          copyLightTargets();
          tracer.updateLights(); changed = true;
        }
        if (next.environment !== previous.environment) { environment(); tracer.updateEnvironment(); changed = true; }
      }
      const key = JSON.stringify([camera.id, camera.matrixWorld.elements, camera.projectionMatrix.elements, renderer.toneMapping, renderer.toneMappingExposure, renderer.domElement.width, renderer.domElement.height]);
      if (activeCamera !== camera) { tracer.setCamera(camera); activeCamera = camera; changed = true; }
      else if (cameraKey !== key) { tracer.updateCamera(); changed = true; }
      previous = next; cameraKey = key;
      if (changed) resetCount();
      tracer.renderSample();
      if (!pending && performance.now() - lastRead > 250) {
        const request = generation; pending = true; lastRead = performance.now();
        tracer.getSampleCountsAsync().then(count => { if (!disposed && request === generation) samples = Math.floor(count.avg); }).catch(error => { if (!disposed) onError(error); }).finally(() => { pending = false; });
      }
    },
    async setSettings(settings) { await setDenoiser(settings.gkDenoiser); tracer.maxSamples = settings.maxSamples; tracer.maxBounces = settings.bounces; tracer.reset(); resetCount(); },
    resize() { tracer.reset(); resetCount(); },
    dispose() { if (disposed) return; disposed = true; generation++; tracer.dispose(); clearGeometry(); unlitEnvironment.dispose(); renderer.autoClear = originalAutoClear; },
  };
}
