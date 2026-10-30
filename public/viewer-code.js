import {viewerIcon} from './usd/viewer/icons.js';

// Read-only inspection of live USD layers and the sample's source files.
// File identities stay separate from the presentation and stage ownership,
// allowing an editor or an explicit root-open action to build on these sources.

const ICON_PATHS = {
  code: 'M320-240 80-480l240-240 57 57-184 184 183 183-56 56Zm320 0-57-57 184-184-183-183 56-56 240 240-240 240Z',
  content_copy: 'M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z',
  check: 'M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z',
};
/** Same geometry and attributes as the viewer icon set (Material Symbols, 960 grid on 16px). */
export function codeIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('width', '16'); svg.setAttribute('height', '16');
  svg.setAttribute('class', 'usd-icon'); svg.dataset.icon = name; svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  svg.innerHTML = `<path fill="currentColor" stroke="none" transform="translate(0 16) scale(0.016666666667)" d="${ICON_PATHS[name]}"/>`;
  return svg;
}

const JS_KEYWORDS = new Set('async await break case catch class const continue default delete do else export extends false finally for from function if import in instanceof let new null of return static switch this throw true try typeof undefined var void while yield'.split(' '));
const USDA_KEYWORDS = new Set('def over class variantSet variants prepend append add delete reorder uniform custom rel references payload inherits specializes subLayers subLayerOffsets kind instanceable active apiSchemas timeSamples connect None true false'.split(' '));
const USDA_TYPE = /^(?:bool|uchar|u?int(?:64)?|half|float|double|timecode|string|token|asset|opaque|dictionary|frame4d|matrix[234]d|quat[dfh]|(?:color|point|normal|vector|texCoord)[23][dfh]|(?:double|float|half|int)[234])$/;
const GRAMMARS = {
  javascript: {
    pattern: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:\\[\s\S]|[^\\`])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|()([A-Za-z_$][\w$]*)|(\[[\d\s+\-.,eE()]+\]|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?n?|\.\d+)/g,
    word: word => JS_KEYWORDS.has(word) ? 'keyword' : '',
  },
  usda: {
    pattern: /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(@@@[\s\S]*?@@@|@[^@\n]*@|<[^<>\n]*>)|([A-Za-z_]\w*)|(\[[\d\s+\-.,eE()]+\]|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/g,
    word: word => USDA_KEYWORDS.has(word) ? 'keyword' : USDA_TYPE.test(word) ? 'type' : '',
  },
};
// Dense numeric arrays share a span, so large geometry layers remain highlighted
// without creating a DOM node for each coordinate or normal component.
function highlight(text, language) {
  const grammar = GRAMMARS[language], fragment = document.createDocumentFragment();
  if (!grammar) { fragment.append(text); return fragment; }
  let last = 0, plain = '';
  const flush = () => { if (plain) { fragment.append(plain); plain = ''; } };
  for (const match of text.matchAll(grammar.pattern)) {
    plain += text.slice(last, match.index); last = match.index + match[0].length;
    const [, comment, string, path, word] = match;
    const kind = comment ? 'comment' : string ? 'string' : path ? 'path' : word ? grammar.word(word) : 'number';
    if (!kind) { plain += match[0]; continue; }
    flush();
    const span = document.createElement('span'); span.className = `usd-code-${kind}`; span.textContent = match[0]; fragment.append(span);
  }
  plain += text.slice(last); flush();
  return fragment;
}

function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
function layerInfos(stage) {
  // Root layer stack first, then session layers, then layers reached through composition.
  const rootStack = stage.GetLayerStack(false) || [], fullStack = stage.GetLayerStack(true) || [], used = stage.GetUsedLayers(false) || [];
  const local = new Set(rootStack.map(layer => layer.identifier)), seen = new Set(), layers = [];
  const add = (layer, role) => { if (!layer?.identifier || seen.has(layer.identifier)) return; seen.add(layer.identifier); layers.push({ ...layer, role }); };
  rootStack.forEach((layer, index) => add(layer, index ? 'sublayer' : 'root'));
  fullStack.forEach(layer => { if (!local.has(layer.identifier)) add(layer, 'session'); });
  used.forEach(layer => add(layer, 'layer'));
  return layers;
}

/** Mount Code with independent file inspection and stage ownership. */
export function mountCodePane(container, {stateKey = 'needle-usd-code-source', isVisible = () => true} = {}) {
  const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
  let saved = load(stateKey, {}), preferences = load(stateKey + ':files', {});
  const collapsed = new Set(preferences.collapsed || []), scrolls = preferences.scrolls || {};
  let fileWidth = Number.isFinite(preferences.width) ? preferences.width : null;
  const root = element('div','usd-code'), browser = element('aside','usd-code-browser');
  browser.setAttribute('aria-label','Files');
  const filter = element('input','usd-code-filter'); filter.type = 'search'; filter.placeholder = 'Filter files'; filter.setAttribute('aria-label','Filter files');
  filter.value = preferences.filter || '';
  const tree = element('div','usd-code-files'); tree.setAttribute('role','tree'); tree.setAttribute('aria-label','Sample files');
  browser.append(filter,tree);
  const divider = element('div','usd-code-divider'); divider.tabIndex = 0; divider.setAttribute('role','separator');
  divider.setAttribute('aria-label','Files width'); divider.setAttribute('aria-orientation','vertical');
  const reader = element('div','usd-code-reader'), toolbar = element('div','usd-code-toolbar');
  const picker = element('select','usd-code-source'); picker.setAttribute('aria-label','Source');
  const filename = element('span','usd-code-filename');
  const copy = element('button','usd-code-copy'); copy.type = 'button'; copy.title = 'Copy'; copy.setAttribute('aria-label','Copy source'); copy.append(codeIcon('content_copy'));
  const announcer = element('span','usd-code-announcer'); announcer.setAttribute('aria-live','polite');
  toolbar.append(picker,filename,copy,announcer);
  const status = element('div','usd-code-status'); status.setAttribute('role','status');
  const view = element('pre','usd-code-view'); view.tabIndex = 0; view.setAttribute('role','region');
  const code = element('code'); view.append(code);
  const preview = element('div','usd-code-preview'), empty = element('div','usd-panel-empty','No source');
  reader.append(toolbar,status,view,preview,empty); root.append(browser,divider,reader); container.append(root);
  let binding = null, sources = [], selected = '', listener = null, dirty = true, token = 0, text = '', shownKey = '', revision = 0;
  let timer, firstNotice = 0, copiedTimer, disposed = false, imageUrl = '', readAbort, resizeFrame = 0, resizeWindow, layout, drag, scrollTimer;
  const cache = new Map();
  let shownValue;

  function canonical(path) {
    if (/^https?:\/\//i.test(path)) {
      const url = new URL(path); path = url.pathname.startsWith('/test-fixtures/') ? url.pathname.slice(15) : url.host + url.pathname;
      try { path = decodeURIComponent(path); } catch {}
    }
    return String(path || '').replace(/\\/g,'/').replace(/^\/?needle\/\d+\//,'').replace(/^\/+/, '');
  }
  function sourceKey(source) { return source.kind === 'example' ? 'example' : source.kind === 'layer' ? `layer:${source.identifier}` : `file:${canonical(source.path)}`; }
  function matches(a,b) { a = canonical(a); b = canonical(b); return a === b || a.endsWith('/' + b); }
  const basename = path => path.split(/[?#]/)[0].split('/').pop();
  const extension = path => basename(path).split('.').pop().toLowerCase();
  function contextKey() { return binding?.example?.title || canonical(sources.find(source => source.role === 'root')?.path || ''); }
  function saveFiles() {
    if (contextKey()) scrolls[contextKey()] = tree.scrollTop;
    try { localStorage.setItem(stateKey + ':files',JSON.stringify({width:fileWidth,collapsed:[...collapsed],filter:filter.value,scrolls})); } catch {}
  }
  function rebuildSources() {
    const files = binding?.getFiles?.({includeResources:visible()}) || [];
    sources = [];
    if (binding?.example) sources.push({kind:'example',label:binding.example.title,path:binding.example.path || 'examples.js',language:'javascript',read:()=>binding.example.code});
    let layers = [];
    try { if (binding?.stage) layers = layerInfos(binding.stage); } catch (error) { console.warn('Code pane could not list layers',error); }
    const usedFiles = new Set();
    for (const layer of layers) {
      const file = layer.role !== 'session' && files.find(file => matches(layer.identifier,file.path) || matches(layer.realPath,file.path));
      if (file) usedFiles.add(file);
      let url;
      try { url = binding?.handle?.driver?.resolveAssetUrl?.(layer.realPath || layer.identifier); } catch {}
      const path = file?.path || (layer.role === 'session' ? layer.displayName : /^https?:\/\//i.test(url || '') ? url : layer.identifier);
      sources.push({kind:'layer',role:layer.role,identifier:layer.identifier,path,label:layer.displayName || basename(path),language:'usda',canOpenAsRoot:layer.role !== 'session',read:()=>exportLayer(layer.identifier,layer.role)});
    }
    const rootLayer = layers.find(layer=>layer.role === 'root'), rootFile = files.find(file=>rootLayer && matches(rootLayer.identifier,file.path));
    const mount = rootFile ? rootLayer.identifier.slice(0,-rootFile.path.length) : '';
    for (const file of files) {
      if (usedFiles.has(file) || sources.some(source=>canonical(source.path) === canonical(file.path))) continue;
      const layer = /\.(?:usd[acz]?|usdz)(?:[?#]|$)/i.test(file.path);
      sources.push({...file,kind:'file',role:'file',label:basename(file.path),language:layer?'usda':language(file.path),
        read:layer && binding?.usd ? ()=>exportLayer(mount ? mount + file.path : file.url || file.path) : signal=>file.read(signal)});
    }
    picker.replaceChildren();
    for (const [kind,label] of [['example','JavaScript'],['layer','Layers'],['file','Files']]) {
      const members = sources.filter(source=>source.kind === kind); if (!members.length) continue;
      const group = element('optgroup'); group.label = label;
      for (const source of members) { const option = element('option','',source.kind === 'file' ? canonical(source.path) : source.label); option.value = sourceKey(source); option.title = source.path; option.dataset.role = source.role || 'example'; group.append(option); }
      picker.append(group);
    }
    selected = resolveSelection(); picker.value = selected; picker.disabled = !sources.length;
    rebuildTree(); updateSelection();
  }
  function resolveSelection() {
    if (sources.some(source=>sourceKey(source) === selected)) return selected;
    let match;
    if (saved.kind === 'example') match = sources.find(source=>source.kind === 'example');
    else if (saved.kind === 'file') match = sources.find(source=>source.kind === 'file' && canonical(source.path) === saved.path);
    else if (saved.kind === 'layer') match = sources.find(source=>source.identifier === saved.identifier)
      || sources.find(source=>saved.role === 'session' && source.role === 'session')
      || sources.find(source=>saved.role === 'layer' && source.label === saved.label);
    if (!match && saved.kind === 'layer') match = sources.find(source=>source.role === 'root');
    match ||= sources.find(source=>source.kind === 'example') || sources.find(source=>source.role === 'root') || sources[0];
    return match ? sourceKey(match) : '';
  }
  async function exportLayer(identifier, role) {
    const {stage,usd} = binding;
    if (role === 'root') return stage.GetRootLayer().ExportToString();
    // OpenStage resolves the registered live layer, including unsaved opinions.
    const temporary = await usd.OpenStage(identifier);
    if (!temporary) throw new Error(`Layer ${identifier} is not available.`);
    try { return temporary.GetRootLayer().ExportToString(); }
    finally { usd.ReleaseStage(temporary); }
  }
  function language(path) {
    const ext = extension(path);
    return ['js','mjs','cjs','ts'].includes(ext) ? 'javascript' : ['usda','usd','usdc','usdz'].includes(ext) ? 'usda' : 'text';
  }
  function visible() { return !disposed && root.isConnected && root.getClientRects().length > 0 && isVisible(); }
  function persist(source) {
    saved = {kind:source.kind,role:source.role,identifier:source.identifier,label:source.label,path:canonical(source.path)};
    try { localStorage.setItem(stateKey,JSON.stringify(saved)); } catch {}
  }
  function updateSelection() {
    const source = sources.find(candidate=>sourceKey(candidate) === selected);
    filename.textContent = source?.kind === 'example' ? source.label : source ? basename(canonical(source.path)) : '';
    filename.title = source?.path || ''; picker.value = selected;
    for (const row of tree.querySelectorAll('[data-source-key]')) row.setAttribute('aria-selected',String(row.dataset.sourceKey === selected));
  }
  function rebuildTree() {
    const focused = tree.querySelector(':focus')?.dataset.itemKey, top = tree.scrollTop;
    const query = filter.value.trim().toLocaleLowerCase(), files = sources.filter(source=>!query || `${source.path} ${source.label}`.toLocaleLowerCase().includes(query));
    const paths = sources.filter(source=>source.role !== 'session').map(source=>canonical(source.path).split('/'));
    let prefix = paths[0]?.slice(0,-1) || [];
    for (const path of paths) while (prefix.length && !prefix.every((part,i)=>part === path[i])) prefix.pop();
    const model = {dirs:new Map(),files:[]};
    for (const source of files) {
      let parts = source.role === 'session' ? [source.label] : canonical(source.path).split('/').slice(prefix.length), node = model, path = '';
      const name = parts.pop();
      for (const part of parts) { path += (path ? '/' : '') + part; if (!node.dirs.has(part)) node.dirs.set(part,{dirs:new Map(),files:[],path}); node = node.dirs.get(part); }
      node.files.push({source,name});
    }
    const fragment = document.createDocumentFragment();
    function row(label,key,depth) {
      const button = element('button','usd-code-file'); button.type = 'button'; button.setAttribute('role','treeitem'); button.setAttribute('aria-level',String(depth));
      button.tabIndex = -1; button.dataset.itemKey = key; button.style.setProperty('--file-depth',depth); button.title = key;
      button.append(element('span','usd-code-file-name',label)); return button;
    }
    function append(node,depth) {
      for (const [name,child] of [...node.dirs].sort(([a],[b])=>a.localeCompare(b))) {
        let branch = child, label = name;
        while (!branch.files.length && branch.dirs.size === 1) { const [next,nested] = [...branch.dirs][0]; label += '/' + next; branch = nested; }
        const key = branch.path, expanded = !!query || !collapsed.has(key), button = row(label,'folder:' + key,depth);
        button.dataset.folder = key; button.setAttribute('aria-expanded',String(expanded)); button.prepend(viewerIcon(expanded?'expand_more':'chevron_right'),viewerIcon('folder_open'));
        button.onclick = ()=>{ if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key); rebuildTree(); saveFiles(); };
        fragment.append(button); if (expanded) append(branch,depth + 1);
      }
      for (const {source,name} of node.files.sort((a,b)=>a.name.localeCompare(b.name))) {
        const key = sourceKey(source), button = row(name,key,depth); button.dataset.sourceKey = key;
        button.setAttribute('aria-selected',String(key === selected)); button.title = source.path;
        button.prepend(source.kind === 'layer' || source.language === 'usda' ? viewerIcon('layers') : codeIcon('code'));
        button.onclick = ()=>choose(key); fragment.append(button);
      }
    }
    append(model,1); tree.replaceChildren(fragment); tree.scrollTop = top;
    const buttons = [...tree.children], active = buttons.find(row=>row.dataset.itemKey === focused) || buttons.find(row=>row.dataset.sourceKey === selected) || buttons[0];
    if (active) { active.tabIndex = 0; if (focused) active.focus({preventScroll:true}); }
  }
  function choose(key) {
    const source = sources.find(candidate=>sourceKey(candidate) === key); if (!source) return false;
    selected = key; persist(source); updateSelection(); void render(); return true;
  }
  tree.addEventListener('focusin',event=>{
    if (event.target.parentElement === tree) for (const row of tree.children) row.tabIndex = row === event.target ? 0 : -1;
  });
  tree.onkeydown = event => {
    const rows = [...tree.children], index = rows.indexOf(event.target); if (index < 0) return;
    let next;
    if (event.key === 'ArrowDown') next = rows[Math.min(rows.length-1,index+1)];
    if (event.key === 'ArrowUp') next = rows[Math.max(0,index-1)];
    if (event.key === 'Home') next = rows[0]; if (event.key === 'End') next = rows.at(-1);
    if (['ArrowLeft','ArrowRight'].includes(event.key)) {
      const row = rows[index], expanded = row.getAttribute('aria-expanded');
      if (expanded !== null && (event.key === 'ArrowLeft' ? expanded === 'true' : expanded === 'false')) { row.click(); next = tree.querySelector(`[data-item-key=${CSS.escape(row.dataset.itemKey)}]`); }
      else if (event.key === 'ArrowRight' && expanded === 'true') next = rows[index+1];
      else if (event.key === 'ArrowLeft') next = rows.slice(0,index).reverse().find(parent=>Number(parent.getAttribute('aria-level')) < Number(row.getAttribute('aria-level')));
    }
    if (next) { event.preventDefault(); event.stopPropagation(); rows.forEach(row=>row.tabIndex=-1); next.tabIndex = 0; next.focus(); }
  };
  filter.oninput = ()=>{ rebuildTree(); tree.scrollTop = 0; saveFiles(); };
  tree.onscroll = ()=>{ clearTimeout(scrollTimer); scrollTimer = setTimeout(saveFiles,120); };
  picker.onchange = ()=>choose(picker.value);

  function clearPreview() { if (imageUrl) URL.revokeObjectURL(imageUrl); imageUrl = ''; shownValue = undefined; preview.replaceChildren(); }
  async function render() {
    clearTimeout(timer); timer = undefined; firstNotice = 0;
    if (disposed) return;
    if (dirty) { dirty = false; cache.clear(); rebuildSources(); }
    const source = sources.find(candidate=>sourceKey(candidate) === selected);
    empty.hidden = !!source; view.hidden = !source; preview.hidden = true; copy.disabled = true;
    readAbort?.abort(); readAbort = new AbortController();
    const current = ++token, bound = binding, key = selected;
    if (!source) { status.textContent = ''; text = ''; shownKey = ''; code.replaceChildren(); clearPreview(); return; }
    let value = cache.get(key), failure;
    if (value === undefined) {
      if (key !== shownKey) { text = ''; shownKey = ''; code.replaceChildren(); clearPreview(); view.hidden = true; status.textContent = ''; }
      if (bound?.isCurrent && !bound.isCurrent()) return;
      try {
        const ext = extension(source.path);
        const textual = source.kind !== 'file' || source.language === 'usda' || /^(?:js|mjs|cjs|ts|json|xml|mtlx|mdl|txt|md|svg|glsl|wgsl|yaml|yml|obj|csv)$/.test(ext);
        if (textual) { const data = await source.read(readAbort.signal); value = {kind:'text',text:typeof data === 'string' ? data : await data.text()}; }
        else if (/^(?:png|jpe?g|gif|webp|avif|bmp)$/.test(ext)) value = {kind:'image',blob:await source.read(readAbort.signal)};
        else value = {kind:'binary',size:source.size,extension:ext};
      } catch (error) { failure = error; }
      if (disposed || current !== token || bound !== binding || (bound?.isCurrent && !bound.isCurrent())) return;
      if (!failure) cache.set(key,value);
    }
    updateSelection(); status.textContent = failure ? failure.message || String(failure) : '';
    view.setAttribute('aria-label',source.label); view.dataset.language = source.language;
    if (failure) { text = ''; shownKey = ''; code.replaceChildren(); clearPreview(); view.hidden = true; return; }
    copy.disabled = value.kind !== 'text'; view.hidden = value.kind !== 'text'; preview.hidden = value.kind === 'text';
    const content = value.kind === 'text' ? value.text : '';
    if (key === shownKey && (value.kind === 'text' ? content === text : value === shownValue)) return;
    const switched = key !== shownKey; text = content; shownKey = key; revision++; root.dataset.revision = String(revision); clearPreview(); shownValue = value;
    if (value.kind === 'text') code.replaceChildren(highlight(text,source.language));
    else if (value.kind === 'image') { const image = element('img'); image.alt = source.label; imageUrl = URL.createObjectURL(value.blob); image.src = imageUrl; preview.append(image); }
    else { const info = element('dl','usd-code-file-info'); for (const [label,data] of [['File',basename(source.path)],['Format',value.extension.toUpperCase()],['Size',Number.isFinite(value.size)?`${value.size.toLocaleString()} bytes`:null]]) if (data) info.append(element('dt','',label),element('dd','',data)); preview.append(info); }
    if (switched) view.scrollTop = view.scrollLeft = 0;
  }
  function schedule() {
    if (disposed || !visible()) return;
    const now = performance.now(); firstNotice ||= now;
    clearTimeout(timer); timer = setTimeout(()=>void render(),now-firstNotice > 1000 ? 0 : 150);
  }
  function invalidate() { dirty = true; schedule(); }
  function unbind() {
    token++; readAbort?.abort(); clearTimeout(timer); timer = undefined;
    if (listener !== null && binding?.stage) { try { binding.stage.RevokeObjectsChanged(listener); } catch {} }
    listener = null; binding = null;
  }
  copy.onclick = async ()=>{
    if (!text) return;
    try { await navigator.clipboard.writeText(text); }
    catch { const range = document.createRange(); range.selectNodeContents(code); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.execCommand('copy'); }
    copy.replaceChildren(codeIcon('check')); announcer.textContent = 'Copied'; clearTimeout(copiedTimer);
    copiedTimer = setTimeout(()=>{ copy.replaceChildren(codeIcon('content_copy')); announcer.textContent = ''; },1200);
  };

  function measureSplit() {
    const styles = root.ownerDocument.defaultView.getComputedStyle(root), token = (name,fallback)=>parseFloat(styles.getPropertyValue(name)) || fallback;
    const width = root.clientWidth, wide = width >= token('--usd-code-sidebar-breakpoint',480);
    root.dataset.sidebar = String(wide); browser.hidden = divider.hidden = !wide;
    const available = width - token('--usd-splitter-size',5), min = token('--usd-code-files-min-width',144), max = Math.max(min,available-token('--usd-code-reader-min-width',240));
    const pixels = Math.max(min,Math.min(max,fileWidth ?? token('--usd-code-files-width',180)));
    root.style.setProperty('--usd-code-current-files-width',`${pixels}px`); layout = {wide,min,max,pixels};
    for (const [name,value] of [['min',min],['max',max],['now',pixels]]) divider.setAttribute('aria-value' + name,String(Math.round(value)));
    if (drag && !wide) finishDrag();
  }
  function finishDrag(event) {
    if (!drag || event && event.pointerId !== drag.id) return;
    const {id} = drag; drag = null; divider.removeAttribute('data-dragging');
    if (divider.hasPointerCapture(id)) divider.releasePointerCapture(id); saveFiles();
  }
  divider.onpointerdown = event=>{ if (event.button !== 0) return; measureSplit(); if (!layout.wide) return; event.preventDefault(); divider.focus(); drag = {id:event.pointerId,x:event.clientX,width:layout.pixels}; divider.setPointerCapture(event.pointerId); divider.dataset.dragging = ''; };
  divider.onpointermove = event=>{ if (event.pointerId !== drag?.id) return; fileWidth = Math.max(layout.min,Math.min(layout.max,drag.width + event.clientX-drag.x)); measureSplit(); };
  for (const event of ['pointerup','pointercancel','lostpointercapture']) divider.addEventListener(event,finishDrag);
  divider.onkeydown = event=>{
    measureSplit(); if (!layout.wide || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); fileWidth = event.key === 'Home' ? layout.min : event.key === 'End' ? layout.max : Math.max(layout.min,Math.min(layout.max,layout.pixels+(event.key === 'ArrowLeft' ? -1 : 1)*(event.shiftKey?40:10))); measureSplit(); saveFiles();
  };
  let wasVisible = false;
  function refreshVisibility() {
    const now = visible(); if (now && !wasVisible) { dirty = true; void render(); } wasVisible = now;
  }
  const resize = new ResizeObserver(()=>{
    if (resizeFrame) return; resizeWindow = root.ownerDocument.defaultView;
    resizeFrame = resizeWindow.requestAnimationFrame(()=>{ resizeFrame = 0; measureSplit(); refreshVisibility(); });
  }); resize.observe(container);
  measureSplit(); rebuildSources(); empty.hidden = !!sources.length; view.hidden = !sources.length; preview.hidden = true;
  return {
    show(next) {
      if (disposed) return;
      saveFiles(); unbind(); selected = ''; binding = next && (next.stage || next.example) ? next : null;
      if (binding?.stage) {
        try { listener = binding.stage.RegisterObjectsChanged(()=>invalidate()); }
        catch (error) { listener = null; console.warn('Code pane could not observe stage changes',error); }
      }
      text = ''; shownKey = ''; code.replaceChildren(); clearPreview(); status.textContent = ''; cache.clear(); dirty = false;
      rebuildSources(); tree.scrollTop = scrolls[contextKey()] || 0; empty.hidden = !!sources.length; view.hidden = !sources.length; preview.hidden = true;
      if (visible()) void render();
    },
    invalidate,refreshVisibility,
    get sources() { return sources.map(({kind,role,identifier,label,language,path,canOpenAsRoot})=>({key:sourceKey({kind,identifier,path}),kind,role,identifier,label,language,path,canOpenAsRoot})); },
    get selected() { return selected; }, get text() { return text; }, select:choose,
    dispose() {
      if (disposed) return;
      saveFiles(); unbind(); disposed = true; clearTimeout(copiedTimer); clearTimeout(scrollTimer); resize.disconnect();
      if (resizeFrame) resizeWindow.cancelAnimationFrame(resizeFrame); finishDrag(); clearPreview(); cache.clear(); sources = []; text = ''; root.remove();
    },
  };
}
