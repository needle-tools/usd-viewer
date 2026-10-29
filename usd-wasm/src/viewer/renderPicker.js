import { createRenderModes } from '../renderers/index.js';
import { installViewerStyle } from './style.js';

export async function mountRenderModePicker({ container = document.body, style = true, layout = 'compact', onModeChange = () => {}, onSettingsChange = () => {}, ...options }) {
  if (style) installViewerStyle();
  const panel = document.createElement('div'); panel.id = 'render-mode-controls'; panel.className = 'viewer-render-modes'; panel.dataset.layout = layout;
  const label = document.createElement('label'); label.className = 'usd-settings-row'; label.textContent = layout === 'settings' ? 'Mode' : 'Render ';
  const select = document.createElement('select'); select.setAttribute('aria-label', 'Render mode');
  for (const [value, title] of [['basic', 'Basic'], ['beauty', 'Beauty'], ['pathtraced', 'Path traced (MuTracer)'], ['pathtraced-gk', 'Path traced (gkjohnson)']]) {
    const option = document.createElement('option'); option.value = value; option.textContent = title;
    option.disabled = value === 'beauty' && !options.renderer.isWebGPURenderer || value === 'pathtraced-gk' && !options.renderer.backend?.isWebGPUBackend; select.append(option);
  }
  const status = document.createElement('span'); status.setAttribute('role', 'status');
  label.append(select); panel.append(label, status); container.append(panel);
  let sampleInput, bounceInput, denoiserInput, pathFields;
  const modes = await createRenderModes({ ...options, onStatus(info) {
    panel.dataset.status = info.status;
    if (info.error) { status.textContent = info.error; panel.dataset.error = 'true'; }
    else { delete panel.dataset.error; status.textContent = info.status === 'loading' ? 'Loading…' : info.mode.startsWith('pathtraced') ? info.status === 'previewing' ? 'Preview' : `${info.samples} / ${info.maxSamples}${info.status === 'denoising' ? ' · Denoising…' : ''}` : ''; }
    if (pathFields) {
      pathFields.hidden = !info.mode.startsWith('pathtraced');
      const gk = info.mode === 'pathtraced-gk';
      for (const option of denoiserInput.options) option.hidden = gk && option.value === 'jnlm';
      denoiserInput.value = (gk ? modes.settings.gkDenoiser : modes.settings.denoiser) || 'none';
    }
    select.value = info.mode; options.onStatus?.(info);
  } });
  function field(title, input) {const label=document.createElement('label');label.className='usd-settings-row';label.append(document.createTextNode(title),input);return label;}
  function number(title,value,min,max,change) {const input=document.createElement('input');input.type='number';input.value=value;input.min=min;input.max=max;input.step='1';input.setAttribute('aria-label',title);input.onchange=()=>void change(Number(input.value)).catch(error=>{status.textContent=error.message;panel.dataset.error='true';});return input;}
  if (layout === 'settings') {
    const exposure=number('Exposure',options.renderer.toneMappingExposure,0,32,async value=>{if(!Number.isFinite(value)||value<0||value>32)throw new Error('Exposure must be between 0 and 32.');options.renderer.toneMappingExposure=value;onSettingsChange({...modes.settings,exposure:value});});exposure.step='0.1';panel.insertBefore(field('Exposure',exposure),status);
    pathFields=document.createElement('div');pathFields.className='usd-path-settings';pathFields.hidden=true;
    const change=async next=>{await modes.setSettings(next);onSettingsChange({...modes.settings,exposure:options.renderer.toneMappingExposure});};
    sampleInput=number('Samples',modes.settings.maxSamples,1,65536,value=>change({maxSamples:value}));
    bounceInput=number('Bounces',modes.settings.bounces,1,20,value=>change({bounces:value}));
    denoiserInput=document.createElement('select');denoiserInput.setAttribute('aria-label','Denoiser');
    for(const [value,title] of [['jnlm','JNLM'],['oidn-fast','OIDN · Fast'],['oidn','OIDN · Quality'],['none','Off']]){const option=document.createElement('option');option.value=value;option.textContent=title;denoiserInput.append(option);}denoiserInput.value=modes.settings.denoiser||'none';
    denoiserInput.onchange=()=>void change({[modes.mode==='pathtraced-gk'?'gkDenoiser':'denoiser']:denoiserInput.value==='none'?null:denoiserInput.value}).catch(error=>{status.textContent=error.message;panel.dataset.error='true';});
    pathFields.append(field('Samples',sampleInput),field('Bounces',bounceInput),field('Denoiser',denoiserInput));panel.insertBefore(pathFields,status);
  }
  async function choose(mode) {
    select.disabled = true;
    try { await modes.setMode(mode); onModeChange(modes.mode); }
    catch (error) { select.value = modes.mode; status.textContent = error.message; panel.dataset.error = 'true'; }
    finally { select.disabled = false; }
  }
  select.addEventListener('change', () => { void choose(select.value); });
  return { modes, select, status, panel, dispose() { modes.dispose(); panel.remove(); } };
}
