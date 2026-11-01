import {viewerIcon} from './usd/viewer/icons.js';
import {createTransferTracker,downloadAmount,formatBytes,formatEta} from './viewer-transfer-tracker.js';

/** Compact, expandable transfer list shared by initial loading and streaming. */
export function createDownloadProgress({getHost,onUpdate = () => {},now} = {}) {
  const tracker = createTransferTracker(now), rows = new Map();
  let root, heading, amount, bar, timing, count, list, toggle, timer, idleTimer, disposed = false;
  let expanded = true;
  const node = (tag,className) => {const el=document.createElement(tag);el.className=className;return el;};
  function setBar(element,ratio) {
    if (ratio == null) element.removeAttribute('value');
    else element.value=Math.max(0,Math.min(1,ratio));
  }
  function mount() {
    if (root) return;
    root=node('section','usd-asset-progress');root.setAttribute('aria-label','Downloads');
    // The panel lives over the viewport. OrbitControls must not capture its
    // pointer or treat scrolling the transfer list as camera zoom.
    for(const type of ['pointerdown','pointerup','wheel'])root.addEventListener(type,event=>event.stopPropagation());
    toggle=node('button','usd-download-heading');toggle.type='button';toggle.setAttribute('aria-expanded','true');
    const icon=viewerIcon('download');heading=node('span','usd-download-title');heading.setAttribute('role','status');
    toggle.append(icon,heading,viewerIcon('expand_more'));toggle.onclick=()=>{expanded=!expanded;list.hidden=!expanded;toggle.setAttribute('aria-expanded',String(expanded));};
    const summary=node('div','usd-download-summary');amount=node('span','usd-download-amount');count=node('span','usd-download-count');summary.append(amount,count);
    bar=node('progress','usd-download-bar');bar.max=1;bar.setAttribute('aria-label','Known downloads');
    timing=node('div','usd-download-timing');list=node('ul','usd-download-files');list.setAttribute('aria-label','Files downloading');
    root.append(toggle,summary,bar,timing,list);
  }
  function render() {
    timer=undefined;if(disposed)return;
    const snapshot=tracker.snapshot();onUpdate(snapshot);
    if (!snapshot.files.length) return;
    mount();const host=getHost?.();if(host&&root.parentElement!==host)host.append(root);
    root.hidden=false;root.dataset.state=snapshot.active?'active':snapshot.failed?'error':'done';
    const title=snapshot.active?`Downloading ${snapshot.active} ${snapshot.active===1?'file':'files'}`:snapshot.failed?'Download failed':'Downloads complete';
    if(heading.textContent!==title)heading.textContent=title;toggle.setAttribute('aria-label',title);
    root.title=snapshot.files.filter(file=>file.state!=='done').map(file=>file.url.split('/').pop()).join('\n');
    amount.textContent=snapshot.total==null?`${formatBytes(snapshot.loaded)} downloaded`:downloadAmount(snapshot);count.textContent=`${snapshot.completed} / ${snapshot.files.length} ${snapshot.files.length===1?'file':'files'}`;
    setBar(bar,snapshot.failed?null:snapshot.ratio);
    timing.textContent=[snapshot.rate>0?`${formatBytes(snapshot.rate)}/s`:snapshot.active?snapshot.loaded?'Waiting…':'Connecting…':'',snapshot.active?formatEta(snapshot.eta):'',snapshot.unknown?`${snapshot.unknown} ${snapshot.unknown===1?'size':'sizes'} unknown`:''].filter(Boolean).join(' · ');
    const visible=new Set();
    for (const file of snapshot.files.filter(file=>file.state!=='done')) {
      visible.add(file.url);let row=rows.get(file.url);
      if(!row){
        const element=node('li','usd-download-file'),name=node('span','usd-download-name'),status=node('span','usd-download-file-amount'),progress=node('progress','usd-download-bar');
        progress.max=1;const line=node('div','usd-download-file-heading');line.append(name,status);element.append(line,progress);list.append(element);
        row={element,name,status,progress};rows.set(file.url,row);
      }
      let filename=file.url.split(/[?#]/)[0].split('/').pop();try{filename=decodeURIComponent(filename);}catch{}
      row.name.textContent=filename;row.element.title=file.url;row.progress.setAttribute('aria-label',filename);
      row.status.textContent=file.state==='error'?'Failed':downloadAmount(file);row.element.dataset.state=file.state;
      setBar(row.progress,file.state==='error'?null:file.ratio);
    }
    for(const [url,row] of rows)if(!visible.has(url)){row.element.remove();rows.delete(url);}
    list.hidden=!expanded||!rows.size;toggle.disabled=!rows.size;toggle.setAttribute('aria-expanded',String(expanded&&rows.size>0));
    clearTimeout(idleTimer);
    if(snapshot.active)timer=setTimeout(render,250);
    else if(!snapshot.failed)idleTimer=setTimeout(()=>{if(root)root.hidden=true;},1200);
  }
  return {
    update(event) {if(disposed||!tracker.update(event))return;clearTimeout(idleTimer);if(!timer)timer=setTimeout(render,100);},
    reset() {clearTimeout(timer);clearTimeout(idleTimer);timer=undefined;tracker.reset();for(const row of rows.values())row.element.remove();rows.clear();if(root)root.hidden=true;onUpdate(tracker.snapshot());},
    get snapshot() {return tracker.snapshot();},
    dispose() {disposed=true;clearTimeout(timer);clearTimeout(idleTimer);root?.remove();tracker.reset();rows.clear();},
  };
}
