import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Group, Mesh, MeshBasicMaterial, Texture } from 'three';
import { unzipSync } from 'three/addons/libs/fflate.module.js';
import { getUsdModule } from '../runtime.mjs';
import { createThreeHydra } from '../../src/create.three.js';
import { readStageAsset, readStageLayer, readStageLayerBytes, stageResources } from '../../src/scene/sources.js';
import { inspectUsdPhysics, readUsdPhysics } from '../../src/physics/createPhysics.js';
import { inspectStage, inspectStageAsync, inspectPrim, inspectPrimAsync } from '../../src/scene/index.js';

const encode = text => new TextEncoder().encode(text);
const files = [
  ['scene.usda', '#usda 1.0\n(startTimeCode=0\nendTimeCode=10\ntimeCodesPerSecond=1\nsubLayers=[@layers/shape.usda@])\ndef Xform "World" {\n custom asset palette=@textures/palette.bin@\n}\n'],
  ['layers/shape.usda', '#usda 1.0\ndef Xform "World" {\n def Sphere "Ball" {}\n}\n'],
  ['unused.usda', '#usda 1.0\ndef Xform "Unused" {}\n'],
  ['textures/palette.bin', new Uint8Array([17, 33, 66, 99])],
].map(([path, value]) => Object.assign(new File([typeof value === 'string' ? encode(value) : value], path.split('/').pop()), { path }));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test('async inspection preserves composed values, timeline and synchronous-runtime snapshots', async () => {
  const USD = await getUsdModule({ print() {}, printErr() {} });
  const handle = await createThreeHydra({ USD, scene: new Group(), files });
  try {
    await handle.ready();
    await handle.editStage(stage => {
      const prim = stage.GetPrimAtPath('/World/Ball');
      const radius = prim.GetAttribute('radius');
      try { radius.Set(1, 0); radius.Set(3, 10); }
      finally { radius.delete(); prim.delete(); }
    });
    await handle.readStage(async stage => {
      const overview = await inspectStageAsync(stage, 5);
      const ball = await inspectPrimAsync(stage, '/World/Ball', 5);
      assert.deepEqual(overview.time, { start: 0, end: 10 });
      assert.ok(overview.prims.some(prim => prim.path === '/World/Ball' && prim.visible));
      assert.equal(ball.attributes.find(attribute => attribute.name === 'radius').value, 2);
      assert.equal(await inspectPrimAsync(stage, '/Missing'), null);
      if (!USD.CreateHdWebSyncDriver) {
        assert.deepEqual(overview, inspectStage(stage, 5));
        assert.deepEqual(ball, inspectPrim(stage, '/World/Ball', 5));
      }
    });
  } finally { await handle.dispose(); }
});

test('source reads propagate asynchronous native failures', async () => {
  const driver = { getFile: async () => { throw new Error('resolver failed'); } };
  const handle = { readStage: async read => read(null, driver) };
  const USD = { FS_analyzePath: () => ({ exists: false }) };
  await assert.rejects(readStageAsset(handle, USD, 'missing.bin'), /resolver failed/);
});

test('presentation update state covers edits through synchronization and clears after failure',async()=>{
  const USD=await getUsdModule({print(){},printErr(){}});
  const handle=await createThreeHydra({USD,scene:new Group(),files});
  try{
    await handle.ready();assert.equal(handle.isUpdating,false);
    const started=deferred(),finish=deferred();
    const edit=handle.editStage(async()=>{assert.equal(handle.isUpdating,true);started.resolve();await finish.promise;throw new Error('edit failed');});
    await started.promise;assert.equal(handle.isUpdating,true);
    const rejected=assert.rejects(edit,/edit failed/);finish.resolve();await rejected;
    assert.equal(handle.isUpdating,false);
    await handle.readStage(()=>assert.equal(handle.isUpdating,false));
    await handle.setIncludedPurposes(['default','render']);assert.equal(handle.isUpdating,false);
  }finally{await handle.dispose();}
});

