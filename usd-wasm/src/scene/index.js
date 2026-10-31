export { hasAuthoredUsdLights, stageLayers, stageVariants } from './inspection.js';
export { readStageAsset, readStageLayer, stageResources } from './sources.js';

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
export function inspectStage(stage, time = 0) {
  let firstSample = Infinity, lastSample = -Infinity, timeVarying = false;
  const prims = readVector(stage.TraverseAll(), prim => {
    const path = prim.GetPath();
    const variants = strings(prim.GetVariantSetNames()).map(setName => ({
      path, setName, choices: strings(prim.GetVariantNames(setName)), selection: prim.GetVariantSelection(setName),
    }));
    if (prim.IsActive() && prim.IsLoaded()) readVector(prim.GetAttributes?.(), attribute => {
      const count = attribute.GetNumTimeSamples();
      if (count > 1) {
        timeVarying = true;
        const samples = attribute.GetTimeSamples();
        try { if (samples.size()) { firstSample = Math.min(firstSample, samples.get(0)); lastSample = Math.max(lastSample, samples.get(samples.size() - 1)); } }
        finally { samples.delete?.(); }
      } else {
        const resolve = attribute.GetResolveInfo?.(0);
        if (resolve?.valueSourceMightBeTimeVarying && ['ValueClips', 'Spline'].includes(resolve.source)) timeVarying = true;
      }
    });
    const visibility = prim.GetAttribute('visibility');
    let visible = true, imageable = false;
    try { imageable = visibility.IsValid(); if (imageable) visible = visibility.GetValueStringAtTime(time) !== 'invisible'; }
    finally { visibility.delete?.(); }
    return { path, name: prim.GetName(), type: prim.GetTypeName(), specifier: (prim.GetSpecifier?.() || '').replace(/^SdfSpecifier/, '').toLowerCase(), active: prim.IsActive(), visible, imageable, loaded: prim.IsLoaded(),
      payload: prim.HasAuthoredPayloads(), reference: prim.HasAuthoredReferences(), instance: prim.IsInstance(), variants };
  });
  const start = stage.GetStartTimeCode?.(), end = stage.GetEndTimeCode?.();
  const timeRange = timeVarying ? (end > start ? { start, end } : Number.isFinite(firstSample) ? { start: firstSample, end: lastSample } : null) : null;
  return { prims, time: timeRange, variants: prims.flatMap(prim => prim.variants), payloads: prims.filter(prim => prim.payload),
    layers: stage.GetLayerStack?.(true) || [], errors: stage.GetCompositionErrors?.() || [] };
}

export function inspectPrim(stage, path, time = 0) {
  const prim = stage.GetPrimAtPath(path);
  try {
    if (!prim?.IsValid()) return null;
    return { path, type: prim.GetTypeName(), metadata: prim.GetAllMetadata(),
      attributes: readVector(prim.GetAttributes(), attribute => ({ name: attribute.GetName(), path: attribute.GetPath(), type: attribute.GetTypeName(), value: attribute.GetValueStringAtTime(time),
        connections: strings(attribute.GetConnections?.()), resolveInfo: attribute.GetResolveInfo?.(time), authored: attribute.HasAuthoredValueOpinion?.() || false })),
      relationships: readVector(prim.GetRelationships(), relation => ({ name: relation.GetName(), path: relation.GetPath(), targets: strings(relation.GetTargets()) })) };
  } finally { prim?.delete?.(); }
}

async function readVectorAsync(vector, read) {
  if (!vector) return [];
  try {
    const result = [];
    for (let i = 0; i < vector.size(); i++) {
      const value = vector.get(i);
      try { result.push(await read(value)); } finally { value?.delete?.(); }
    }
    return result;
  } finally { vector.delete?.(); }
}

/** Inspection that also supports asynchronously resolved value clips and JSPI.
 * Call inside handle.readStage() to keep the stage alive throughout the reads. */
