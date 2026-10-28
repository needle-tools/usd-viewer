import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group } from 'three';
import { getUsdModule } from '../../src/bindings/index.js';
import { createThreeHydra } from '../../src/create.three.js';

const stage = (material, shaders, meshProperties = '') => `#usda 1.0
(
    startTimeCode = 1
    endTimeCode = 2
)
def Xform "World" {
    def Material "Material" {
        token outputs:mdl:surface.connect = </World/Material/Shader.outputs:out>
        ${material}
        ${shaders}
    }
    def Mesh "Triangle" (prepend apiSchemas = ["MaterialBindingAPI"]) {
        ${meshProperties}
        uniform token subdivisionScheme = "none"
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]
        color3f[] primvars:displayColor = [(1, 0, 0)]
        rel material:binding = </World/Material>
    }
}`;

const shader = (inputs = '', module = 'OmniPBR', identifier = module) => `
    def Shader "Shader" {
        uniform token info:implementationSource = "sourceAsset"
        uniform asset info:mdl:sourceAsset = @${module}.mdl@
        uniform token info:mdl:sourceAsset:subIdentifier = "${identifier}"
        ${inputs}
        token outputs:out
    }
`;

const nativeDiagnostics = [];

async function inspect(source, callback) {
    const USD = await getUsdModule({ print() {}, printErr(message) { nativeDiagnostics.push(String(message)); } });
    const diagnosticsStart = nativeDiagnostics.length;
    const scene = new Group();
    const handle = await createThreeHydra({ USD, scene, url: 'mdl-bridge-regression.usda', buffer: new TextEncoder().encode(source) });
    try {
        await handle.ready();
        await handle.materialsReady();
        const mesh = scene.children.find(object => object.isMesh);
        assert.ok(mesh?.visible);
        await callback(mesh.material, handle.diagnostics(), {
            handle, mesh, nativeMessages: () => nativeDiagnostics.slice(diagnosticsStart),
        });
    } finally { await handle.dispose(); }
}

test('real Hydra extracts OmniPBR authored and Material interface inputs without an MDL compiler', async () => {
    await inspect(stage('color3f inputs:tint = (0.25, 0.5, 0.75)', shader(`
        color3f inputs:diffuse_color_constant.connect = </World/Material.inputs:tint>
        float inputs:reflection_roughness_constant = 0.125
        float inputs:metallic_constant = 0.75
    `)), (material, diagnostics) => {
        assert.deepEqual(material.color.toArray(), [0.25, 0.5, 0.75]);
        assert.equal(material.roughness, 0.125);
        assert.equal(material.metalness, 0.75);
        assert.equal(material.userData.usdMdlApproximation, 'OmniPBR');
        assert.equal(diagnostics.materialFallbacks, 0);
    });
});

test('real Hydra extracts glTF MDL color4 alpha and masking', async () => {
    await inspect(stage('', shader(`
        color4f inputs:base_color_factor = (0.25, 0.5, 0.75, 0.25)
        float inputs:metallic_factor = 0
        float inputs:roughness_factor = 0.5
        int inputs:alpha_mode = 1
        float inputs:alpha_cutoff = 0.5
    `, 'pbr_2', 'gltf_material')), material => {
        assert.deepEqual(material.color.toArray(), [0.25, 0.5, 0.75]);
        assert.equal(material.opacity, 0.25);
        assert.equal(material.alphaTest, 0.5);
        assert.equal(material.transparent, false);
        assert.equal(material.metalness, 0);
    });
});

test('real Hydra prefers a universal PreviewSurface over an MDL terminal', async () => {
    await inspect(stage('token outputs:surface.connect = </World/Material/Preview.outputs:surface>', shader() + `
        def Shader "Preview" {
            uniform token info:id = "UsdPreviewSurface"
            color3f inputs:diffuseColor = (0, 1, 0)
            token outputs:surface
        }
    `), (material, _diagnostics, { nativeMessages }) => {
        assert.deepEqual(material.color.toArray(), [0, 1, 0]);
        assert.equal(material.userData.usdMdlApproximation, undefined);
        assert.deepEqual(nativeMessages().filter(message => message.includes('Invalid info:id')), [],
            'a preferred PreviewSurface must not trigger an unused MDL network build');
    });
});

test('real Hydra falls back deterministically for connected MDL expressions', async () => {
    await inspect(stage('', shader('color3f inputs:diffuse_color_constant.connect = </World/Material/Procedural.outputs:out>') + `
        def Shader "Procedural" {
            uniform token info:implementationSource = "sourceAsset"
            uniform asset info:mdl:sourceAsset = @CustomPattern.mdl@
            uniform token info:mdl:sourceAsset:subIdentifier = "CustomPattern"
            color3f outputs:out
        }
    `), (material, diagnostics) => {
        assert.deepEqual(material.color.toArray(), [1, 0, 0]);
        assert.equal(material.userData.usdMdlApproximation, undefined);
        assert.equal(diagnostics.materialFallbacks, 1);
    });
});