test('source inspection reads mounted files, authored layers and USDZ members without changing the root', async () => {
  const USD = await getUsdModule({ print() {}, printErr() {} });
  const handle = await createThreeHydra({ USD, scene: new Group(), files });
  let packaged;
  try {
    await handle.ready();
    const root = await handle.readStage(stage => stage.GetRootLayer().GetIdentifier());
    const base = root.slice(0, root.lastIndexOf('/') + 1);
    const bytes = await readStageAsset(handle, USD, base + 'textures/palette.bin');
    assert.deepEqual([...bytes], [17, 33, 66, 99]);
    assert.equal(handle.sourcePaths.path(base + 'textures/palette.bin'), 'textures/palette.bin');
    assert.deepEqual([...await readStageAsset(handle, USD, 'textures/palette.bin')], [17, 33, 66, 99]);
    assert.match(await readStageLayer(handle, USD, 'layers/shape.usda'), /Sphere "Ball"/);
    USD.FS_analyzePath(base + 'textures/palette.bin').object.contents.set([4, 3, 2, 1]);
    assert.deepEqual([...bytes], [17, 33, 66, 99], 'returned bytes do not alias native memory');
    await handle.editStage(stage => stage.DefinePrim('/World/Unsaved', 'Xform').delete());
    const revision = handle.revision;
    assert.match(await readStageLayer(handle, USD, root), /Unsaved/);
    assert.match(await readStageLayer(handle, USD, base + 'layers/shape.usda'), /Sphere "Ball"/);
    await assert.rejects(readStageLayer(handle, USD, base + 'unused.usda'), /not available/);
    assert.match(await readStageLayer(handle, USD, base + 'unused.usda', { allowUncomposed: true }), /Unused/);
    assert.equal(handle.revision, revision, 'inspection does not publish a scene edit');
    assert.equal(await handle.readStage(stage => stage.GetRootLayer().GetIdentifier()), root);
    await assert.rejects(readStageLayer(handle, USD, root, { isCurrent: () => false }), /no longer current/);
    const abort = new AbortController(); abort.abort();
    await assert.rejects(readStageAsset(handle, USD, base + 'textures/palette.bin', { signal: abort.signal }), { name: 'AbortError' });

    const archive = await handle.exportUsdz();
    packaged = await createThreeHydra({ USD, scene: new Group(), buffer: archive.buffer, url: 'sources.usdz' });
    await packaged.ready();
    const packageRoot = await packaged.readStage(stage => stage.GetRootLayer().GetIdentifier());
    const archivePath = packageRoot.split('[')[0];
    const member = Object.keys(unzipSync(archive)).find(path => path.endsWith('palette.bin'));
    assert.ok(member);
    assert.deepEqual([...await readStageAsset(packaged, USD, `${archivePath}[${member}]`)], [4, 3, 2, 1]);
    assert.deepEqual([...await readStageAsset(packaged, USD, packaged.sourcePaths.path(`${archivePath}[${member}]`))], [4, 3, 2, 1]);
    assert.match(await readStageLayer(packaged, USD, packageRoot), /Unsaved/);
  } finally { await packaged?.dispose(); await handle.dispose(); }
  await assert.rejects(readStageAsset(handle, USD, 'anything'), /closed stage/);
});

test('readStage waits native drawing, blocks animation and edits, and retains native lifetime through disposal', async () => {
  const USD = await getUsdModule({ print() {}, printErr() {} });
  const handle = await createThreeHydra({ USD, scene: new Group(), files, autoPlay: true });
  try {
    await handle.ready();
    handle.update(1);
    const started = deferred(), release = deferred(), order = [];
    const read = handle.readStage(async () => {
      assert.equal(handle.driver.IsDrawPending(), false);
      order.push('read'); started.resolve(); await release.promise;
      return 'read result';
    });
    await started.promise;
    const time = handle.getTime(), revision = handle.revision;
    handle.update(1);
    assert.equal(handle.getTime(), time, 'animation cannot tick inside native inspection');
    const edit = handle.editStage(stage => { order.push('edit'); stage.DefinePrim('/World/Queued', 'Xform').delete(); });
    assert.deepEqual(order, ['read']);
    release.resolve();
    assert.equal(await read, 'read result'); await edit;
    assert.deepEqual(order, ['read', 'edit']);
    assert.equal(handle.revision, revision + 1, 'only the edit changes revision');

    const entered = deferred(), finish = deferred();
    const pending = handle.readStage(async stage => {
      entered.resolve(); await finish.promise;
      assert.equal(handle.driver.isDeleted(), false, 'disposal waits active reads');
      return stage.GetRootLayer().ExportToString();
    });
    await entered.promise;
    const rejected = assert.rejects(pending, /closed stage/);
    const disposal = handle.dispose();
    let ran = false;
    const afterClose = assert.rejects(handle.readStage(() => { ran = true; }), /closed stage/);
    finish.resolve(); await rejected; await afterClose; await disposal;
    assert.equal(ran, false);
    assert.equal(handle.driver.isDeleted(), true);
  } finally { await handle.dispose(); }
});

