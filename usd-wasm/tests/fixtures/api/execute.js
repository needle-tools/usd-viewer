import { createPxrFacade } from './pxr.js';
import { createApiStage } from './create-api-stage.js';
import { createSceneKit } from './scene-kit.js';

// Runs only the bundled examples. The browser host owns an isolated worker for
// each execution so prototype adapters, authored layers and native handles never
// escape into the viewer's USD runtime, or survive an example replacement.
export async function executeExample(USD, example, { fixtureCatalog, readFixture, onExecute = () => {} }) {
  const pxr = createPxrFacade(USD), output = [], mounted = new Map();
  const encoder = new TextEncoder();
  function print(value) {
    output.push(typeof value === 'string' ? value : JSON.stringify(value, (_key, item) =>
      typeof item === 'bigint' ? String(item) : item, 2) ?? String(value));
  }
  function mountBytes(path, bytes) {
    const parts = path.split('/').filter(Boolean), file = parts.pop();
    let parent = '/';
    for (const part of parts) {
      if (!USD.FS_analyzePath(`${parent}${part}`).exists) USD.FS_createPath(parent, part, true, true);
      parent += `${part}/`;
    }
    if (USD.FS_analyzePath(path).exists) USD.FS_unlink(path);
    USD.FS_createDataFile(parent, file, bytes, true, true, true);
    mounted.set(path, new Uint8Array(bytes));
    return path;
  }
  const findFixture = query => fixtureCatalog.find(asset => !asset.executable &&
    [asset.label, asset.root].some(value => value.toLowerCase() === String(query).toLowerCase()));
  const context = {
    USD, ...pxr, stage: null, print, createApiStage, sceneKit: createSceneKit(USD), vectorToArray: pxr.vectorToArray,
    listPrims: (stage = context.stage) => stage ? pxr.vectorToArray(stage.TraverseAll()).map(prim => prim.GetPath()) : [],
    inspectPrim: prim => !prim?.IsValid?.() ? null : ({
      path: prim.GetPath(), typeName: prim.GetTypeName(),
      attributes: pxr.vectorToArray(prim.GetAttributes()).map(attr => ({ name: attr.GetName(), typeName: attr.GetTypeName(), value: attr.GetValueString() })),
      relationships: pxr.vectorToArray(prim.GetRelationships()).map(rel => ({ name: rel.GetName(), targets: pxr.vectorToArray(rel.GetTargets()) })),
    }),
    mountBytes, mountText: (path, text) => mountBytes(path, encoder.encode(text)),
    fixtureCatalog, findFixture,
    async openFixture(query, files) {
      const asset = findFixture(query), root = asset?.root ?? query;
      for (const path of new Set([root, ...(files ?? asset?.files ?? [])])) {
        mountBytes(`/tmp/repl-fixtures/${path}`, await readFixture(path));
      }
      return context.stage = await pxr.Usd.Stage.Open(`/tmp/repl-fixtures/${root}`);
    },
  };
  const run = new Function('context', 'code', `
    return (async () => { with (context) {
      return await eval('(async () => {\\n' + code + '\\n})()');
    } })();
  `);
  onExecute(true);
  try { await run(context, example.code); }
  finally { onExecute(false); }
  if (!context.stage) return { output, files: [], hasGeometry: false };
  const geometryTypes = new Set(['Mesh', 'Sphere', 'Cube', 'Cone', 'Cylinder', 'Capsule', 'Points', 'BasisCurves', 'NurbsCurves', 'NurbsPatch', 'PointInstancer', 'Volume', 'ParticleField3DGaussianSplat']);
  const hasGeometry = pxr.vectorToArray(context.stage.TraverseAll()).some(prim => geometryTypes.has(prim.GetTypeName()) && prim.IsActive());
  // Preserve authored composition/variants, not just the flattened appearance.
  // Collect script-created payload/reference layers as well as fetched assets.
  function collect(directory) {
    for (const name of USD.FS_readdir(directory).filter(name => name !== '.' && name !== '..')) {
      const path = `${directory}/${name}`;
      if (USD.FS_analyzePath(path).object.isFolder) collect(path);
      else mounted.set(path, new Uint8Array(USD.FS_readFile(path)));
    }
  }
  collect('/tmp');
  const layer = context.stage.GetRootLayer(), root = layer.GetIdentifier();
  if (!root.startsWith('/tmp/')) throw new Error(`Unexpected example layer: ${root}`);
  mounted.set(root, encoder.encode(layer.ExportToString()));
  function relativeAsset(from, to) {
    const directory = from.split('/').slice(0, -1), target = to.split('/');
    while (directory.length && target.length && directory[0] === target[0]) { directory.shift(); target.shift(); }
    return [...directory.map(() => '..'), ...target].join('/');
  }
  const files = [root, ...mounted.keys()].filter((path, index, paths) => paths.indexOf(path) === index).map(path => {
    let bytes = mounted.get(path);
    if (/\.(?:usda|mtlx)$/.test(path)) {
      const text = new TextDecoder().decode(bytes).replace(/@(\/tmp\/[^@\n]+)@/g, (_match, target) => `@${relativeAsset(path, target)}@`);
      bytes = encoder.encode(text);
    }
    return { path: `api-runtime${path}`, bytes };
  });
  return { output, files, hasGeometry };
}
