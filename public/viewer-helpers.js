import {readRenderSettings, saveRenderSettings} from './viewer-preferences.js';

const synchronizers=new WeakMap(), owners=new WeakMap();
export function syncViewportHelpers(container){if(container)synchronizers.get(container)?.();}

const choices = [['curves','Curve centerlines'],['controlPoints','Control points'],['points','Point markers'],['lights','Lights'],['cameras','Cameras'],['joints','Joint constraints']];

export async function showViewportHelpers(container, handle, onPurposesChange = () => {}) {
  if(!container)return;
  const owner={};owners.set(container,owner);
  container.replaceChildren();synchronizers.delete(container);container.parentElement.ontoggle=null;
  if(!handle?.setHelpers)return;
  const stored=readRenderSettings().helpers || {}, settings={curves:true,joints:true};
  for(const [key] of choices)if(typeof stored[key]==='boolean')settings[key]=stored[key];
  handle.setHelpers(settings);
  if(stored.guides===true && !handle.includedPurposes.includes('guide'))await handle.setIncludedPurposes([...handle.includedPurposes,'guide']);
  if(owners.get(container)!==owner)return;
  const persist=()=>saveRenderSettings({helpers:{...handle.helpers,guides:handle.includedPurposes.includes('guide')}});
  for(const [key,title] of choices) {
    const label=document.createElement('label');label.className='usd-menu-row';label.textContent=title;
    const check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label',`Show ${title.toLowerCase()}`);check.checked=handle.helpers[key];
    check.onchange=()=>{handle.setHelpers({[key]:check.checked});persist();};
    label.append(check);container.append(label);
  }
  const label=document.createElement('label');label.className='usd-menu-row';label.textContent='Guide geometry';
  const check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label','Show guide geometry');
  const sync=()=>{check.checked=handle.includedPurposes.includes('guide');};sync();
  synchronizers.set(container,sync);container.parentElement.ontoggle=sync;
  check.onchange=async()=>{
    check.disabled=true;
    try {
      const purposes=handle.includedPurposes.filter(purpose=>purpose!=='guide');
      await handle.setIncludedPurposes(check.checked?[...purposes,'guide']:purposes);
      persist();await onPurposesChange();
    }catch(error){console.error('Failed to change guide visibility',error);}
    finally{sync();check.disabled=false;}
  };
  label.append(check);container.append(label);
}
