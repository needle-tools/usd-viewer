import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMaterialXVolumeMaterial } from '../../src/hydra/materialxVolume.js';
import { hasMaterialXVolume } from '../../src/hydra/materialxVolumeSupport.js';
import { Group } from 'three';
import { ThreeRenderDelegateInterface } from '../../src/hydra/ThreeJsRenderDelegate.js';

test('volume routing recognizes MaterialX material nodes', () => {
    assert.equal(hasMaterialXVolume('<volumematerial name="M" type="material"/>'), true);
    assert.equal(hasMaterialXVolume('<surfacematerial name="M"/>'), false);
});

test('bounded volumes reject incompatible renderers before shader generation', async () => {
    await assert.rejects(createMaterialXVolumeMaterial('', 0, { renderer: { isWebGLRenderer: true } }), /legacy WebGLRenderer/);
    await assert.rejects(createMaterialXVolumeMaterial('', 0, { renderer: { isWebGPURenderer: true, samples: 4 } }), /single-sample depth/);
});

test('a volume without the optional factory reports failure instead of claiming surface success', async () => {
    const delegate = new ThreeRenderDelegateInterface({ usdRoot: new Group() });
    const material = delegate.createSPrim('material', '/Medium');
    const warnings = [];
    const previousWarn = console.warn;
    console.warn = (...args) => warnings.push(args.map(String).join(' '));
    try {
        const result = await material.createMaterialXMaterial({ terminal: 'volume', xml: '<materialx version="1.39"><volumematerial name="Medium" type="material"/></materialx>' });
        assert.equal(result, null);
        assert.equal(delegate.getDiagnostics().materialXCreateSuccess, 0);
        assert.equal(delegate.getDiagnostics().materialXCreateFailures, 1);
        assert.ok(warnings.some(message => message.includes('@needle-tools/usd/volumes') && message.includes('materialXVolumeFactory')));
    } finally {
        console.warn = previousWarn;
        delegate.dispose();
    }
});