test('HTTP source bytes are fetched without holding animation and rejected after stage disposal', async () => {
  const USD = await getUsdModule({ print() {}, printErr() {} });
  const handle = await createThreeHydra({ USD, scene: new Group(), files, autoPlay: true });
  const requested = deferred(), responseReady = deferred();
  const server = createServer(async (_request, response) => {
    requested.resolve(); await responseReady.promise;
    response.writeHead(200); response.end('downloaded source');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await handle.ready();
    const url = `http://127.0.0.1:${server.address().port}/source.txt`;
    const pending = readStageAsset(handle, USD, url);
    await requested.promise;
    const time = handle.getTime(); handle.update(1);
    assert.notEqual(handle.getTime(), time, 'network fetch leaves native animation available');
    const rejected = assert.rejects(pending, /closed stage/);
    await handle.dispose(); responseReady.resolve(); await rejected;
  } finally {
    responseReady.resolve(); await handle.dispose(); server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

for (const hostname of ['127.0.0.1', '::1']) test(`HTTP source URLs preserve query brackets and IPv6 authority (${hostname})`, async () => {
  const USD = await getUsdModule({ print() {}, printErr() {} });
  const handle = await createThreeHydra({ USD, scene: new Group(), files });
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url); response.writeHead(200); response.end('source contents');
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, hostname, resolve); });
  try {
    await handle.ready();
    const host = hostname.includes(':') ? `[${hostname}]` : hostname;
    const origin = `http://${host}:${server.address().port}`;
    for (const path of ['/source.png?filter[]=x#preview', '/source%5Bcopy%5D.png', '/scene.usdz?filter[member]']) {
      assert.equal(new TextDecoder().decode(await readStageAsset(handle, USD, origin + path)), 'source contents');
    }
    assert.deepEqual(requests, ['/source.png?filter[]=x', '/source%5Bcopy%5D.png', '/scene.usdz?filter[member]']);
  } finally {
    await handle.dispose(); server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('stageResources reports unique loaded texture identities without retaining rendering objects', () => {
  const root = new Group(), map = new Texture(), transient = new Texture();
  map.name = '/textures/source.png'; transient.name = 'blob:generated';
  root.add(new Mesh(undefined, new MeshBasicMaterial({ map, alphaMap: transient })),
    new Mesh(undefined, new MeshBasicMaterial({ map })));
  assert.deepEqual(stageResources(root), ['/textures/source.png']);
});

test('physics overview uses the native read boundary without extracting collider geometry', async () => {
  const USD = await getUsdModule({ print() {}, printErr() {} });
  const buffer = encode('#usda 1.0\ndef PhysicsScene "Physics" {}\ndef Cube "Body" (prepend apiSchemas = ["PhysicsRigidBodyAPI", "PhysicsCollisionAPI"]) {\n bool physics:rigidBodyEnabled = true\n}\ndef PhysicsPrismaticJoint "Joint" {}\n');
  const handle = await createThreeHydra({ USD, scene: new Group(), buffer, url: 'overview.usda' });
  let fullReads = 0;
  const original = handle.driver.GetPhysicsSceneJson;
  handle.driver.GetPhysicsSceneJson = function () { fullReads++; return original.call(this); };
  try {
    assert.deepEqual(await inspectUsdPhysics(handle), { scenes: [{ path: '/Physics' }], dynamic: true, bodies: ['/Body'], joints: ['/Joint'] });
    assert.equal(fullReads, 0);
    const queued = handle.editStage(stage => {
      const prim = stage.GetPrimAtPath('/Body'), attribute = prim.GetAttribute('physics:rigidBodyEnabled');
      try { assert.equal(attribute.SetBool(false, NaN), true); }
      finally { attribute.delete(); prim.delete(); }
    });
    assert.deepEqual(await inspectUsdPhysics(handle), { scenes: [{ path: '/Physics' }], dynamic: false, bodies: [], joints: ['/Joint'] });
    await queued;
    assert.equal(fullReads, 0, 'overview never allocates the full physics snapshot');
    await readUsdPhysics(handle);
    assert.equal(fullReads, 1);
  } finally { await handle.dispose(); }
  await assert.rejects(inspectUsdPhysics(handle), /closed stage/);
  await assert.rejects(readUsdPhysics(handle), /closed stage/);
  assert.equal(fullReads, 1, 'closed handles do not reach native extraction');
});

test('authored layer export yields the event loop and preserves exact unsaved values',async()=>{
 const USD=await getUsdModule({print(){},printErr(){}}),handle=await createThreeHydra({USD,scene:new Group(),files});
 try{
  await handle.ready();let expected,identifier;
  await handle.readStage(async stage=>{
   const prim=stage.DefinePrim('/World/Data','Scope'),attribute=prim.CreateAttribute('values','float[]',true);
   try{attribute.Set(Array.from({length:100000},(_,i)=>i/16),NaN);}finally{attribute.delete();prim.delete();}
   const layer=stage.GetRootLayer();
   try{
    identifier=layer.GetIdentifier();expected=layer.ExportToString();
    assert.equal(typeof layer.ExportToStringAsync,'function');
    let beats=0;const timer=setInterval(()=>beats++,1);
    try{assert.equal(await layer.ExportToStringAsync(),expected);assert.ok(beats>0,'native export yields while its worker owns the layer');}finally{clearInterval(timer);}
   }finally{layer.delete?.();}
  });
  assert.equal(await readStageLayer(handle,USD,identifier),expected);
  const bytes=await readStageLayerBytes(handle,USD,identifier);
  assert.equal(new TextDecoder().decode(bytes),expected);
  assert.ok(!USD.FS_readdir('/tmp').some(name=>name.startsWith('needle-layer-source-')),'temporary exports are unlinked');
 }finally{await handle.dispose();}
});
