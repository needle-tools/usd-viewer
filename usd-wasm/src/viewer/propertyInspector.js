import { inspectPrimAsync } from '../scene/index.js';
import { viewerIcon } from './icons.js';

const node = (tag, className = '', text = '') => {
  const element = document.createElement(tag);
  element.className = className; element.textContent = text;
  return element;
};
const rawText = value => value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
// History and callbacks contain only data, never live USD or renderer objects.
function plain(value) {
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map(plain);
  if (Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v !== 'function').map(([k, v]) => [k, plain(v)]));
  return undefined;
}
function vectorValues(vector, read = value => value) {
  if (!vector) return [];
  if (Array.isArray(vector)) return vector.map(read);
  try {
    return Array.from({ length: vector.size() }, (_, index) => {
      const value = vector.get(index);
      try { return read(value); } finally { value?.delete?.(); }
    });
  } finally { vector.delete?.(); }
}
async function vectorValuesAsync(vector, read) {
  if (!vector) return [];
  const values = [];
  try {
    for (let index = 0; index < (Array.isArray(vector) ? vector.length : vector.size()); index++) {
      const value = Array.isArray(vector) ? vector[index] : vector.get(index);
      try { values.push(await read(value)); } finally { if (!Array.isArray(vector)) value?.delete?.(); }
    }
    return values;
  } finally { vector.delete?.(); }
}
function parts(path) {
  const dot = path.indexOf('.');
  return dot < 0 ? { prim: path, property: '' } : { prim: path.slice(0, dot), property: path.slice(dot + 1) };
}
/** Resolve actual USD target paths, including relative paths anchored to the owning prim. */
function absolutePath(path, owner = '/') {
  if (typeof path !== 'string') return null;
  if (!path) return '';
  let candidate = path;
  if (!candidate.startsWith('/')) candidate = candidate.startsWith('.') && !candidate.startsWith('./') && !candidate.startsWith('../')
    ? owner + candidate : `${owner}/${candidate}`;
  const segments = [];
  for (const segment of candidate.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') { if (!segments.length) return null; segments.pop(); }
    else segments.push(segment);
  }
  candidate = '/' + segments.join('/');
  const { prim, property } = parts(candidate);
  if (prim.includes('.') || property.includes('/') || /[\[\]{}\s]/.test(candidate)) return null;
  return candidate;
}

/**
 * Read-only navigation is deliberately independent of future document undo.
 * The owner calls refresh after pause, seek or edits; this module never polls playback.
 * onNavigate must call show(target, options) when it accepts navigation.
 */
