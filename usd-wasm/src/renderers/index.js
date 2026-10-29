export { createWebGpuSupport } from './webGpuSupport.js';
import { Vector2, CubeUVReflectionMapping } from 'three';

/** Optional presentation modes. The caller retains ownership of the Three renderer and scene. */
export async function createRenderModes({ renderer, scene, camera, canvas, onStatus = () => {}, loadPathTracer, loadGkPathTracer, convertMaterial, convertLight }) {
  let mode = 'basic', disposed = false, revision = 0;
  let beauty, beautyPending, tracer, loop, sync, sourceCamera;
  let gk;
  let lastStatus = '';
  const pathCanvas = canvas || document.createElement('canvas');
  const ownsCanvas = !canvas;
  const originalOpacity = renderer.domElement.style.opacity;
  const originalHidden = pathCanvas.hidden;
  if (ownsCanvas) {
    Object.assign(pathCanvas.style, { position: renderer.domElement.parentElement === document.body ? 'fixed' : 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '1' });
    renderer.domElement.after(pathCanvas);
  }
  pathCanvas.hidden = true;
  const notify = (detail = {}) => {
    const state = { mode, samples: gk?.samples || loop?.samples || 0, status: loop?.status || 'ready', ...detail };
    const key = JSON.stringify(state); if (key !== lastStatus) { lastStatus = key; onStatus(state); }
  };
  const showPath = (show) => { pathCanvas.hidden = !show; renderer.domElement.style.opacity = show ? '0' : originalOpacity; };
  function releasePath() {
    loop?.dispose(); sync?.dispose(); tracer?.dispose();
    loop = sync = tracer = sourceCamera = undefined;
    showPath(false);
  }
  function releaseBeauty() {
    beauty?.dispose();
    beauty = undefined;
  }
  function validatePath(gkjohnson = false) {
    const issues = new Set();
    scene.traverseVisible(object => {
      if (object.userData?.usdTypeName === 'ParticleField3DGaussianSplat') issues.add('Gaussian splats');
      if (gkjohnson && object.isLight && object.intensity && !object.isRectAreaLight && !object.isSpotLight && !object.isPointLight && !object.isDirectionalLight) issues.add(object.type);
      if (object.isPoints || object.isLine) issues.add('points and lines');
      if (!object.isMesh || object.userData?.usdHelperFor) return;
      if (object.geometry?.getAttribute('strokeOpacity')?.array.some(value => value < 1)) issues.add('point and curve opacity');
      for (const material of [object.material].flat()) {
        if (convertMaterial && !gkjohnson) continue; // The application supplies its own shader translation.
        if (material?.isBoundedVolumeNodeMaterial) issues.add('volumes');
        else if (gkjohnson && ['colorNode', 'opacityNode', 'normalNode', 'roughnessNode', 'metalnessNode', 'emissiveNode', 'positionNode'].some(key => material?.[key])) issues.add('custom node shaders');
        else if (material?.userData?.usdPreviewPrimvars?.length) issues.add('custom primvar shaders');
        else if (material?.userData?.usdMaterialX || material?.isMaterialXMaterial) issues.add('MaterialX graphs');
        else if (!material?.isMeshStandardMaterial && (gkjohnson || !material?.isMeshBasicMaterial)) issues.add(material?.type || 'custom materials');
      }
      if (object.isBatchedMesh || object.isInstancedMesh && (object.morphTexture || object.isSkinnedMesh)) issues.add('deformed instances');
    });
    if (scene.environment?.mapping === CubeUVReflectionMapping) issues.add('PMREM-only environments');
    if (issues.size) throw new Error(`Path tracing does not yet support ${[...issues].join(', ')}.`);
  }
  async function prepareBeauty(activeCamera = camera) {
    if (!renderer.isWebGPURenderer) throw new Error('Beauty requires WebGPURenderer.');
    const { createBeauty } = await import('./beauty.js');
    return createBeauty({ renderer, scene, camera: activeCamera });
  }

  function makeSync(api, activeCamera) {
    sync?.dispose();
    sync = new api.THREESync(tracer, { scene, camera: activeCamera, convertMaterial, convertLight });
    sourceCamera = activeCamera;
  }
  let pathApi;
  return {
    get mode() { return mode; },
    get samples() { return gk?.samples || loop?.samples || 0; },
    get backend() { return mode === 'pathtraced' ? tracer?.backend : renderer.backend?.isWebGPUBackend ? 'webgpu' : 'webgl'; },
    get pathCanvas() { return pathCanvas; },
    async setMode(next) {
      if (!['basic', 'beauty', 'pathtraced', 'pathtraced-gk'].includes(next)) throw new Error(`Unknown render mode: ${next}`);
      if (disposed) throw new Error('Render modes have been disposed.');
      const request = ++revision;
      if (next === mode) return;
      if (next.startsWith('pathtraced')) validatePath(next === 'pathtraced-gk');
      notify({ status: 'loading', requestedMode: next });
      try {
        if (next === 'beauty' && !beauty) {
          const candidate = await prepareBeauty();
          if (disposed || request !== revision) { candidate.dispose(); return; }
          beauty = candidate;
        }
        let nextGk;
        if (next === 'pathtraced-gk') {
          if (!renderer.backend?.isWebGPUBackend) throw new Error('gkjohnson path tracing requires the WebGPU backend.');
          if (!loadGkPathTracer) throw new Error("Pass loadGkPathTracer: () => import('three-gpu-pathtracer/webgpu') to enable this mode.");
          const [api, { createGkjohnsonTracer }] = await Promise.all([loadGkPathTracer(), import('./gkjohnson.js')]);
          if (disposed || request !== revision) return;
          nextGk = createGkjohnsonTracer({ api, renderer, scene, camera, onError: error => notify({ status: 'error', error: error.message }) });
        }
        if (next === 'pathtraced') {
          if (!loadPathTracer) throw new Error("Pass loadPathTracer: () => import('@meimu/mutracer') to enable path tracing.");
          pathApi = await loadPathTracer();
          if (disposed || request !== revision) return;
          const candidate = new pathApi.Engine({ canvas: pathCanvas, backend: 'auto' });
          try { await candidate.init(); } catch (error) { candidate.dispose(); throw error; }
          if (disposed || request !== revision) { candidate.dispose(); return; }
          const nextSync = new pathApi.THREESync(candidate, { scene, camera, convertMaterial, convertLight });
          const nextLoop = new pathApi.RenderLoop(candidate, { sync: nextSync, final: { maxSamples: 512, bounces: 8 } });
          try { await nextLoop.final.setDenoiser({ type: 'jnlm' }); }
          catch (error) { nextLoop.dispose(); nextSync.dispose(); candidate.dispose(); throw error; }
          if (disposed || request !== revision) { nextLoop.dispose(); nextSync.dispose(); candidate.dispose(); return; }
          tracer = candidate; sync = nextSync; loop = nextLoop; sourceCamera = camera;
          tracer.on('error', error => notify({ error: error.message, status: 'error' }));
          tracer.display.toneMapping = 'agx'; tracer.display.toneMappingExposure = renderer.toneMappingExposure;
          this.resize();
        } else releasePath();
        gk?.dispose(); gk = nextGk;
        if (next !== 'beauty') releaseBeauty();
        mode = next; showPath(mode === 'pathtraced'); notify();
      } catch (error) { notify({ error: error.message, status: 'error' }); throw error; }
    },
    resize() {
      gk?.resize();
      if (tracer) {
        const size = renderer.getDrawingBufferSize(new Vector2());
        tracer.display.setSize(size.x, size.y);
      }
    },
    render(activeCamera = camera) {
      if (disposed) return;
      if (mode === 'pathtraced-gk') {
        try { validatePath(true); gk.render(activeCamera); notify(); }
        catch (error) { gk?.dispose(); gk = undefined; mode = 'basic'; notify({ status: 'error', error: error.message }); renderer.render(scene, activeCamera); }
      } else if (mode === 'pathtraced') {
        // Stage edits can introduce materials absent when this mode was selected.
        try { validatePath(); } catch (error) { releasePath(); mode = 'basic'; notify({ status: 'error', error: error.message }); renderer.render(scene, activeCamera); return; }
        if (sourceCamera !== activeCamera) { loop.removeSync(sync); makeSync(pathApi, activeCamera); loop.addSync(sync); }
        tracer.display.toneMappingExposure = renderer.toneMappingExposure;
        loop.tick(); notify();
      } else if (mode === 'beauty') {
        if (beauty?.camera !== activeCamera) {
          if (!beautyPending) {
            releaseBeauty(); const request = revision;
            beautyPending = prepareBeauty(activeCamera).then(candidate => {
              if (disposed || request !== revision) { candidate.dispose(); }
              else beauty = candidate;
            }).catch(error => { mode = 'basic'; notify({ error: error.message, status: 'error' }); }).finally(() => { beautyPending = undefined; });
          }
          renderer.render(scene, activeCamera); return;
        }
        beauty.render();
      } else renderer.render(scene, activeCamera);
    },
    dispose() { if (disposed) return; disposed = true; revision++; gk?.dispose(); gk = undefined; releasePath(); releaseBeauty(); if (ownsCanvas) pathCanvas.remove(); else pathCanvas.hidden = originalHidden; },
  };
}
