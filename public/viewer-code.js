import {viewerIcon} from './usd/viewer/icons.js';
import {stageLayers} from './usd/scene/inspection.js';
import {readStageLayer} from './usd/scene/sources.js';
import {findArrays, arrayLayout, serializeArray} from './usd/viewer/arrayData.js';
import {mountArrayEditor, attachArrayInput} from './usd/viewer/arrayEditor.js';
import {createArrayEdits} from './usd/editing/index.js';
import {sourceLocations, referencedSource, referencePaths} from './viewer-source-links.js';

// Inspect sources and edit typed array data without rewriting USD layers.
// File identities stay separate from the presentation and stage ownership,
// allowing an editor or an explicit root-open action to build on these sources.

const ICON_PATHS = {
  code: 'M320-240 80-480l240-240 57 57-184 184 183 183-56 56Zm320 0-57-57 184-184-183-183 56-56 240 240-240 240Z',
  check: 'M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z',
};
/** Same geometry and attributes as the viewer icon set (Material Symbols, 960 grid on 16px). */
export function codeIcon(name) {
  if(name==='content_copy')return viewerIcon(name);
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
function highlight(text, language, decorate, offset = 0) {
  const grammar = GRAMMARS[language], fragment = document.createDocumentFragment();
  if (!grammar) { fragment.append(text); return fragment; }
  let last = 0, plain = '';
  const flush = () => { if (plain) { fragment.append(plain); plain = ''; } };
  for (const match of text.matchAll(grammar.pattern)) {
    plain += text.slice(last, match.index); last = match.index + match[0].length;
    const [, comment, string, path, word] = match;
    const kind = comment ? 'comment' : string ? 'string' : path ? 'path' : word ? grammar.word(word) : 'number';
    const decorated=decorate?.(match.index + offset,kind);
    if (!kind&&!decorated) { plain += match[0]; continue; }
    flush();
    const span = decorated || document.createElement('span'); if(kind)span.classList.add(`usd-code-${kind}`); span.textContent = match[0]; fragment.append(span);
  }
  plain += text.slice(last); flush();
  return fragment;
}

function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }

