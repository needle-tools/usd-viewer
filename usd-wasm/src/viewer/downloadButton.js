import {viewerIcon} from './icons.js';
import {installViewerStyle} from './style.js';
import {compressArchive} from '../scene/compressArchive.js';

const formats = ['zip', 'usdz', 'gltf'];
let nextId = 0;

/** A standalone stage download control; the host owns the current Hydra handle. */
export function mountDownloadButton(options) {
  const menuOnly = options.menuOnly === true;
  if (options.style !== false) installViewerStyle();
  const container = options.container || document.body;
  const element = document.createElement('div'); element.className = 'usd-download';
  const button = document.createElement('button'); button.type = 'button'; button.className = 'usd-download-button';
  button.setAttribute('aria-label', 'Download');
  const label = document.createElement('span'); label.className = 'usd-download-label';
  const idleLabel = document.createElement('span'); idleLabel.textContent = 'Download'; idleLabel.className = 'usd-download-idle';
  const busyLabel = document.createElement('span'); busyLabel.textContent = 'Exporting…'; busyLabel.className = 'usd-download-busy';
  label.append(idleLabel, busyLabel);
  if (menuOnly) {
    const cancelLabel = document.createElement('span');
    cancelLabel.className = 'usd-download-cancel';
    cancelLabel.textContent = 'Cancel';
    label.append(cancelLabel);
  }
  const glyph = document.createElement('span'); glyph.className = 'usd-download-glyph'; glyph.setAttribute('aria-hidden','true');
  const spinner = document.createElement('span'); spinner.className = 'usd-download-spinner';
  glyph.append(viewerIcon('download'), spinner); button.append(glyph, label);
  const menuElement = document.createElement('details'); menuElement.className = 'usd-download-format'; menuElement.dataset.usdMenu = 'download';
  const summary = document.createElement('summary');
  const menuTrigger = menuOnly ? button : summary;
  menuTrigger.classList.add('usd-download-trigger');
  if (menuOnly) summary.hidden = true;
  else {
    menuTrigger.setAttribute('aria-label', 'Download format'); menuTrigger.title = 'Download format';
    menuTrigger.append(viewerIcon('expand_more'));
  }
  menuTrigger.setAttribute('aria-haspopup', 'menu');
  menuTrigger.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('div'); menu.className = 'usd-download-menu'; menu.id = `usd-download-formats-${++nextId}`;
  menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Download formats'); menuTrigger.setAttribute('aria-controls', menu.id);
  const topLayer = typeof menu.showPopover === 'function';
  if (topLayer) menu.setAttribute('popover', 'manual');
  let format = options.format || 'zip', sharing = false, busy = false, disposed = false, progress = null, activeSource = null, compressionAbort = null;
  let announcedPhase = '', announcedPercent = -1;
  let exportingFormat = format;
  let exportChangedPose = false, poseHandle;
  let textureResolution = options.textureResolution || 'original';
  try { if(options.stateKey) textureResolution=JSON.parse(localStorage.getItem(options.stateKey+':textures'))||textureResolution; } catch {}
  if(!['original','preview'].includes(textureResolution))textureResolution='original';
  const status = document.createElement('span'); status.className = 'usd-download-status'; status.id = `usd-download-status-${nextId}`;
  status.setAttribute('role','status'); status.setAttribute('aria-live','polite'); status.setAttribute('aria-atomic','true');
  try { if (options.stateKey) format = JSON.parse(localStorage.getItem(options.stateKey)) || format; } catch {}
  if (!formats.includes(format)) format = 'zip';
  const items = formats.map(value => {
    const item = document.createElement('button'); item.type = 'button'; item.textContent = value === 'gltf' ? 'glTF' : value.toUpperCase();
    item.setAttribute('role', menuOnly ? 'menuitem' : 'menuitemradio');
    item.addEventListener('click', () => { setFormat(value); closeMenu(); button.focus(); if (menuOnly) runAction(download); });
    menu.append(item); return item;
  });
  const shareItem=document.createElement('button');shareItem.type='button';shareItem.textContent='Share on Needle Cloud';shareItem.setAttribute('role',menuOnly?'menuitem':'menuitemradio');
  shareItem.addEventListener('click',()=>{
    closeMenu();button.focus();
    if (menuOnly) runAction(share);
    else { sharing=true;refresh(); }
  });menu.append(shareItem);
  const textureItem=document.createElement('button');textureItem.type='button';textureItem.className='usd-download-textures';
  textureItem.setAttribute('role','menuitemcheckbox');
  const textureCheck=document.createElement('span');textureCheck.setAttribute('aria-hidden','true');textureCheck.className='usd-download-checkbox';
  textureItem.append(textureCheck,'Full-resolution textures');
  textureItem.addEventListener('click',()=>setTextureResolution(textureResolution==='original'?'preview':'original'));menu.append(textureItem);
  const poseItem=document.createElement('button');poseItem.type='button';
  poseItem.setAttribute('role','menuitemcheckbox');
  const poseCheck=document.createElement('span');poseCheck.setAttribute('aria-hidden','true');poseCheck.className='usd-download-checkbox';
  poseItem.append(poseCheck,'Export with changed SimReady pose');
  poseItem.addEventListener('click',()=>{exportChangedPose=!exportChangedPose;refresh();});menu.append(poseItem);
  menuElement.append(summary, menu); element.append(button, menuElement, status); container.append(element);

  function reportProgress(value) {
    if (disposed || compressionAbort?.signal.aborted) return;
    progress = value;
    const names = {preparing:'Preparing',dependencies:'Fetching dependencies',packaging:'Packaging',reading:'Reading archive',textures:'Preparing preview textures',compressing:'Compressing ZIP',physics:'Physics',metadata:'Metadata',geometry:'Geometry',writing:'Writing glTF',sharing:'Sharing',complete:sharing?'Share ready':'Download ready'};
    const percent = value.total > 0 ? Math.min(100, Math.floor(value.completed / value.total * 100)) : -1;
    const text = names[value.phase] + (percent >= 0 && value.phase !== 'complete' ? ` ${percent}%` : '');
    button.title = value.phase === 'complete' ? text : `Exporting ${exportingFormat.toUpperCase()} · ${text}`;
    if (value.phase !== announcedPhase || percent >= announcedPercent + 10 || percent === 100) {
      status.textContent = text; announcedPhase = value.phase; announcedPercent = percent;
    }
    try { options.onProgress?.(value); } catch (error) { console.warn('Export progress callback failed:', error); }
  }

  function refresh() {
    if (disposed) return;
    const source = options.getSource(), allowed = source?.formats || (!source||source.exportGltf ? formats : ['zip','usdz']);
    if (poseHandle !== source?.handle) {
      poseHandle = source?.handle;
      exportChangedPose = false;
    }
    if (busy && (!source || source.handle !== activeSource?.handle || activeSource?.isCurrent?.() === false)) compressionAbort?.abort();
    if (!allowed.includes(format)) format = allowed[0] || 'zip';
    if(sharing&&!source?.share)sharing=false;
    const canCancel = menuOnly && busy && !compressionAbort.signal.aborted;
    button.disabled = busy ? !canCancel : !source || (sharing ? !source.share : allowed.length === 0);
    const showShare = sharing && !menuOnly;
    idleLabel.textContent=showShare?'Share':'Download';
    button.setAttribute('aria-label', canCancel ? 'Cancel export' : menuOnly && busy ? 'Cancelling export' : idleLabel.textContent);
    busyLabel.textContent = menuOnly && busy && !canCancel ? 'Cancelling…' : 'Exporting…';
    glyph.replaceChildren(viewerIcon(showShare?'share':'download'),spinner);
    button.setAttribute('aria-busy', String(busy)); element.dataset.exporting = String(busy);
    if (menuOnly) {
      element.dataset.cancellable = String(canCancel);
      if (busy) button.removeAttribute('aria-haspopup');
      else button.setAttribute('aria-haspopup', 'menu');
    }
    if (busy) button.setAttribute('aria-describedby', status.id);
    else { button.title = !source?'Open a file first':menuOnly?'Download':sharing?'Share on Needle Cloud':`Download ${format==='gltf'?'glTF':format.toUpperCase()}`; element.dataset.tip=button.dataset.tip=button.title;button.removeAttribute('aria-describedby'); }
    menuTrigger.setAttribute('aria-disabled', String(button.disabled)); menuTrigger.tabIndex = button.disabled ? -1 : 0;
    items.forEach((item, index) => {
      item.disabled = button.disabled || !allowed.includes(formats[index]);
      item.hidden = formats[index]==='gltf'&&!source?.exportGltf;
      if (!menuOnly) item.setAttribute('aria-checked', String(!sharing&&formats[index] === format));
    });
    shareItem.hidden=!source?.share;shareItem.disabled=button.disabled;
    if (!menuOnly) shareItem.setAttribute('aria-checked',String(sharing));
    textureItem.hidden=false;
    textureItem.disabled=button.disabled;
    textureItem.setAttribute('aria-checked',String(textureResolution==='original'));
    textureItem.title=textureResolution==='original'?'Export source textures at full resolution':'Export the currently loaded preview textures';
    poseItem.hidden=!source?.canExportChangedPose;
    poseItem.disabled=button.disabled||!source?.canExportChangedPose?.();
    poseItem.setAttribute('aria-checked',String(exportChangedPose));
    if (busy || button.disabled) closeMenu();
  }
  function setFormat(value) {
    if (!formats.includes(value)) throw new RangeError(`Unsupported download format: ${value}`);
    format = value;
    sharing = false;
    try { if (options.stateKey) localStorage.setItem(options.stateKey, JSON.stringify(format)); } catch {}
    refresh(); options.onFormatChange?.(format);
  }
  function setTextureResolution(value) {
    if(!['original','preview'].includes(value))throw new RangeError('Unsupported export texture resolution: '+value);
    textureResolution=value;
    try {if(options.stateKey)localStorage.setItem(options.stateKey+':textures',JSON.stringify(value));}catch{}
    refresh();options.onTextureResolutionChange?.(value);
  }
  function positionMenu() {
    if (!menuElement.open || disposed) return;
    const anchor = (options.menuAnchor || (menuOnly ? menuTrigger : element)).getBoundingClientRect();
    const bounds = menu.getBoundingClientRect();
    const top = anchor.bottom + 4 + bounds.height <= innerHeight - 8 ? anchor.bottom + 4 : Math.max(8, anchor.top - bounds.height - 4);
    menu.style.left = `${Math.max(8, Math.min(anchor.right - bounds.width, innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${top}px`;
  }
  function openMenu() {
    refresh(); if (disposed || busy || button.disabled || menuElement.open) return;
    menuElement.open = true; menuTrigger.setAttribute('aria-expanded', 'true');
    if (topLayer) menu.showPopover();
    positionMenu(); options.onOpenChange?.(true);
  }
  function closeMenu() {
    const wasOpen = menuElement.open;
    if (topLayer && menu.matches(':popover-open')) menu.hidePopover();
    menuElement.open = false; menuTrigger.setAttribute('aria-expanded', 'false');
    if (wasOpen) options.onOpenChange?.(false);
  }
  async function download() {
    if (disposed || busy) return;
    const source = options.getSource(); if (!source) return;
    refresh(); if (button.disabled) return;
    const selectedFormat = format;
    const selectedShare = sharing;
    const selectedTextures = textureResolution;
    const changedPose = !poseItem.disabled && !poseItem.hidden && exportChangedPose;
    exportingFormat = selectedFormat;
    closeMenu(); busy = true; activeSource = source; compressionAbort = new AbortController(); refresh();
    announcedPhase = ''; announcedPercent = -1; reportProgress({phase:'preparing',completed:0,total:0});
    const current = () => !disposed && !compressionAbort.signal.aborted && options.getSource()?.handle === source.handle && source.isCurrent?.() !== false;
    try {
      // Give the busy UI a task boundary before starting work. Native packaging
      // uses a pthread; compression uses a separate module worker below.
      await (globalThis.scheduler?.yield?.() || new Promise(resolve => setTimeout(resolve, 0)));
      if (!current()) return;
      if(selectedShare){reportProgress({phase:'sharing',completed:0,total:0});await source.share({format:selectedFormat,textureResolution:selectedTextures,exportChangedPose:changedPose,signal:compressionAbort.signal,onProgress:reportProgress});return;}
      const exportUsdz = source.exportUsdz || (options => source.handle.exportUsdz(options));
      let bytes = selectedFormat==='gltf' ? await source.exportGltf({onProgress:reportProgress,signal:compressionAbort.signal,textureResolution:selectedTextures,exportChangedPose:changedPose}) : await exportUsdz({textureResolution:selectedTextures,exportChangedPose:changedPose,signal:compressionAbort.signal,onProgress:value => {
        if (current() && value.phase !== 'complete') reportProgress(value);
      }});
      if (!current()) return;
      if (selectedFormat === 'zip') {
        reportProgress({phase:'compressing',completed:0,total:0});
        bytes = await compressArchive(bytes, {onProgress:reportProgress,signal:compressionAbort.signal});
      }
      if (current()) { saveDownload(bytes, source.filename, selectedFormat); reportProgress({phase:'complete',completed:1,total:1}); }
    } catch (error) {
      if (compressionAbort.signal.aborted || !current()) return;
      status.textContent = 'Export failed'; throw error;
    } finally {
      if (menuOnly && compressionAbort.signal.aborted) status.textContent = 'Export cancelled';
      busy = false; activeSource = null; compressionAbort = null; refresh();
    }
  }
  async function share() {
    if(disposed||busy||!options.getSource()?.share)return;
    sharing=true;refresh();await download();
  }
  function runAction(action) {
    void action().catch(error => {
      if (!disposed) (options.onError || (error => console.error('Download failed:', error)))(error);
    });
  }
  if (!menuOnly) button.addEventListener('click', () => runAction(download));
  menuTrigger.addEventListener('click', event => {
    event.preventDefault();
    if (menuOnly && busy) {
      compressionAbort.abort();
      status.textContent = 'Cancelling export';
      refresh();
    } else if (menuElement.open) closeMenu();
    else openMenu();
  });
  menuTrigger.addEventListener('keydown', event => {
    if (busy || button.disabled) return;
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault(); openMenu();
      const enabled = [...items,shareItem,textureItem,poseItem].filter(item => !item.disabled&&!item.hidden);
      (event.key === 'ArrowUp' ? enabled.at(-1) : enabled[0])?.focus();
    }
  });
  menu.addEventListener('keydown', event => {
    const enabled = [...items,shareItem,textureItem,poseItem].filter(item => !item.disabled&&!item.hidden), index = enabled.indexOf(document.activeElement);
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(event.key)) return;
    if (event.key === 'Tab') { closeMenu(); (event.shiftKey ? button : menuTrigger).focus(); return; }
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
    enabled[next]?.focus();
  });
  element.addEventListener('keydown', event => {
    if (options.onMenuNavigate && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation(); options.onMenuNavigate(event.key === 'ArrowRight' ? 1 : -1);
    }
  });
  const outside = event => { if (!element.contains(event.target)) closeMenu(); };
  const escape = event => {
    if (event.key === 'Escape' && menuElement.open) { event.preventDefault(); closeMenu(); menuTrigger.focus(); }
  };
  document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
  window.addEventListener('resize', positionMenu); document.addEventListener('scroll', positionMenu, true);
  const observer = new ResizeObserver(positionMenu); observer.observe(element);
  refresh();
  return {
    element, button, menuElement, menuTrigger, refresh, setFormat, setTextureResolution, download, share, openMenu, closeMenu,
    get textureResolution() { return textureResolution; },
    get format() { return format; }, get busy() { return busy; }, get menuOpen() { return menuElement.open; },
    get progress() { return progress; },
    dispose() {
      if (disposed) return;
      closeMenu(); disposed = true; compressionAbort?.abort(); observer.disconnect();
      document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', positionMenu); document.removeEventListener('scroll', positionMenu, true);
      element.remove();
    },
  };
}

function saveDownload(bytes, name, format) {
  let filename = String(name).split(/[?#]/)[0].split('/').pop() || 'stage';
  try { filename = decodeURIComponent(filename); } catch {}
  const basename = filename.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'stage';
  const url = URL.createObjectURL(new Blob([bytes], {type: format === 'gltf'?'model/gltf-binary':format === 'zip' ? 'application/zip' : 'model/vnd.usdz+zip'}));
  const link = document.createElement('a'); link.href = url; link.download = `${basename}.${format==='gltf'?'glb':format}`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
