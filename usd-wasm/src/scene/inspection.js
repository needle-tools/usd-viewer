const lightTypes = new Set(['DistantLight', 'SphereLight', 'RectLight', 'DiskLight', 'CylinderLight', 'DomeLight', 'PortalLight', 'GeometryLight']);

/** Find authored emitters, including light APIs on meshes and volumes. */
export function hasAuthoredUsdLights(root, stage) {
  let found = false;
  root?.traverse(object => { if (lightTypes.has(object.userData?.usdTypeName)) found = true; });
  if (found || !stage?.Traverse) return found;
  const prims = stage.Traverse();
  try {
    for (let i = 0; i < prims.size(); i++) {
      const prim = prims.get(i);
      try {
        if (lightTypes.has(prim.GetTypeName())) return true;
        const schemas = prim.GetAppliedSchemas?.();
        if (schemas) {
          try { for (let j = 0; j < schemas.size(); j++) if (['LightAPI', 'MeshLightAPI', 'VolumeLightAPI'].includes(schemas.get(j))) return true; }
          finally { schemas.delete?.(); }
        }
      } finally { prim.delete?.(); }
    }
  } finally { prims.delete?.(); }
  return false;
}

/** Layer identities and composition roles, without retaining native wrappers. */
export function stageLayers(stage) {
  const root = stage.GetLayerStack(false) || [], stack = stage.GetLayerStack(true) || [], used = stage.GetUsedLayers(false) || [];
  const local = new Set(root.map(layer => layer.identifier)), seen = new Set(), layers = [];
  const add = (layer, role) => { if (!layer?.identifier || seen.has(layer.identifier)) return; seen.add(layer.identifier); layers.push({...layer, role}); };
  root.forEach((layer, index) => add(layer, index ? 'sublayer' : 'root'));
  stack.forEach(layer => { if (!local.has(layer.identifier)) add(layer, 'session'); });
  used.forEach(layer => add(layer, 'layer'));
  return layers;
}

/** Inspect variant choices without scanning geometry or time samples. */
export function stageVariants(stage) {
  const prims = stage.Traverse(), variants = [];
  try {
    for (let i = 0; i < prims.size(); i++) {
      const prim = prims.get(i);
      try {
        const sets = prim.GetVariantSetNames();
        try {
          for (let j = 0; j < sets.size(); j++) {
            const setName = sets.get(j), names = prim.GetVariantNames(setName), choices = [];
            try { for (let k = 0; k < names.size(); k++) choices.push(names.get(k)); }
            finally { names.delete?.(); }
            if (choices.length) variants.push({path:prim.GetPath(), setName, choices, selection:prim.GetVariantSelection(setName)});
          }
        } finally { sets.delete?.(); }
      } finally { prim.delete?.(); }
    }
  } finally { prims.delete?.(); }
  return variants;
}
