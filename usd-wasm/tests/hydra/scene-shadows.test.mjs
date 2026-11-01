import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, DirectionalLight, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PointLight, RectAreaLight, SpotLight, Vector3 } from 'three';
import { UsdSceneShadows } from '../../src/hydra/sceneShadows.js';

function setup() {
    const root = new Group();
    const mesh = new Mesh(new BoxGeometry(4, 2, 6), new MeshStandardMaterial());
    mesh.position.set(3,4,5); mesh.userData.usdPath = '/World/Mesh'; root.add(mesh);
    const state = {value:undefined, valid:false, primGets:0, attributeGets:0, reads:[], deletedPrim:0, deletedAttribute:0};
    const stage = {GetPrimAtPath() { state.primGets++; return {
        GetAttribute(name) { assert.equal(name,'inputs:shadow:enable'); state.attributeGets++; return {
            IsValid: () => state.valid,
            Get(time) {state.reads.push(time); return state.value;},
            delete() {state.deletedAttribute++;},
        }; }, delete() {state.deletedPrim++;},
    }; }};
    const delegate = {config:{usdRoot:root}, scenePrimitives:{}};
    return {root,mesh,state,delegate,shadows:new UsdSceneShadows(stage,delegate)};
}

test('composed shadow enable defaults true and updates time/variants through cached, owned attributes', async () => {
    const {root,state,delegate,shadows} = setup();
    const light = new PointLight(); root.add(light); delegate.scenePrimitives['/Light']={_object:light};
    await shadows.update(0); assert.equal(light.castShadow,true);
    state.valid=true; state.value=false; await shadows.update(12); assert.equal(light.castShadow,false);
    state.value=true; await shadows.update(24); assert.equal(light.castShadow,true);
    assert.deepEqual(state.reads,[12,24]);
    assert.equal(state.primGets,1); assert.equal(state.attributeGets,1); assert.equal(state.deletedPrim,1);
    shadows.dispose(); shadows.dispose(); assert.equal(state.deletedAttribute,1);
});

test('hidden, zero-intensity and unsupported area lights do not render shadow maps; replacement frees resources', async () => {
    const {root,state,delegate,shadows} = setup();
    const light = new SpotLight(); root.add(light); delegate.scenePrimitives['/Light']={_object:light};
    await shadows.update(0); assert.equal(light.castShadow,true);
    light.intensity=0; await shadows.update(0); assert.equal(light.castShadow,false);
    light.intensity=1; root.visible=false; await shadows.update(0); assert.equal(light.castShadow,false);
    root.visible=true; let freed=0; light.shadow.dispose=()=>freed++;
    const area = new RectAreaLight(); root.add(area); delegate.scenePrimitives['/Light']={_object:area};
    await shadows.update(0); assert.equal(area.castShadow,false); assert.equal(freed,1); assert.equal(state.deletedAttribute,1);
    shadows.dispose(); assert.equal(freed,1);
});

test('directional frustum includes stage bounds behind the light and transformed instanced geometry', async () => {
    const {root,delegate,shadows} = setup();
    root.rotation.x = -Math.PI/2; root.scale.setScalar(0.01);
    const instances = new InstancedMesh(new BoxGeometry(1,1,1), new MeshStandardMaterial(),2);
    instances.setMatrixAt(0,new Matrix4().makeTranslation(20,30,40));
    instances.setMatrixAt(1,new Matrix4().makeTranslation(-20,-30,-40));
    instances.userData.usdPath='/World/Instances'; root.add(instances);
    const light = new DirectionalLight(); light.position.set(0,0,0); light.target.position.set(0,0,-1); light.add(light.target); root.add(light);
    delegate.scenePrimitives['/Light']={_object:light};
    await shadows.update(0);
    assert.ok(light.shadow.camera.near < 0);
    light.shadow.updateMatrices(light);
    const bounds=shadows.bounds, camera=light.shadow.camera;
    for(let i=0;i<8;i++) {
        const p=new Vector3(i&1?bounds.max.x:bounds.min.x,i&2?bounds.max.y:bounds.min.y,i&4?bounds.max.z:bounds.min.z).project(camera);
        assert.ok(Math.abs(p.x)<1 && Math.abs(p.y)<1 && Math.abs(p.z)<1,JSON.stringify(p));
    }
    shadows.dispose();
});

test('scenes without active supported shadow lights never scan geometry bounds', async () => {
    const {root,delegate,shadows,state} = setup();
    root.traverseVisible = () => { throw new Error('unexpected geometry scan'); };
    await shadows.update(0);
    const area = new RectAreaLight(); root.add(area); delegate.scenePrimitives['/Area']={_object:area};
    await shadows.update(0);
    const light = new PointLight(); light.intensity=0; root.add(light); delegate.scenePrimitives['/Light']={_object:light};
    await shadows.update(0);
    light.intensity=1;light.visible=false;await shadows.update(0);
    light.visible=true;state.valid=true;state.value=false;await shadows.update(0);
    shadows.dispose();
});

test('late geometry visibility refits bounds without rereading the composed attribute', async () => {
    const {root,mesh,state,delegate,shadows} = setup();
    const light = new PointLight(); root.add(light); delegate.scenePrimitives['/Light']={_object:light};
    state.valid=true;state.value=true;mesh.visible=false;
    await shadows.update(3);assert.equal(light.castShadow,false);
    mesh.visible=true;shadows.refreshBounds();assert.equal(light.castShadow,true);
    assert.deepEqual(state.reads,[3]);
    const hidden = new Group();hidden.visible=false;
    const farMesh = mesh.clone();farMesh.position.setScalar(10000);hidden.add(farMesh);root.add(hidden);
    const before=shadows.bounds.clone();shadows.refreshBounds();assert.ok(before.equals(shadows.bounds));
    shadows.dispose();shadows.refreshBounds();
});

test('MaterialX light ordering refreshes on changes, not every frame', async () => {
    const {root,state,delegate,shadows} = setup();let refreshes=0;
    delegate.refreshMaterialXLighting=()=>refreshes++;
    const light=new PointLight();root.add(light);delegate.scenePrimitives['/Light']={_object:light};
    await shadows.update(0);assert.equal(refreshes,1);
    await shadows.update(1);shadows.refreshBounds();assert.equal(refreshes,1);
    state.valid=true;state.value=false;await shadows.update(2);assert.equal(refreshes,2);
    await shadows.update(3);assert.equal(refreshes,2);
    light.visible=false;await shadows.update(4);assert.equal(refreshes,3);
    delete delegate.scenePrimitives['/Light'];await shadows.update(5);assert.equal(refreshes,4);
    shadows.dispose();
});