export function mountPropertyInspector({ stage, handle, container, isCurrent = () => true, onNavigate }) {
  let revision = 0;
  let disposed = false, current = '', context = {}, primPath, table, snapshot;
  let history = [], historyIndex = -1, pendingHistory = null;
  const rows = new Map();
  const root = node('section', 'usd-property-inspector');
  const toolbar = node('div', 'usd-property-toolbar');
  const makeButton = (label, glyph, action) => {
    const button = node('button', '', glyph ? '' : label); button.type = 'button';
    button.title = label; button.setAttribute('aria-label', label);
    if (glyph) button.append(viewerIcon(glyph));
    button.onclick = action; return button;
  };
  const back = makeButton('Back', 'arrow_back', () => travel(-1));
  const forward = makeButton('Forward', 'chevron_right', () => travel(1));
  const filter = node('input'); filter.type = 'search'; filter.placeholder = 'Filter properties'; filter.setAttribute('aria-label', 'Filter properties');
  toolbar.append(back, forward, filter);
  const address = node('div', 'usd-property-address'), pathLabel = node('code');
  const copyPath = makeButton('Copy path', null, () => copy(current));
  const copyValue = makeButton('Copy value', null, () => copy(selectedRow()?.text ?? rawText(snapshot)));
  address.append(pathLabel, copyPath, copyValue);
  const status = node('div', 'usd-property-status'); status.setAttribute('role', 'status'); status.hidden = true;
  const provenance = node('details', 'usd-property-provenance'); provenance.hidden = true;
  const scroller = node('div', 'usd-property-scroller'); scroller.setAttribute('aria-label', 'Properties');
  root.append(toolbar, address, status, provenance, scroller); container.append(root);
  const alive = () => !disposed && isCurrent();
  function message(text = '') { status.textContent = text; status.hidden = !text; }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text || ''); if (alive()) message('Copied'); }
    catch { if (alive()) message('Could not copy to clipboard.'); }
  }
  function buttons() { back.disabled = historyIndex <= 0; forward.disabled = historyIndex >= history.length - 1; copyPath.disabled = !current; copyValue.disabled = !snapshot; }
  function selectedRow() { return [...rows.values()].find(row => row.path === current && row.kind !== 'metadata'); }
  function valid(path) {
    if (!path) return true;
    const { prim: pathToPrim, property } = parts(path);
    let prim, attr, relation;
    try {
      prim = stage.GetPrimAtPath(pathToPrim);
      if (!prim?.IsValid()) return false;
      if (!property) return true;
      attr = prim.GetAttribute?.(property);
      if (attr?.IsValid()) return true;
      relation = prim.GetRelationship?.(property);
      return !!relation?.IsValid();
    } catch { return false; }
    finally { relation?.delete?.(); attr?.delete?.(); prim?.delete?.(); }
  }
  function navigate(path, options = {}) {
    if (!alive()) return;
    const resolved = absolutePath(path, primPath || '/');
    if (resolved === null || !valid(resolved)) { pendingHistory = null; message(`Unavailable target: ${path}`); return; }
    message();
    const localContext = options.recordHistory !== false && parts(resolved).prim === primPath ? plain(context) : {};
    const nextOptions = { ...localContext, ...plain(options) };
    if (onNavigate) onNavigate(resolved, nextOptions); else show(resolved, nextOptions);
  }
  function travel(direction) {
    const index = historyIndex + direction, entry = history[index];
    if (!entry || !alive()) return;
    pendingHistory = index;
    navigate(entry.target, { ...entry.context, recordHistory: false });
  }
  // Older runtime snapshots may omit navigation fields. Read only missing fields,
  // and guard metadata access for bindings built without GetAllMetadata.
  async function inspect(path, time) {
    if (!path) return { metadata: handle.stageMetadata?.() || {}, attributes: [], relationships: [] };
    const prim = stage.GetPrimAtPath(path);
    try {
      if (!prim?.IsValid()) return null;
      const data = typeof prim.GetAllMetadata === 'function' ? await inspectPrimAsync(stage, path, time) : {
        path, type: prim.GetTypeName?.(), metadata: {},
        attributes: await vectorValuesAsync(prim.GetAttributes?.(), async attr => ({ name: attr.GetName(), type: attr.GetTypeName(), value: await attr.GetValueStringAtTime(time) })),
        relationships: vectorValues(prim.GetRelationships?.(), rel => ({ name: rel.GetName(), targets: vectorValues(rel.GetTargets?.()) })),
      };
      for (const attr of data.attributes || []) {
        attr.path ||= `${path}.${attr.name}`;
        if (!Array.isArray(attr.connections)) {
          const native = prim.GetAttribute(attr.name);
          try { attr.connections = vectorValues(native.GetConnections?.()); }
          finally { native?.delete?.(); }
        }
      }
      for (const rel of data.relationships || []) rel.path ||= `${path}.${rel.name}`;
      return data;
    } finally { prim?.delete?.(); }
  }
  async function readDetails(data, target, time) {
    const { prim: path, property: name } = parts(target);
    const attribute = data.attributes?.find(item => item.name === name);
    const relation = data.relationships?.find(item => item.name === name);
    if (!attribute && !relation) return null;
    const kind = attribute ? 'attribute' : 'relationship', type = attribute?.type || kind;
    let prim, property;
    try {
      prim = stage.GetPrimAtPath(path);
      property = attribute ? prim.GetAttribute(name) : prim.GetRelationship(name);
      const resolve = plain(await property.GetResolveInfo?.(time));
      const stack = plain(await property.GetPropertyStackWithLayerOffsets?.(time)) || [];
      return {
        summary: [type, resolve?.source, resolve?.valueIsBlocked ? 'Blocked' : ''].filter(Boolean).join(' · '),
        entries: stack.map(spec => [spec.path, spec.layer?.identifier, spec.layerOffset ? `offset ${spec.layerOffset.offset}, scale ${spec.layerOffset.scale}` : ''].filter(Boolean).join('\n')),
      };
    } catch { return { summary: type, entries: [] }; }
    finally { property?.delete?.(); prim?.delete?.(); }
  }
  function details(value) {
    provenance.hidden = !value;
    if (!value) { provenance.replaceChildren(); delete provenance.dataset.signature; return; }
    const signature = JSON.stringify(value);
    if (provenance.dataset.signature === signature) return;
    provenance.dataset.signature = signature;
    provenance.replaceChildren(node('summary', '', value.summary));
    for (const text of value.entries) provenance.append(node('pre', '', text));
  }
  function link(path, label = path, owner = primPath) {
    const button = makeButton(`Follow ${path}`, null, () => navigate(absolutePath(path, owner) ?? path));
    button.className = 'usd-property-link'; button.textContent = label; button.dataset.target = absolutePath(path, owner) ?? path;
    return button;
  }
  function applyFilter() {
    const query = filter.value.trim().toLowerCase();
    for (const row of rows.values()) row.tr.hidden = !!query && !`${row.name} ${row.type || ''} ${row.kind} ${row.text}`.toLowerCase().includes(query);
  }
  function reveal(row) {
    // Never scroll an ancestor, Dockview or the document, including when hidden.
    if (!row || !scroller.clientHeight || getComputedStyle(scroller).visibility !== 'visible') return;
    row.tr.focus({ preventScroll: true });
    const bounds = scroller.getBoundingClientRect(), item = row.tr.getBoundingClientRect();
    if (item.top < bounds.top) scroller.scrollTop += item.top - bounds.top;
    else if (item.bottom > bounds.bottom) scroller.scrollTop += item.bottom - bounds.bottom;
  }
  function render(data, path) {
    const samePrim = primPath === path, scrollTop = scroller.scrollTop;
    if (!samePrim) { rows.clear(); table = node('table'); scroller.replaceChildren(table); primPath = path; }
    table.setAttribute('aria-label', path ? `Properties of ${path}` : 'Stage properties');
    pathLabel.textContent = current || 'Stage'; pathLabel.title = current;
    const instances = context.instance?.instances || [];
    if (instances.length) pathLabel.textContent += ' · ' + instances.map(instance => `${instance.path}[${instance.id ?? instance.index}]`).join(' / ');
    const values = [
      ...Object.entries(data.metadata || {}).map(([name, value]) => ({ kind: 'metadata', name, value })),
      ...(data.attributes || []).map(attr => ({ ...attr, kind: 'attribute' })),
      ...(data.relationships || []).map(rel => ({ ...rel, kind: 'relationship', value: (rel.targets || []).join(', ') })),
    ];
    const keys = new Set(values.map(value => `${value.kind}:${value.name}`));
    for (const [key, row] of rows) if (!keys.has(key)) { row.tr.remove(); rows.delete(key); }
    for (const value of values) {
      const key = `${value.kind}:${value.name}`;
      let row = rows.get(key);
      if (!row) {
        const tr = node('tr'), th = node('th'), td = node('td'); th.scope = 'row'; th.setAttribute('aria-label', value.name); th.title = value.name;
        const name = value.path ? link(value.path, value.name, path) : node('span', '', value.name);
        const caption = node('small', 'usd-property-caption');
        const connections = node('div', 'usd-property-connections');
        th.append(name, caption, connections); tr.append(th, td); table.append(tr);
        tr.dataset.propertyKey = key; tr.dataset.propertyKind = value.kind;
        row = { tr, th, td, caption, connections }; rows.set(key, row);
      }
      Object.assign(row, { name: value.name, kind: value.kind, path: value.path, type: value.type });
      row.caption.textContent = [value.type || (value.kind === 'relationship' ? 'Relationship' : ''), value.resolveInfo?.source === 'None' ? '' : value.resolveInfo?.source].filter(Boolean).join(' · ');
      row.tr.dataset.active = String(value.path === current); row.tr.tabIndex = value.path === current ? 0 : -1;
      if (value.path) row.tr.dataset.propertyPath = value.path;
      const connectionKey = JSON.stringify(value.connections || []);
      if (row.connectionKey !== connectionKey) {
        row.connectionKey = connectionKey; row.connections.replaceChildren();
        for (const target of value.connections || []) row.connections.append(link(target, target, path));
      }
      const text = rawText(value.value), targetsKey = JSON.stringify(value.targets || []);
      if (row.text === text && row.targetsKey === targetsKey) continue;
      row.text = text; row.targetsKey = targetsKey;
      const { td } = row;
      const draw = () => {
        if (value.kind === 'relationship' && value.targets?.length) {
          td.replaceChildren(); value.targets.forEach((target, index) => { if (index) td.append(document.createTextNode(', ')); td.append(link(target, target, path)); });
        } else td.textContent = td.classList.contains('expanded') || text.length <= 200 ? text : text.slice(0, 200) + '…';
      };
      draw(); td.title = text.length > 500 ? text.slice(0, 500) + '…' : text;
      if (value.kind !== 'relationship' && (text.length > 80 || td.classList.contains('expanded'))) {
        td.tabIndex = 0; td.title = 'Double-click or press Enter to expand';
        const expand = () => { td.classList.toggle('expanded'); draw(); };
        td.ondblclick = expand; td.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); expand(); } };
      } else { td.removeAttribute('tabindex'); td.ondblclick = td.onkeydown = null; }
    }
    applyFilter();
    if (samePrim) scroller.scrollTop = scrollTop;
    else scroller.scrollTop = 0;
  }
  function show(target, options = {}) {
    if (!alive()) return false;
    const resolved = absolutePath(target, primPath || '/');
    if (resolved === null || !valid(resolved)) { message(`Unavailable target: ${target}`); return false; }
    const nextContext = options.instance ? { instance: plain(options.instance) } : {};
    const changed = current !== resolved || JSON.stringify(context) !== JSON.stringify(nextContext);
    current = resolved; context = nextContext; message();
    if (changed) snapshot = null;
    if (options.recordHistory !== false && (changed || historyIndex < 0)) {
      history = history.slice(0, historyIndex + 1); history.push({ target: current, context }); historyIndex = history.length - 1;
    } else if (options.recordHistory === false) {
      const index = pendingHistory !== null && history[pendingHistory]?.target === current ? pendingHistory : history.findIndex(entry => entry.target === current && JSON.stringify(entry.context) === JSON.stringify(context));
      if (index >= 0) historyIndex = index;
    }
    pendingHistory = null;
    buttons(); void refresh({ revealTarget: true });
    return true;
  }
  async function refresh({ revealTarget = false } = {}) {
    if (!alive()) return;
    const request = ++revision, target = current, time = handle.getTime?.() || 0;
    const isLatest = () => alive() && revision === request;
    try {
      const result = await handle.readStage(async () => {
        if (!isLatest()) return null;
        const data = await inspect(parts(target).prim, time);
        return data ? { data, provenance: await readDetails(data, target, time) } : null;
      });
      if (!isLatest()) return;
      if (!result) { message(`Unavailable target: ${target}`); return; }
      snapshot = result.data; render(result.data, parts(target).prim); details(result.provenance); buttons();
      const active = selectedRow();
      if (parts(target).property && !active) message(`Unavailable target: ${target}`);
      if (revealTarget) {
        if (active?.tr.hidden) { filter.value = ''; applyFilter(); }
        if (parts(target).property) reveal(active);
      }
    } catch (error) { if (isLatest()) message(`Could not refresh properties: ${error.message}`); }
  }
  filter.oninput = applyFilter;
  buttons(); show('', { recordHistory: false });
  return { show, refresh, get target() { return current; }, dispose() { disposed = true; revision++; rows.clear(); history = []; snapshot = null; root.remove(); } };
}