/** Mount Code with independent file inspection and stage ownership. */
export function mountCodePane(container, {stateKey = 'needle-usd-code-source', isVisible = () => true} = {}) {
  const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
  let saved = load(stateKey, {}), preferences = load(stateKey + ':files', {});
  const collapsed = new Set(preferences.collapsed || []), scrolls = preferences.scrolls || {};
  let fileWidth = Number.isFinite(preferences.width) ? preferences.width : null;
  let followSelection = preferences.followSelection !== false, selectionPath = '', followRevision = 0;
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
  const tool=(label,action)=>{const button=element('button','usd-code-action',label);button.type='button';button.setAttribute('aria-label',label);button.onclick=action;toolbar.append(button);return button;};
  const historyButton=(label,icon)=>{const button=element('button','usd-code-history');button.type='button';button.title=label;button.setAttribute('aria-label',label);button.append(viewerIcon(icon));return button;};
  const back=historyButton('Previous source','arrow_back'),forward=historyButton('Next source','chevron_right');
  const linked = historyButton('Follow selection', 'link');
  linked.setAttribute('aria-pressed',String(followSelection));
  linked.onclick=()=>{followSelection=!followSelection;linked.setAttribute('aria-pressed',String(followSelection));saveFiles();if(followSelection)void followSelected();else followRevision++;};
  toolbar.append(back,forward,picker,filename,linked,copy,announcer);
  const rawButton=tool('Expand arrays',()=>{closeArray();const {scrollTop,scrollLeft}=view;rawSource=!rawSource;drawSource();view.scrollTop=scrollTop;view.scrollLeft=scrollLeft;});
  const editButton=tool('Edit source',()=>{closeArray();sourceEditing=!sourceEditing;editButton.setAttribute('aria-pressed',String(sourceEditing));sourceInput.value=text;drawSource();if(sourceEditing)sourceInput.focus();});
  const arrayButton=tool('Array',()=>{});
  const runButton=tool('Run',async()=>{const bound=binding;runButton.disabled=true;try{await bound.runExample(text);}catch(error){status.textContent=error.message;}finally{if(bound===binding)refreshTools();}});
  const undoButton=tool('Undo array edit',()=>void replayEdit(false)),redoButton=tool('Redo array edit',()=>void replayEdit(true));undoButton.textContent='Undo';redoButton.textContent='Redo';
  const status = element('div','usd-code-status'); status.setAttribute('role','status');
  const view = element('pre','usd-code-view'); view.tabIndex = 0; view.setAttribute('role','region');
  const code = element('code'); view.append(code);
  const preview = element('div','usd-code-preview'), empty = element('div','usd-panel-empty','No source');
  const sourceInput=element('textarea','usd-code-input');sourceInput.setAttribute('aria-label','JavaScript source');sourceInput.spellcheck=false;sourceInput.hidden=true;
  const body=element('div','usd-code-body'), surface=element('div','usd-code-surface');
  const arrayDivider=element('div','usd-code-divider usd-code-array-divider'), arraySidebar=element('aside','usd-code-array-sidebar');
  arrayDivider.tabIndex=0;arrayDivider.setAttribute('role','separator');arrayDivider.setAttribute('aria-label','Array editor width');arrayDivider.setAttribute('aria-orientation','vertical');
  arraySidebar.setAttribute('aria-label','Array editor');arrayDivider.hidden=arraySidebar.hidden=true;
  surface.append(view,sourceInput,preview,empty);body.append(surface,arrayDivider,arraySidebar);
  reader.append(toolbar,status,body); root.append(browser,divider,reader); container.append(root);
  let binding = null, sources = [], selected = '', listener = null, dirty = true, token = 0, text = '', shownKey = '', revision = 0;
  let timer, firstNotice = 0, copiedTimer, disposed = false, imageUrl = '', readAbort, resizeFrame = 0, resizeWindow, layout, drag, scrollTimer;
  const cache = new Map();
  let shownValue,rawSource=false,sourceEditing=false,hasArrays=false,arrayEditor,editOwner;
  let sourceHistory=[],historyIndex=-1;
  const drafts=new Map(Object.entries(load(stateKey+':drafts',{})).filter(([,value])=>typeof value==='string'&&value.length<=200000).slice(-10)),draftHistory=new Map();let draftTimer;
  function saveDrafts(){clearTimeout(draftTimer);try{localStorage.setItem(stateKey+':drafts',JSON.stringify(Object.fromEntries([...drafts].filter(([,value])=>value.length<=200000).slice(-10))));}catch{}}
  const draftWindow=root.ownerDocument.defaultView;draftWindow.addEventListener('pagehide',saveDrafts);
  const draftKey=()=>contextKey()+'|'+selected;
  let arrayWidth=Number.isFinite(preferences.arrayWidth)?preferences.arrayWidth:null,arrayLayoutState,arrayDrag;
  function arrayVisible(open){arrayDivider.hidden=arraySidebar.hidden=!open;if(open)measureArray();else finishArrayDrag();}
  const arrayInput=attachArrayInput(sourceInput,arrayButton,arraySidebar,{onToggle:arrayVisible});
  function closeArray(){arrayEditor?.dispose();arrayEditor=null;arrayInput.close();arrayVisible(false);}
  function refreshTools(){
    back.disabled=historyIndex<=0;forward.disabled=historyIndex>=sourceHistory.length-1;
    const source=sources.find(source=>sourceKey(source)===selected),js=source?.kind==='example';
    const reading=shownKey!==selected;editButton.disabled=reading;arrayButton.disabled=reading;rawButton.disabled=reading;
    editButton.setAttribute('aria-pressed',String(sourceEditing));editButton.hidden=!js;arrayButton.hidden=!js||!sourceEditing;runButton.hidden=!js||!binding?.runExample;rawButton.hidden=shownValue?.kind!=='text'||sourceEditing||!hasArrays;
    rawButton.textContent=rawSource?'Compact arrays':'Expand arrays';rawButton.setAttribute('aria-label',rawButton.textContent);rawButton.setAttribute('aria-pressed',String(rawSource));
    rawButton.title=rawSource?'Collapse array values to compact table links':'Show array values inline in the code';
    const history=draftHistory.get(draftKey());undoButton.hidden=redoButton.hidden=js?!history?.entries.length:!(editOwner?.canUndo||editOwner?.canRedo);
    undoButton.disabled=js?!history?.cursor:!editOwner?.canUndo;redoButton.disabled=js?!history||history.cursor>=history.entries.length:!editOwner?.canRedo;
    runButton.disabled=reading||text===binding?.example?.code;
  }
  function draft(value,record=true){
    if(record&&value!==text){const h=draftHistory.get(draftKey())||{entries:[],cursor:0};h.entries.splice(h.cursor);h.entries.push({before:text,after:value});if(h.entries.length>30)h.entries.shift();h.cursor=h.entries.length;draftHistory.set(draftKey(),h);}
    text=value;drafts.delete(draftKey());drafts.set(draftKey(),value);clearTimeout(draftTimer);draftTimer=setTimeout(saveDrafts,250);cache.set(selected,{kind:'text',text:value});if(sourceInput.value!==value)sourceInput.value=value;drawSource();refreshTools();
  }
  sourceInput.oninput=()=>draft(sourceInput.value,false);
  async function replayEdit(forward){
    try {
      const source=sources.find(source=>sourceKey(source)===selected);
      if(source?.kind==='example'){const h=draftHistory.get(draftKey());if(!h||(forward?h.cursor>=h.entries.length:h.cursor===0))return;const entry=h.entries[forward?h.cursor:h.cursor-1];if(text!==(forward?entry.before:entry.after))throw new Error('Source was edited elsewhere.');draft(forward?entry.after:entry.before,false);h.cursor+=forward?1:-1;}
      else {await editOwner?.[forward?'redo':'undo']();dirty=true;await render();}
      refreshTools();status.textContent='';
    }catch(error){status.textContent=error.message;}
  }
  function drawSource(){
    const source=sources.find(source=>sourceKey(source)===selected);if(!source)return;
    view.hidden=sourceEditing||shownValue?.kind!=='text';sourceInput.hidden=!sourceEditing||source.kind!=='example';refreshTools();
    if(sourceEditing)return;
    const locations=sourceLocations(text,source.language),resolveUrl=path=>binding?.handle?.driver?.resolveAssetUrl?.(path),defined=new Set(locations.definitions.values()),primAvailability=new Map();
    const decorate=(at,kind)=>{
      const definition=locations.definitions.get(at),link=locations.links.get(at);
      if(link){
        const known=link.kind==='prim'&&!link.asset?null:referencedSource(link.asset||link.target,source,sources,resolveUrl);
        if(link.kind==='file'&&!known||link.kind==='prim'&&!link.asset&&!canFollow(link.target,defined,primAvailability))return;
        const anchor=element('a','usd-code-link'),href=link.kind==='prim'&&!link.asset?'':known?.url||referencePaths(link.asset||link.target,source,resolveUrl).find(path=>/^https?:\/\//i.test(path));
        anchor.href=link.kind==='url'?link.target:href||'#';anchor.dataset.reference=link.target;
        anchor.title=link.asset?`${link.asset} · ${link.target}`:link.target;
        if(link.kind==='url'&&!known){anchor.target='_blank';anchor.rel='noopener noreferrer';}
        else anchor.onclick=event=>{
          if(href&&(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey))return;
          event.preventDefault();if(event.button!==0)return;
          void followReference(link,source).catch(error=>{status.textContent=error.message;});
        };
        return anchor;
      }
      if(definition){const span=element('span','usd-code-definition');span.dataset.usdPath=definition;return span;}
    };
    const availableArrays=findArrays(text,source.language).filter(array=>![...locations.links.keys()].some(at=>at>=array.start&&at<array.end));
    hasArrays=availableArrays.some(array=>array.end-array.start>=64||array.value.flat(Infinity).length>4);refreshTools();
    const fragment=document.createDocumentFragment(),arrays=rawSource?[]:availableArrays;let last=0;
    for(const array of arrays){
      fragment.append(highlight(text.slice(last,array.start),source.language,decorate,last));
      const wrapper=element('span','usd-code-array'),raw=element('span','usd-code-array-literal',text.slice(array.start,array.end));
      const button=element('button','usd-code-array-button');button.type='button';const layout=arrayLayout(array.value,array.type,array.name);
      const literal=text.slice(array.start,array.end);button.dataset.summary=array.value.length*layout.width<=4&&literal.length<64?literal:layout.width===1?`[ ${array.value.length.toLocaleString()} ${array.value.length===1?'value':'values'} ]`:`[ ${array.value.length.toLocaleString()} × ${layout.dims.length===3?layout.dims.slice(1).join('×'):layout.columns.join('')} ]`;
      button.dataset.arrayId=array.property?`${array.property.primPath}.${array.property.name}@${array.property.time}`:`${array.name}@${array.start}`;button.setAttribute('aria-label',`Open ${array.name} array`);button.title=`${array.property?.primPath||array.name} · ${array.type||'Array'}`;
      button.onclick=()=>{
        closeArray();const baseline=text,bound=binding,key=selected,editable=source.kind==='example'||source.kind==='layer'&&!!array.property&&!!editOwner;
        arrayVisible(true);arrayEditor=mountArrayEditor(arraySidebar,{...array,timeCode:array.property?.time,editable,create:source.kind==='example'&&array.value.length===0&&!array.type,onClose:()=>{arrayEditor=null;arrayVisible(false);[...code.querySelectorAll('[data-array-id]')].find(next=>next.dataset.arrayId===button.dataset.arrayId)?.focus({preventScroll:true});},onApply:async value=>{
          if(bound!==binding||key!==selected||baseline!==text)throw new Error('Source changed. Reopen the array.');
          if(source.kind==='example')draft(text.slice(0,array.start)+serializeArray(value,source.language)+text.slice(array.end));
          else {await editOwner.apply(source.identifier,array,baseline,value);dirty=true;await render();refreshTools();}
        }});
      };
      wrapper.append(button,raw);fragment.append(wrapper);last=array.end;
    }
    fragment.append(highlight(text.slice(last),source.language,decorate,last));code.replaceChildren(fragment);
  }

  function canonical(path) {
    if (/^https?:\/\//i.test(path)) {
      const url = new URL(path); path = url.pathname.startsWith('/test-fixtures/') ? url.pathname.slice(15) : url.host + url.pathname;
      try { path = decodeURIComponent(path); } catch {}
    }
    return String(path || '').replace(/\\/g,'/').replace(/^\/+/, '');
  }
  function sourceKey(source) { return source.kind === 'example' ? 'example' : `${source.kind}:${canonical(source.path)}`; }
  function matches(a,b) { a = canonical(a); b = canonical(b); return a === b || a.endsWith('/' + b); }
  const basename = path => path.split(/[?#]/)[0].split('/').pop();
  const extension = path => basename(path).split('.').pop().toLowerCase();
  function contextKey() { return binding?.example?.title || canonical(sources.find(source => source.role === 'root')?.path || ''); }
  function saveFiles() {
    if (contextKey()) scrolls[contextKey()] = tree.scrollTop;
    try { localStorage.setItem(stateKey + ':files',JSON.stringify({width:fileWidth,arrayWidth,followSelection,collapsed:[...collapsed],filter:filter.value,scrolls})); } catch {}
  }
  function rebuildSources() {
    const files = binding?.getFiles?.({includeResources:visible()}) || [];
    sources = [];
    if (binding?.example) sources.push({kind:'example',label:binding.example.title,path:binding.example.path || 'examples.js',language:'javascript',read:()=>drafts.get(contextKey()+'|example')??binding.example.code});
    let layers = [];
    try { if (binding?.stage) layers = stageLayers(binding.stage); } catch (error) { console.warn('Code pane could not list layers',error); }
    const paths = binding?.handle?.sourcePaths;
    const usedFiles = new Set();
    for (const layer of layers) {
      const path = layer.role === 'session' ? layer.displayName : paths ? paths.path(layer.identifier) : layer.identifier;
      const file = layer.role !== 'session' && files.find(file => paths ? file.path === path : matches(layer.identifier,file.path) || matches(layer.realPath,file.path));
      if (file) usedFiles.add(file);
      sources.push({kind:'layer',role:layer.role,identifier:layer.identifier,path:file?.path || path,label:layer.displayName || basename(path),language:'usda',canOpenAsRoot:layer.role !== 'session',read:signal=>exportLayer(layer.identifier,layer.role,signal)});
    }
    for (const file of files) {
      if (usedFiles.has(file) || sources.some(source=>canonical(source.path) === canonical(file.path))) continue;
      const layer = /\.(?:usd[acz]?|usdz)(?:[?#]|$)/i.test(file.path);
      sources.push({...file,kind:'file',role:'file',label:basename(file.path),language:layer?'usda':language(file.path),
        read:layer && binding?.usd ? signal=>exportLayer(file.identifier || file.url || file.path,undefined,signal) : signal=>file.read(signal)});
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
    else if (saved.kind === 'layer') match = sources.find(source=>source.kind==='layer'&&(canonical(source.path) === saved.path || saved.identifier && source.identifier === saved.identifier))
      || sources.find(source=>saved.role === 'session' && source.role === 'session')
      || sources.find(source=>saved.role === 'layer' && source.label === saved.label);
    if (!match && saved.kind === 'layer') match = sources.find(source=>source.role === 'root');
    match ||= sources.find(source=>source.kind === 'example') || sources.find(source=>source.role === 'root') || sources[0];
    return match ? sourceKey(match) : '';
  }
  async function exportLayer(identifier, role, signal) {
    const bound = binding;
    return readStageLayer(bound.handle, bound.usd, identifier, {
      signal, allowUncomposed: !role,
      isCurrent: () => !disposed && binding === bound && (!bound.isCurrent || bound.isCurrent()),
    });
  }
  function language(path) {
    const ext = extension(path);
    return ['js','mjs','cjs','ts','json'].includes(ext) ? 'javascript' : ['usda','usd','usdc','usdz'].includes(ext) ? 'usda' : 'text';
  }
  function visible() { return !disposed && root.isConnected && root.getClientRects().length > 0 && isVisible(); }
  function persist(source) {
    saved = {kind:source.kind,role:source.role,label:source.label,path:canonical(source.path)};
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
    const model = {dirs:new Map(),files:[]};
    for (const source of files) {
      let parts = source.role === 'session' ? [source.label] : canonical(source.path).split('/'), node = model, path = '';
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
        const disclosure=element('span','usd-code-file-disclosure');disclosure.setAttribute('aria-hidden','true');
        button.prepend(disclosure,source.kind === 'layer' || source.language === 'usda' ? viewerIcon('layers') : codeIcon('code'));
        button.onclick = ()=>choose(key); fragment.append(button);
      }
    }
    append(model,1); tree.replaceChildren(fragment); tree.scrollTop = top;
    const buttons = [...tree.children], active = buttons.find(row=>row.dataset.itemKey === focused) || buttons.find(row=>row.dataset.sourceKey === selected) || buttons[0];
    if (active) { active.tabIndex = 0; if (focused) active.focus({preventScroll:true}); }
  }
  function rememberSource(){
    if(historyIndex>=0&&sourceHistory[historyIndex]?.key===selected)Object.assign(sourceHistory[historyIndex],{top:view.scrollTop,left:view.scrollLeft});
  }
  async function chooseSource(key,{record=true,target,position}={}){
    const source=sources.find(candidate=>sourceKey(candidate)===key);if(!source)return false;
    if(record)followRevision++;
    rememberSource();
    if(record){
      if(historyIndex<0&&selected){sourceHistory=[{key:selected,top:view.scrollTop,left:view.scrollLeft}];historyIndex=0;}
      sourceHistory.splice(historyIndex+1);sourceHistory.push({key,target});historyIndex=sourceHistory.length-1;
      if(sourceHistory.length>100){sourceHistory.shift();historyIndex--;}
    }
    closeArray();sourceEditing=false;selected=key;persist(source);updateSelection();refreshTools();
    const bound=binding,reading=render(),request=token;await reading;if(request!==token||bound!==binding||selected!==key||disposed)return false;
    if(position){view.scrollTop=position.top||0;view.scrollLeft=position.left||0;}
    else if(target)revealDefinition(target);
    return true;
  }
  function choose(key){if(!sources.some(source=>sourceKey(source)===key))return false;void chooseSource(key);return true;}
  async function replaySource(direction){
    const at=historyIndex+direction;if(at<0||at>=sourceHistory.length)return;
    rememberSource();historyIndex=at;const entry=sourceHistory[at];await chooseSource(entry.key,{record:false,position:entry});
  }
  back.onclick=()=>void replaySource(-1);forward.onclick=()=>void replaySource(1);
  function canFollow(path,defined,availability){
    if(defined.has(path))return true;
    const owner=path.split('.')[0];if(availability.has(owner))return availability.get(owner);
    let prim,valid=false;
    try{prim=binding?.stage?.GetPrimAtPath(owner);valid=!!prim?.IsValid();}catch{}finally{prim?.delete?.();}
    availability.set(owner,valid);return valid;
  }
  function revealDefinition(path){
    code.querySelectorAll('[data-target]').forEach(node=>delete node.dataset.target);
    const targets=[...code.querySelectorAll('[data-usd-path]')],target=targets.find(node=>node.dataset.usdPath===path)||targets.find(node=>node.dataset.usdPath===path.split('.')[0])
      || (sources.find(source=>sourceKey(source)===selected)?.kind==='example' ? [...code.querySelectorAll('[data-reference]')].find(node=>node.dataset.reference===path||node.dataset.reference===path.split('.')[0]) : null);
    if(!target)return false;
    target.dataset.target='true';const rect=target.getBoundingClientRect(),viewport=view.getBoundingClientRect();
    view.scrollTop+=rect.top-viewport.top-view.clientHeight*.3;
    if(rect.left<viewport.left||rect.right>viewport.right)view.scrollLeft+=rect.left-viewport.left-16;
    return true;
  }
  // Resolve composition identities through USD: a referenced /World/Robot can
  // be declared as /Robot in its own layer, not under the composed stage path.
  async function followSelected() {
    const bound=binding, request=++followRevision, path=selectionPath;
    const current=()=>!disposed&&bound===binding&&request===followRevision&&followSelection&&visible()&&!sourceEditing;
    if(!path||!bound?.stage||!current())return;
    try {
      if(sources.find(source=>sourceKey(source)===selected)?.kind==='example'&&revealDefinition(path))return;
      const read=stage=>{
        const dot=path.indexOf('.'),prim=stage.GetPrimAtPath(dot<0?path:path.slice(0,dot));let property;
        try{
          if(!prim?.IsValid())return [];
          if(dot>=0){property=prim.GetAttribute(path.slice(dot+1));if(!property?.IsValid()){property?.delete?.();property=prim.GetRelationship(path.slice(dot+1));}}
          return (property?.IsValid()?property.GetPropertyStackWithLayerOffsets?.(bound.handle?.getTime?.()||0):prim.GetPrimStack?.())||[];
        }finally{property?.delete?.();prim?.delete?.();}
      };
      const stack=await (bound.handle?.readStage?bound.handle.readStage(read):read(bound.stage));
      if(!current())return;
      if(dirty){dirty=false;cache.clear();rebuildSources();}
      const opinions=path.includes('.')?stack:[...stack.filter(spec=>/Def$|^def$/.test(spec.specifier||'')),...stack.filter(spec=>!/Def$|^def$/.test(spec.specifier||''))];
      for(const spec of opinions){
        if(!current())return;
        const source=sources.find(candidate=>candidate.kind==='layer'&&candidate.identifier===spec.layer?.identifier);
        if(!source)continue;
        const key=sourceKey(source),target=spec.path.replace(/\{[^}]*\}/g,'/').replace(/\/+/g,'/');
        if(selected!==key||shownKey!==key)await chooseSource(key,{record:false});
        if(!current())return;
        if(revealDefinition(target))return;
      }
    }catch(error){if(current())status.textContent=error.message;}
  }
  function follow(path){selectionPath=path||'';void followSelected();}
  async function followReference(link,source){
    const bound=binding;
    if(link.kind==='prim'&&!link.asset){
      if(!revealDefinition(link.target)){
        // Referenced definitions may live in another layer. Inspect them through
        // the composed USD stage without guessing which opinion is strongest.
        const followed=bound?.navigate?.(link.target);
        if(!followed)status.textContent=`Unavailable target: ${link.target}`;
      }else bound?.navigate?.(link.target);
      return;
    }
    const resolveUrl=path=>bound?.handle?.driver?.resolveAssetUrl?.(path),path=link.asset||link.target;
    let next=referencedSource(path,source,sources,resolveUrl);
    if(!next&&link.kind==='asset'){
      const paths=referencePaths(path,source,resolveUrl),resolved=paths.find(value=>/^https?:\/\//i.test(value))||paths[0];
      if(resolved&&bound?.getFiles?.resolve){bound.getFiles.resolve(resolved);rebuildSources();next=referencedSource(path,source,sources,resolveUrl);}
    }
    if(!next){status.textContent=`Unavailable source: ${path}`;return;}
    await chooseSource(sourceKey(next),{target:link.kind==='prim'?link.target:undefined});
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
    if (value.kind === 'text') drawSource();
    else if (value.kind === 'image') { const image = element('img'); image.alt = source.label; imageUrl = URL.createObjectURL(value.blob); image.src = imageUrl; preview.append(image); }
    else { const info = element('dl','usd-code-file-info'); for (const [label,data] of [['File',basename(source.path)],['Format',value.extension.toUpperCase()],['Size',Number.isFinite(value.size)?`${value.size.toLocaleString()} bytes`:null]]) if (data) info.append(element('dt','',label),element('dd','',data)); preview.append(info); }
    refreshTools();
    if (switched) view.scrollTop = view.scrollLeft = 0;
  }
  function schedule() {
    if (disposed || !visible()) return;
    const now = performance.now(); firstNotice ||= now;
    clearTimeout(timer); timer = setTimeout(()=>void render(),now-firstNotice > 1000 ? 0 : 150);
  }
  function invalidate() { dirty = true; schedule(); }
  function unbind() {
    followRevision++;selectionPath='';closeArray();sourceEditing=false;sourceInput.hidden=true;editOwner?.dispose();editOwner=null;token++; readAbort?.abort(); clearTimeout(timer); timer = undefined;
    if (listener !== null && binding?.stage) { try { binding.stage.RevokeObjectsChanged(listener); } catch {} }
    listener = null; binding = null;
  }
  copy.onclick = async ()=>{
    if (!text) return;
    try { await navigator.clipboard.writeText(text); }
    catch { const active=document.activeElement,area=element('textarea');area.value=text;area.style.cssText='position:fixed;opacity:0;pointer-events:none';document.body.append(area);area.select();document.execCommand('copy');area.remove();active?.focus({preventScroll:true}); }
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
    if(!arraySidebar.hidden)measureArray();
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
  function measureArray(){
    const styles=root.ownerDocument.defaultView.getComputedStyle(root),token=(name,fallback)=>parseFloat(styles.getPropertyValue(name))||fallback;
    const available=Math.max(0,body.clientWidth-token('--usd-splitter-size',5)), min=Math.min(token('--usd-code-array-min-width',240),available*.65),max=Math.max(min,available-Math.min(token('--usd-code-source-min-width',200),available*.35));
    const pixels=Math.max(min,Math.min(max,arrayWidth??token('--usd-code-array-width',340)));
    body.style.setProperty('--usd-code-current-array-width',`${pixels}px`);arrayLayoutState={min,max,pixels};
    for(const [name,value] of [['min',min],['max',max],['now',pixels]])arrayDivider.setAttribute('aria-value'+name,String(Math.round(value)));
  }
  function finishArrayDrag(event){
    if(!arrayDrag||event&&event.pointerId!==arrayDrag.id)return;
    const {id}=arrayDrag;arrayDrag=null;arrayDivider.removeAttribute('data-dragging');
    if(arrayDivider.hasPointerCapture(id))arrayDivider.releasePointerCapture(id);saveFiles();
  }
  arrayDivider.onpointerdown=event=>{if(event.button!==0)return;measureArray();event.preventDefault();arrayDivider.focus();arrayDrag={id:event.pointerId,x:event.clientX,width:arrayLayoutState.pixels};arrayDivider.setPointerCapture(event.pointerId);arrayDivider.dataset.dragging='';};
  arrayDivider.onpointermove=event=>{if(event.pointerId!==arrayDrag?.id)return;arrayWidth=Math.max(arrayLayoutState.min,Math.min(arrayLayoutState.max,arrayDrag.width+arrayDrag.x-event.clientX));measureArray();};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])arrayDivider.addEventListener(event,finishArrayDrag);
  arrayDivider.onkeydown=event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;measureArray();event.preventDefault();event.stopPropagation();
    const {min,max,pixels}=arrayLayoutState;arrayWidth=event.key==='Home'?min:event.key==='End'?max:Math.max(min,Math.min(max,pixels+(event.key==='ArrowLeft'?1:-1)*(event.shiftKey?40:10)));measureArray();saveFiles();
  };
  let wasVisible = false;
  function refreshVisibility() {
    const now = visible(); if (now && !wasVisible) { dirty = true; void render().then(()=>followSelected()); } wasVisible = now;
  }
  const resize = new ResizeObserver(()=>{
    if (resizeFrame) return; resizeWindow = root.ownerDocument.defaultView;
    resizeFrame = resizeWindow.requestAnimationFrame(()=>{ resizeFrame = 0; measureSplit(); refreshVisibility(); });
  }); resize.observe(container);
  measureSplit(); rebuildSources(); empty.hidden = !!sources.length; view.hidden = !sources.length; preview.hidden = true;
  return {
    show(next) {
      if (disposed) return;
      saveFiles(); unbind(); sourceHistory=[];historyIndex=-1;selected = ''; binding = next && (next.stage || next.example) ? next : null;
      if(binding?.stage&&binding?.edit)editOwner=createArrayEdits({usd:binding.usd,stage:binding.stage,edit:binding.edit,isCurrent:()=>!disposed&&binding===next&&(!binding.isCurrent||binding.isCurrent())});
      if (binding?.stage) {
        try { listener = binding.stage.RegisterObjectsChanged(()=>invalidate()); }
        catch (error) { listener = null; console.warn('Code pane could not observe stage changes',error); }
      }
      text = ''; shownKey = ''; code.replaceChildren(); clearPreview(); status.textContent = ''; cache.clear(); dirty = false;
      rebuildSources(); tree.scrollTop = scrolls[contextKey()] || 0; empty.hidden = !!sources.length; view.hidden = !sources.length; preview.hidden = true;
      refreshTools();if (visible()) void render();
    },
    invalidate,refreshVisibility,follow,
    get sources() { return sources.map(({kind,role,label,language,path,canOpenAsRoot})=>({key:sourceKey({kind,path}),kind,role,identifier:path,label,language,path,canOpenAsRoot})); },
    get selected() { return selected; }, get text() { return text; }, select:choose,
    dispose() {
      if (disposed) return;
      saveFiles();saveDrafts();draftWindow.removeEventListener('pagehide',saveDrafts);unbind(); arrayInput.dispose(); drafts.clear();draftHistory.clear();disposed = true; clearTimeout(copiedTimer); clearTimeout(scrollTimer); resize.disconnect();
      if (resizeFrame) resizeWindow.cancelAnimationFrame(resizeFrame); finishDrag(); finishArrayDrag(); clearPreview(); cache.clear(); sources = []; text = ''; root.remove();
    },
  };
}
