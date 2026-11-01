import {readRenderSettings, saveRenderSettings} from './viewer-preferences.js';

const choices = [['curves','Curve centerlines'],['controlPoints','Control points'],['points','Point markers'],['lights','Lights'],['cameras','Cameras']];

export function showViewportHelpers(container, handle) {
  if(!container)return;
  container.replaceChildren();
  if(!handle?.setHelpers)return;
  const stored=readRenderSettings().helpers || {}, settings={curves:true};
  for(const [key] of choices)if(typeof stored[key]==='boolean')settings[key]=stored[key];
  handle.setHelpers(settings);
  for(const [key,title] of choices) {
    const label=document.createElement('label');label.className='usd-menu-row';label.textContent=title;
    const check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label',`Show ${title.toLowerCase()}`);check.checked=handle.helpers[key];
    check.onchange=()=>{handle.setHelpers({[key]:check.checked});saveRenderSettings({helpers:handle.helpers});};
    label.append(check);container.append(label);
  }
}
