import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera, Mesh, BoxGeometry, ShaderMaterial } from 'three';
import { createRenderModes } from '../../src/renderers/index.js';
function setup(loadPathTracer) {
    const scene = new Scene(), camera = new PerspectiveCamera();
    const renderer = { domElement: { style: { opacity: '0.7' } }, toneMappingExposure: 1, render() {}, getDrawingBufferSize(target) { return target.set(100, 80); } };
    const canvas = { hidden: false };
    return { scene, renderer, canvas, create: () => createRenderModes({ scene, camera, renderer, canvas, loadPathTracer }) };
}

test('cancelling or disposing a pending path tracer releases its device without changing caller-owned DOM', async () => {
    for (const dispose of [false, true]) {
        let finish, started;
        const initialized = new Promise(resolve => { started = resolve; });
        let engine;
        class Engine {
            constructor() { engine = this; this.disposals = 0; }
            init() { started(); return new Promise(resolve => { finish = resolve; }); }
            dispose() { this.disposals++; }
        }
        const state = setup(async () => ({ Engine })), modes = await state.create();
        const pending = modes.setMode('pathtraced');
        await initialized;
        if (dispose) modes.dispose(); else await modes.setMode('basic');
        finish(); await pending;
        assert.equal(engine.disposals, 1);
        assert.equal(modes.mode, 'basic');
        assert.equal(state.renderer.domElement.style.opacity, '0.7');
        modes.dispose(); modes.dispose();
        assert.equal(engine.disposals, 1);
        assert.equal(state.canvas.hidden, false);
    }
});

test('unsupported custom shaders keep the current view and never load the optional tracer', async () => {
    let imports = 0;
    const state = setup(async () => { imports++; throw new Error('must not load'); });
    const mesh = new Mesh(new BoxGeometry(), new ShaderMaterial()); state.scene.add(mesh);
    const modes = await state.create();
    await assert.rejects(modes.setMode('pathtraced'), /does not yet support ShaderMaterial/);
    assert.equal(modes.mode, 'basic'); assert.equal(imports, 0);
    assert.equal(state.renderer.domElement.style.opacity, '0.7');
    modes.dispose(); mesh.geometry.dispose(); mesh.material.dispose();
});

test('bloom settings reject invalid values atomically and remain optional on legacy renderers', async () => {
    const state = setup(), modes = await state.create();
    assert.equal(modes.settings.bloom, false);
    for (const settings of [{bloom:true}, {bloom:'yes'}, {bloomStrength:Infinity}, {bloomThreshold:-1}, {bloomRadius:1.01}]) {
        const before = modes.settings;
        await assert.rejects(modes.setSettings(settings), /Bloom|bloom/);
        assert.deepEqual(modes.settings, before);
    }
    await modes.setSettings({bloomStrength:2,bloomRadius:0.75,bloomThreshold:3});
    assert.equal(modes.settings.bloomStrength,2);
    modes.dispose();
});
