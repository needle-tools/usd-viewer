import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, ShaderLib } from 'three';
import { ThreeRenderDelegateInterface } from '../../src/hydra/ThreeJsRenderDelegate.js';

function mesh(delegate, id) {
    const result = delegate.createRPrim('mesh', id);
    result.updatePoints([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
    result.updateIndices([0, 1, 2, 0, 2, 3]);
    result.setMaterial('/Material');
    result.setVisibilityState(true);
    return result;
}
async function material(delegate) {
    const result = delegate.createSPrim('material', '/Material');
    result.updateNode('surface', '/Material/Surface', { identifier: 'UsdPreviewSurface' });
    const connections = [
        ['diffuseColor', 'displayColor', 'float3', [0.5, 0.25, 0.125]],
        ['roughness', 'panelRoughness', 'float', 0.5],
        ['metallic', 'signal', 'float', 0],
    ];
    for (const [input, name, type, fallback] of connections) {
        result.updateNode('surface', `/Material/${input}`, { identifier: `UsdPrimvarReader_${type}`, varname: name, fallback });
    }
    result.updateFinished('surface', connections.map(([input]) => ({
        inputId: `/Material/${input}`, inputName: 'result', outputId: '/Material/Surface', outputName: input,
    })));
    await delegate.waitForMaterialsReady();
    return result;
}
function values(object, input) {
    const binding = object.material.userData.usdPreviewPrimvars.find(binding => binding.input === input);
    return [...object.geometry.getAttribute(binding.attribute).array];
}
const repeat = (value, count = 6) => Array.from({ length: count }, () => value).flat();

test('Preview readers use per-mesh constants and reader fallback on a shared material', async () => {
    const delegate = new ThreeRenderDelegateInterface({ usdRoot: new Group() });
    const warm = mesh(delegate, '/Warm'), cool = mesh(delegate, '/Cool'), missing = mesh(delegate, '/Missing');
    warm.updatePrimvar('displayColor', [1, 0.25, 0], 3, 'constant');
    cool.updatePrimvar('displayColor', [0, 0.25, 1], 3, 'constant');
    warm.updatePrimvar('panelRoughness', [0.125], 1, 'constant');
    cool.updatePrimvar('panelRoughness', [0.875], 1, 'constant');
    warm.updatePrimvar('signal', [1], 1, 'constant');
    const authored = await material(delegate);
    assert.equal(warm._mesh.material, cool._mesh.material);
    assert.equal(authored._material.vertexColors, true, 'explicit displayColor readers retain the public vertexColors contract');
    assert.deepEqual(values(warm._mesh, 'diffuseColor'), repeat([1, 0.25, 0]));
    assert.deepEqual(values(cool._mesh, 'diffuseColor'), repeat([0, 0.25, 1]));
    assert.deepEqual(values(missing._mesh, 'diffuseColor'), repeat([0.5, 0.25, 0.125]));
    assert.deepEqual(values(warm._mesh, 'roughness'), repeat(0.125));
    assert.deepEqual(values(cool._mesh, 'roughness'), repeat(0.875));
    assert.deepEqual(values(missing._mesh, 'roughness'), repeat(0.5));
    assert.deepEqual(values(warm._mesh, 'metallic'), repeat(1));
    assert.deepEqual(values(cool._mesh, 'metallic'), repeat(0));
    const shader = { vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
    authored._material.onBeforeCompile(shader);
    assert.match(shader.fragmentShader, /diffuseColor\.rgb = usdPrimvar_\w+_value;/);
    assert.match(shader.fragmentShader, /roughnessFactor = usdPrimvar_\w+_value;/);
    assert.match(shader.fragmentShader, /metalnessFactor = usdPrimvar_\w+_value;/);
    delegate.dispose();
});

test('Preview readers follow vertex ordering, topology edits and interpolation changes', async () => {
    const delegate = new ThreeRenderDelegateInterface({ usdRoot: new Group() });
    const panel = mesh(delegate, '/Panel');
    await material(delegate);
    panel.updatePrimvar('displayColor', [1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1], 3, 'vertex');
    panel.updatePrimvar('panelRoughness', [0, 0.25, 0.5, 1], 1, 'varying');
    assert.deepEqual(values(panel._mesh, 'roughness'), [0, 0.25, 0.5, 0, 0.5, 1]);
    assert.deepEqual(values(panel._mesh, 'diffuseColor').slice(0, 9), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    panel.updateIndices([3, 2, 1]);
    assert.deepEqual(values(panel._mesh, 'roughness'), [1, 0.5, 0.25]);
    assert.deepEqual(values(panel._mesh, 'diffuseColor'), [1, 1, 1, 0, 0, 1, 0, 1, 0]);
    panel.updatePrimvar('panelRoughness', [0.75], 1, 'constant');
    assert.deepEqual(values(panel._mesh, 'roughness'), [0.75, 0.75, 0.75]);
    panel.updatePrimvar('panelRoughness', [0.5, 0.125, 1], 1, 'facevarying');
    assert.deepEqual(values(panel._mesh, 'roughness'), [0.5, 0.125, 1]);
    assert.equal(panel._mesh.userData.usdPrimvars.panelRoughness, undefined);
    delegate.dispose();
});

test('Preview reader hooks survive side clones and obsolete shader attributes are removed', async () => {
    const delegate = new ThreeRenderDelegateInterface({ usdRoot: new Group() });
    const panel = mesh(delegate, '/Panel');
    const authored = await material(delegate);
    const variant = panel._applyMaterialSide(authored._material, { requiresMaterialSideVariants: () => true });
    const shader = { vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
    variant.onBeforeCompile(shader);
    assert.match(shader.vertexShader, /attribute vec3 usdPrimvar_/);
    authored.beginMaterialSync();
    authored.updateNode('surface', '/Material/Surface', { identifier: 'UsdPreviewSurface', diffuseColor: [0, 0, 1] });
    authored.updateFinished('surface', []);
    await delegate.waitForMaterialsReady();
    assert.equal(Object.keys(panel._geometry.attributes).some(name => name.startsWith('usdPrimvar_')), false);
    assert.deepEqual(panel._mesh.material.color.toArray(), [0, 0, 1]);
    assert.equal(panel._mesh.material.vertexColors, false, 'unconnected authored color must not read displayColor');
    delegate.dispose();
});

test('node-material side copies retain cutout thresholds on creation and refresh', async () => {
    const { MeshPhysicalNodeMaterial } = await import('three/webgpu');
    const delegate = new ThreeRenderDelegateInterface({ usdRoot: new Group() });
    const panel = mesh(delegate, '/Panel');
    const source = new MeshPhysicalNodeMaterial(); source.alphaTest = .5; source.alphaClip = true;
    const hydraMaterial = { requiresMaterialSideVariants: () => true };
    const copy = panel._applyMaterialSide(source, hydraMaterial);
    assert.notEqual(copy, source); assert.equal(copy.alphaTest, .5); assert.equal(copy.alphaClip, true);
    source.alphaTest = .25;
    assert.equal(panel._applyMaterialSide(source, hydraMaterial), copy);
    assert.equal(copy.alphaTest, .25);
    source.alphaTest = 0; source.alphaClip = false;
    panel._applyMaterialSide(source, hydraMaterial);
    assert.equal(copy.alphaTest, 0); assert.equal(copy.alphaClip, false);
    source.dispose(); delegate.dispose();
});

test('MaterialX custom inputs bind constants and typed vertex primvars without stale aliases', async () => {
    const { ShaderMaterial } = await import('three');
    const delegate = new ThreeRenderDelegateInterface({ usdRoot: new Group() });
    const panel = mesh(delegate, '/Panel');
    const generated = new ShaderMaterial({ vertexShader: 'in float i_geomprop_finish;\nin vec3 i_geomprop_direction;' });
    generated.isMaterialXMaterial = true;
    panel._mesh.material = generated;
    panel.updatePrimvar('finish', [0.625], 1, 'constant');
    panel.updatePrimvar('direction', [1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1], 3, 'vertex');
    assert.deepEqual([...panel._geometry.attributes.i_geomprop_finish.array], repeat(0.625));
    assert.deepEqual([...panel._geometry.attributes.i_geomprop_direction.array].slice(0, 9), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    panel.updateIndices([3, 2, 1]);
    assert.deepEqual([...panel._geometry.attributes.i_geomprop_direction.array], [1, 1, 1, 0, 0, 1, 0, 1, 0]);
    panel._mesh.material = panel._ownedMaterial;
    delegate.prepareMeshMaterialGeometry(panel._mesh);
    assert.equal(panel._geometry.attributes.i_geomprop_finish, undefined);
    assert.equal(panel._geometry.attributes.i_geomprop_direction, undefined);
    generated.dispose();
    delegate.dispose();
});

test('MaterialX custom attribute and varying names stay distinct across shader stages', async () => {
    const { ShaderMaterial } = await import('three');
    const { configureMaterialXPrimvars } = await import('../../src/hydra/materialPrimvars.js');
    const generated = new ShaderMaterial({
        vertexShader: 'in vec3 i_geomprop_finish;\nout vec3 i_geomprop_finish;\nvoid main() { i_geomprop_finish = i_geomprop_finish; }',
        fragmentShader: 'in vec3 i_geomprop_finish;\nvoid main() { vec3 color = i_geomprop_finish; }',
    });
    configureMaterialXPrimvars(generated);
    assert.match(generated.vertexShader, /in vec3 i_geomprop_finish;/);
    assert.match(generated.vertexShader, /out vec3 usdGeompropVarying_finish;/);
    assert.match(generated.vertexShader, /usdGeompropVarying_finish = i_geomprop_finish;/);
    assert.match(generated.fragmentShader, /in vec3 usdGeompropVarying_finish;/);
    assert.match(generated.fragmentShader, /color = usdGeompropVarying_finish;/);
    const result = generated.vertexShader;
    configureMaterialXPrimvars(generated);
    assert.equal(generated.vertexShader, result, 'already valid shaders remain unchanged');
    generated.dispose();
});

test('WebGPU PreviewSurface readers use TSL attributes and survive material side cloning', async () => {
    const { createWebGpuSupport } = await import('../../src/renderers/webGpuSupport.js');
    const delegate = new ThreeRenderDelegateInterface({ usdRoot: new Group(), renderer: { isWebGPURenderer: true }, webGpuSupport: await createWebGpuSupport() });
    const panel = mesh(delegate, '/Panel');
    panel.updatePrimvar('displayColor', [1,0,0, 0,1,0, 0,0,1, 1,1,1], 3, 'vertex');
    const authored = await material(delegate);
    assert.equal(authored._material.isMeshPhysicalNodeMaterial, true);
    assert.equal(authored._material.vertexColors, false, 'a direct color reader is not multiplied a second time');
    assert.ok(authored._material.colorNode.isNode);
    assert.ok(authored._material.roughnessNode.isNode);
    assert.deepEqual(values(panel._mesh, 'diffuseColor').slice(0, 9), [1,0,0, 0,1,0, 0,0,1]);
    const clone = authored._material.clone();
    assert.equal(clone.colorNode, authored._material.colorNode);
    clone.dispose(); delegate.dispose();
});
