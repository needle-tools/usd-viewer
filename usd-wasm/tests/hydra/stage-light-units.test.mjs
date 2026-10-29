import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {getUsdModule} from '../../src/bindings/index.js';
import {createThreeHydra} from '../../src/create.three.js';

test('native light state forwards dimensions, normalization and exposure into Three light units', async () => {
  const source=`#usda 1.0
def Xform "World" {
 def CylinderLight "Tube" {
  float inputs:radius=.2
  float inputs:length=2.4
  float inputs:intensity=200
 }
 def RectLight "Panel" {
  float inputs:width=2
  float inputs:height=3
  float inputs:intensity=120
  bool inputs:normalize=true
  float3 xformOp:scale=(2,3,1)
  uniform token[] xformOpOrder=["xformOp:scale"]
 }
 def SphereLight "Orb" {
  float inputs:radius=.25
  float inputs:intensity=400
 }
 def DistantLight "Sun" {
  float inputs:angle=10
  float inputs:intensity=300
  float inputs:exposure=1
 }
}`;
  const USD=await getUsdModule({print(){},printErr(){}}),scene=new Group();
  const h=await createThreeHydra({USD,scene,buffer:new TextEncoder().encode(source),url:'light-units.usda',scenePrimitiveLightIntensityScale:1});
  try {
    await h.ready();
    const lights=new Map();scene.traverse(o=>{if(o.isLight)lights.set(o.userData.usdPath,o);});
    assert.equal(lights.size,4);
    const close=(name,value)=>assert.ok(Math.abs(lights.get('/World/'+name).intensity-value)<1e-4,name);
    close('Tube',200*2*Math.PI*.2*2.4/4);
    close('Panel',120/36);
    close('Orb',400*Math.PI*.25**2);
    close('Sun',600*Math.PI*Math.sin(5*Math.PI/180)**2);
    assert.equal(lights.get('/World/Panel').width,4);assert.equal(lights.get('/World/Panel').height,9);
  } finally {await h.dispose();}
});
