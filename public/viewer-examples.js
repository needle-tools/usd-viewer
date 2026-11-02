const STORAGE = 'needle-usd-examples-appearance-v1';

/** Presentation preferences stay independent of catalog, selection and dock state. */
export function mountExamplesBrowser(root) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE)) || {}; } catch {}
  const size = root.querySelector('#examples-preview-size');
  const previewControl=root.querySelector('.usd-preview-renderer');
  let previewRenderer=saved.previewRenderer==='storm'?'storm':'beauty';
  const beautyPreviews=new Map();let disposed=false;
  const previewKey=value=>{
    if(!/^https?:\/\//.test(value))return decodeURIComponent(value.replace(/^\/?test-fixtures\//,'').replace(/^\//,''));
    try{return new URL(value).href;}catch{return value;}
  };
  fetch('/test-fixtures/thumbnails/beauty/index.json').then(response=>response.ok?response.json():null).then(index=>{
    if(disposed)return;for(const entry of index?.results||[])if(entry.status==='rendered'&&entry.image)beautyPreviews.set(previewKey(entry.root),'/test-fixtures/'+entry.image);previewSource();
  }).catch(()=>{});
  const details = root.querySelector('#examples-details');
  const search = root.querySelector('#examples-search');
  const grid = root.querySelector('#gallery-grid');
  const count = root.querySelector('#examples-count');
  const empty = root.querySelector('#examples-empty');
  const content = root.querySelector('.usd-examples-content');
  const divider = root.querySelector('.usd-examples-divider');
  let folderRatio = Number.isFinite(saved.split?.heightRatio) ? Math.max(0, Math.min(1, saved.split.heightRatio)) : .28;
  let folderWidth = Number.isFinite(saved.split?.width) && saved.split.width > 0 ? saved.split.width : null;
  let layout, drag, resizeFrame = 0, frameWindow;
  size.value = String(Number.isFinite(saved.size) ? Math.max(88, Math.min(216, saved.size)) : 128);
  let showDetails = saved.details !== false;
  search.value = typeof saved.search === 'string' ? saved.search : '';

  function save() {
    try { localStorage.setItem(STORAGE, JSON.stringify({ size: Number(size.value), previewRenderer, details: showDetails, search: search.value, split: {heightRatio: folderRatio, width: folderWidth} })); } catch {}
  }
  function measureSplit() {
    const view = root.ownerDocument.defaultView;
    const wide = view.getComputedStyle(content).flexDirection === 'row';
    const span = wide ? content.clientWidth : content.clientHeight;
    if (!span) return;
    const styles = view.getComputedStyle(root);
    const token = (name, fallback) => parseFloat(styles.getPropertyValue(name)) || fallback;
    const available = Math.max(0, span - (wide ? divider.offsetWidth : divider.offsetHeight));
    const min = Math.min(token(wide ? '--usd-gallery-navigation-min-width' : '--usd-gallery-navigation-min-height', wide ? 144 : 72), available / 2);
    const max = available - Math.min(token(wide ? '--usd-gallery-results-min-width' : '--usd-gallery-results-min-height', wide ? 180 : 128), available / 2);
    const desired = wide ? folderWidth ?? token('--usd-gallery-navigation-width', 240) : folderRatio * available;
    const pixels = Math.max(min, Math.min(max, desired));
    if (drag && drag.wide !== wide) finishDrag();
    layout = {wide, available, min, max, pixels};
    root.style.setProperty(wide ? '--usd-examples-folders-width' : '--usd-examples-folders-height', `${pixels}px`);
    divider.setAttribute('aria-orientation', wide ? 'vertical' : 'horizontal');
    for (const [key, value] of [['min', min], ['max', max], ['now', pixels]]) divider.setAttribute(`aria-value${key}`, String(Math.round(available ? value / available * 100 : 0)));
    divider.setAttribute('aria-valuetext', `${Math.round(pixels)} pixels`);
  }
  function scheduleSplit() {
    if (resizeFrame) return;
    frameWindow = root.ownerDocument.defaultView;
    resizeFrame = frameWindow.requestAnimationFrame(() => { resizeFrame = 0; measureSplit(); });
  }
  function changeSplit(pixels) {
    if (!layout?.available) return;
    pixels = Math.max(layout.min, Math.min(layout.max, pixels));
    if (layout.wide) folderWidth = pixels;
    else folderRatio = pixels / layout.available;
    measureSplit();
  }
  function finishDrag(event) {
    if (!drag || event && event.pointerId !== drag.pointerId) return;
    const pointerId = drag.pointerId; drag = null;
    divider.removeAttribute('data-dragging');
    if (divider.hasPointerCapture(pointerId)) divider.releasePointerCapture(pointerId);
    save();
  }
  function startDrag(event) {
    if (event.button !== 0 || drag) return;
    measureSplit(); if (!layout) return;
    event.preventDefault(); event.stopPropagation();
    divider.focus({preventScroll: true});
    drag = {pointerId: event.pointerId, wide: layout.wide, start: layout.wide ? event.clientX : event.clientY, pixels: layout.pixels};
    divider.setPointerCapture(event.pointerId); divider.setAttribute('data-dragging', '');
  }
  function moveDrag(event) {
    if (event.pointerId !== drag?.pointerId) return;
    changeSplit(drag.pixels + (drag.wide ? event.clientX : event.clientY) - drag.start);
  }
  function keyboardSplit(event) {
    measureSplit(); if (!layout) return;
    const direction = layout.wide ? {ArrowLeft: -1, ArrowRight: 1} : {ArrowUp: -1, ArrowDown: 1};
    const delta = direction[event.key];
    if (delta === undefined && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault(); event.stopPropagation();
    changeSplit(event.key === 'Home' ? layout.min : event.key === 'End' ? layout.max : layout.pixels + delta * (event.shiftKey ? 40 : 10));
    save();
  }
  divider.addEventListener('pointerdown', startDrag);
  divider.addEventListener('pointermove', moveDrag);
  divider.addEventListener('pointerup', finishDrag);
  divider.addEventListener('pointercancel', finishDrag);
  divider.addEventListener('lostpointercapture', finishDrag);
  divider.addEventListener('keydown', keyboardSplit);
  const splitObserver = new ResizeObserver(scheduleSplit);
  splitObserver.observe(content);
  function previewSource(){
    let available=false,hasBeauty=false,hasStorm=false;
    for(const image of grid.querySelectorAll('img[data-preview-key]')){
      if (image.dataset.previewDark) {
        const source=root.ownerDocument.documentElement.dataset.theme==='light'?image.dataset.previewLight:image.dataset.previewDark;
        if (image.getAttribute('src')!==source) image.src=source;
        continue;
      }
      const beauty=beautyPreviews.get(previewKey(image.dataset.previewKey));if(beauty)image.dataset.beauty=beauty;
      if(!image.dataset.beauty&&!image.dataset.storm)continue;
      available=true;hasBeauty ||= !!image.dataset.beauty;hasStorm ||= !!image.dataset.storm;
      if(!image.dataset.previewFallback){image.dataset.previewFallback='true';image.addEventListener('error',()=>{if(image.getAttribute('src')===image.dataset.beauty&&image.dataset.storm){image.dataset.beautyFailed=image.dataset.beauty;image.src=image.dataset.storm;}});}
      const source=(image.dataset.beautyFailed===image.dataset.beauty&&previewRenderer==='beauty'?image.dataset.storm:image.dataset[previewRenderer])||image.dataset.storm||image.dataset.beauty;
      if(source&&image.getAttribute('src')!==source)image.src=source;
    }
    if(previewControl){previewControl.hidden=!available;for(const button of previewControl.children){button.disabled=button.dataset.previewRenderer==='beauty'?!hasBeauty:!hasStorm;button.setAttribute('aria-pressed',String(button.dataset.previewRenderer===previewRenderer));}}
  }
  if(previewControl)previewControl.onclick=event=>{const button=event.target.closest('[data-preview-renderer]');if(!button)return;previewRenderer=button.dataset.previewRenderer;previewSource();save();};
  function appearance() {
    root.style.setProperty('--usd-gallery-card-width', `${size.value}px`);
    root.dataset.details = String(showDetails);
    details.setAttribute('aria-pressed', String(showDetails));
  }
  function filter() {
    const tokens = search.value.trim().toLocaleLowerCase().replace(/[_\s-]+/g,' ').split(' ').filter(Boolean);
    const query=tokens.length;
    let total = 0, visible = 0;
    for (const card of grid.children) {
      total++;
      const text=`${card.dataset.name} ${card.dataset.search || ''} ${card.textContent}`.toLocaleLowerCase().replace(/[_\s-]+/g,' ');
      card.hidden = !!query && !tokens.every(token=>text.includes(token));
      if (!card.hidden) visible++;
    }
    empty.hidden = !!visible || !total || !query;
    count.value = query ? `${visible} / ${total}` : `${total} ${total === 1 ? 'example' : 'examples'}`;
  }
  function changeAppearance() {
    const top = grid.getBoundingClientRect().top;
    const anchor = [...grid.children].find(card => !card.hidden && card.getBoundingClientRect().bottom > top);
    const offset = anchor?.getBoundingClientRect().top;
    appearance();
    // Keep the first visible example in place as preview/card heights change.
    if (anchor) grid.scrollTop += anchor.getBoundingClientRect().top - offset;
    save();
  }
  size.oninput = changeAppearance;
  details.onclick = () => { showDetails = !showDetails; changeAppearance(); };
  search.oninput = () => { filter(); grid.scrollTop = 0; save(); };
  const observer = new MutationObserver(()=>{filter();previewSource();});
  const onThemeChange=()=>previewSource();
  document.addEventListener('usd-theme-change',onThemeChange);
  observer.observe(grid, { childList: true });
  appearance(); filter(); previewSource(); scheduleSplit();
  return { dispose() {
    disposed=true;observer.disconnect(); splitObserver.disconnect();
    document.removeEventListener('usd-theme-change',onThemeChange);
    if (resizeFrame) frameWindow.cancelAnimationFrame(resizeFrame);
    finishDrag();
    divider.removeEventListener('pointerdown', startDrag); divider.removeEventListener('pointermove', moveDrag);
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) divider.removeEventListener(name, finishDrag);
    divider.removeEventListener('keydown', keyboardSplit);
  } };
}
