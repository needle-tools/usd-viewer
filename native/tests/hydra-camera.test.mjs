import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,OrthographicCamera,Matrix4,Vector3,WebGLCoordinateSystem,WebGPUCoordinateSystem} from 'three';
import {HydraCamera} from '../renderer/hydra-camera.mjs';

for(const projection of ['perspective','orthographic'])test(`${projection}: Hydra projection matches Three and survives temporal jitter`,()=>{
  const source=projection==='perspective'?new PerspectiveCamera(42,1.7,.25,130):new OrthographicCamera(-3,5,4,-2,.25,130);
  source.coordinateSystem=WebGLCoordinateSystem;source.updateProjectionMatrix();
  const camera=new HydraCamera();camera.setHydraMatrices(new Matrix4().elements,source.projectionMatrix.elements);
  source.coordinateSystem=WebGPUCoordinateSystem;source.updateProjectionMatrix();
  for(let i=0;i<16;i++)assert.ok(Math.abs(camera.projectionMatrix.elements[i]-source.projectionMatrix.elements[i])<1e-12);
  assert.ok(Math.abs(camera.near-.25)<1e-10);assert.ok(Math.abs(camera.far-130)<1e-7);
  const original=camera.projectionMatrix.clone();
  const point=new Vector3(.7,-.2,-5),before=point.clone().applyMatrix4(original);
  camera.setViewOffset(800,600,.375,-.25,800,600);
  const after=point.clone().applyMatrix4(camera.projectionMatrix);
  assert.ok(Math.abs(after.x-before.x+2*.375/800)<1e-12);
  assert.ok(Math.abs(after.y-before.y-2*(-.25)/600)<1e-12);
  camera.clearViewOffset();assert.deepEqual(camera.projectionMatrix.elements,original.elements);
});

test('off-axis/cropped Hydra frusta retain their principal point after jitter restoration',()=>{
  const source=new PerspectiveCamera(39,1.3,.1,100);
  source.setViewOffset(1200,900,103,47,700,620);
  const camera=new HydraCamera();camera.setHydraMatrices(new Matrix4().elements,source.projectionMatrix.elements);
  const before=camera.projectionMatrix.clone();
  for(const [x,y]of [[.1,.4],[-.25,.125],[.375,-.1]]){
    camera.setViewOffset(700,620,x,y,700,620);camera.clearViewOffset();
    assert.deepEqual(camera.projectionMatrix.elements,before.elements);
  }
});
