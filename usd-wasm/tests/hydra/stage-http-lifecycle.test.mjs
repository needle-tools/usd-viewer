import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Worker } from 'node:worker_threads';
import { test } from 'node:test';
import { Group } from 'three';
import { getUsdModule } from '../runtime.mjs';
import { createThreeHydra } from '../../src/create.three.js';

test('sequential HTTP stages reload distinct payloads sharing a relative filename', async () => {
    // The HTTP resolver reports loaded files through the browser/worker global.
    const previousSelf = globalThis.self;
    globalThis.self = globalThis;
    const root = '#usda 1.0\n( subLayers = [@payloads/base.usda@] )\n';
    const payload = (name, x, color) => `#usda 1.0
def Mesh "${name}" {
    uniform token subdivisionScheme = "none"
    int[] faceVertexCounts = [3]
    int[] faceVertexIndices = [0, 1, 2]
    point3f[] points = [(0, 0, 0), (${x}, 0, 0), (0, 1, 0)]
    color3f[] primvars:displayColor = [${color}]
}
`;
    const files = new Map([
        ['/first/first.usda', root],
        ['/first/payloads/base.usda', payload('First', 1, '(1, 0, 0)')],
        ['/second/second.usda', root],
        ['/second/payloads/base.usda', payload('Second', 3, '(0, 1, 0)')],
    ]);
    const requests = [];
    const server = createServer((request, response) => {
        requests.push(request.url);
        const contents = files.get(request.url);
        response.writeHead(contents === undefined ? 404 : 200, { 'Content-Type': 'text/plain' });
        response.end(contents ?? 'Not found');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const USD = await getUsdModule({ print() {}, printErr() {} });
    try {
        for (const [directory, name, x, color] of [
            ['first', 'First', 1, [1, 0, 0]],
            ['second', 'Second', 3, [0, 1, 0]],
        ]) {
            const scene = new Group();
            const handle = await createThreeHydra({ USD, scene, url: `${origin}/${directory}/${directory}.usda` });
            try {
                await handle.ready();
                await handle.materialsReady();
                const mesh = scene.children.find(object => object.isMesh);
                assert.ok(mesh, `${directory} stage has geometry`);
                assert.equal(mesh.name, name);
                assert.equal(Math.max(...mesh.geometry.attributes.position.array), x);
                assert.deepEqual(mesh.material.color.toArray(), color);
            } finally { await handle.dispose(); }
        }
        assert.ok(requests.includes('/second/payloads/base.usda'), 'the second payload is fetched from its own URL');
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        if (previousSelf === undefined) delete globalThis.self;
        else globalThis.self = previousSelf;
    }
});

test('live HTTP stages isolate same-named payloads and keep the survivor usable after disposal', async () => {
    const previousSelf = globalThis.self;
    globalThis.self = globalThis;
    const root = '#usda 1.0\n( subLayers = [@../payloads/base.usda@] )\n';
    const payload = (name, width, color) => `#usda 1.0
 def Mesh "${name}" {
    uniform token subdivisionScheme = "none"
    int[] faceVertexCounts = [3]
    int[] faceVertexIndices = [0, 1, 2]
    point3f[] points = [(0, 0, 0), (${width}, 0, 0), (0, 1, 0)]
    double3 xformOp:translate = (0, 0, 0)
    uniform token[] xformOpOrder = ["xformOp:translate"]
    rel material:binding = </Material>
 }
 def Material "Material" {
    token outputs:surface.connect = </Material/Preview.outputs:surface>
    def Shader "Preview" {
        uniform token info:id = "UsdPreviewSurface"
        color3f inputs:diffuseColor = ${color}
        token outputs:surface
    }
 }
`;
    const files = new Map([
        ['/first/scenes/root.usda', root], ['/second/scenes/root.usda', root],
        ['/first/payloads/base.usda', payload('First', 1, '(1, 0, 0)')],
        ['/second/payloads/base.usda', payload('Second', 3, '(0, 1, 0)')],
        ['/first/scenes/late.txt', 'first'], ['/second/scenes/late.txt', 'second'],
        ['/second/scenes/survivor.txt', 'still-owned'],
    ]);
    const requests = [];
    const server = createServer((request, response) => {
        requests.push(request.url);
        const contents = files.get(request.url);
        response.writeHead(contents === undefined ? 404 : 200);
        response.end(contents ?? 'Not found');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const USD = await getUsdModule({ print() {}, printErr() {} });
    // Absolute referenced layers use separate URL directories in the same
    // scope; neither may change the base for late relative asset lookups.
    for (const directory of ['first', 'second']) {
        const payloadPath = `/${directory}/payloads/base.usda`;
        files.set(payloadPath, files.get(payloadPath).replace('#usda 1.0',
            `#usda 1.0\n( subLayers = [@${origin}/external/${directory}/metadata.usda@] )`));
        files.set(`/external/${directory}/metadata.usda`, `#usda 1.0\ndef Scope "${directory}Metadata" {}\n`);
    }
    const handles = [];
    try {
        const scenes = [];
        for (const directory of ['first', 'second']) {
            const scene = new Group();
            scenes.push(scene);
            const handle = await createThreeHydra({ USD, scene, url: `${origin}/${directory}/scenes/root.usda` });
            handles.push(handle);
            await handle.ready();
            await handle.materialsReady();
        }
        const meshes = scenes.map(scene => scene.children.find(object => object.isMesh));
        assert.deepEqual(meshes.map(mesh => mesh.name), ['First', 'Second']);
        assert.deepEqual(meshes.map(mesh => Math.max(...mesh.geometry.attributes.position.array)), [1, 3]);
        assert.deepEqual(meshes.map(mesh => mesh.material.color.toArray()), [[1, 0, 0], [0, 1, 0]]);
        const roots = handles.map(handle => handle.driver.GetStage().GetRootLayer().GetRealPath());
        assert.notEqual(roots[0], roots[1], 'same basename has distinct native layer identity');
        assert.ok(roots.every(path => path.includes('/1/1/1/1/1/1/')), 'parent-traversal padding is retained');
        for (let i = 0; i < handles.length; i++) {
            const content = await new Promise(resolve => handles[i].driver.getFile(roots[i].replace(/root.usda$/, 'late.txt'), bytes => resolve(new TextDecoder().decode(bytes))));
            assert.equal(content, i ? 'second' : 'first', 'late lookup must use the owning stage URL');
        }
        await handles[0].dispose();
        assert.equal(USD.FS_analyzePath(roots[0]).exists, false, 'disposed scope cache is released');
        assert.equal(USD.FS_analyzePath(roots[1]).exists, true, 'surviving scope cache remains');
        const survivorAsset = await new Promise(resolve => handles[1].driver.getFile(
            roots[1].replace(/root.usda$/, 'survivor.txt'),
            bytes => resolve(new TextDecoder().decode(bytes))));
        assert.equal(survivorAsset, 'still-owned', 'survivor can fetch new assets after other disposal');
        await handles[1].editStage(stage => {
            assert.equal(stage.GetPrimAtPath('/Second').GetAttribute('xformOp:translate').SetVec3d(4, 0, 0, Number.NaN), true);
        });
        assert.equal(meshes[1].matrix.elements[12], 4);
        assert.deepEqual(meshes[1].material.color.toArray(), [0, 1, 0]);
        await handles[1].refresh();
        assert.ok(requests.includes('/second/payloads/base.usda'));
        assert.ok(requests.includes('/external/first/metadata.usda'));
        assert.ok(requests.includes('/external/second/metadata.usda'));
        await handles[1].dispose();
        assert.equal(USD.FS_analyzePath(roots[1]).exists, false);
    } finally {
        for (const handle of handles) await handle.dispose();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        if (previousSelf === undefined) delete globalThis.self;
        else globalThis.self = previousSelf;
    }
});

test('legacy runtime guard rejects a second live handle before opening it and permits sequential loads', async () => {
    const USD = await getUsdModule({ print() {}, printErr() {} });
    const prototype = USD.HdWebSyncDriver.prototype;
    const capability = Object.getOwnPropertyDescriptor(prototype, 'HasScopedHttpCache');
    if (capability) delete prototype.HasScopedHttpCache;
    const source = new TextEncoder().encode('#usda 1.0\ndef Xform "Root" {}\n');
    let first;
    let next;
    try {
        first = await createThreeHydra({ USD, scene: new Group(), url: 'legacy.usda', buffer: source.buffer });
        await first.ready();
        await assert.rejects(createThreeHydra({ USD, scene: new Group(), url: 'https://must-not-fetch.invalid/root.usda' }), /one live Hydra handle/);
        await first.dispose();
        next = await createThreeHydra({ USD, scene: new Group(), url: 'legacy.usda', buffer: source.buffer });
        await next.ready();
    } finally {
        await first?.dispose();
        await next?.dispose();
        if (capability) Object.defineProperty(prototype, 'HasScopedHttpCache', capability);
    }
});

test('failed imports and failed native stage opens release their private files and allow retry', async () => {
    const USD = await getUsdModule({ print() {}, printErr() {} });
    const directories = () => USD.FS_analyzePath('/needle').exists
        ? USD.FS_readdir('/needle').filter(name => name !== '.' && name !== '..').sort() : [];
    const before = directories();
    const valid = new TextEncoder().encode('#usda 1.0\ndef Xform "Root" {}\n');
    await assert.rejects(createThreeHydra({ USD, scene: new Group(), files: [
        { name: 'root.usda', path: 'root.usda', arrayBuffer: async () => valid.buffer },
        { name: 'broken.usda', path: 'broken.usda', arrayBuffer: async () => { throw new Error('fixture read failed'); } },
    ] }), /fixture read failed/);
    assert.deepEqual(directories(), before, 'partial uploaded files are removed');
    await assert.rejects(createThreeHydra({ USD, scene: new Group(), url: 'invalid.usda',
        buffer: new TextEncoder().encode('#usda 1.0\nthis is not valid USD').buffer }), /Failed to open USD stage/);
    assert.deepEqual(directories(), before, 'native open failure removes its imported file');
    const retry = await createThreeHydra({ USD, scene: new Group(), url: 'retry.usda', buffer: valid.buffer });
    await retry.ready();
    await retry.dispose();
    assert.deepEqual(directories(), before);
});


test('mixed relative and absolute HTTP sibling sublayers compose in authored order', async () => {
    const previousSelf = globalThis.self;
    globalThis.self = globalThis;
    // USD can synchronously wait for TBB layer-reader workers. The HTTP server
    // must have an independent event loop, as a real browser's server does.
    const server = new Worker(`
        const { parentPort, workerData } = require('node:worker_threads');
        const { createServer } = require('node:http');
        const files = new Map(workerData);
        const server = createServer((request, response) => {
            const source = files.get(request.url);
            response.writeHead(source === undefined ? 404 : 200, { 'Content-Type': 'text/plain' });
            response.end(source?.replaceAll('__ORIGIN__', 'http://127.0.0.1:' + server.address().port) ?? 'Not found');
        });
        server.listen(0, '127.0.0.1', () => parentPort.postMessage(server.address().port));
    `, { eval: true, workerData: [
        ['/scene/root.usda', '#usda 1.0\n( subLayers = [@../payloads/geometry.usda@, @__ORIGIN__/external/metadata.usda@] )\n'],
        ['/payloads/geometry.usda', `#usda 1.0
            def Scope "Composed" {
                custom string user:strength = "relative"
            }
            def Mesh "Triangle" {
                uniform token subdivisionScheme = "none"
                int[] faceVertexCounts = [3]
                int[] faceVertexIndices = [0, 1, 2]
                point3f[] points = [(0, 0, 0), (2, 0, 0), (0, 1, 0)]
            }
        `],
        ['/external/metadata.usda', `#usda 1.0
            def Scope "Composed" {
                custom string user:strength = "absolute"
            }
            def Scope "Metadata" {}
        `],
    ] });
    let handle;
    try {
        const port = await new Promise((resolve, reject) => {
            server.once('message', resolve);
            server.once('error', reject);
        });
        const USD = await getUsdModule({ print() {}, printErr() {} });
        const scene = new Group();
        handle = await createThreeHydra({ USD, scene, url: `http://127.0.0.1:${port}/scene/root.usda` });
        await handle.ready();
        const stage = handle.driver.GetStage();
        assert.equal(stage.GetPrimAtPath('/Metadata').GetName(), 'Metadata', 'absolute sibling is composed');
        assert.equal(await stage.GetPrimAtPath('/Composed').GetAttribute('user:strength').GetValueString(), 'relative',
            'earlier sibling retains its stronger authored opinion');
        const mesh = scene.children.find(object => object.isMesh);
        assert.equal(mesh?.name, 'Triangle', 'relative sibling contributes geometry');
        assert.equal(Math.max(...mesh.geometry.attributes.position.array), 2);
    } finally {
        await handle?.dispose();
        await server.terminate();
        if (previousSelf === undefined) delete globalThis.self;
        else globalThis.self = previousSelf;
    }
});
