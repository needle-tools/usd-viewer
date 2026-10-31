import {readRenderSettings, saveRenderSettings} from './viewer-preferences.js';
import {configureNeedleAgxDisplay} from './usd/renderers/index.js';
import { mountRenderModePicker } from './usd/viewer/inspect.js';

export async function mountRenderModes({ renderer, scene, camera, controls, preference }) {
  let selectedMode = preference;
  const updateUrl = mode => {
    const url = new URL(location.href);
    url.searchParams.set('render', mode);
    history.replaceState({}, '', url);
  };
  const rememberMode = mode => {
    selectedMode = mode; saveRenderSettings({mode}); updateUrl(mode);
  };
  const saved = readRenderSettings();
  const settings={};if(Number.isInteger(saved.maxSamples)&&saved.maxSamples>=1&&saved.maxSamples<=65536)settings.maxSamples=saved.maxSamples;if(Number.isInteger(saved.bounces)&&saved.bounces>=1&&saved.bounces<=20)settings.bounces=saved.bounces;if([null,'jnlm','oidn','oidn-fast'].includes(saved.denoiser))settings.denoiser=saved.denoiser;if([null,'oidn','oidn-fast'].includes(saved.gkDenoiser))settings.gkDenoiser=saved.gkDenoiser;
  if(Number.isFinite(saved.exposure)&&saved.exposure>=0&&saved.exposure<=32)renderer.toneMappingExposure=saved.exposure;
  if (typeof saved.bloom === 'boolean') settings.bloom = saved.bloom;
  for (const [key, max] of [['bloomStrength', 10], ['bloomRadius', 1], ['bloomThreshold', 100]]) {
    if (Number.isFinite(saved[key]) && saved[key] >= 0 && saved[key] <= max) settings[key] = saved[key];
  }
  const { modes, select, status, panel } = await mountRenderModePicker({ layout: window.usdWorkbench ? 'settings' : 'compact', settings, onSettingsChange: saveRenderSettings, renderer, scene, camera, controls, container: window.usdWorkbench?.containers.settings, onModeChange: rememberMode, onStatus(info) { if (info.error) updateUrl(info.mode); }, configurePathTracer: engine => configureNeedleAgxDisplay(engine,()=>renderer.toneMapping), loadPathTracer: () => import('@meimu/mutracer'), loadGkPathTracer: () => import('three-gpu-pathtracer/webgpu'), loadDenoiser: () => import('oidn-webgpu'), denoiserWeightsBaseUrl: '/mutracer/oidn/weights/' });
  async function choose(mode) {
    select.disabled = true;
    try {
      await modes.setMode(mode);
      updateUrl(mode);
    } catch (error) { select.value = modes.mode; status.textContent = error.message; panel.dataset.error = 'true'; }
    finally { select.disabled = false; }
  }
  select.value = selectedMode;
  let started = false;
  window.addEventListener('pagehide', () => { modes.dispose(); panel.remove(); }, { once: true });
  return { modes, dispose() { modes.dispose(); panel.remove(); }, async start() { if (!started) { started = true; await choose(selectedMode); } } };
}
