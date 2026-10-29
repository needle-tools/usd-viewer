/** Selection is view context, not authored USD data or document undo history. */
export function selectionItem(value) {
  if (typeof value === 'string') value = {path: value};
  if (!value || typeof value.path !== 'string' || !value.path.startsWith('/')) return null;
  const result = {path: value.path};
  for (const key of ['renderPath', 'prototypePath', 'instancerPath']) if (typeof value[key] === 'string') result[key] = value[key];
  for (const key of ['instanceIndex', 'renderInstanceIndex']) if (Number.isSafeInteger(value[key]) && value[key] >= 0) result[key] = value[key];
  if (typeof value.instanceId === 'string' || Number.isSafeInteger(value.instanceId)) result.instanceId = value.instanceId;
  if (Array.isArray(value.instances)) result.instances = Object.freeze(value.instances.filter(entry => typeof entry?.path === 'string' && Number.isSafeInteger(entry.index) && entry.index >= 0).map(entry => Object.freeze({path: entry.path, index: entry.index, ...(typeof entry.id === 'string' ? {id: entry.id} : {})})));
  return Object.freeze(result);
}
export const selectionKey = item => JSON.stringify([item.path, item.instancerPath, item.instanceId ?? item.instanceIndex, item.instances?.length ? item.instances.map(entry => [entry.path, entry.id ?? entry.index]) : undefined]);
export const pathContains = (parent, path) => !!parent && (parent === path || path?.startsWith(parent + '/'));

/** One selection owner shared by the hierarchy, picking, inspector and scripting. */
export function createSelection({items = [], onChange = () => {}} = {}) {
  let current = [], anchor = '';
  function replace(values, {notify = true, preserveAnchor = false} = {}) {
    const next = new Map();
    for (const value of values) {const item = selectionItem(value); if (item) next.set(selectionKey(item), item);}
    const result = [...next.values()];
    if (!preserveAnchor) anchor = result.at(-1)?.path || '';
    if (JSON.stringify(result) === JSON.stringify(current)) return false;
    current = Object.freeze(result); if (notify) onChange(current); return true;
  }
  replace(items, {notify: false});
  return {
    get items() {return current;}, get primary() {return current.at(-1) || null;}, get anchor() {return anchor;},
    replace,
    choose(value, {toggle = false, range = false, order = []} = {}) {
      const item = selectionItem(value);
      if (!item) return toggle || range ? false : replace([]);
      if (range && anchor && order.includes(anchor) && order.includes(item.path)) {
        const a = order.indexOf(anchor), b = order.indexOf(item.path);
        const slice = order.slice(Math.min(a, b), Math.max(a, b) + 1).filter(path => path !== item.path).map(path => ({path}));
        return replace([...(toggle ? current : []), ...slice, item], {preserveAnchor: true});
      }
      if (toggle) {
        const key = selectionKey(item), found = current.some(entry => selectionKey(entry) === key);
        return replace(found ? current.filter(entry => selectionKey(entry) !== key) : [...current, item]);
      }
      return replace([item]);
    },
    prune(predicate) {return replace(current.filter(predicate), {preserveAnchor: true});},
    clear() {return replace([]);},
  };
}

/** Match an entire prim subtree or just one rendered instance, without modifying source meshes. */
export function selectedInstanceIndices(items, object) {
  const path = object.userData.usdPath;
  const indices = new Set();
  for (const item of items) {
    if (item.renderInstanceIndex !== undefined) {
      const root = item.prototypePath || item.renderPath;
      if (pathContains(root, path)) indices.add(item.renderInstanceIndex);
    } else if (pathContains(item.path, path)) return null; // all instances/whole mesh
  }
  return indices;
}
