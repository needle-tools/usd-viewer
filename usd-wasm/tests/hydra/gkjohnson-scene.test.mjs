import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Group,Object3D,DirectionalLight,SpotLight,PerspectiveCamera,Color,DataTexture,Vector3} from 'three';
import {createGkjohnsonTracer} from '../../src/renderers/gkjohnson.js';

test('gkjohnson preserves authored environment absence, texture intensity/rotation and light targets',async()=>{
  let staged;
  class Tracer {
    setDenoiser(){}setScene(scene){staged=scene;}updateTransforms(){}updateMaterials(){}updateLights(){}updateEnvironment(){}updateCamera(){}setCamera(){}renderSample(){}dispose(){}reset(){}
    getSampleCountsAsync(){return Promise.resolve({avg:1});}
  }
  const scene=new Scene(),parent=new Group(),external=new Group(),camera=new PerspectiveCamera();
  parent.position.set(4,2,1);parent.rotation.y=.8;scene.add(parent);
  const light=new DirectionalLight(0xffaa33,4),target=new Object3D();target.position.set(1,3,-2);parent.add(light,target);light.target=target;
  const spot=new SpotLight();external.position.set(20,-3,2);external.add(spot.target);spot.target.position.set(2,4,1);parent.add(spot);
  const renderer={autoClear:true,domElement:{width:100,height:100},toneMapping:0,toneMappingExposure:1,getClearColor:c=>c.set(0xffffff),getClearAlpha:()=>1};
  const adapter=await createGkjohnsonTracer({api:{WebGPUPathTracer:Tracer},renderer,scene,camera});adapter.render(camera);
  assert.equal(scene.environment,null);assert.ok(staged.environment.isDataTexture);assert.equal(staged.environmentIntensity,0);assert.deepEqual([...staged.environment.image.data],[0,0,0,255]);
  const lights=[];staged.traverse(o=>{if(o.isLight)lights.push(o);});
  const copied=lights.find(l=>l.isDirectionalLight);assert.notEqual(copied.target,target);assert.ok(copied.target.parent);
  assert.deepEqual(copied.target.getWorldPosition(new Vector3()).toArray(),target.getWorldPosition(new Vector3()).toArray());
  const copiedSpot=lights.find(l=>l.isSpotLight);assert.deepEqual(copiedSpot.target.getWorldPosition(new Vector3()).toArray(),spot.target.getWorldPosition(new Vector3()).toArray());
  const texture=new DataTexture();scene.environment=texture;scene.environmentIntensity=.23;scene.environmentRotation.set(.2,.8,-.1);scene.background=new Color(.1,.2,.3);adapter.render(camera);
  assert.equal(staged.environment,texture);assert.equal(staged.environmentIntensity,.23);assert.deepEqual(staged.environmentRotation.toArray(),scene.environmentRotation.toArray());assert.equal(staged.background,scene.background);
  target.position.x+=2;external.rotation.y=.5;light.intensity=7;adapter.render(camera);
  assert.equal(copied.intensity,7);assert.deepEqual(copied.target.getWorldPosition(new Vector3()).toArray(),target.getWorldPosition(new Vector3()).toArray());assert.deepEqual(copiedSpot.target.getWorldPosition(new Vector3()).toArray(),spot.target.getWorldPosition(new Vector3()).toArray());
  scene.environment=null;adapter.render(camera);assert.equal(staged.environmentIntensity,0);
  adapter.dispose();texture.dispose();
});
