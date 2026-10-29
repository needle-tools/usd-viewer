import { Color } from 'three';
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
    shape.push([object.id, object.parent?.id, object.visible, object.geometry?.id, object.material && [object.material].flat().map(m => m.id)]);
    transforms.push([object.id, object.matrixWorld.elements, attributeKey(object.instanceMatrix), attributeKey(object.instanceColor)]);
    const geometry = object.geometry;
    if (geometry) {
      shape.push([attributeKey(geometry.index), Object.entries(geometry.attributes).map(([name, attribute]) => [name, attributeKey(attribute)]), Object.entries(geometry.morphAttributes).map(([name, attributes]) => [name, attributes.map(attributeKey)]), geometry.drawRange, geometry.groups]);
      if (object.isSkinnedMesh || object.morphTargetInfluences?.some(Boolean)) shape.push([object.morphTargetInfluences, object.skeleton?.bones.map(bone => bone.matrixWorld.elements)]);
      for (const material of [object.material].flat()) materials.push([material.id, properties(material)]);
    }
    if (object.isLight) lights.push([object.id, properties(object), object.matrixWorld.elements, object.target?.matrixWorld.elements]);
  });
  return { shape: JSON.stringify(shape), transforms: JSON.stringify(transforms), materials: JSON.stringify(materials), lights: JSON.stringify(lights), environment: JSON.stringify([valueKey(scene.environment), scene.environmentIntensity, valueKey(scene.environmentRotation), valueKey(scene.background || renderer.getClearColor(clearColor)), renderer.getClearAlpha(), scene.backgroundIntensity, scene.backgroundBlurriness, valueKey(scene.backgroundRotation)]) };
}

/** A private geometry copy keeps BVH index reordering and generated attributes out of the host scene. */
export function createGkjohnsonTracer({ api, renderer, scene, camera, onError = () => {} }) {
  const tracer = new api.WebGPUPathTracer(renderer);
  tracer.maxSamples = 512; tracer.maxBounces = 8; tracer.renderDelay = 150;
  tracer.fadeDuration = 150;
  let staging, geometries = [], pairs = [], previous, cameraKey = '', activeCamera;
  let samples = 0, pending = false, lastRead = 0, generation = 0, disposed = false;
  const originalAutoClear = renderer.autoClear;
  function clearGeometry() { for (const geometry of geometries) geometry.dispose(); geometries = []; pairs = []; }
  function rebuild() {
    const old = geometries;
    geometries = []; pairs = [];
    staging = clone(scene);
    const copied = new Map();
    function pair(source, target) {
      pairs.push([source, target]);
      if (source.geometry) {
        if (!copied.has(source.geometry)) { const geometry = source.geometry.clone(); delete geometry.boundsTree; copied.set(source.geometry, geometry); geometries.push(geometry); }
        target.geometry = copied.get(source.geometry);
        if (source.isSkinnedMesh) delete target.boundsTree;
      }
      source.children.forEach((child, i) => pair(child, target.children[i]));
    }
    pair(scene, staging);
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
  function environment() {
    staging.environment = scene.environment; staging.background = scene.background;
    staging.environmentIntensity = scene.environmentIntensity; staging.environmentRotation.copy(scene.environmentRotation);
    staging.backgroundIntensity = scene.backgroundIntensity; staging.backgroundBlurriness = scene.backgroundBlurriness; staging.backgroundRotation.copy(scene.backgroundRotation);
  }
  function resetCount() { samples = 0; generation++; }
  return {
    get samples() { return samples; },
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
    resize() { tracer.reset(); resetCount(); },
    dispose() { if (disposed) return; disposed = true; generation++; tracer.dispose(); clearGeometry(); renderer.autoClear = originalAutoClear; },
  };
}
