import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Scene, Group, Color, PerspectiveCamera, Mesh} from 'three';
import {ThreeRenderDelegateInterface} from '../../usd-wasm/src/hydra/ThreeJsRenderDelegate.js';
import {createPicking} from '../renderer/picking.mjs';

function setup() {
  const scene=new Scene(), root=new Group();scene.add(root);
  const delegate=new ThreeRenderDelegateInterface({usdRoot:root});
  const mesh=delegate.createRPrim('mesh','/Animated');
  mesh.updatePoints([0,0,0,1,0,0,1,1,0,0,1,0]);
  mesh.setVisibilityState(true);
  const renderer={
    getRenderTarget:()=>null, getMRT:()=>null, getClearColor:target=>target.copy(new Color()),
    getClearAlpha:()=>1, setClearColor(){}, setRenderTarget(){}, setMRT(){},
    render(){
      assert.equal(scene.backgroundNode,null);
      assert.equal(mesh._geometry.getAttribute('needleElementId').count,mesh._geometry.getAttribute('position').count);
    },
  };
  const picking=createPicking(renderer,scene,new PerspectiveCamera(),new Map([['/Animated',7]]));
  return {delegate,mesh,picking,renderer,root,scene};
}

test('picking does not leave stale attributes that hide a mesh when holes close',()=>{
  const {delegate,mesh,picking,root,scene}=setup();
  const background={isNode:true};scene.backgroundNode=background;
  try {
    // Both renderables can share a geometry (ordinary/instanced mesh paths).
    const shared=new Mesh(mesh._geometry,mesh._mesh.material);
    shared.userData.usdPath='/Animated';root.add(shared);
    for(const [indices,coarse] of [[[0,1,2],[0]],[[0,1,2,0,2,3],[0,4]],[[0,1,2],[8]]]){
      mesh.updateIndices(indices,coarse);
      mesh.commit();
      assert.equal(mesh._mesh.visible,true);
      picking.render(16,16);
      assert.equal(scene.backgroundNode,background);
      assert.equal(mesh._geometry.getAttribute('needleElementId'),undefined);
      mesh.commit();
      assert.equal(mesh._mesh.visible,true);
    }
  } finally {picking.dispose();delegate.dispose();}
});

test('a failed picking draw restores the shared beauty geometry',()=>{
  const {delegate,mesh,picking,renderer}=setup();
  try {
    mesh.updateIndices([0,1,2],[0]);
    renderer.render=()=>{throw new Error('draw failed');};
    assert.throws(()=>picking.render(16,16),/draw failed/);
    assert.equal(mesh._geometry.getAttribute('needleElementId'),undefined);
  } finally {picking.dispose();delegate.dispose();}
});
