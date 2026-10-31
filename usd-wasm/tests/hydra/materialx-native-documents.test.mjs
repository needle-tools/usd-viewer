import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {test} from 'node:test';
import {Group} from 'three';
import {getUsdModule} from '../runtime.mjs';
import {ThreeRenderDelegateInterface} from '../../src/hydra/ThreeJsRenderDelegate.js';

const materialStage = (outputs, shaders) => `#usda 1.0
def Xform "World" {
    def Material "Material" {
        ${outputs}
        ${shaders}
    }
    def Cube "Shape" (prepend apiSchemas = ["MaterialBindingAPI"]) {
        rel material:binding = </World/Material>
    }
}`;
const preview = `def Shader "Preview" {
    uniform token info:id = "UsdPreviewSurface"
    color3f inputs:diffuseColor = (0.2, 0.6, 0.4)
    token outputs:surface
}`;

async function documents(USD, path, source) {
    USD.FS_createDataFile('/tmp', path, new TextEncoder().encode(source), true, true);
    const captured = [];
    const delegate = new ThreeRenderDelegateInterface({usdRoot:new Group()});
    const create = delegate.createSPrim.bind(delegate);
    delegate.createSPrim = (type, id) => {
        const prim = create(type, id);
        if (type === 'material') {
            prim.updateMaterialXDocument = document => captured.push(document);
            // Capture native documents without compiling browser materials in Node.
            prim.updateFinished = () => {};
        }
        return prim;
    };
    let driver;
    try {
        driver = await new USD.HdWebSyncDriver(delegate, `/tmp/${path}`);
        await new Promise((resolve, reject) => driver.DrawAsync(resolve, reject));
        await delegate.waitForRprimsReady();
        return captured;
    } finally {
        driver?.delete();
        delegate.dispose();
        USD.FS_unlink(`/tmp/${path}`);
    }
}

test('native MaterialX serialization works after a preview-only stage and retains mixed terminals and custom graphs', async () => {
    const USD = await getUsdModule({print(){}, printErr(){}});
    const previewOnly = materialStage('token outputs:surface.connect = </World/Material/Preview.outputs:surface>', preview);
    assert.deepEqual(await documents(USD, 'preview-first.usda', previewOnly), []);

    const mixed = materialStage(`
        token outputs:surface.connect = </World/Material/Preview.outputs:surface>
        token outputs:mtlx:displacement.connect = </World/Material/Displacement.outputs:out>
    `, preview + `
        def Shader "Displacement" {
            uniform token info:id = "ND_displacement_float"
            float inputs:displacement = 0.1
            token outputs:out
        }
    `);
    const mixedDocuments = await documents(USD, 'mixed-terminals.usda', mixed);
    assert.ok(mixedDocuments.some(document => document.terminal === 'displacement' && document.xml.includes('displacement')));
    assert.ok(mixedDocuments.every(document => document.terminal !== 'surface'), 'PreviewSurface remains on its native preview path');

    const graphs = new URL('../fixtures/coverage/materialx/graphs/', import.meta.url);
    const copiedGraphs = [];
    USD.FS_createPath('/tmp', 'graphs', true, true);
    try {
        for (const name of await readdir(graphs)) {
            if (!name.endsWith('.mtlx')) continue;
            USD.FS_createDataFile('/tmp/graphs', name, await readFile(new URL(name, graphs)), true, true);
            copiedGraphs.push(name);
        }
        for (const name of ['nested', 'wrapped-standard_surface', 'jade-plume']) {
            const source = await readFile(new URL(`../fixtures/coverage/materialx/${name}.usda`, import.meta.url), 'utf8');
            const result = await documents(USD, `${name}.usda`, source);
            assert.ok(result.length > 0, `${name} emits a native MaterialX document`);
            assert.ok(result.every(document => document.xml.includes('<materialx')));
        }
    } finally {
        for (const name of copiedGraphs) USD.FS_unlink(`/tmp/graphs/${name}`);
    }
    assert.deepEqual(await documents(USD, 'preview-last.usda', previewOnly), []);
});
