export { createWebGpuSupport } from './webGpuSupport.js';
export { configureNeedleAgxDisplay } from './needleAgxDisplay.js';
/** Load the TSL display transform only for applications using the modern renderer. */
export async function configureNeedleAgx(renderer) {
  return (await import('./needleAgx.js')).configureNeedleAgx(renderer);
}
import { Vector2, Color, CubeUVReflectionMapping, NoToneMapping } from 'three';
import { createOrbitControlUpdater } from './orbitControls.js';

/** Optional presentation modes. The caller retains ownership of the Three renderer and scene. */
export async function createRenderModes({ renderer, scene, camera, canvas, controls, settings: initialSettings = {}, onStatus = () => {}, loadPathTracer, loadGkPathTracer, loadDenoiser, denoiserWeightsBaseUrl, configurePathTracer, convertMaterial, convertLight }) {
  const settings = { maxSamples: 512, bounces: 8, denoiser: 'jnlm', gkDenoiser: loadDenoiser ? 'oidn-fast' : null, ...initialSettings };
  const muDenoiser = type => !type ? null : type === 'jnlm' ? {type, schedule:'progressive'} : {type:'oidn', model:type === 'oidn-fast' ? 'small' : 'standard', schedule:'progressive', ...(denoiserWeightsBaseUrl ? {weightsBaseUrl:denoiserWeightsBaseUrl} : {})};
  function validateSettings(values) {
    if (!Number.isInteger(values.maxSamples) || values.maxSamples < 1 || values.maxSamples > 65536) throw new Error('Samples must be an integer from 1 to 65536.');
    if (!Number.isInteger(values.bounces) || values.bounces < 1 || values.bounces > 20) throw new Error('Bounces must be an integer from 1 to 20.');
    if (![null, 'jnlm', 'oidn', 'oidn-fast'].includes(values.denoiser) || ![null,'oidn','oidn-fast'].includes(values.gkDenoiser)) throw new Error('Unknown denoiser.');
  }
  validateSettings(settings);
  const orbit = controls ? createOrbitControlUpdater(controls) : null; let lastControlTime = performance.now();
  let mode = 'basic', disposed = false, revision = 0;
  let beauty, beautyPending, tracer, loop, sync, sourceCamera;
  let gk, pathDisplayDispose;
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
    const state = { mode, samples: gk?.samples || loop?.samples || 0, status: gk?.status || loop?.status || 'ready', maxSamples: settings.maxSamples, ...detail };
    const key = JSON.stringify(state); if (key !== lastStatus) { lastStatus = key; onStatus(state); }
  };
  const showPath = (show) => { pathCanvas.hidden = !show; renderer.domElement.style.opacity = show ? '0' : originalOpacity; };
  function releasePath() {
    loop?.dispose(); sync?.dispose(); pathDisplayDispose?.(); pathDisplayDispose = undefined; tracer?.dispose();
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

  function createSync(api, engine, activeCamera) {
    const bridge = new api.THREESync(engine, { scene, camera: activeCamera, controls: activeCamera === camera ? controls : undefined, updateControls: false, convertMaterial, convertLight });
    const update = bridge.update.bind(bridge), clear = new Color();
    const pixels = new Float32Array([0,0,0,1]);
    const background = new api.Texture({width:1,height:1,data:pixels});
    bridge.update = () => {
      update();
      // Flat MuTracer colors bypass exposure/tone mapping. A constant HDR map
      // follows the same display transform as Three's clear color/Color background.
      // Retain its identity and change its version only when the input changes.
      if (bridge.scene && !scene.userData?.mutracerHiddenBackground && !scene.userData?.mutracerGroundedSkybox && (!scene.background || scene.background.isColor)) {
        if (scene.background?.isColor) clear.copy(scene.background);
        else if (renderer.getClearColor) renderer.getClearColor(clear);
        else return;
        const values = [clear.r,clear.g,clear.b,scene.background ? 1 : renderer.getClearAlpha?.() ?? 1];
        if (values.some((value,index) => Math.fround(value) !== pixels[index])) {
          pixels.set(values); background.markUpdated();
        }
        bridge.scene.background = background;
      }
    };
    return bridge;
  }
  function makeSync(api, activeCamera) {
    sync?.dispose();
    sync = createSync(api, tracer, activeCamera);
    sourceCamera = activeCamera;
  }
  let pathApi;
  return {
    get mode() { return mode; },
    get settings() { return { ...settings }; },
    async setSettings(next) {
      const values = { ...settings, ...next };
      validateSettings(values);
      if (loop && values.denoiser !== settings.denoiser) await loop.final.setDenoiser(muDenoiser(values.denoiser));
      await gk?.setSettings(values);
      Object.assign(settings, values);
      if (loop) { loop.final.maxSamples = settings.maxSamples; loop.final.bounces = settings.bounces; }
      notify();
    },
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
          nextGk = await createGkjohnsonTracer({ api, renderer, scene, camera, settings, loadDenoiser, denoiserWeightsBaseUrl, onError: error => notify({ status: 'error', error: error.message }) });
          if (disposed || request !== revision) { nextGk.dispose(); return; }
        }
        if (next === 'pathtraced') {
          if (!loadPathTracer) throw new Error("Pass loadPathTracer: () => import('@meimu/mutracer') to enable path tracing.");
          pathApi = await loadPathTracer();
          if (disposed || request !== revision) return;
          const candidate = new pathApi.Engine({ canvas: pathCanvas, backend: 'auto' });
          let displayDispose;
          try { await candidate.init(); displayDispose = await configurePathTracer?.(candidate); }
          catch (error) { candidate.dispose(); throw error; }
          if (disposed || request !== revision) { displayDispose?.(); candidate.dispose(); return; }
          let nextSync, nextLoop;
          try {
            nextSync = createSync(pathApi, candidate, camera);
            nextLoop = new pathApi.RenderLoop(candidate, { sync: nextSync, idleMs: 80, preview: { timeBudgetMs: 32 }, final: { maxSamples: settings.maxSamples, bounces: settings.bounces } });
            await nextLoop.final.setDenoiser(muDenoiser(settings.denoiser));
          }
          catch (error) { nextLoop?.dispose(); nextSync?.dispose(); displayDispose?.(); candidate.dispose(); throw error; }
          if (disposed || request !== revision) { nextLoop.dispose(); nextSync.dispose(); displayDispose?.(); candidate.dispose(); return; }
          pathDisplayDispose = displayDispose; tracer = candidate; sync = nextSync; loop = nextLoop; sourceCamera = camera;
          tracer.on('error', error => notify({ error: error.message, status: 'error' }));
          if (!configurePathTracer) tracer.display.toneMapping = 'agx';
          tracer.display.toneMappingExposure = renderer.toneMapping === NoToneMapping ? 1 : renderer.toneMappingExposure;
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
      const now = performance.now(); orbit?.update(Math.min(0.1,Math.max(0,(now-lastControlTime)/1000))); lastControlTime=now;
      if (mode === 'pathtraced-gk') {
        try { validatePath(true); gk.render(activeCamera); notify(); }
        catch (error) { gk?.dispose(); gk = undefined; mode = 'basic'; notify({ status: 'error', error: error.message }); renderer.render(scene, activeCamera); }
      } else if (mode === 'pathtraced') {
        // Stage edits can introduce materials absent when this mode was selected.
        try { validatePath(); } catch (error) { releasePath(); mode = 'basic'; notify({ status: 'error', error: error.message }); renderer.render(scene, activeCamera); return; }
        if (sourceCamera !== activeCamera) { loop.removeSync(sync); makeSync(pathApi, activeCamera); loop.addSync(sync); }
        tracer.display.toneMappingExposure = renderer.toneMapping === NoToneMapping ? 1 : renderer.toneMappingExposure;
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
    dispose() { if (disposed) return; disposed = true; revision++; orbit?.dispose(); gk?.dispose(); gk = undefined; releasePath(); releaseBeauty(); if (ownsCanvas) pathCanvas.remove(); else pathCanvas.hidden = originalHidden; },
  };
}
