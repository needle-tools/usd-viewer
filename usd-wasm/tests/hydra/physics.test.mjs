import assert from 'node:assert/strict';
import { test } from 'node:test';
import R from '@dimforge/rapier3d-compat';
import { Group, Mesh, InstancedMesh, BoxGeometry, MeshBasicMaterial, Vector3 } from 'three';
import { createUsdPhysics } from '../../src/physics/createPhysics.js';
import { createSimulationWorld } from '@needle-tools/simready/rapier';

await R.init();
const identity = [0, 0, 0, 1];
function stage({ upAxis = 'Y', metersPerUnit = 1, kilogramsPerUnit = 1, filtered = false } = {}) {
    const position = upAxis === 'Z' ? [0, 0, 3] : [0, 3, 0];
    const root = new Group(), visual = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    visual.userData.usdPath = '/Body/Visual'; visual.position.fromArray(position); visual.scale.set(2, 1, 1);
    root.add(visual); root.updateMatrixWorld(true);
    const handle = { scene: root, ready: async () => {}, materialsReady: async () => {}, playing: true,
        isPlaying() { return this.playing; }, setPlaying(value) { this.playing = value; } };
    const snapshot = { upAxis, metersPerUnit, kilogramsPerUnit, scenes: [],
        bodies: [{ path: '/Body', position, rotation: identity, scale: [2, 1, 1], mass: 2,
            rigidBodyEnabled: true, filteredCollisions: filtered ? ['/Ground'] : [] }],
        shapes: [{ path: '/Body/Visual', type: 'cube', body: '/Body', halfExtents: [1, .5, .5], position: [0, 0, 0], rotation: identity },
            { path: '/Ground', type: 'cube', body: '', halfExtents: upAxis === 'Z' ? [20, 20, .5] : [20, .5, 20], position: [0, -.5, 0], rotation: identity }],
        joints: [], materials: [], groups: [], unsupported: [] };
    if (upAxis === 'Z') snapshot.shapes[1].position = [0, 0, -.5];
    return { root, visual, handle, snapshot };
}
const step = (simulation, seconds) => { for (let i = 0; i < seconds * 120; i++) simulation.update(1 / 120); };

test('gravity, contact, descendant poses, mass units, pause/reset/disposal use real Rapier', async () => {
    const data = stage({ kilogramsPerUnit: .001 });
    const original = data.visual.matrix.clone();
    const simulation = await createUsdPhysics({ ...data, rapier: R });
    assert.equal(data.handle.playing, false);
    assert.ok(Math.abs(simulation.bodies.get('/Body').body.mass() - .002) < 1e-7);
    simulation.play(); step(simulation, 2);
    const body = simulation.bodies.get('/Body').body;
    assert.ok(Math.abs(body.translation().y - .5) < .02, 'box settles on authored collision floor');
    assert.ok(Math.abs(data.visual.matrix.elements[13] - .5) < .02);
    assert.ok(Math.abs(data.visual.matrix.elements[0] - 2) < 1e-6, 'render scale is retained');
    simulation.pause(); const position = body.translation().y; step(simulation, 1);
    assert.equal(body.translation().y, position);
    simulation.reset(); assert.deepEqual(data.visual.matrix.elements, original.elements); assert.equal(body.translation().y, 3);
    simulation.dispose(); simulation.dispose(); assert.equal(data.handle.playing, true);
    simulation.play(); assert.equal(data.handle.playing, true, 'a disposed controller cannot pause the restored timeline');
});

test('Z-up gravity converts meters to stage units and filtered pairs pass through colliders', async () => {
    const data = stage({ upAxis: 'Z', metersPerUnit: .01, filtered: true });
    const simulation = await createUsdPhysics({ ...data, rapier: R });
    simulation.play(); step(simulation, .1);
    const p = simulation.bodies.get('/Body').body.translation();
    assert.equal(p.y, 0); assert.ok(p.z < -.5, 'centimeter stage falls ~4.9 stage units in0.1s, through filtered floor');
    simulation.dispose();
});

test('dragging moves a dynamic body, releases constraints and reset restores authored velocity', async () => {
    const data = stage();
    data.snapshot.scenes = [{ path: '/Scene', gravityDirection: [0, -1, 0], gravityMagnitude: 0 }];
    const simulation = await createUsdPhysics({ ...data, rapier: R });
    assert.equal(simulation.bodyForObject(data.visual).data.path, '/Body');
    simulation.play(); assert.equal(simulation.beginDrag('/Body', new Vector3(0, 3, 0)), true);
    simulation.moveDrag(new Vector3(2, 3, 0)); step(simulation, 1);
    assert.ok(simulation.bodies.get('/Body').body.translation().x > 1.9);
    simulation.endDrag(); assert.equal(simulation.world.impulseJoints.len(), 0);
    simulation.reset(); assert.equal(simulation.bodies.get('/Body').body.translation().x, 0);
    simulation.dispose();
});

test('shared-world dragging accepts USD stage points after unit, axis and instance placement', async () => {
    const data = stage({upAxis:'Z',metersPerUnit:.01});
    const world = createSimulationWorld({rapier:R,gravity:[0,0,0]});
    const originalRoot = data.root.matrix.clone();
    try {
        const simulation = await createUsdPhysics({...data,world,id:'placed',position:[2,1,0],rotation:[0,Math.SQRT1_2,0,Math.SQRT1_2],allowPartial:false});
        simulation.play();
        assert.equal(simulation.beginDrag('/Body',new Vector3(0,0,3)),true);
        simulation.moveDrag(new Vector3(100,0,3));
        for(let i=0;i<120;i++)world.step();
        const body = simulation.bodies.get('/Body').body;
        assert.ok(Math.abs(body.translation().x-2)<.01);
        assert.ok(Math.abs(body.translation().y-1.03)<.01);
        assert.ok(body.translation().z<-.95,'stage X drag follows the rotated shared-world instance');
        world.removeAsset('placed');
        assert.equal(data.handle.playing,true,'world removal restores timeline ownership');
        assert.deepEqual(data.root.matrix.elements,originalRoot.elements);
    } finally {world.dispose();}
});

