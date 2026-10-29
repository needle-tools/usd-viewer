import { mountRenderModePicker } from './usd/viewer/index.js';

export async function mountRenderModes({ renderer, scene, camera, preference }) {
  const persist = mode => {
    const url = new URL(location.href);
    if (mode === 'basic') url.searchParams.delete('render');
    else url.searchParams.set('render', mode);
    history.replaceState({}, '', url);
  };
  const { modes, select, status, panel } = await mountRenderModePicker({ renderer, scene, camera, onModeChange: persist, onStatus(info) { if (info.error) persist(info.mode); }, loadPathTracer: () => import('@meimu/mutracer'), loadGkPathTracer: () => import('three-gpu-pathtracer/webgpu') });
  async function choose(mode) {
    select.disabled = true;
    try {
      await modes.setMode(mode);
      persist(mode);
    } catch (error) { select.value = modes.mode; status.textContent = error.message; panel.dataset.error = 'true'; }
    finally { select.disabled = false; }
  }
  let started = false;
  window.addEventListener('pagehide', () => { modes.dispose(); panel.remove(); }, { once: true });
  return { modes, dispose() { modes.dispose(); panel.remove(); }, async start() { if (!started) { started = true; await choose(preference); } } };
}
