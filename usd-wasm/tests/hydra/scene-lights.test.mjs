import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Scene, Vector3, Quaternion, Euler, LinearFilter, RepeatWrapping } from 'three';
import { ThreeRenderDelegateInterface } from '../../src/hydra/ThreeJsRenderDelegate.js';
import { getDomeRotation } from '../../src/hydra/domeEnvironment.js';

function setup() {
    const scene = new Scene(), root = new Group(); scene.add(root);
    return { scene, delegate: new ThreeRenderDelegateInterface({ usdRoot: root, scenePrimitiveRoot: root, renderScene: scene }) };
}

test('rect lights retain their authored area and directional targets follow local -Z', () => {
    const { delegate } = setup();
    const area = delegate.createSPrim('rectLight', '/Softbox');
    area.updateLightState({ intensity: 300, width: 4, height: 2 });
    assert.equal(area._object.isRectAreaLight, true);
    assert.equal(area._object.width, 4); assert.equal(area._object.height, 2);
    const key = delegate.createSPrim('distantLight', '/Key');
    key.updateLightState({ intensity: 200, transform: [1,0,0,0, 0,1,0,0, 0,0,1,0, 3,4,5,1] });
    key._object.updateMatrixWorld(true);
    const direction = key._object.target.getWorldPosition(new Vector3()).sub(key._object.getWorldPosition(new Vector3())).normalize();
    assert.ok(direction.distanceTo(new Vector3(0, 0, -1)) < 1e-6);
    delegate.dispose();
});

test('area-light preparation starts once on first use and remains part of readiness', async () => {
    let finish, preparations = 0;
    const preparation = new Promise(resolve => { finish = resolve; });
    const delegate = new ThreeRenderDelegateInterface({ usdRoot: new Group(), webGpuSupport: {
        prepareAreaLights: () => { preparations++; return preparation; },
    } });
    try {
        const point = delegate.createSPrim('sphereLight', '/Point');
        point.updateLightState({ intensity: 20 });
        const shaped = delegate.createSPrim('rectLight', '/Shaped');
        shaped.updateLightState({ intensity: 20, coneAngle: 30 });
        assert.equal(preparations, 0, 'punctual and shaped lights need no area lookup tables');
        const area = delegate.createSPrim('rectLight', '/Area');
        area.updateLightState({ intensity: 20, width: 2, height: 3 });
        area.updateLightState({ intensity: 40, width: 3, height: 4 });
        assert.equal(preparations, 1);
        let ready = false;
        const pending = delegate.waitForRprimsReady().then(() => { ready = true; });
        await Promise.resolve();
        assert.equal(ready, false);
        finish(); await pending;
        assert.equal(ready, true);
    } finally { finish(); delegate.dispose(); }
});

test('area lookup failures remain visible if the import rejects before readiness is requested', async () => {
    const failure = new Error('area lookup import failed');
    const delegate = new ThreeRenderDelegateInterface({ usdRoot: new Group(), webGpuSupport: {
        prepareAreaLights: () => Promise.reject(failure),
    } });
    try {
        delegate.createSPrim('diskLight', '/Area').updateLightState({ intensity: 20 });
        await new Promise(resolve => setImmediate(resolve));
        await assert.rejects(delegate.waitForRprimsReady(), error => error === failure);
    } finally { delegate.dispose(); }
});

test('solid dome lights illuminate the scene and restore its environment on disposal', async () => {
    const { scene, delegate } = setup();
    const dome = delegate.createSPrim('domeLight', '/Sky');
    dome.updateLightState({ intensity: 2, color: [0.25, 0.5, 1], visible: true });
    await delegate.waitForMaterialsReady();
    assert.equal(dome._object.isGroup, true);
    assert.notEqual(dome._object.isLight, true);
    assert.equal(dome._object.userData.usdPath, '/Sky');
    assert.equal(dome._object.visible, true);
    assert.ok(scene.environment?.isDataTexture);
    assert.equal(scene.environmentIntensity, 2);
    assert.ok(scene.environment.image.data[2] > scene.environment.image.data[0]);
    delegate.destroySPrim('/Sky');
    assert.equal(scene.environment, null);
    delegate.dispose();
});

