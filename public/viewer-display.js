import {readRenderSettings, saveRenderSettings} from './viewer-preferences.js';
import {AgXToneMapping,NoToneMapping,LinearToneMapping,ReinhardToneMapping,ACESFilmicToneMapping,NeutralToneMapping} from 'three';
const modes=[['needle-agx','Needle AgX',AgXToneMapping],['aces','ACES',ACESFilmicToneMapping],['neutral','Khronos Neutral',NeutralToneMapping],['linear','Linear',LinearToneMapping],['reinhard','Reinhard',ReinhardToneMapping],['none','None',NoToneMapping]];
export function viewerToneMapping(){const value=readRenderSettings().toneMapping;return(modes.find(mode=>mode[0]===value)||modes[0])[2];}
export function mountDisplayControl(parent,renderer,getNeedleRenderer){
  const row=document.createElement('label');row.className='usd-settings-row';row.append('Tone mapping');
  const select=document.createElement('select');select.setAttribute('aria-label','Tone mapping');
  for(const [value,label,id]of modes){const option=document.createElement('option');option.value=value;option.textContent=label;option.selected=id===viewerToneMapping();select.append(option);}
  select.onchange=()=>{const mode=modes.find(mode=>mode[0]===select.value);renderer.toneMapping=mode[2];const needle=getNeedleRenderer();if(needle)needle.toneMapping=mode[2];saveRenderSettings({toneMapping:mode[0]});};
  row.append(select);parent.append(row);return row;
}
