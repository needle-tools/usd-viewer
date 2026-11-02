import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareInstancedMaterialUpdates} from '../../src/renderers/instancedMaterialUpdates.js';

test('node material observers refresh changed instance buffers and keep idle checks',()=>{
  let checks=0;const material={isNodeMaterial:true,setupObserver(){return {equals(){checks++;return true;}};}};
  prepareInstancedMaterialUpdates(material);const setup=material.setupObserver;prepareInstancedMaterialUpdates(material);assert.equal(material.setupObserver,setup);
  const observer=material.setupObserver({}),object={instanceMatrix:{version:0}},draw={object};
  assert.equal(observer.equals(draw),false);assert.equal(observer.equals(draw),true);
  object.instanceMatrix.version++;assert.equal(observer.equals(draw),false);assert.equal(observer.equals(draw),true);
  object.instanceMatrix={version:1};assert.equal(observer.equals(draw),false);
  assert.equal(observer.equals({object:{}}),true);assert.equal(checks,3);
});
