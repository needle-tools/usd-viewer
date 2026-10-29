import { createRenderModes } from '../renderers/index.js';
import { installViewerStyle } from './style.js';

export async function mountRenderModePicker({ container = document.body, style = true, onModeChange = () => {}, ...options }) {
  if (style) installViewerStyle();
  const panel = document.createElement('div'); panel.id = 'render-mode-controls'; panel.className = 'viewer-render-modes';
  const label = document.createElement('label'); label.textContent = 'Render ';
  const select = document.createElement('select'); select.setAttribute('aria-label', 'Render mode');
  for (const [value, title] of [['basic', 'Basic'], ['beauty', 'Beauty'], ['pathtraced', 'Path traced (MuTracer)'], ['pathtraced-gk', 'Path traced (gkjohnson)']]) {
    const option = document.createElement('option'); option.value = value; option.textContent = title;
    option.disabled = value === 'beauty' && !options.renderer.isWebGPURenderer || value === 'pathtraced-gk' && !options.renderer.backend?.isWebGPUBackend; select.append(option);
  }
  const status = document.createElement('span'); status.setAttribute('role', 'status');
  label.append(select); panel.append(label, status); container.append(panel);
  const modes = await createRenderModes({ ...options, onStatus(info) {
    if (info.error) { status.textContent = info.error; panel.dataset.error = 'true'; }
    else { delete panel.dataset.error; status.textContent = info.status === 'loading' ? 'Loading…' : info.mode.startsWith('pathtraced') ? `${info.samples} / 512` : ''; }
    select.value = info.mode; options.onStatus?.(info);
  } });
  async function choose(mode) {
    select.disabled = true;
    try { await modes.setMode(mode); onModeChange(modes.mode); }
    catch (error) { select.value = modes.mode; status.textContent = error.message; panel.dataset.error = 'true'; }
    finally { select.disabled = false; }
  }
  select.addEventListener('change', () => { void choose(select.value); });
  return { modes, select, status, panel, dispose() { modes.dispose(); panel.remove(); } };
}