test('destroying a borrowed world cancels pending USD instance binding before body access', async () => {
    const data = stage();
    data.root.remove(data.visual);
    const visual = new InstancedMesh(new BoxGeometry(),new MeshBasicMaterial(),1);
    visual.userData.usdPath='/Body/Visual';data.root.add(visual);
    let resolvePick, started;
    const waiting = new Promise(resolve=>{started=resolve;});
    data.handle.resolvePick=()=>{started();return new Promise(resolve=>{resolvePick=resolve;});};
    const raw = new R.World({x:0,y:0,z:0});
    const world = createSimulationWorld({rapier:R,world:raw});
    const creation = createUsdPhysics({...data,world,id:'pending'});
    const rejected = assert.rejects(creation,{name:'AbortError'});
    await waiting;
    world.dispose();
    assert.equal(raw.bodies.len(),0,'pending bodies detach before the host frees its world');
    raw.free();
    resolvePick({path:'/Body/Visual'});
    await rejected;
    assert.equal(data.handle.playing,true);
    assert.equal(data.root.matrixAutoUpdate,true);
});

test('fixed joint anchors remain coincident and unsupported joint frames are explicit', async () => {
    const data = stage();
    data.snapshot.joints = [{ path: '/Joint', type: 'fixed', body0: '', body1: '/Body',
        position0: [0, 3, 0], position1: [0, 0, 0], rotation0: identity, rotation1: identity }];
    const simulation = await createUsdPhysics({ ...data, rapier: R });
    simulation.play(); step(simulation, 1);
    assert.ok(Math.abs(simulation.bodies.get('/Body').body.translation().y - 3) < .01);
    simulation.dispose();
    data.snapshot.joints[0] = { ...data.snapshot.joints[0], type: 'prismatic', rotation1: [0, 0, Math.SQRT1_2, Math.SQRT1_2] };
    const unsupported = await createUsdPhysics({ ...data, rapier: R });
    assert.ok(unsupported.unsupported.some(item => item.path === '/Joint' && item.reason.includes('frame rotations')));
    unsupported.dispose();
});

test('multiple authored scenes require selection and retain independent gravity', async () => {
    const data = stage();
    data.snapshot.scenes = [{ path: '/Zero', gravityDirection: [0, -1, 0], gravityMagnitude: 0 },
        { path: '/Earth', gravityDirection: [0, -1, 0], gravityMagnitude: 9.81 }];
    await assert.rejects(createUsdPhysics({ ...data, rapier: R }), /Select a USD physics scene/);
    const simulation = await createUsdPhysics({ ...data, rapier: R, scenePath: '/Zero' });
    simulation.play(); step(simulation, 1); assert.equal(simulation.bodies.get('/Body').body.translation().y, 3);
    simulation.dispose();
    const second = await createUsdPhysics({ ...data, rapier: R, scenePath: '/Earth' });
    assert.equal(second.bodies.size, 0, 'ownerless bodies belong to the first authored scene');
    second.dispose();
});

test('merged collision-group aliases filter contacts and reset preserves authored sleep and scaled COM', async () => {
    const data = stage();
    data.snapshot.bodies[0].centerOfMass = [.1, .2, .3];
    data.snapshot.bodies[0].startsAsleep = true;
    data.snapshot.groups = [
        { path: '/Moving', filteredGroups: ['/FloorAlias'], mergedGroups: [] },
        { path: '/FloorGroup', filteredGroups: [], mergedGroups: ['/FloorAlias'] },
    ];
    data.snapshot.shapes[0].collisionGroups = ['/Moving'];
    data.snapshot.shapes[1].collisionGroups = ['/FloorGroup'];
    const simulation = await createUsdPhysics({ ...data, rapier: R });
    const body = simulation.bodies.get('/Body').body;
    assert.ok(Math.abs(body.localCom().x - .2) < 1e-6);
    assert.equal(body.isSleeping(), true);
    body.wakeUp(); simulation.play(); step(simulation, 2);
    assert.ok(body.translation().y < -10, 'merged alias excludes the floor contact');
    simulation.reset(); assert.equal(body.isSleeping(), true);
    simulation.dispose();
});

test('authored COM shifts computed inertia, while explicit inertia keeps its authored values', async () => {
    const data = stage();
    data.snapshot.shapes[0].halfExtents = [1, 1, 1];
    data.snapshot.bodies[0].centerOfMass = [.5, 0, 0];
    let simulation = await createUsdPhysics({ ...data, rapier: R });
    let body = simulation.bodies.get('/Body').body;
    const moments = body.principalInertia();
    assert.ok(Math.abs(moments.x - 4 / 3) < 1e-5);
    assert.ok(Math.abs(moments.y - 10 / 3) < 1e-5);
    assert.ok(Math.abs(moments.z - 10 / 3) < 1e-5);
    simulation.dispose();
    data.snapshot.bodies[0].diagonalInertia = [1, 2, 3];
    simulation = await createUsdPhysics({ ...data, rapier: R });
    body = simulation.bodies.get('/Body').body;
    assert.deepEqual(Object.values(body.principalInertia()), [1, 2, 3]);
    simulation.dispose();
});
