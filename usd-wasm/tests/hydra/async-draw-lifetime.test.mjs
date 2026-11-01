import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, PointLight } from 'three';
import { createThreeHydra } from '../../src/create.three.js';

const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function fixture(options = {}) {
    const query = deferred();
    const state = { draws: 0, reads: 0, attributeDeletes: 0, driverDeletes: 0, query };
    const stage = {
        GetRootLayer: () => ({GetIdentifier: () => '/tmp/scene.usda', delete() {}}),
        GetUpAxis: () => 'Y', GetStartTimeCode: () => 0, GetEndTimeCode: () => 24, GetTimeCodesPerSecond: () => 24,
        GetPrimAtPath: () => ({ delete() {}, GetAttribute: () => ({
            IsValid: () => true,
            Get: () => { state.reads++; return query.promise; },
            delete: () => { state.attributeDeletes++; },
        }) }),
    };
    class Driver {
        constructor(delegate) { this.delegate = delegate; }
        HasScopedHttpCache() { return true; }
        HasStage() { return options.hasStage !== false; }
        GetStage() { return stage; }
        SetTime() {}
        IsDrawPending() { return false; }
        isDeleted() { return state.driverDeletes > 0; }
        delete() { state.driverDeletes++; }
        DrawAsync(resolve) {
            state.draws++;
            if (!this.delegate.scenePrimitives['/Light']) {
                const light = new PointLight();
                this.delegate.config.usdRoot.add(light);
                this.delegate.scenePrimitives['/Light'] = { _object: light, dispose: () => light.removeFromParent() };
            }
            queueMicrotask(resolve);
            return true;
        }
    }
    const USD = { ready: Promise.resolve(), HdWebSyncDriver: Driver, FS_analyzePath: () => ({}) };
    if (options.factory) USD.CreateHdWebSyncDriver = options.factory;
    const scene = new Group();
    return { state, USD, scene, create: () => createThreeHydra({ USD, scene, url: 'https://example.test/scene.usda', autoPlay: true }) };
}

test('draw timeout cannot release shadow-query lifetime or allow overlapping reads and animation', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const warnings = [];
    t.mock.method(console, 'warn', message => warnings.push(message));
    const { state, create } = fixture();
    const handle = await create();
    let ready = false, inspected = false, disposed = false;
    const readiness = handle.ready().then(() => { ready = true; });
    await turn();
    assert.equal(state.reads, 1);
    t.mock.timers.tick(30000);
    await turn();
    assert.equal(warnings.length, 1, 'timeout still reports promptly');
    assert.equal(ready, false);
    handle.update(1);
    assert.equal(state.draws, 1, 'native draw completion alone cannot restart animation');
    const read = handle.readStage(() => { inspected = true; });
    const readRejected = assert.rejects(read, /closed stage/);
    const disposal = handle.dispose().then(() => { disposed = true; });
    await turn();
    assert.equal(inspected, false);
    assert.equal(disposed, false);
    assert.equal(state.driverDeletes, 0);
    assert.equal(state.attributeDeletes, 0);
    state.query.resolve(true);
    await Promise.all([readiness, readRejected, disposal]);
    assert.equal(state.driverDeletes, 1);
    assert.equal(state.attributeDeletes, 1);
});

test('shadow read rejection remains visible to ready and inspection while cleanup releases native ownership', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    t.mock.method(console, 'warn', () => {});
    const logged = [];
    t.mock.method(console, 'error', (...message) => logged.push(message));
    const { state, create } = fixture();
    const handle = await create();
    const failure = new Error('Shadow value resolution failed');
    const ready = assert.rejects(handle.ready(), error => error === failure);
    await turn();
    t.mock.timers.tick(30000);
    await turn();
    state.query.reject(failure);
    await ready;
    await assert.rejects(handle.readStage(() => assert.fail('must not inspect after failed draw')), error => error === failure);
    await handle.dispose();
    assert.ok(logged.some(message => message.includes(failure)));
    assert.equal(state.driverDeletes, 1);
    assert.equal(state.attributeDeletes, 1);
});

test('asynchronous constructor failure and missing stage clean up partial handles', async () => {
    const failure = new Error('Stage composition failed');
    const failed = fixture({ factory: () => Promise.reject(failure) });
    await assert.rejects(failed.create(), error => error === failure);
    assert.equal(failed.scene.children.length, 0);
    const missing = fixture({ hasStage: false });
    await assert.rejects(missing.create(), /Failed to open USD stage/);
    assert.equal(missing.state.driverDeletes, 1, 'missing-stage driver is deleted exactly once');
    assert.equal(missing.scene.children.length, 0);
});
