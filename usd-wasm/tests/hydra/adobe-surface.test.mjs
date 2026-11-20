import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group} from 'three';
import {ThreeRenderDelegateInterface} from '../../src/hydra/ThreeJsRenderDelegate.js';

test('imported Adobe glass retains transmission, volume and emission independently of opacity',async()=>{
 const delegate=new ThreeRenderDelegateInterface({usdRoot:new Group()});
 const material=delegate.createSPrim('material','/Glass');material.beginMaterialSync();
 material.updateNode('surface','/Glass/Surface',{identifier:'AdobeStandardMaterial_4_0',baseColor:[.8,.9,1],roughness:.12,metallic:0,opacity:.9,translucency:.8,IOR:1.45,volumeThickness:.2,absorptionColor:[.7,.8,.9],absorptionDistance:3,coatOpacity:1,clearcoatModelsTransmissionTint:true,emissive:[1,.5,0],emissiveIntensity:2});
 material.updateFinished('surface',[]);await delegate.waitForMaterialsReady();
 const m=material._material;
 assert.equal(m.transmission,.8);assert.equal(m.opacity,.9);assert.equal(m.thickness,.2);assert.equal(m.ior,1.45);
 assert.deepEqual(m.attenuationColor.toArray(),[.7,.8,.9]);assert.equal(m.attenuationDistance,3);assert.equal(m.clearcoat,0);
 assert.equal(m.emissiveIntensity,2);assert.deepEqual(m.emissive.toArray(),[1,.5,0]);assert.deepEqual(m.color.toArray(),[.8,.9,1]);
 assert.equal(delegate.getDiagnostics().materialFallbacks,0);delegate.dispose();
});