test('orthographic cameras use Hydra world aperture units and preserve authored clipping and transforms', () => {
    const { delegate } = setup();
    const camera = delegate.createSPrim('camera', '/Camera');
    camera.updateCameraState({ projection: 'orthographic', horizontalAperture: 8, verticalAperture: 4, near: 0.2, far: 250,
        transform: [1,0,0,0, 0,1,0,0, 0,0,1,0, 3,4,5,1] });
    assert.equal(camera._object.isOrthographicCamera, true);
    assert.deepEqual([camera._object.left, camera._object.right, camera._object.top, camera._object.bottom], [-4, 4, 2, -2]);
    assert.deepEqual(camera._object.position.toArray(), [3,4,5]);
    assert.equal(camera._object.near, 0.2); assert.equal(camera._object.far, 250);
    camera.updateCameraState({ projection: 'perspective', focalLength: 50, verticalAperture: 24 });
    assert.equal(camera._object.isPerspectiveCamera, true);
    assert.ok(Math.abs(camera._object.fov - 26.99146656) < 0.00001);
    delegate.dispose();
});

test('area-light preparation can finish after disposal without requesting another render', async () => {
    let finish, requests = 0;
    const preparation = new Promise(resolve => { finish = resolve; });
    const delegate = new ThreeRenderDelegateInterface({ usdRoot: new Group(),
        requestRender: () => { requests++; },
        webGpuSupport: { prepareAreaLights: () => preparation },
    });
    delegate.createSPrim('rectLight', '/Area').updateLightState({ intensity: 20 });
    const ready = delegate.waitForRprimsReady();
    delegate.dispose();
    finish();
    await ready;
    assert.equal(requests, 0);
});

test('LDR dome texels decode sRGB before applying the linear light tint',async()=>{
 const {DataTexture,SRGBColorSpace}=await import('three');
 const {createDomeTexture}=await import('../../src/hydra/domeEnvironment.js');
 const source=new DataTexture(new Uint8Array([128,64,255,255]),1,1);source.colorSpace=SRGBColorSpace;
 const texture=createDomeTexture(source,[0.5,1,0]);
 try {
  assert.ok(Math.abs(texture.image.data[0]-0.10793)<0.0001);
  assert.ok(Math.abs(texture.image.data[1]-0.05127)<0.0001);
  assert.equal(texture.image.data[2],0);assert.deepEqual([...source.image.data],[128,64,255,255]);
  assert.equal(texture.minFilter,LinearFilter);assert.equal(texture.magFilter,LinearFilter);
  assert.equal(texture.wrapS,RepeatWrapping);
 } finally {source.dispose();texture.dispose();}
});

test('USD dome longitude matches Storm after local and parent rotations',()=>{
 const parent=new Group(),dome=new Group();parent.add(dome);
 for(const angles of [[0,0,0],[.3,.7,-.2],[Math.PI/2,0,0]]){
  parent.rotation.set(...angles);dome.rotation.set(.1,.2,.3);
  const authored=dome.getWorldQuaternion(new Quaternion());
  const rotation=getDomeRotation(dome,new Euler());
  const inverse=new Quaternion().setFromEuler(rotation).invert();
  for(const local of [new Vector3(1,.2,0),new Vector3(0,-.2,1),new Vector3(-1,.3,-1)]){
   const direction=local.clone().normalize();
   const sampled=direction.clone().applyQuaternion(authored).applyQuaternion(inverse);
   const threeU=Math.atan2(sampled.z,sampled.x)/(2*Math.PI)+.5;
   const stormU=Math.atan2(direction.z,direction.x)/(2*Math.PI)+.25;
   const difference=threeU-stormU;
   assert.ok(Math.abs(difference-Math.round(difference))<1e-12);
   assert.ok(Math.abs(sampled.y-direction.y)<1e-12,'basis must preserve dome latitude');
  }
 }
});
