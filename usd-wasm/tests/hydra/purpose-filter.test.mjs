import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group, Float32BufferAttribute} from 'three';
import {ThreeRenderDelegateInterface} from '../../src/hydra/ThreeJsRenderDelegate.js';

// Retained rprims must follow collection changes even when Hydra skips their Sync.
for (const type of ['mesh', 'points', 'basisCurves', 'nurbsPatch', 'particleField', 'volume']) {
  test(`${type}: purpose changes filter retained objects independently of authored visibility`, () => {
    const delegate = new ThreeRenderDelegateInterface({usdRoot: new Group()});
    const prim = delegate.createRPrim(type, '/Proxy');
    if (type === 'volume') {
      prim._key = JSON.stringify([]);
      prim.updateVolumeState({fields: [], visible: true, renderTag: 'proxy'});
    } else {
      if (type === 'mesh') { prim.updateIndices([0,1,2]); prim.updatePoints([0,0,0,1,0,0,0,1,0]); prim.updateNormals([0,0,1,0,0,1,0,0,1]); }
      if (['points','basisCurves','nurbsPatch'].includes(type)) {
        prim._geometry.setAttribute('position', new Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3)); prim._mesh.count = 1;
      }
      prim.setVisibilityState(true, 'proxy');
    }
    const object = prim._root || prim._mesh;
    assert.equal(object.visible, false);
    delegate.setIncludedPurposes(['proxy']); assert.equal(object.visible, true);
    delegate.setIncludedPurposes(['default','render']); assert.equal(object.visible, false);
    delegate.setIncludedPurposes(['proxy']); assert.equal(object.visible, true);
    if (type === 'volume') prim.updateVolumeState({fields: [], visible: false, renderTag: 'proxy'});
    else prim.setVisibilityState(false, 'proxy');
    delegate.setIncludedPurposes(['default','render']); delegate.setIncludedPurposes(['proxy']);
    assert.equal(object.visible, false, 'purpose must not override authored invisibility');
    delegate.dispose();
  });
}
