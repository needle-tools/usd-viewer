/** Resolve local visibility in traversal order, including non-imageable ancestors. */
export function resolveHierarchyVisibility(prims) {
  const byPath = new Map();
  for (const prim of prims) {
    const parent = byPath.get(prim.path.slice(0, prim.path.lastIndexOf('/')));
    prim.localVisible ??= prim.visible;
    prim.hiddenBy = !prim.localVisible ? prim.path : parent?.hiddenBy || '';
    prim.visible = !prim.hiddenBy;
    byPath.set(prim.path, prim);
  }
  return prims;
}

function pathOf(read) {
  const prim = read?.();
  try { return prim?.IsValid() ? prim.GetPath() : ''; }
  finally { prim?.delete?.(); }
}

export function primCompositionFlags(prim) {
  const instance = prim.IsInstance(), instanceProxy = prim.IsInstanceProxy?.() || false;
  return {
    instance, instanceProxy,
    instanceable: prim.IsInstanceable?.() ?? prim.GetMetadata?.('instanceable') === true,
    prototype: prim.IsPrototype?.() || false, inPrototype: prim.IsInPrototype?.() || false,
    defined: prim.IsDefined?.() ?? true, abstract: prim.IsAbstract?.() || false,
    prototypePath: instance ? pathOf(() => prim.GetPrototype?.()) : '',
    prototypePrimPath: instanceProxy ? pathOf(() => prim.GetPrimInPrototype?.()) : '',
  };
}

/** Counts do not expand proxy subtrees or copy every shared instance into JS. */
export function stagePrototypes(stage) {
  const prototypes = stage.GetPrototypes?.();
  if (!prototypes) return [];
  const result = [];
  try {
    for (let i=0;i<prototypes.size();i++) {
      const prototype=prototypes.get(i);let instances;
      try {instances=prototype.GetInstances();result.push({path:prototype.GetPath(),instanceCount:instances.size()});}
      finally {instances?.delete?.();prototype.delete?.();}
    }
  } finally {prototypes.delete?.();}
  return result;
}

/** Extra inspection data for the selected prim, not a scene-wide instance scan. */
export function primInstancing(prim, attributes, relationships) {
  const flags=primCompositionFlags(prim);
  if (prim.GetTypeName()==='PointInstancer') {
    const indicesAttribute=attributes.find(attr=>attr.name==='protoIndices'),indices=indicesAttribute?.value;
    return {kind:'point-instancer',instanceCount:indicesAttribute?.arraySize ?? (Array.isArray(indices)?indices.length:0),
      prototypes:relationships.find(rel=>rel.name==='prototypes')?.targets || []};
  }
  let prototype,instances;
  try {
    if(flags.prototype) {
      instances=prim.GetInstances?.();const paths=[];
      if(instances)for(let i=0;i<instances.size();i++){const item=instances.get(i);try{paths.push(item.GetPath());}finally{item.delete?.();}}
      return {kind:'prototype',instances:paths,instanceCount:paths.length};
    }
    if(flags.instance) {
      prototype=prim.GetPrototype?.();instances=prototype?.IsValid()?prototype.GetInstances():null;
      return {kind:'instance',prototypePath:flags.prototypePath,instanceCount:instances?.size() || 0};
    }
    if(flags.instanceProxy)return {kind:'proxy',prototypePrimPath:flags.prototypePrimPath};
    if(flags.inPrototype)return {kind:'prototype-child'};
    if(flags.instanceable)return {kind:'instanceable'};
    return null;
  }finally{instances?.delete?.();prototype?.delete?.();}
}
