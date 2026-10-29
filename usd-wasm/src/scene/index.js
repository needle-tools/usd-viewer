/** Convert embind vectors without retaining native wrappers. */
function readVector(vector, read = identity) {
  if (!vector) return [];
  try {
    const result = [];
    for (let i = 0; i < vector.size(); i++) {
      const value = vector.get(i);
      try { result.push(read(value)); } finally { if (read !== identity) value?.delete?.(); }
    }
    return result;
  } finally { vector.delete?.(); }
}
const identity = value => value;
const strings = vector => readVector(vector, identity);

/** Plain snapshots of the composed stage. No embind objects escape this API. */
export function inspectStage(stage) {
  const prims = readVector(stage.TraverseAll(), prim => {
    const path = prim.GetPath();
    const variants = strings(prim.GetVariantSetNames()).map(setName => ({
      path, setName, choices: strings(prim.GetVariantNames(setName)), selection: prim.GetVariantSelection(setName),
    }));
    return { path, name: prim.GetName(), type: prim.GetTypeName(), active: prim.IsActive(), loaded: prim.IsLoaded(),
      payload: prim.HasAuthoredPayloads(), reference: prim.HasAuthoredReferences(), instance: prim.IsInstance(), variants };
  });
  return { prims, variants: prims.flatMap(prim => prim.variants), payloads: prims.filter(prim => prim.payload),
    layers: stage.GetLayerStack?.(true) || [], errors: stage.GetCompositionErrors?.() || [] };
}

export function inspectPrim(stage, path, time = 0) {
  const prim = stage.GetPrimAtPath(path);
  try {
    if (!prim?.IsValid()) return null;
    return { path, type: prim.GetTypeName(), metadata: prim.GetAllMetadata(),
      attributes: readVector(prim.GetAttributes(), attribute => ({ name: attribute.GetName(), type: attribute.GetTypeName(), value: attribute.GetValueStringAtTime(time) })),
      relationships: readVector(prim.GetRelationships(), relation => ({ name: relation.GetName(), targets: strings(relation.GetTargets()) })) };
  } finally { prim?.delete?.(); }
}

/** Stage edits use the Hydra handle's synchronization and asynchronous asset resolver. */
export async function setVariant(handle, path, setName, value) {
  return handle.editStage(async stage => {
    const prim = stage.GetPrimAtPath(path);
    try {
      if (!prim?.IsValid()) throw new Error(`No USD prim at ${path}`);
      if (!strings(prim.GetVariantNames(setName)).includes(value)) throw new Error(`Unknown variant ${setName}: ${value}`);
      return await prim.SetVariantSelection(setName, value);
    } finally { prim?.delete?.(); }
  });
}
export async function setPayloadLoaded(handle, path, loaded) {
  return handle.editStage(async stage => {
    const prim = stage.GetPrimAtPath(path);
    try {
      if (!prim?.IsValid() || !prim.HasAuthoredPayloads()) throw new Error(`No USD payload at ${path}`);
      if (loaded) await prim.Load(); else await prim.Unload();
    } finally { prim?.delete?.(); }
  });
}

/** Hydra supplies fully composed and animated cameras, including arbitrary xform stacks. */
export function stageCameras(scene) {
  const cameras = [];
  scene.traverse(object => { if (object.isCamera && object.userData?.usdTypeName === 'Camera') cameras.push(object); });
  return cameras.sort((a, b) => a.userData.usdPath.localeCompare(b.userData.usdPath));
}