export async function inspectStageAsync(stage, time = 0) {
  let firstSample = Infinity, lastSample = -Infinity, timeVarying = false;
  const prims = await readVectorAsync(stage.TraverseAll(), async prim => {
    const path = prim.GetPath();
    const variants = strings(prim.GetVariantSetNames()).map(setName => ({
      path, setName, choices: strings(prim.GetVariantNames(setName)), selection: prim.GetVariantSelection(setName),
    }));
    if (prim.IsActive() && prim.IsLoaded()) await readVectorAsync(prim.GetAttributes?.(), async attribute => {
      const count = await attribute.GetNumTimeSamples();
      if (count > 1) {
        timeVarying = true;
        const samples = await attribute.GetTimeSamples();
        try { if (samples.size()) { firstSample = Math.min(firstSample, samples.get(0)); lastSample = Math.max(lastSample, samples.get(samples.size() - 1)); } }
        finally { samples.delete?.(); }
      } else {
        const resolve = await attribute.GetResolveInfo?.(0);
        if (resolve?.valueSourceMightBeTimeVarying && ['ValueClips', 'Spline'].includes(resolve.source)) timeVarying = true;
      }
    });
    const visibility = prim.GetAttribute('visibility');
    let visible = true, imageable = false;
    try { imageable = visibility.IsValid(); if (imageable) visible = await visibility.GetValueStringAtTime(time) !== 'invisible'; }
    finally { visibility.delete?.(); }
    return { path, name: prim.GetName(), type: prim.GetTypeName(), specifier: (prim.GetSpecifier?.() || '').replace(/^SdfSpecifier/, '').toLowerCase(), active: prim.IsActive(), visible, imageable, loaded: prim.IsLoaded(),
      payload: prim.HasAuthoredPayloads(), reference: prim.HasAuthoredReferences(), instance: prim.IsInstance(), variants };
  });
  const start = stage.GetStartTimeCode?.(), end = stage.GetEndTimeCode?.();
  const timeRange = timeVarying ? (end > start ? { start, end } : Number.isFinite(firstSample) ? { start: firstSample, end: lastSample } : null) : null;
  return { prims, time: timeRange, variants: prims.flatMap(prim => prim.variants), payloads: prims.filter(prim => prim.payload),
    layers: stage.GetLayerStack?.(true) || [], errors: stage.GetCompositionErrors?.() || [] };
}

/** Asynchronous counterpart of inspectPrim; preserves wrapper ownership until each read completes. */
export async function inspectPrimAsync(stage, path, time = 0) {
  const prim = stage.GetPrimAtPath(path);
  try {
    if (!prim?.IsValid()) return null;
    return { path, type: prim.GetTypeName(), metadata: prim.GetAllMetadata(),
      attributes: await readVectorAsync(prim.GetAttributes(), async attribute => ({ name: attribute.GetName(), path: attribute.GetPath(), type: attribute.GetTypeName(), value: await attribute.GetValueStringAtTime(time),
        connections: strings(attribute.GetConnections?.()), resolveInfo: await attribute.GetResolveInfo?.(time), authored: attribute.HasAuthoredValueOpinion?.() || false })),
      relationships: readVector(prim.GetRelationships(), relation => ({ name: relation.GetName(), path: relation.GetPath(), targets: strings(relation.GetTargets()) })) };
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

export async function setPrimActive(handle, path, active) {
  return handle.editStage(async stage => {
    const prim = stage.GetPrimAtPath(path);
    try {
      if (!prim?.IsValid()) throw new Error(`No USD prim at ${path}`);
      if (!await prim.SetActive(active)) throw new Error(`Could not change activation of ${path}`);
    } finally { prim?.delete?.(); }
  });
}

export async function setPrimVisible(handle, path, visible) {
  return handle.editStage(async stage => {
    const prim = stage.GetPrimAtPath(path);
    let attribute;
    try {
      if (!prim?.IsValid()) throw new Error(`No USD prim at ${path}`);
      attribute = prim.GetAttribute('visibility');
      if (!attribute.IsValid()) throw new Error(`Prim is not imageable: ${path}`);
      const time = await attribute.GetNumTimeSamples() ? handle.getTime?.() || 0 : Number.NaN;
      if (!attribute.SetToken(visible ? 'inherited' : 'invisible', time)) throw new Error(`Could not change visibility of ${path}`);
    } finally { attribute?.delete?.(); prim?.delete?.(); }
  });
}

/** Hydra supplies fully composed and animated cameras, including arbitrary xform stacks. */
export function stageCameras(scene) {
  const cameras = [];
  scene.traverse(object => { if (object.isCamera && object.userData?.usdTypeName === 'Camera') cameras.push(object); });
  return cameras.sort((a, b) => a.userData.usdPath.localeCompare(b.userData.usdPath));
}
