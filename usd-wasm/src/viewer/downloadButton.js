import {viewerIcon} from './icons.js';
import {installViewerStyle} from './style.js';
import {compressArchive} from '../scene/compressArchive.js';

const formats = ['zip', 'usdz'];
let nextId = 0;

/** A standalone stage download control; the host owns the current Hydra handle. */
export function mountDownloadButton(options) {
  if (options.style !== false) installViewerStyle();
  const container = options.container || document.body;
  const element = document.createElement('div'); element.className = 'usd-download';
  const button = document.createElement('button'); button.type = 'button'; button.className = 'usd-download-button';
  button.setAttribute('aria-label', 'Download');
  const label = document.createElement('span'); label.className = 'usd-download-label';
  const idleLabel = document.createElement('span'); idleLabel.textContent = 'Download'; idleLabel.className = 'usd-download-idle';
  const busyLabel = document.createElement('span'); busyLabel.textContent = 'Exporting…'; busyLabel.className = 'usd-download-busy';
  label.append(idleLabel, busyLabel);
  const glyph = document.createElement('span'); glyph.className = 'usd-download-glyph'; glyph.setAttribute('aria-hidden','true');
  const spinner = document.createElement('span'); spinner.className = 'usd-download-spinner';
  glyph.append(viewerIcon('download'), spinner); button.append(glyph, label);
  const menuElement = document.createElement('details'); menuElement.className = 'usd-download-format'; menuElement.dataset.usdMenu = 'download';
  const menuTrigger = document.createElement('summary'); menuTrigger.className = 'usd-download-trigger';
  menuTrigger.setAttribute('aria-label', 'Download format'); menuTrigger.title = 'Download format';
  menuTrigger.setAttribute('aria-haspopup', 'menu'); menuTrigger.append(viewerIcon('expand_more'));
  const menu = document.createElement('div'); menu.className = 'usd-download-menu'; menu.id = `usd-download-formats-${++nextId}`;
  menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Download formats'); menuTrigger.setAttribute('aria-controls', menu.id);
  const topLayer = typeof menu.showPopover === 'function';
  if (topLayer) menu.setAttribute('popover', 'manual');
  let format = options.format || 'zip', busy = false, disposed = false, progress = null, activeSource = null, compressionAbort = null;
  let announcedPhase = '', announcedPercent = -1;
  let exportingFormat = format;
  const status = document.createElement('span'); status.className = 'usd-download-status'; status.id = `usd-download-status-${nextId}`;
  status.setAttribute('role','status'); status.setAttribute('aria-live','polite'); status.setAttribute('aria-atomic','true');
  try { if (options.stateKey) format = JSON.parse(localStorage.getItem(options.stateKey)) || format; } catch {}
  if (!formats.includes(format)) format = 'zip';
  const items = formats.map(value => {
    const item = document.createElement('button'); item.type = 'button'; item.textContent = value.toUpperCase();
    item.setAttribute('role', 'menuitemradio');
    item.addEventListener('click', () => { setFormat(value); closeMenu(); button.focus(); });
    menu.append(item); return item;
  });
  menuElement.append(menuTrigger, menu); element.append(button, menuElement, status); container.append(element);

  function reportProgress(value) {
    if (disposed) return;
    progress = value;
    const names = {preparing:'Preparing',dependencies:'Fetching dependencies',packaging:'Packaging',reading:'Reading archive',compressing:'Compressing ZIP',complete:'Download ready'};
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
    const source = options.getSource(), allowed = source?.formats || formats;
    if (busy && (!source || source.handle !== activeSource?.handle || activeSource?.isCurrent?.() === false)) compressionAbort?.abort();
    if (!allowed.includes(format)) format = allowed[0] || 'zip';
    button.disabled = !source || busy || allowed.length === 0;
    button.setAttribute('aria-busy', String(busy)); element.dataset.exporting = String(busy);
    if (busy) button.setAttribute('aria-describedby', status.id);
    else { button.title = `Download ${format.toUpperCase()}`; button.removeAttribute('aria-describedby'); }
    menuTrigger.setAttribute('aria-disabled', String(button.disabled)); menuTrigger.tabIndex = button.disabled ? -1 : 0;
    items.forEach((item, index) => {
      item.disabled = button.disabled || !allowed.includes(formats[index]);
      item.setAttribute('aria-checked', String(formats[index] === format));
    });
    if (button.disabled) closeMenu();
  }
  function setFormat(value) {
    if (!formats.includes(value)) throw new RangeError(`Unsupported download format: ${value}`);
    format = value;
    try { if (options.stateKey) localStorage.setItem(options.stateKey, JSON.stringify(format)); } catch {}
    refresh(); options.onFormatChange?.(format);
  }
  function positionMenu() {
    if (!menuElement.open || disposed) return;
    const anchor = (options.menuAnchor || element).getBoundingClientRect();
    const bounds = menu.getBoundingClientRect();
    const top = anchor.bottom + 4 + bounds.height <= innerHeight - 8 ? anchor.bottom + 4 : Math.max(8, anchor.top - bounds.height - 4);
    menu.style.left = `${Math.max(8, Math.min(anchor.right - bounds.width, innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${top}px`;
  }
  function openMenu() {
    refresh(); if (disposed || button.disabled || menuElement.open) return;
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
    exportingFormat = selectedFormat;
    closeMenu(); busy = true; activeSource = source; compressionAbort = new AbortController(); refresh();
    announcedPhase = ''; announcedPercent = -1; reportProgress({phase:'preparing',completed:0,total:0});
    const current = () => !disposed && options.getSource()?.handle === source.handle && source.isCurrent?.() !== false;
    try {
      // Give the busy UI a task boundary before starting work. Native packaging
      // uses a pthread; compression uses a separate module worker below.
      await (globalThis.scheduler?.yield?.() || new Promise(resolve => setTimeout(resolve, 0)));
      if (!current()) return;
      let bytes = await source.handle.exportUsdz({onProgress:value => {
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
    } finally { busy = false; activeSource = null; compressionAbort = null; refresh(); }
  }
  button.addEventListener('click', () => { void download().catch(error => {
    if (!disposed) (options.onError || (error => console.error('Download failed:', error)))(error);
  }); });
  menuTrigger.addEventListener('click', event => { event.preventDefault(); menuElement.open ? closeMenu() : openMenu(); });
  menuTrigger.addEventListener('keydown', event => {
    if (button.disabled) return;
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault(); openMenu();
      const enabled = items.filter(item => !item.disabled);
      (event.key === 'ArrowUp' ? enabled.at(-1) : enabled[0])?.focus();
    }
  });
  menu.addEventListener('keydown', event => {
    const enabled = items.filter(item => !item.disabled), index = enabled.indexOf(document.activeElement);
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
    element, button, menuElement, menuTrigger, refresh, setFormat, download, openMenu, closeMenu,
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
  const url = URL.createObjectURL(new Blob([bytes], {type: format === 'zip' ? 'application/zip' : 'model/vnd.usdz+zip'}));
  const link = document.createElement('a'); link.href = url; link.download = `${basename}.${format}`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
