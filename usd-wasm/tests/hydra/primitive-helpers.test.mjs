import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group,Matrix4,PerspectiveCamera} from 'three';
import {ThreeRenderDelegateInterface} from '../../src/hydra/ThreeJsRenderDelegate.js';
import {scenePrimitiveHelper,disposeHelper} from '../../src/hydra/primitiveHelpers.js';

const curve={type:'cubic',basis:'bezier',wrap:'nonperiodic',counts:[4],points:[[0,0,0],[0,2,0],[2,2,0],[2,0,0]],primvars:{widths:{values:[0],interpolation:'constant'}}};

test('zero-width curves have sampled centerlines without changing widths; helpers follow visibility, instances and purpose',()=>{
  const root=new Group(),delegate=new ThreeRenderDelegateInterface({usdRoot:root});
  const prim=delegate.createRPrim('basisCurves','/Curve');prim.setStrokeData(curve);prim.setVisibilityState(true);
  assert.equal(prim._helpers.length,0);
  const geometry=prim._geometry,positions=geometry.attributes.position.array.slice();
  delegate.setHelpers({curves:true,controlPoints:true});
  assert.equal(prim._helpers.length,3);assert.equal(prim._geometry,geometry);assert.deepEqual(geometry.attributes.position.array,positions);
  const line=prim._helpers.find(h=>h.userData.usdHelperKind==='curves');
  assert.equal(line.geometry.attributes.position.count,32);assert.ok(line.userData.usdExcludeFromBounds);assert.ok(line.userData.usdHelperPickable);
  assert.equal(line.material.depthWrite,false);assert.equal(line.material.toneMapped,false);
  let released=0;line.geometry.addEventListener('dispose',()=>released++);
  prim.setInstanceTransforms(new Matrix4().makeTranslation(3,4,5).toArray(),1,true);
  assert.equal(released,1);const instance=prim._helpers[0];
  assert.equal(instance.geometry.attributes.position.getX(0),3);assert.equal(instance.geometry.attributes.position.getY(0),4);
  assert.equal(instance.userData.usdHelperInstanceStride,32);
  prim.setVisibilityState(false);assert.ok(prim._helpers.every(h=>!h.visible));
  prim.setVisibilityState(true,'guide');assert.ok(prim._helpers.every(h=>!h.visible));
  delegate.setIncludedPurposes(['guide']);assert.ok(prim._helpers.every(h=>h.visible));
  prim.setInstanceTransforms([],0,true);assert.equal(prim._helpers.length,0);
  delegate.dispose();assert.equal(root.children.length,0);
});

test('control cages omit invisible curves and follow indexed control points',()=>{
  const root=new Group(),delegate=new ThreeRenderDelegateInterface({usdRoot:root,helpers:{controlPoints:true}});
  const prim=delegate.createRPrim('basisCurves','/Curves');
  prim.setStrokeData({...curve,counts:[4,4],indices:[3,2,1,0,0,1,2,3],invisibleCurves:[1]});prim.setVisibilityState(true);
  assert.equal(prim._helpers[0].geometry.attributes.position.count,6);
  assert.equal(prim._helpers[1].geometry.attributes.position.count,4);
  assert.equal(prim._helpers[1].geometry.attributes.position.getX(0),2);
  delegate.dispose();
});

test('zero-width point markers and NURBS control cages remain display-only',()=>{
  const root=new Group(),delegate=new ThreeRenderDelegateInterface({usdRoot:root,helpers:{points:true,controlPoints:true}});
  const points=delegate.createRPrim('points','/Points');points.setStrokeData({points:[[1,2,3]],primvars:{widths:{values:[0]}}});points.setVisibilityState(true);
  assert.equal(points._helpers[0].isPoints,true);assert.equal(points._helpers[0].material.sizeAttenuation,false);
  const patch=delegate.createRPrim('nurbsPatch','/Patch');
  patch.setStrokeData({uCount:2,vCount:2,uOrder:2,vOrder:2,uKnots:[0,0,1,1],vKnots:[0,0,1,1],points:[[0,0,0],[1,0,0],[0,1,0],[1,1,0]]});patch.setVisibilityState(true);
  assert.equal(patch._helpers[0].geometry.attributes.position.count,8);
  assert.equal(patch._helpers[1].geometry.attributes.position.count,4);
  delegate.setHelpers({points:false,controlPoints:false});assert.equal(points._helpers.length,0);assert.equal(patch._helpers.length,0);
  delegate.dispose();
});

test('all USD light shapes, dome lights and cameras get helpers that update and dispose',()=>{
  const root=new Group(),delegate=new ThreeRenderDelegateInterface({usdRoot:root,scenePrimitiveRoot:root,scenePrimitiveLightIntensityScale:1});
  for(const typeId of ['sphereLight','distantLight','rectLight','diskLight','cylinderLight','domeLight']) {
    const prim=delegate.createSPrim(typeId,`/${typeId}`);
    prim.updateLightState({typeId,intensity:0,visible:true,width:2,height:3,radius:.5,length:4,transform:new Matrix4().makeTranslation(2,3,4).toArray()});
    assert.equal(prim._helper,null);delegate.setHelpers({lights:true});
    assert.ok(prim._helper.isLineSegments);assert.equal(prim._helper.matrix.elements[12],2);
    assert.ok(prim._helper.geometry.attributes.position.count>0);
    prim.updateLightState({typeId,intensity:0,visible:false});assert.equal(prim._helper.visible,false);
    delegate.setHelpers({lights:false});assert.equal(prim._helper,null);
  }
  const camera=new PerspectiveCamera(50,1.5,.01,100000),helper=scenePrimitiveHelper(camera,{},'/Camera');
  helper.geometry.computeBoundingBox();assert.ok(helper.geometry.boundingBox.max.length()<10);disposeHelper(helper);
  delegate.dispose();assert.equal(root.children.length,0);
});

test('area lights wait for lookup tables and retain the latest authored visibility',async()=>{
  let finish;const pending=new Promise(resolve=>finish=resolve),root=new Group();
  const delegate=new ThreeRenderDelegateInterface({usdRoot:root,scenePrimitiveRoot:root,helpers:{lights:true},webGpuSupport:{prepareAreaLights:()=>pending}});
  const prim=delegate.createSPrim('rectLight','/Light');
  prim.updateLightState({typeId:'rectLight',intensity:100,visible:true});
  assert.equal(prim._object.visible,false);assert.equal(prim._helper.visible,false);
  prim.updateLightState({typeId:'rectLight',intensity:100,visible:false});
  finish();await delegate.waitForRprimsReady();await Promise.resolve();
  assert.equal(prim._object.visible,false);assert.equal(prim._helper.visible,false);
  prim.updateLightState({typeId:'rectLight',intensity:100,visible:true});
  assert.equal(prim._object.visible,true);assert.equal(prim._helper.visible,true);
  const helper=prim._helper;
  prim.updateLightState({typeId:'rectLight',intensity:100,visible:true,transform:new Matrix4().makeTranslation(1,2,3).toArray()});
  assert.equal(prim._helper,helper);assert.equal(helper.matrix.elements[12],1);
  delegate.dispose();assert.equal(root.children.length,0);
});
