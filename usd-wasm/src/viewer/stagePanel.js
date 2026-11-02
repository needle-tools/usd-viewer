import {resolveHierarchyVisibility} from '../scene/hierarchy.js';
import { installViewerStyle } from './style.js';
import { transportIcon, viewerIcon, primIcon } from './icons.js';
import { createSelection } from './selection.js';
import { mountPropertyInspector } from './propertyInspector.js';
import { inspectStageAsync, setVariant, setPayloadLoaded, setPrimActive, setPrimVisible, stageCameras } from '../scene/index.js';

function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text) el.textContent = text; return el; }
/** Plain DOM panels can be hosted in Dockview or embedded without a framework. Native handles remain owned by Hydra. */
export async function mountStagePanel({ handle, stage, scene, camera, controls, container = document.body, containers, stateKey, beforeEdit = () => {}, afterEdit = () => {}, isCurrent = () => true, setCamera = () => {}, onVariantChange = () => {}, onPickModeChange = () => {}, onHover = () => {}, onSelect = () => {}, onOpen = () => {}, onStage = () => {}, style = true }) {
  if (style) installViewerStyle();
  let disposed = false, editing = false, activeCamera = '', currentPurpose = 'default,render', frame, info, selectedPath = '';
  let collapsed = new Set(), expandedInstances = new Set(), showPrototypes = false;
  let saved = {};
  if (stateKey) try { const value = JSON.parse(localStorage.getItem(stateKey)); if (value && typeof value === 'object' && !Array.isArray(value)) saved = value; } catch {}
  const selection = createSelection({items: Array.isArray(saved.selectedItems) ? saved.selectedItems : (typeof saved.selectedPath === 'string' ? [saved.selectedPath] : [])});
  showPrototypes=saved.showPrototypes===true;
  selectedPath = selection.primary?.path || ''; expandedInstances=new Set(Array.isArray(saved.expandedInstances)?saved.expandedInstances:[]);
  for(let ancestor=selectedPath.slice(0,selectedPath.lastIndexOf('/'));ancestor;ancestor=ancestor.slice(0,ancestor.lastIndexOf('/')))expandedInstances.add(ancestor);
  collapsed = new Set(Array.isArray(saved.collapsed) ? saved.collapsed : []);
  function persist() { if (stateKey) try { localStorage.setItem(stateKey, JSON.stringify({ selectedPath, selectedItems: selection.items, showPrototypes, pickMode: saved.pickMode || 'prim', collapsed: [...collapsed], expandedInstances:[...expandedInstances], search: search.value })); } catch {} }
  const embedded = !!containers;
  const panel = node('aside', 'usd-suite'); panel.id = 'usd-suite';
  const toggle = node('button', 'usd-stage-toggle', 'Stage'); toggle.type = 'button'; toggle.setAttribute('aria-controls', 'usd-suite-content'); toggle.setAttribute('aria-expanded', String(embedded));
  const content = node('div'); content.id = 'usd-suite-content'; content.hidden = !embedded;
  const heading = node('div', 'usd-suite-heading'); heading.append(node('strong', '', 'Stage'));
  const close = node('button'); close.append(viewerIcon('close')); close.type = 'button'; close.title = 'Close stage'; close.setAttribute('aria-label', 'Close stage'); heading.append(close); content.append(heading);
  panel.append(content); (containers?.stage || container).append(panel); if (!embedded) panel.prepend(toggle);
  function open(value) { content.hidden = !value; toggle.setAttribute('aria-expanded', String(value)); if (value) onOpen(); }
  toggle.onclick = () => open(embedded || content.hidden); close.onclick = () => open(false);
  const status = node('div', 'usd-stage-status'); status.setAttribute('role', 'status'); content.append(status);
  const sections = [];
  function section(title, expanded = true, parent = content) {
    const group = node('details', 'usd-stage-section'); group.open = expanded;
    const summary = node('summary'); summary.append(viewerIcon('chevron_right'), document.createTextNode(title));
    group.append(summary); parent.append(group); sections.push(group); return group;
  }
  const propertyHost = containers?.properties || content;
  const view = containers?.view || section('View', true, propertyHost), variants = section('Variants', true, propertyHost), payloads = section('Payloads', true, propertyHost);
  // An embedded hierarchy needs a real flex container, not details' anonymous content box.
  const hierarchy = embedded ? node('section', 'usd-stage-section') : section('Prims');
  if (embedded) { content.append(hierarchy); sections.push(hierarchy); }
  hierarchy.classList.add('usd-tree-section');
  const properties = embedded ? node('section', 'usd-stage-section usd-inspector-section') : section('Properties', true, propertyHost);
  if (embedded) { propertyHost.append(properties); sections.push(properties); }
  const layers = section('Layers', !!containers, containers?.layers || content);
  if (containers) layers.firstElementChild.hidden = true;
  const search = node('input', 'usd-prim-filter'); search.type = 'search'; search.placeholder = 'Filter prims'; search.setAttribute('aria-label', 'Filter prims'); search.value = typeof saved.search === 'string' ? saved.search : '';
  const columns = node('div', 'usd-tree-columns'); columns.append(node('span', '', 'Prim'), node('span', '', 'Type'));
  for (const [name, title] of [['visibility','Visibility'],['power_settings_new','Activation']]) {
    const column = node('span', 'usd-tree-column-icon'); column.append(viewerIcon(name)); column.title = title; column.setAttribute('aria-label', title); columns.append(column);
  }
  const tree = node('div', 'usd-prim-tree'); tree.setAttribute('role', 'tree'); tree.setAttribute('aria-label', 'Stage hierarchy'); tree.setAttribute('aria-multiselectable', 'true');
  const treeTools=node('div','usd-tree-tools'),prototypeToggle=node('button','usd-tree-prototypes');
  prototypeToggle.type='button';prototypeToggle.append(viewerIcon('prototype'));
  function updatePrototypeToggle(){prototypeToggle.setAttribute('aria-pressed',String(showPrototypes));prototypeToggle.setAttribute('aria-label','Show prototypes');prototypeToggle.title=showPrototypes?'Hide generated prototypes':'Show generated prototypes';}
  updatePrototypeToggle();prototypeToggle.onclick=()=>{showPrototypes=!showPrototypes;updatePrototypeToggle();persist();void refresh().catch(error=>{if(!disposed)status.textContent=error.message;});};
  treeTools.append(search,prototypeToggle);hierarchy.append(treeTools, columns, tree);
  tree.addEventListener('scroll',()=>{columns.style.transform=`translateX(${-tree.scrollLeft}px)`;},{passive:true});
  function row(parent, text, input) { const label = node('label', 'usd-settings-row', text); label.append(input); parent.append(label); return input; }
  function dropdown(parent, label, choices, value, change, caption = label) {
    const select = node('select'); select.setAttribute('aria-label', label);
    for (const [id, text] of choices) { const option = node('option', '', text); option.value = id; select.append(option); }
    select.value = value; select.onchange = () => change(select.value); const field = row(parent, caption, select); field.parentElement.title = label; return select;
  }
  let editQueue = Promise.resolve();
  function assertCurrent() {
    if (disposed || !isCurrent()) throw new Error('USD stage is no longer current.');
  }
  // The native edit queue may wait behind another owner after the panel's own
  // queue and host preparation have finished. Recheck at the mutation boundary.
  const authoringHandle = {
    getTime: () => handle.getTime?.() || 0,
    editStage: action => handle.editStage((...args) => { assertCurrent(); return action(...args); }),
  };
  function edit(action, {rethrow = false} = {}) {
    const result = editQueue.then(() => performEdit(action));
    editQueue = result.catch(() => {});
    return rethrow ? result : result.catch(() => {});
  }
  async function performEdit(action) {
    assertCurrent();
    editing = true; status.textContent = 'Updating stage…'; panel.setAttribute('aria-busy', 'true');
    for (const group of sections) group.querySelectorAll('select,input,button[data-prim-action]').forEach(control => { control.disabled = true; });
    let result, failure, failed = false;
    try {await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0))); assertCurrent(); await beforeEdit(); assertCurrent(); result = await action(stage, handle.driver);}
    catch (error) {failure = error; failed = true;}
    finally {
      if (!disposed && isCurrent()) {
        try {await afterEdit(); if (!disposed && isCurrent()) await refresh();}
        catch (error) {if (!failed) {failure = error; failed = true;}}
      }
      editing = false; panel.removeAttribute('aria-busy');
      if (!failed && status.textContent === 'Updating stage…') status.textContent = '';
      for (const group of sections) group.querySelectorAll('select,input,button[data-prim-action]').forEach(control => { control.disabled = control.dataset.unavailable === 'true'; });
    }
    if (failed) {status.textContent = failure?.message || String(failure); console.error('USD stage edit failed', failure); throw failure;}
    return result;
  }
  let authoredCameras = [];
  function selectCamera(path) {
    activeCamera = path; const selected = authoredCameras.find(candidate => candidate.userData.usdPath === path);
    if (!selected) activeCamera = ''; setCamera(selected || camera); controls.enabled = !selected;
  }
  let inspectedTime, primPaths = new Set();
  const inspector = mountPropertyInspector({stage, handle, container: properties, isCurrent: () => !disposed && isCurrent(), onNavigate: navigate});
  const primPath = target => target.includes('.') ? target.slice(0, target.indexOf('.')) : target;
  function validItem(item) {
    if (!item || typeof item.path !== 'string' || !item.path.startsWith('/')) return false;
    let prim;
    try {prim = stage.GetPrimAtPath(item.path); return !!prim?.IsValid();}
    finally {prim?.delete?.();}
  }
  function selectedInTree(path) {
    return selection.items.some(item => {
      let target = item.path;
      while (target && !primPaths.has(target)) target = parentOf(target);
      return target === path;
    });
  }
  function expandTo(path) {
    if(!path || primPaths.has(path))return;
    const target=stage.GetPrimAtPath(path);try{if(target.IsInPrototype?.()){showPrototypes=true;updatePrototypeToggle();}}finally{target.delete?.();}
    for(let ancestor=parentOf(path);ancestor;ancestor=parentOf(ancestor)){expandedInstances.add(ancestor);collapsed.delete(ancestor);}
    void refresh().then(revealSelection).catch(error=>{if(!disposed)status.textContent=error.message;});
  }
  function showProperties(path, notify = true) {
    if (disposed || !isCurrent()) return;
    selectedPath = path;
    if (!notify && primPath(inspector.target) === path) inspector.refresh();
    else inspector.show(path, {instance: selection.primary || undefined, recordHistory: notify});
    if (notify && path) {
      expandTo(path);
      let ancestor = parentOf(path); while (ancestor) {collapsed.delete(ancestor); ancestor = parentOf(ancestor);}
      drawTree();
    }
    tree.querySelectorAll('[data-prim-path]').forEach(button => {
      const selected = selectedInTree(button.dataset.primPath);
      button.setAttribute('aria-selected', String(selected)); button.parentElement.dataset.selected = String(selected);
    });
    if (notify) revealSelection();
    persist(); if (notify) onSelect(path, selection.items);
  }
  function selectPrim(value, options = {}) {
    if (disposed || editing || !isCurrent()) return false;
    if (typeof value === 'string' && value.includes('.')) return navigate(value, options);
    const item = typeof value === 'string' ? {path: value} : value;
    if (item?.path && !validItem(item)) return false;
    selection.choose(item, {...options, order: [...tree.querySelectorAll('[data-prim-path]')].map(button => button.dataset.primPath)});
    showProperties(selection.primary?.path || '', true); return true;
  }
  function selectMany(values) {
    if (disposed || editing || !isCurrent()) return;
    selection.replace(values.map(value => typeof value === 'string' ? {path: value} : value).filter(validItem));
    showProperties(selection.primary?.path || '', true);
  }
  function navigate(target, options = {}) {
    if (disposed || editing || !isCurrent() || !inspector.show(target, options)) return false;
    selectedPath = primPath(inspector.target);
    selection.replace(selectedPath ? [{...options.instance, path: selectedPath}] : []);
    let ancestor = parentOf(selectedPath); while (ancestor) {collapsed.delete(ancestor); ancestor = parentOf(ancestor);}
    expandTo(selectedPath); drawTree(); revealSelection(); persist(); onSelect(selectedPath, selection.items); return true;
  }
  const parentOf = path => path.slice(0, path.lastIndexOf('/'));
  function revealItem(item) {
    // scrollIntoView also scrolls the dock/document. Inactive Dockview panels
    // retain stale bounds, so even a hidden tree can otherwise move the canvas.
    if (!item || !tree.clientHeight || getComputedStyle(tree).visibility !== 'visible') return;
    const row = item.getBoundingClientRect(), bounds = tree.getBoundingClientRect();
    if (row.top < bounds.top) tree.scrollTop += row.top - bounds.top;
    else if (row.bottom > bounds.bottom) tree.scrollTop += row.bottom - bounds.bottom;
  }
  function revealSelection() {
    let path = selectedPath, item;
    while (path && !(item = tree.querySelector(`[data-prim-path="${CSS.escape(path)}"]`))) path = parentOf(path);
    revealItem(item);
  }
  function focusItem(item) { item?.focus({preventScroll:true}); revealItem(item); }

  const treeRows = new Map();
  const text = (element,value) => {if(element.textContent!==value)element.textContent=value;};
  const glyph = (element,name) => {if(element.dataset.glyph!==name){element.replaceChildren(viewerIcon(name));element.dataset.glyph=name;}};
  function drawTree(focusPath) {
    const scrollTop = tree.scrollTop; if (!info) return;
    let cursor = tree.firstElementChild;
    // Reserve a shared content-sized column; names may truncate, USD types may not.
    const parents = new Set(info.prims.map(prim => parentOf(prim.path))), query = search.value.trim().toLowerCase();
    const matched = new Set();
    if (query) for (const prim of info.prims) if (`${prim.path} ${prim.type}`.toLowerCase().includes(query)) { let path = prim.path; while (path) { matched.add(path); path = parentOf(path); } }
    for (const prim of info.prims) {
      if (query && !matched.has(prim.path)) continue;
      let parent = parentOf(prim.path), hidden = false;
      if (!query) while (parent) { if (collapsed.has(parent)) { hidden = true; break; } parent = parentOf(parent); }
      if (hidden) continue;
      const lazyBranch=prim.instance || prim.prototype,hasChildren = parents.has(prim.path) || lazyBranch, expanded = !!query || (!collapsed.has(prim.path) && (!lazyBranch || expandedInstances.has(prim.path)));
      let cached=treeRows.get(prim.path);
      if(!cached){
        const entry=node('div','usd-tree-row'),button=node('button'),disclosure=node('span','usd-tree-disclosure'),icon=node('span','usd-tree-icon'),name=node('span','usd-tree-name'),type=node('span','usd-tree-type');
        button.append(disclosure,icon,name,type);entry.append(button);
        cached={entry,button,disclosure,icon,name,type};treeRows.set(prim.path,cached);
      }
      const {entry,button,disclosure,icon,name,type}=cached;
      if(prim.payload && !prim.loaded) {
        if(!cached.loadState){cached.loadState=node('span','usd-tree-load-state');cached.loadState.append(viewerIcon('download'));button.insertBefore(cached.loadState,type);}
        cached.loadState.title='Payload unloaded';cached.loadState.hidden=false;
      } else if(cached.loadState)cached.loadState.hidden=true;
      const purposeIncluded=(handle.includedPurposes || currentPurpose.split(',')).includes(prim.purpose || 'default');
      entry.dataset.instance=String(prim.instance);entry.dataset.instanceProxy=String(prim.instanceProxy);entry.dataset.prototype=String(prim.prototype);entry.dataset.defined=String(prim.defined);entry.dataset.abstract=String(prim.abstract);
      entry.dataset.purposeIncluded=String(purposeIncluded); entry.dataset.loaded = String(prim.loaded); entry.dataset.active = String(prim.active); entry.dataset.visible = String(prim.visible); entry.dataset.selected = String(selectedInTree(prim.path));
      button.type = 'button'; button.title = prim.path; button.dataset.primPath = prim.path;
      button.setAttribute('role', 'treeitem'); button.setAttribute('aria-selected', String(selectedInTree(prim.path)));
      button.setAttribute('aria-level', String(prim.path.split('/').length - 1)); if (hasChildren) button.setAttribute('aria-expanded', String(expanded)); else button.removeAttribute('aria-expanded');
      button.style.paddingLeft = `${6 + (prim.path.split('/').length - 2) * 13}px`;
      if(hasChildren)glyph(disclosure,expanded?'expand_more':'chevron_right');else{disclosure.replaceChildren();delete disclosure.dataset.glyph;}disclosure.setAttribute('aria-hidden','true');
      glyph(icon,primIcon(prim));
      const badgeKind=prim.instance?'instance':prim.instanceProxy?'instance-proxy':prim.inPrototype&&!prim.prototype?'prototype':'';
      if(badgeKind){
        if(!cached.instanceBadge){cached.instanceBadge=node('span','usd-tree-instance-badge');button.insertBefore(cached.instanceBadge,type);}
        cached.instanceBadge.hidden=false;glyph(cached.instanceBadge,badgeKind);
        cached.instanceBadge.title=prim.instance?`Instance of ${prim.prototypePath} · ${prim.prototypeInstanceCount} shared instances`:prim.instanceProxy?`Shared instance child · ${prim.prototypePrimPath}`:'Shared prototype child (read-only)';
      }else if(cached.instanceBadge)cached.instanceBadge.hidden=true;
      const description = [prim.prototype?'Prototype':prim.type || 'Untyped prim', prim.specifier, !prim.defined && !prim.inPrototype && 'Not fully defined', prim.abstract && 'Abstract (not drawn)', !prim.active && 'Inactive (children are not composed)', prim.instance && `Instance of ${prim.prototypePath} · ${prim.prototypeInstanceCount} shared instances`, prim.instanceable && !prim.instance && 'Instanceable (no shared prototype)', prim.instanceProxy && `Instance proxy (read-only) · ${prim.prototypePrimPath}`, prim.inPrototype && 'Generated prototype (read-only)', !prim.loaded && 'Payload unloaded', prim.hiddenBy && `Hidden by ${prim.hiddenBy}`, prim.purpose && prim.purpose !== 'default' && `Purpose: ${prim.purpose}`, !purposeIncluded && 'Excluded by view purpose'].filter(Boolean).join(' · ');
      icon.title = description; button.title = `${prim.path}\n${description}`;
      button.dataset.specifier = prim.specifier; button.setAttribute('aria-description', description);
      text(name,prim.name);text(type,prim.type);
      function toggleState(kind, on, off, checked, glyph, change) {
        let button=cached[kind];if(!button){button=node('button','usd-tree-action');button.type='button';cached[kind]=button;entry.append(button);}
        if(button.dataset.glyph!==glyph){button.replaceChildren(viewerIcon(glyph));button.dataset.glyph=glyph;}
        button.dataset.primAction = kind;
        button.setAttribute('aria-pressed', String(checked)); button.setAttribute('aria-label', `${checked ? off : on} ${prim.path}`); button.title = `${checked ? off : on} ${prim.path}`;
        button.disabled=editing;
        button.onclick = async () => { await edit(() => change(button.getAttribute('aria-pressed') !== 'true')); tree.querySelector(`[data-prim-path="${CSS.escape(prim.path)}"]`)?.parentElement.querySelector(`[data-prim-action="${kind}"]`)?.focus({preventScroll:true}); }; return button;
      }
      const visibility = toggleState('visibility', 'Show', 'Hide', prim.visible, prim.visible ? 'visibility' : 'visibility_off', async value => {
        await setPrimVisible(authoringHandle, prim.path, value);
        const purposes = handle.includedPurposes || currentPurpose.split(',');
        if(value && prim.purpose && !purposes.includes(prim.purpose)) {
          await handle.setIncludedPurposes([...purposes,prim.purpose]); currentPurpose=[...purposes,prim.purpose].join(',');
        }
      });
      visibility.dataset.inherited=String(!prim.visible && prim.localVisible === true);
      if(visibility.dataset.inherited==='true')visibility.title+=`\nHidden by ${prim.hiddenBy}`;
      visibility.disabled = editing || !prim.active || !prim.imageable || !prim.loaded || prim.instanceProxy || prim.inPrototype; visibility.dataset.unavailable = String(!prim.active || !prim.imageable || !prim.loaded || prim.instanceProxy || prim.inPrototype);
      const activation = toggleState('activation', 'Activate', 'Deactivate', prim.active, prim.active ? 'power_settings_new' : 'block', value => setPrimActive(authoringHandle, prim.path, value));
      activation.disabled=editing || prim.instanceProxy || prim.inPrototype; activation.dataset.unavailable=String(!!(prim.instanceProxy || prim.inPrototype));
      function toggleBranch() {
        if(lazyBranch) {
          if(expandedInstances.has(prim.path))expandedInstances.delete(prim.path);else expandedInstances.add(prim.path);
          collapsed.delete(prim.path);persist();void refresh().then(()=>focusItem(tree.querySelector(`[data-prim-path="${CSS.escape(prim.path)}"]`))).catch(error=>{if(!disposed)status.textContent=error.message;});
        } else {if(collapsed.has(prim.path))collapsed.delete(prim.path);else collapsed.add(prim.path);persist();drawTree(prim.path);}
      }
      button.onclick = event => { if (disclosure.contains(event.target) && hasChildren) toggleBranch(); else selectPrim(prim.path, {toggle: event.ctrlKey || event.metaKey, range: event.shiftKey}); };
      button.onpointerenter = () => onHover(prim.path);
      button.onpointerleave = () => onHover(null);
      button.onkeydown = event => {
        if (event.key === ' ' && (event.ctrlKey || event.metaKey)) {event.preventDefault(); selectPrim(prim.path, {toggle: true}); return;}
        if (event.shiftKey && ['ArrowDown','ArrowUp'].includes(event.key)) {
          const buttons = [...tree.querySelectorAll('[role=treeitem]')], index = buttons.indexOf(button);
          const next = buttons[Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))];
          event.preventDefault(); selectPrim(next.dataset.primPath, {range: true, toggle: event.ctrlKey || event.metaKey}); focusItem(tree.querySelector(`[data-prim-path="${CSS.escape(next.dataset.primPath)}"]`)); return;
        }
        const buttons = [...tree.querySelectorAll('[role=treeitem]')], index = buttons.indexOf(button);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); focusItem(buttons[Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]); }
        if (event.key === 'ArrowRight' && hasChildren) { event.preventDefault(); if (!expanded) toggleBranch(); else if(parentOf(buttons[index + 1]?.dataset.primPath || '')===prim.path)focusItem(buttons[index + 1]); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); if (hasChildren && expanded) toggleBranch(); else focusItem(tree.querySelector(`[data-prim-path="${CSS.escape(parentOf(prim.path))}"]`)); }
      };
      if(entry!==cursor)tree.insertBefore(entry,cursor);
      cursor=entry.nextElementSibling;
    }
    while(cursor){const next=cursor.nextElementSibling;cursor.remove();cursor=next;}
    const currentPaths=new Set(info.prims.map(prim=>prim.path));
    for(const path of treeRows.keys())if(!currentPaths.has(path))treeRows.delete(path);
    fitTypes();tree.scrollTop = scrollTop;
    if (focusPath) focusItem(tree.querySelector(`[data-prim-path="${CSS.escape(focusPath)}"]`));
  }
  function fitTypes() {
    const probe=tree.querySelector('.usd-tree-type'),measure=document.createElement('canvas').getContext('2d');
    if(!probe || !measure || !info || disposed)return;
    const style=getComputedStyle(probe);
    // A tabular-numeral variant can make CSSOM's font shorthand empty. Compose
    // the canvas font explicitly so column widths still use the rendered face.
    measure.font=[style.fontStyle,style.fontWeight,style.fontSize,style.fontFamily].join(' ');
    const width=Math.ceil(info.prims.reduce((width,prim)=>Math.max(width,measure.measureText(prim.type).width),measure.measureText('Type').width))+(parseFloat(style.paddingLeft)||0)+(parseFloat(style.paddingRight)||0)+2;
    hierarchy.style.setProperty('--usd-tree-type-width',`${width}px`);
  }
  document.fonts?.ready.then(()=>{if(!disposed)fitTypes();});
  search.oninput = () => { persist(); void refresh().catch(error=>{if(!disposed)status.textContent=error.message;}); };
  let refreshRevision = 0, sampling;
  function refreshSampledState(time = handle.getTime?.() || 0) {
    if (disposed || !isCurrent()) return Promise.resolve();
    if (sampling) return sampling;
    const revision = refreshRevision, currentInfo = info;
    // Keep native wrappers alive and serialize reads with edits, draws and disposal.
    sampling = handle.readStage(async () => {
      if (disposed || !isCurrent() || revision !== refreshRevision) return [];
      const values = [];
      for (const item of currentInfo?.prims || []) {
        if (!item.imageable) continue;
        const prim = stage.GetPrimAtPath(item.path);
        let attribute;
        try {
          attribute = prim.GetAttribute('visibility');
          values.push([item, await attribute.Get(time) !== 'invisible']);
        } finally { attribute?.delete?.(); prim?.delete?.(); }
      }
      return values;
    }).then(values => {
      if (disposed || !isCurrent() || revision !== refreshRevision || time !== (handle.getTime?.() || 0)) return;
      showProperties(selectedPath, false);
      for (const [item,visible] of values)item.localVisible=visible;
      resolveHierarchyVisibility(currentInfo.prims);drawTree();
      inspectedTime = time;
    }).catch(error => { if (!disposed && isCurrent()) status.textContent = error.message; })
      .finally(() => { sampling = undefined; });
    return sampling;
  }
  async function refresh() {
    if (disposed || !isCurrent()) return;
    const revision = ++refreshRevision, time = handle.getTime?.() || 0;
    const nextInfo = await handle.readStage(currentStage => {
      if (disposed || !isCurrent() || revision !== refreshRevision) return null;
      return inspectStageAsync(currentStage, time, {expandedInstances:search.value.trim()?null:[...expandedInstances],includePrototypes:showPrototypes});
    });
    if (disposed || !isCurrent() || revision !== refreshRevision || !nextInfo) return;
    info = nextInfo; inspectedTime = time; primPaths = new Set(info.prims.map(prim => prim.path)); updateTimeline(info.time); onStage(info);
    if (!saved.initialized) { if (!saved.collapsed) for (const prim of info.prims) if (['Looks', 'Materials'].includes(prim.name)) collapsed.add(prim.path); saved.initialized = true; }
    for (const group of [view, variants, payloads, layers]) group.replaceChildren(...(group === containers?.view ? [] : [group.firstElementChild]));
    authoredCameras = stageCameras(scene);
    dropdown(view, 'Camera', [['', 'Free'], ...authoredCameras.map(cam => [cam.userData.usdPath, cam.name || cam.userData.usdPath])], activeCamera, selectCamera); selectCamera(activeCamera);
    dropdown(view, 'Pick', [['prim', 'Prims'], ['instance', 'Instances'], ['subset', 'Mesh subsets']], saved.pickMode || 'prim', value => {saved.pickMode = value; persist(); onPickModeChange(value);}); onPickModeChange(saved.pickMode || 'prim');
    const purposes = [['default,render', 'Default + render'], ['default,render,guide','Default + render + guides'], ['default', 'Default'], ['render', 'Render'], ['proxy', 'Proxy'], ['guide', 'Guide'], ['default,render,proxy,guide', 'All']];
    const included = handle.includedPurposes || handle.driver?.GetIncludedPurposes?.(); let purpose = currentPurpose;
    if (included) try { purpose = (Array.isArray(included) ? included : Array.from({ length: included.size() }, (_, i) => included.get(i))).join(','); } finally { included.delete?.(); }
    if(!purposes.some(([value])=>value===purpose))purposes.push([purpose,purpose.split(',').map(value=>value[0].toUpperCase()+value.slice(1)).join(' + ')]);
    dropdown(view, 'Purpose', purposes, purpose, value => edit(async () => { await handle.setIncludedPurposes(value.split(',')); currentPurpose = value; }));
    for (const variant of info.variants) {
      const select = dropdown(variants, `${variant.path} · ${variant.setName}`, variant.choices.map(value => [value, value]), variant.selection,
        value => edit(async () => { await setVariant(authoringHandle, variant.path, variant.setName, value); onVariantChange(variant.path, variant.setName, value); }), variant.setName);
      select.dataset.stageVariant = variant.setName; select.disabled=!!variant.readOnly; select.dataset.unavailable=String(!!variant.readOnly);
    }
    variants.hidden = !info.variants.length;
    for (const payload of info.payloads) {
      const input = node('input'); input.type = 'checkbox'; input.checked = payload.loaded; input.setAttribute('aria-label', `Load ${payload.path}`); input.disabled=!!(payload.instanceProxy || payload.inPrototype); input.dataset.unavailable=String(!!(payload.instanceProxy || payload.inPrototype));
      input.onchange = () => edit(() => setPayloadLoaded(authoringHandle, payload.path, input.checked)); row(payloads, payload.name, input).parentElement.title = payload.path;
    }
    payloads.hidden = !info.payloads.length; drawTree();
    for (const layer of info.layers) layers.append(node('div', 'usd-layer', handle.sourcePaths?.path(layer.identifier || layer.realPath) || layer.displayName || layer.identifier));
    status.textContent = info.errors.join('\n');
    const pruned = selection.prune(validItem); selectedPath = selection.primary?.path || '';
    if (pruned) { drawTree(); onSelect(selectedPath, selection.items); }
    showProperties(selectedPath, false);
    inspectedTime = time;
  }
  const timeline = node('div', 'usd-timeline');
  let rulerObserver, rulerFrame, rangeKey = '';
  function updateTimeline(range) {
    const key = JSON.stringify(range); if (key === rangeKey) return; rangeKey = key;
    cancelAnimationFrame(frame); cancelAnimationFrame(rulerFrame); rulerObserver?.disconnect(); timeline.remove(); timeline.replaceChildren();
    if (!range || range.end <= range.start) { handle.setPlaying(false); return; }
    const first=range.start,last=range.end;
    let pendingTime, requestedTime, seeking=false, scrubbing=false, editingFrame=false;
    const transport=node('div','usd-time-transport');
    function transportButton(label,icon,action) {const button=node('button');button.type='button';button.title=label;button.setAttribute('aria-label',label);button.append(transportIcon(icon));button.onclick=action;transport.append(button);return button;}
    const clamp=value=>Math.max(first,Math.min(last,value));
    async function seek() {
      if (seeking) return;seeking=true;
      try {while(pendingTime!==undefined&&!disposed&&isCurrent()){const time=pendingTime;pendingTime=undefined;await handle.setTime(time);}if(!handle.isPlaying())await refreshSampledState();}
      catch(error){status.textContent=error.message;}
      finally{seeking=false;}
    }
    function requestTime(value) {if(!Number.isFinite(value))return;handle.setPlaying(false);requestedTime=pendingTime=clamp(value);slider.value=String(requestedTime);frameInput.value=String(requestedTime);void seek();}
    const firstButton=transportButton('First frame','first_page',()=>requestTime(first));
    const previousButton=transportButton('Previous frame','chevron_left',()=>requestTime((requestedTime??handle.getTime())-1));
    const play=transportButton('Play or pause','play_arrow',()=>handle.setPlaying(!handle.isPlaying()));
    const nextButton=transportButton('Next frame','chevron_right',()=>requestTime((requestedTime??handle.getTime())+1));
    const lastButton=transportButton('Last frame','last_page',()=>requestTime(last));
    const frameInput=node('input','usd-time-frame');frameInput.type='number';frameInput.min=first;frameInput.max=last;frameInput.step='1';frameInput.setAttribute('aria-label','Current frame');frameInput.onfocus=()=>{editingFrame=true;};frameInput.onblur=()=>{editingFrame=false;};frameInput.onchange=()=>requestTime(Number(frameInput.value));
    const track=node('div','usd-time-track'),ticks=node('div','usd-time-ticks');ticks.setAttribute('aria-hidden','true');
    const slider=node('input');slider.type='range';slider.min=first;slider.max=last;slider.step='any';slider.setAttribute('aria-label','Time code');
    slider.onpointerdown=()=>{scrubbing=true;handle.setPlaying(false);};slider.onpointerup=slider.onpointercancel=()=>{scrubbing=false;};slider.onblur=()=>{scrubbing=false;};slider.oninput=()=>requestTime(Number(slider.value));
    track.append(ticks,slider);timeline.append(transport,frameInput,track);(containers?.timeline||container).append(timeline);
    function ruler(){
      const target=(last-first)/Math.max(1,Math.floor(track.clientWidth/64));
      const power=10**Math.floor(Math.log10(target));
      let step=Math.max(last-first>=1?1:0, [1,2,5,10].find(n=>n*power>=target)*power);
      // A narrow viewport can put every nice tick outside the authored range.
      // Keep the coarsest regular spacing that still supplies two useful labels.
      for(let attempt=0;attempt<12 && Math.floor(last/step)-Math.ceil(first/step)+1<2 && step>(last-first>=1?1:0);attempt++){
        const scale=10**Math.floor(Math.log10(step)),unit=step/scale;
        step=Number((Math.max(last-first>=1?1:0,(unit>5?5:unit>2?2:unit>1?1:.5)*scale)).toPrecision(12));
      }
      const labels=[];
      for(let value=Math.ceil(first/step)*step;value<=last+step*1e-6;value+=step){
        const tick=node('span','',String(Number(value.toPrecision(10)))), fraction=(value-first)/(last-first);
        tick.style.left=`${fraction*100}%`;
        if(fraction<=0){tick.style.transform='none';tick.dataset.edge='start';}
        else if(fraction>=1){tick.style.transform='translateX(-100%)';tick.dataset.edge='end';}
        labels.push(tick);
      }
      ticks.replaceChildren(...labels);
    }
    rulerObserver=new ResizeObserver(()=>{cancelAnimationFrame(rulerFrame);rulerFrame=requestAnimationFrame(ruler);});rulerObserver.observe(track);
    let wasPlaying;
    function tick() {
      if(disposed||!isCurrent())return;
      const time=handle.getTime(),playing=handle.isPlaying();
      if(!seeking&&pendingTime===undefined&&!scrubbing){requestedTime=undefined;slider.value=String(time);if(!editingFrame)frameInput.value=String(Number(time.toFixed(2)));}
      if(!playing&&!seeking&&pendingTime===undefined&&!scrubbing&&time!==inspectedTime)refreshSampledState(time);
      if(playing!==wasPlaying){play.replaceChildren(transportIcon(playing?'pause':'play_arrow'));play.title=playing?'Pause (Space)':'Play (Space)';play.setAttribute('aria-pressed',String(playing));wasPlaying=playing;}
      firstButton.disabled=previousButton.disabled=time<=first;lastButton.disabled=nextButton.disabled=time>=last;
      frame=requestAnimationFrame(tick);
    }
    tick();
  }
  await refresh();
  return { refresh, selectPrim, selectMany, navigate, edit: action => edit(() => authoringHandle.editStage(action), {rethrow: true}),
    get selection() {return selection.items;}, get selectedProperty() {return inspector.target.includes('.') ? inspector.target : '';}, revealSelection, useFreeCamera() { selectCamera(''); const input=view.querySelector('select[aria-label="Camera"]'); if(input)input.value=''; }, get selectedPath(){return selectedPath;}, dispose() {
    if (disposed) return; disposed = true; cancelAnimationFrame(frame); cancelAnimationFrame(rulerFrame); rulerObserver?.disconnect(); selectCamera('');
    inspector.dispose(); panel.remove(); toggle.remove(); timeline.remove(); containers?.view?.replaceChildren(); for (const group of sections) group.remove(); setCamera(camera); onStage(null);
  } };
}
