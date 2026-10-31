import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { getUsdModule } from '../runtime.mjs';
import { createThreeHydra } from '../../src/create.three.js';
import { createVdbVolumeMesh } from '../../src/hydra/materialxVolume.js';
import { VDBLoader } from '../../src/vendor/vdb/VDBLoader.js';

const root = new URL('../fixtures/coverage/advanced/', import.meta.url);
const buffer = async name => { const bytes = await readFile(new URL(name, root)); return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); };

test('VDB decoder preserves real density and heat voxels, grid transforms and valid empty frames', async () => {
    const grids = new VDBLoader().setGridNames(['density', 'heat']).parse(await buffer('densityAndHeat.vdb'));
    assert.deepEqual(grids.map(grid => grid.name), ['density', 'heat']);
    assert.deepEqual(grids.map(grid => grid.texture.image.data.reduce((n, value) => n + (value > 0), 0)), [6124, 5224]);
    assert.deepEqual(grids.map(grid => [grid.texture.image.width, grid.texture.image.height, grid.texture.image.depth]), [[23, 23, 42], [22, 21, 32]]);
    assert.ok(Math.abs(grids[0].transform.elements[0] - .7033765912) < 1e-8);
    const empty = new VDBLoader().setGridNames(['density']).parse(await buffer('smoke_000001.vdb'));
    assert.equal(empty[0].texture, null);
    for (const grid of grids) grid.texture.dispose();
});

test('a standalone VDB mesh exposes its world bounds before the first render', async () => {
    const mesh = await createVdbVolumeMesh({ fields: [{ name: 'density', fieldName: 'density', filePath: 'densityAndHeat.vdb' }] },
        { renderer: { isWebGPURenderer: true, samples: 0 }, readFile: () => buffer('densityAndHeat.vdb') });
    try {
        const bounds = new Box3().setFromObject(mesh);
        for (const [actual, expected] of [[bounds.min.toArray(), [-8.088831, -8.088831, -2.283032]],
            [bounds.max.toArray(), [8.088831, 8.088831, 27.808083]]]) {
            actual.forEach((value, axis) => assert.ok(Math.abs(value - expected[axis]) < 1e-5));
        }
    } finally {
        mesh.geometry.dispose(); mesh.material.dispose();
        for (const texture of mesh.userData.usdVolumeTextures) texture.dispose();
    }
});

test('real USD VDB fields load, become empty, restore and release their textures', async () => {
    const USD = await getUsdModule({ print() {}, printErr() {} });
    const names = ['volume-sequence.usda', 'smoke_000001.vdb', 'smoke_000002.vdb'];
    const files = names.map(name => ({ name, path: name, arrayBuffer: () => buffer(name) }));
    const scene = new Group();
    const handle = await createThreeHydra({ USD, scene, files, renderer: { isWebGPURenderer: true, samples: 0 },
        usdVolumeFactory: async (state, options) => {
            // A field can arrive after the native draw, e.g. over HTTP.
            await new Promise(resolve => setTimeout(resolve, 30));
            return createVdbVolumeMesh(state, options);
        } });
    try {
        await handle.ready();
        for (const [time, empty] of [[1, false], [24, true], [48, false]]) {
            await handle.setTime(time);
            let volume;
            scene.traverse(object => { if (object.userData.usdVolumeFields) volume = object; });
            assert.ok(volume, `volume state exists at frame ${time}`);
            assert.equal(Boolean(volume.userData.usdVolumeEmpty), empty);
            if (!empty) assert.deepEqual(volume.userData.usdVolumeFields[0].dimensions, [51, 49, 80]);
        }
        let texture;
        scene.traverse(object => { texture ||= object.userData.usdVolumeTextures?.[0]; });
        let disposed = 0; texture.addEventListener('dispose', () => disposed++);
        await handle.dispose();
        assert.equal(disposed, 1);
    } finally { await handle.dispose(); }
});

for (const rejectSibling of [false, true]) test(`disposing during an async VDB factory keeps its reader alive (rejected sibling: ${rejectSibling})`, async () => {
    const USD = await getUsdModule({ print() {}, printErr() {} });
    const names = ['volume-sequence.usda', 'smoke_000001.vdb', 'smoke_000002.vdb'];
    const files = names.map(name => ({ name, path: name, arrayBuffer: () => buffer(name) }));
    if (rejectSibling) files[0].arrayBuffer = async () => {
        const source = new TextDecoder().decode(await buffer(names[0]));
        return new TextEncoder().encode(source + '\ndef Volume "Other" {\n custom rel field:density = </World/Density>\n}\n').buffer;
    };
    let entered, release, rejectFactory;
    const started = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const failureGate = new Promise(resolve => { rejectFactory = resolve; });
    const scene = new Group();
    let bytesRead = 0, geometryDisposals = 0, materialDisposals = 0, calls = 0;
    const handle = await createThreeHydra({ USD, scene, files, usdVolumeFactory: async (state, options) => {
        if (rejectSibling && calls++ === 0) { await failureGate; throw new Error('Rejected sibling factory'); }
        entered();
        await gate;
        bytesRead = (await options.readFile(state.fields[0])).byteLength;
        const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
        geometry.addEventListener('dispose', () => geometryDisposals++);
        material.addEventListener('dispose', () => materialDisposals++);
        return new Mesh(geometry, material);
    } });
    const ready = handle.ready();
    // Observe rejection immediately too, so the pre-fix failure is not unhandled.
    ready.catch(() => {});
    try {
        await started;
        const disposing = handle.dispose();
        while (handle.driver.IsDrawPending()) await new Promise(resolve => setImmediate(resolve));
        await new Promise(resolve => setImmediate(resolve));
        rejectFactory();
        await new Promise(resolve => setImmediate(resolve));
        const driverAliveDuringRead = !handle.driver.isDeleted();
        release();
        await Promise.all([rejectSibling ? assert.rejects(ready, /Rejected sibling factory/) : ready, disposing]);
        assert.equal(driverAliveDuringRead, true);
        assert.ok(bytesRead > 0, 'pending factory can still read its staged VDB bytes');
        assert.equal(handle.driver.isDeleted(), true);
        assert.equal(geometryDisposals, 1);
        assert.equal(materialDisposals, 1);
        assert.equal(scene.children.length, 0);
    } finally { rejectFactory(); release(); await handle.dispose(); }
});