test('real Hydra refreshes live Material and NodeGraph interface edits without repopulation', async () => {
    await inspect(stage(`
        color3f inputs:tint = (0.25, 0.5, 0.75)
        def NodeGraph "Interface" {
            color3f inputs:tint.connect = </World/Material.inputs:tint>
            float inputs:roughness = 0.25
        }
    `, shader(`
        color3f inputs:diffuse_color_constant.connect = </World/Material/Interface.inputs:tint>
        float inputs:reflection_roughness_constant.connect = </World/Material/Interface.inputs:roughness>
    `)), async (material, _diagnostics, { handle, mesh }) => {
        assert.deepEqual(material.color.toArray(), [0.25, 0.5, 0.75]);
        assert.equal(material.roughness, 0.25);
        // editStage waits for any pending draw and draws the same native stage
        // after authoring; it does not call Repopulate or create a new driver.
        const driver = handle.driver;
        await handle.editStage(usdStage => {
            const input = usdStage.GetPrimAtPath('/World/Material').GetAttribute('inputs:tint');
            assert.equal(input.SetColor3f(0.75, 0.25, 0.5, Number.NaN), true);
        });
        await handle.materialsReady();
        assert.deepEqual(mesh.material.color.toArray(), [0.75, 0.25, 0.5]);
        await handle.editStage(usdStage => {
            const input = usdStage.GetPrimAtPath('/World/Material/Interface').GetAttribute('inputs:roughness');
            assert.equal(input.SetFloat(0.75, Number.NaN), true);
        });
        await handle.materialsReady();
        assert.equal(mesh.material.roughness, 0.75);
        assert.equal(handle.driver, driver);
        assert.equal(mesh.material.userData.usdMdlApproximation, 'OmniPBR');
    });
});

test('real Hydra follows animated Material and NodeGraph interface samples on SetTime', async () => {
    await inspect(stage(`
        color3f inputs:tint.timeSamples = { 1: (1, 0, 0), 2: (0, 0, 1) }
        def NodeGraph "Interface" {
            color3f inputs:tint.connect = </World/Material.inputs:tint>
            float inputs:roughness.timeSamples = { 1: 0.25, 2: 0.75 }
        }
    `, shader(`
        color3f inputs:diffuse_color_constant.connect = </World/Material/Interface.inputs:tint>
        float inputs:reflection_roughness_constant.connect = </World/Material/Interface.inputs:roughness>
    `)), async (_material, _diagnostics, { handle, mesh }) => {
        for (const [time, color, roughness] of [
            [1, [1, 0, 0], 0.25],
            [1.5, [0.5, 0, 0.5], 0.5],
            [2, [0, 0, 1], 0.75],
            [1, [1, 0, 0], 0.25],
        ]) {
            await handle.setTime(time);
            await handle.materialsReady();
            assert.equal(handle.getTime(), time);
            assert.deepEqual(mesh.material.color.toArray(), color);
            assert.equal(mesh.material.roughness, roughness);
        }
    });
});

test('real Hydra animates a preferred PreviewSurface when its paired MDL terminal is static', async () => {
    await inspect(stage(`
        token outputs:surface.connect = </World/Material/Preview.outputs:surface>
        color3f inputs:previewTint.timeSamples = { 1: (0, 1, 0), 2: (0, 0, 1) }
    `, shader('color3f inputs:diffuse_color_constant = (1, 0, 0)') + `
        def Shader "Preview" {
            uniform token info:id = "UsdPreviewSurface"
            color3f inputs:diffuseColor.connect = </World/Material.inputs:previewTint>
            float inputs:roughness = 0.5
            token outputs:surface
        }
    `), async (_material, _diagnostics, { handle, mesh }) => {
        for (const [time, color] of [[1, [0, 1, 0]], [2, [0, 0, 1]], [1, [0, 1, 0]]]) {
            await handle.setTime(time);
            await handle.materialsReady();
            assert.deepEqual(mesh.material.color.toArray(), color);
            assert.equal(mesh.material.userData.usdMdlApproximation, undefined);
        }
    });
});

test('ordinary static MaterialX is not reserialized for transform edits or playback time', async () => {
    const source = stage(`
        token outputs:mtlx:surface.connect = </World/Material/Shader.outputs:out>
    `, `
        def Shader "Shader" {
            uniform token info:id = "ND_standard_surface_surfaceshader"
            color3f inputs:base_color = (0.25, 0.5, 0.75)
            float inputs:base = 1
            token outputs:out
        }
    `, `
        double3 xformOp:translate.timeSamples = { 1: (0, 0, 0), 2: (1, 0, 0) }
        uniform token[] xformOpOrder = ["xformOp:translate"]
    `).replace('        token outputs:mdl:surface.connect = </World/Material/Shader.outputs:out>\n', '');
    await inspect(source, async (_material, diagnostics, { handle, mesh }) => {
        assert.ok(diagnostics.materialXDocuments > 0, 'test must exercise native MaterialX document serialization');
        const documentCount = diagnostics.materialXDocuments;
        const createCount = diagnostics.materialXCreateAttempts;
        for (const time of [1, 1.5, 2]) {
            await handle.setTime(time);
            await handle.materialsReady();
            assert.equal(handle.diagnostics().materialXDocuments, documentCount);
            assert.equal(handle.diagnostics().materialXCreateAttempts, createCount);
        }
        assert.equal(mesh.matrix.elements[12], 1, 'the transform must still animate');
        await handle.editStage(usdStage => {
            const input = usdStage.GetPrimAtPath('/World/Triangle').GetAttribute('xformOp:translate');
            assert.equal(input.SetVec3d(3, 0, 0, 2), true);
        });
        await handle.materialsReady();
        assert.equal(mesh.matrix.elements[12], 3, 'the transform edit must reach Hydra');
        assert.equal(handle.diagnostics().materialXDocuments, documentCount);
        assert.equal(handle.diagnostics().materialXCreateAttempts, createCount);
    });
});
