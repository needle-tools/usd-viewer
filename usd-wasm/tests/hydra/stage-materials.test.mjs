import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group } from 'three';
import { getUsdModule } from '../runtime.mjs';
import { createThreeHydra } from '../../src/create.three.js';

const source = `#usda 1.0
def Xform "World" {
    def Material "Base" {
        token outputs:surface.connect = </World/Base/Shader.outputs:surface>
        def Shader "Shader" {
            uniform token info:id = "UsdPreviewSurface"
            color3f inputs:diffuseColor = (1, 0, 0)
            token outputs:surface
        }
    }
    def Material "Subset" {
        token outputs:surface.connect = </World/Subset/Shader.outputs:surface>
        def Shader "Shader" {
            uniform token info:id = "UsdPreviewSurface"
            color3f inputs:diffuseColor = (0, 1, 0)
            token outputs:surface
        }
    }
    def Mesh "Panel" (prepend apiSchemas = ["MaterialBindingAPI"]) {
        uniform token subdivisionScheme = "none"
        int[] faceVertexCounts = [3, 3]
        int[] faceVertexIndices = [0, 1, 2, 0, 2, 3]
        point3f[] points = [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)]
        rel material:binding = </World/Base>
        uniform token subsetFamily:materialBind:familyType = "nonOverlapping"
        def GeomSubset "Green" (prepend apiSchemas = ["MaterialBindingAPI"]) {
            uniform token elementType = "face"
            uniform token familyName = "materialBind"
            int[] indices = [1]
            rel material:binding = </World/Subset>
        }
    }
}
`;

test('real Hydra honors face subsets over a mesh binding and retains uncovered faces', async () => {
    const USD = await getUsdModule({ print() {}, printErr() {} });
    const scene = new Group();
    const handle = await createThreeHydra({ USD, scene, url: 'subset-regression.usda', buffer: new TextEncoder().encode(source) });
    try {
        await handle.ready();
        await handle.materialsReady();
        const mesh = scene.children.find(object => object.isMesh);
        assert.ok(mesh?.visible);
        assert.equal(mesh.geometry.attributes.position.count, 6);
        assert.deepEqual(mesh.geometry.groups.map(({ start, count, materialIndex }) => ({
            start, count, color: mesh.material[materialIndex].color.toArray(),
        })), [
            { start: 0, count: 3, color: [1, 0, 0] },
            { start: 3, count: 3, color: [0, 1, 0] },
        ]);
    } finally {
        await handle.dispose();
    }
});

test('real Hydra keeps MDL-only geometry visible with face-varying fallback display colors', async () => {
    const USD = await getUsdModule({ print() {}, printErr() {} });
    const scene = new Group();
    const usda = `#usda 1.0
def Xform "World" {
    def Material "MDL" {
        token outputs:mdl:surface.connect = </World/MDL/Shader.outputs:out>
        def Shader "Shader" {
            uniform token info:implementationSource = "sourceAsset"
            uniform asset info:mdl:sourceAsset = @CustomSurface.mdl@
            uniform token info:mdl:sourceAsset:subIdentifier = "CustomSurface"
            token outputs:out
        }
    }
    def Mesh "Triangle" (prepend apiSchemas = ["MaterialBindingAPI"]) {
        uniform token subdivisionScheme = "none"
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]
        color3f[] primvars:displayColor = [(1, 0, 0), (0, 1, 0), (0, 0, 1)] (
            interpolation = "faceVarying"
        )
        rel material:binding = </World/MDL>
    }
}
`;
    const handle = await createThreeHydra({ USD, scene, url: 'mdl-regression.usda', buffer: new TextEncoder().encode(usda) });
    try {
        await handle.ready();
        await handle.materialsReady();
        const mesh = scene.children.find(object => object.isMesh);
        assert.ok(mesh?.visible, 'an unsupported shader must not hide the triangle');
        assert.equal(mesh.geometry.attributes.position.count, 3);
        assert.deepEqual([...mesh.geometry.attributes.color.array], [1, 0, 0, 0, 1, 0, 0, 0, 1]);
        assert.equal(mesh.material.vertexColors, true);
        assert.equal(handle.diagnostics().materialFallbacks, 1);
    } finally {
        await handle.dispose();
    }
});

test('real Hydra preserves a PreviewSurface with default diffuse color over paired MDL', async () => {
    const USD = await getUsdModule({ print() {}, printErr() {} });
    const scene = new Group();
    const usda = source.replace('color3f inputs:diffuseColor = (1, 0, 0)', 'float inputs:roughness = 0.125')
        .replace('def Material "Base" {', `def Material "Base" {
            token outputs:mdl:surface.connect = </World/Base/MDL.outputs:out>
            def Shader "MDL" {
                uniform token info:implementationSource = "sourceAsset"
                uniform asset info:mdl:sourceAsset = @OmniPBR.mdl@
                uniform token info:mdl:sourceAsset:subIdentifier = "OmniPBR"
                color3f inputs:diffuse_color_constant = (1, 0, 0)
                token outputs:out
            }
        `);
    const handle = await createThreeHydra({ USD, scene, url: 'preview-defaults.usda', buffer: new TextEncoder().encode(usda) });
    try {
        await handle.ready();
        await handle.materialsReady();
        const mesh = scene.children.find(object => object.isMesh);
        const group = mesh.geometry.groups.find(group => group.start === 0);
        const material = mesh.material[group.materialIndex];
        assert.equal(material.roughness, 0.125);
        assert.ok(material.color.toArray().every(component => Math.abs(component - 0.18) < 1e-7));
        assert.equal(material.userData.usdMdlApproximation, undefined);
    } finally { await handle.dispose(); }
});
