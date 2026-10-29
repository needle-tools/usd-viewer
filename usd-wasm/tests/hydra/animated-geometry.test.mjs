import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {ThreeRenderDelegateInterface} from '../../src/hydra/ThreeJsRenderDelegate.js';

test('deforming mesh keeps static attributes while wire overlays follow the new surface', () => {
  const delegate = new ThreeRenderDelegateInterface({usdRoot:new Group()});
  const mesh = delegate.createRPrim('mesh','/Deforming');
  mesh.updatePoints([0,0,0,1,0,0,1,1,0,0,1,0]);
  mesh.updateIndices([0,1,2,0,2,3]);
  mesh.updatePrimvar('st',[0,0,1,0,1,1,0,1],2,'vertex');
  mesh.updatePrimvar('displayColor',[1,0,0,0,1,0,0,0,1,1,1,0],3,'vertex');
  mesh.updatePrimvar('custom',[1,2,3,4],1,'vertex');
  mesh.setHydraReprStyle('wireOnSurface');
  const uv=mesh._geometry.getAttribute('uv'), color=mesh._geometry.getAttribute('color'), custom=mesh._geometry.getAttribute('primvars:custom');
  const wire=mesh._wireObject.geometry; let released=false;
  wire.addEventListener('dispose',()=>{released=true;});
  mesh.updatePoints([0,0,0,1,0,1,1,1,1,0,1,0]);
  mesh.updateIndices(new Uint32Array([0,1,2,0,2,3]));
  assert.equal(mesh._geometry.getAttribute('uv'),uv);
  assert.equal(mesh._geometry.getAttribute('color'),color);
  assert.equal(mesh._geometry.getAttribute('primvars:custom'),custom);
  assert.ok(mesh._geometry.getAttribute('position').array.some((v,i)=>i%3===2 && v===1));
  assert.ok(mesh._wireObject.geometry.getAttribute('position').array.some((v,i)=>i%3===2 && v===1));
  assert.equal(released,true);
  // A genuine topology change must remap those attributes.
  mesh.updateIndices([0,2,3]);
  assert.notEqual(mesh._geometry.getAttribute('uv'),uv);
  assert.equal(mesh._geometry.getAttribute('uv').count,3);
  delegate.dispose();
});
