import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {unzipSync} from 'three/addons/libs/fflate.module.js';
import {getUsdModule} from '../../src/bindings/index.js';
import {createThreeHydra} from '../../src/create.three.js';

const encoder = new TextEncoder();
const root = `#usda 1.0
(defaultPrim="World"\n subLayers=[@layers/shape.usda@])
def Xform "World" (
 variants={string look="warm"}
 prepend variantSets="look"
) {
 custom asset palette=@textures/palette.bin@
 variantSet "look"={
  "warm" {\n custom string mood="sunny"\n custom asset swatch=@textures/warm.bin@\n }
  "cool" {\n custom string mood="calm"\n }
 }
}`;
const files = [
  ['scene.usda', encoder.encode(root)],
  ['layers/shape.usda', encoder.encode('#usda 1.0\ndef Xform "World" {\n def Sphere "Ball" {\n double radius=0.5\n }\n}\n')],
  ['textures/palette.bin', new Uint8Array([17, 33, 66, 99])],
  ['textures/warm.bin', new Uint8Array([222, 111])],
].map(([path, bytes]) => Object.assign(new File([bytes], path.split('/').pop()), {path}));

test('USDZ export preserves editable variants, sublayers, binary assets and queued edits; repackaging preserves inner-layer edits', async () => {
  const USD = await getUsdModule({print(){}, printErr(){}});
  const handle = await createThreeHydra({USD, scene:new Group(), files, autoPlay:false});
  let reopenedHandle;
  try {
    await handle.ready();
    assert.equal(typeof handle.driver.ExportUsdzAsync, 'function', 'native packaging has a worker entry');
    const edit = handle.editStage(async stage => {
      const prim = stage.GetPrimAtPath('/World');
      try { await prim.SetVariantSelection('look', 'cool'); } finally { prim.delete(); }
      stage.DefinePrim('/World/Edited', 'Xform').delete();
      return stage.GetRootLayer().ExportToString();
    });
    const progress = [];
    const archive = await handle.exportUsdz({onProgress:value=>progress.push(value)});
    const originalLayer = await edit;
    assert.ok(progress.some(value=>value.phase==='packaging'));
    assert.ok(progress.some(value=>value.phase==='reading'));
    assert.equal(progress.at(-1).phase,'complete');
    assert.equal(handle.driver.GetStage().GetRootLayer().ExportToString(), originalLayer, 'localization leaves source layer paths untouched');
    const entries = unzipSync(archive), names = Object.keys(entries);
    assert.equal(names[0], 'scene.usda');
    assert.ok(names.some(name => name.endsWith('shape.usda')));
    assert.deepEqual([...entries[names.find(name => name.endsWith('palette.bin'))]], [17, 33, 66, 99]);
    assert.deepEqual([...entries[names.find(name => name.endsWith('warm.bin'))]], [222, 111], 'unselected variant asset is retained');
    assert.ok(!USD.FS_analyzePath('/needle/1/.needle-export-1').exists, 'temporary export files are cleaned');

    reopenedHandle = await createThreeHydra({USD, scene:new Group(), buffer:archive.buffer, url:'downloaded.usdz', autoPlay:false});
    await reopenedHandle.ready();
    const stage = reopenedHandle.driver.GetStage();
    assert.ok(stage.GetPrimAtPath('/World/Ball').IsValid());
    assert.ok(stage.GetPrimAtPath('/World/Edited').IsValid());
    const world = stage.GetPrimAtPath('/World');
    assert.equal(world.GetVariantSelection('look'), 'cool');
    assert.equal(world.GetVariantNames('look').size(), 2);
    world.delete();
    await reopenedHandle.editStage(stage => stage.DefinePrim('/World/EditedInsidePackage', 'Xform').delete());
    const repackaged = await reopenedHandle.exportUsdz();
    USD.FS_createDataFile('/tmp', 'repacked.usdz', repackaged, true, true, true);
    const verify = await USD.OpenStage('/tmp/repacked.usdz');
    try {
      assert.ok(verify.GetPrimAtPath('/World/EditedInsidePackage').IsValid());
      assert.ok(verify.GetPrimAtPath('/World/Ball').IsValid());
      assert.equal(verify.GetPrimAtPath('/World').GetVariantSelection('look'), 'cool');
    } finally { USD.ReleaseStage(verify); USD.FS_unlink('/tmp/repacked.usdz'); }
    // Read-only packaging does not alter the live graph or revision.
    assert.ok(stage.GetPrimAtPath('/World/EditedInsidePackage').IsValid());
    const revision = reopenedHandle.revision;
    await reopenedHandle.exportUsdz(); assert.equal(reopenedHandle.revision, revision);
    await reopenedHandle.editStage(stage => stage.DefinePrim('/World/SecondEdit', 'Xform').delete());
    const later = unzipSync(await reopenedHandle.exportUsdz());
    assert.ok(Object.values(later).some(bytes => new TextDecoder().decode(bytes).includes('SecondEdit')), 'successive exports do not reuse stale localized layers');
  } finally { await reopenedHandle?.dispose(); await handle.dispose(); }
  await assert.rejects(handle.exportUsdz(), /closed stage/);
});

test('missing dependencies reject the archive and leave the live stage usable', async () => {
  const USD = await getUsdModule({print(){}, printErr(){}});
  const handle = await createThreeHydra({USD, scene:new Group(), buffer:encoder.encode('#usda 1.0\ndef Sphere "Ball" {\n custom asset missing=@never-present.png@\n}\n'), url:'missing.usda'});
  try {
    await handle.ready();
    await assert.rejects(handle.exportUsdz(), /Could not package/);
    await handle.setTime(0);
    assert.ok(handle.driver.GetStage().GetPrimAtPath('/Ball').IsValid());
  } finally { await handle.dispose(); }
});
