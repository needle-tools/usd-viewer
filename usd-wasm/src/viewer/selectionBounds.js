import {Box3, Matrix4, Vector3} from 'three';
import {pathContains} from './selection.js';

async function subsetBounds(handle, items) {
  const result = new Map();
  if (!items.length || !handle.readStage) return result;
  await handle.readStage(async stage => {
    const time = handle.renderedTime ?? handle.getTime();
    const read = async (prim, name) => {
      const attr = prim.GetAttribute(name);
      try { return attr.IsValid() ? await attr.Get(time) : undefined; }
      finally { attr.delete?.(); }
    };
    for (const item of items) {
      const prim = stage.GetPrimAtPath(item.path);
      let mesh;
      try {
        if (!prim.IsValid() || prim.GetTypeName() !== 'GeomSubset') continue;
        const path = item.path.slice(0, item.path.lastIndexOf('/'));
        mesh = stage.GetPrimAtPath(path);
        if (!mesh.IsValid() || mesh.GetTypeName() !== 'Mesh') continue;
        const indices = await read(prim, 'indices') || [], type = await read(prim, 'elementType');
        const points = await read(mesh, 'points') || [], vertices = new Set();
        if (type === 'point' || type === 'edge') for (const index of indices) vertices.add(index);
        else if (type === 'face') {
          const counts = await read(mesh, 'faceVertexCounts') || [], faces = await read(mesh, 'faceVertexIndices') || [];
          const selected = new Set(indices);
          for (let face = 0, offset = 0; face < counts.length; offset += counts[face++]) {
            if (selected.has(face)) for (let i = 0; i < counts[face]; i++) vertices.add(faces[offset + i]);
          }
        }
        const box = new Box3(), vector = new Vector3();
        // Use the authored cage for subdivided surfaces, so this also works
        // without material bindings and without relying on draw-group order.
        for (const index of vertices) {
          const point = points[index];
          if (point?.length === 3 && point.every(Number.isFinite)) box.expandByPoint(vector.fromArray(point));
        }
        result.set(item, {path, box});
      } finally { mesh?.delete?.(); prim.delete?.(); }
    }
  });
  return result;
}

/** World bounds for whole prims, composed instances and authored mesh subsets.
 * Subdivision subsets use their control-cage extent; transforms come from the
 * current render objects, including interaction poses rather than rest poses.
 */
export async function getSelectionBounds(handle, items = [], root = handle.scene) {
  const box = new Box3(), subsets = await subsetBounds(handle, items), objects = [];
  root.updateWorldMatrix(true, true);
  root.traverseVisible(object => {
    if ((object.geometry || typeof object.getBoundingBox === 'function') && !object.userData.usdHelperFor && !object.userData.usdExcludeFromBounds) objects.push(object);
  });
  for (const object of objects) {
    let prim = object; while (prim && !prim.userData.usdPath) prim = prim.parent;
    const path = prim?.userData.usdPath; if (!path) continue;
    if (!items.length) {
      const custom = object.getBoundingBox?.();
      if (custom && !custom.isEmpty()) box.union(custom.clone().applyMatrix4(object.matrixWorld));
      else box.expandByObject(object);
      continue;
    }
    for (const item of items) {
      const subset = subsets.get(item), target = subset ? {...item, path: subset.path} : item;
      let indices;
      if (object.isInstancedMesh) indices = await handle.resolveSelection?.(path, object.count, [target]);
      else if (!target.instances?.length && pathContains(target.path, path)) indices = [null];
      if (!indices?.length) continue;
      if (!subset && !object.isInstancedMesh) { box.expandByObject(object); continue; }
      let local = subset?.box;
      if (!local) {
        const custom = object.getBoundingBox?.();
        if (custom) local = custom;
        else { object.geometry?.computeBoundingBox(); local = object.geometry?.boundingBox; }
      }
      if (!local || local.isEmpty()) continue;
      for (const index of indices) {
        const matrix = new Matrix4();
        if (index !== null) object.getMatrixAt(index, matrix);
        matrix.premultiply(object.matrixWorld);
        box.union(local.clone().applyMatrix4(matrix));
      }
    }
  }
  return box;
}
