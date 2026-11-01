import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClampToEdgeWrapping, DataTexture, DataUtils, FloatType, Group, HalfFloatType,
  LinearSRGBColorSpace, MirroredRepeatWrapping, RepeatWrapping, RGBFormat, RGBAFormat, SRGBColorSpace, UnsignedShortType, Vector2 } from 'three';
import { ThreeRenderDelegateInterface } from '../../src/hydra/ThreeJsRenderDelegate.js';

const omni = (inputs = {}, extra = {}) => ({ sourceAsset: 'materials/OmniPBR.mdl', subIdentifier: 'OmniPBR', inputs, ...extra });
const gltf = (inputs = {}) => ({ sourceAsset: 'nvidia/sdk_examples/gltf_support.mdl', subIdentifier: 'gltf_material', inputs });

function setup() {
  const delegate = new ThreeRenderDelegateInterface({ usdRoot: new Group() });
  const mesh = delegate.createRPrim('mesh', '/Triangle');
  mesh.updatePoints([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  mesh.updateIndices([0, 1, 2]);
  mesh.setVisibilityState(true);
  const material = delegate.createSPrim('material', '/Material');
  mesh.setMaterial('/Material');
  const pixels = new Uint8Array([40, 80, 160, 200]);
  const texture = new DataTexture(pixels, 1, 1);
  const requests = [];
  delegate.registry.resolveResourcePath = path => path;
  delegate.registry.getTexture = async path => { requests.push(path); return texture; };
  return { delegate, material, mesh, texture, requests };
}

async function update(context, document) {
  context.material.beginMaterialSync();
  context.material.updateMdlMaterial(document);
  context.material.updateFinished('surface', []);
  await context.delegate.waitForMaterialsReady();
  return context.mesh._mesh.material;
}

test('OmniPBR uses documented defaults and preserves authored zero values and feature gates', async () => {
  const context = setup();
  try {
    let material = await update(context, omni());
    assert.deepEqual(material.color.toArray(), [0.2, 0.2, 0.2]);
    assert.equal(material.roughness, 0.5);
    assert.equal(material.metalness, 0);
    assert.equal(material.userData.usdMdlApproximation, 'OmniPBR');
    material = await update(context, omni({ diffuse_color_constant: [0, 0, 0], reflection_roughness_constant: 0,
      metallic_constant: 1, opacity_constant: 0, emissive_color: [1, 1, 1], emissive_intensity: 10,
      metallic_texture: 'disabled.png', reflectionroughness_texture: 'disabled.png' }));
    assert.deepEqual(material.color.toArray(), [0, 0, 0]);
    assert.equal(material.roughness, 0);
    assert.equal(material.metalness, 1);
    assert.equal(material.opacity, 1);
    assert.deepEqual(material.emissive.toArray(), [0, 0, 0]);
    assert.deepEqual(context.requests, []);
  } finally { context.delegate.dispose(); }
});

test('OmniPBR keeps resolved assets, color spaces, UV transforms, map influences and normal strength', async () => {
  const context = setup();
  try {
    const material = await update(context, omni({ diffuse_texture: 'base.png', diffuse_tint: [0.5, 1, 0.25],
      enable_ORM_texture: true, ORM_texture: 'orm.png', reflection_roughness_constant: 0.5,
      reflection_roughness_texture_influence: 0.5, metallic_texture_influence: 1, ao_to_diffuse: 0.75,
      normalmap_texture: 'normal.png', bump_factor: 0.2, flip_tangent_v: false,
      texture_scale: [2, 3], texture_translate: [0.1, 0.2], texture_rotate: 90,
    }, { resolvedPaths: { diffuse_texture: '/package/textures/base.png' }, colorSpaces: { diffuse_texture: 'raw' } }));
    assert.ok(context.requests.includes('/package/textures/base.png'));
    assert.deepEqual(material.color.toArray(), [0.5, 1, 0.25]);
    assert.equal(material.map.colorSpace, LinearSRGBColorSpace);
    assert.equal(material.roughnessMap.colorSpace, LinearSRGBColorSpace);
    assert.deepEqual([...material.roughnessMap.image.data], [40, 103, 160, 200]);
    assert.deepEqual([...material.metalnessMap.image.data], [40, 80, 160, 200]);
    assert.deepEqual([...context.texture.image.data], [40, 80, 160, 200], 'cached texture samples must remain intact');
    assert.equal(material.roughness, 1);
    assert.equal(material.metalness, 1);
    assert.equal(material.aoMapIntensity, 0.75);
    for (const map of [material.map, material.roughnessMap, material.metalnessMap, material.normalMap]) {
      assert.deepEqual(map.repeat.toArray(), [2, 3]);
      assert.deepEqual(map.offset.toArray(), [0.1, 0.2]);
      assert.equal(map.rotation, Math.PI / 2);
    }
    assert.deepEqual(material.normalScale.toArray(), [0.2, 0.2]);
  } finally { context.delegate.dispose(); }
});

test('glTF-style MDL retains texture multipliers and packed channels without repacking UVs', async () => {
  const context = setup();
  try {
    const material = await update(context, gltf({ base_color_factor: [0.2, 0.4, 0.6], base_color_texture: 'base.png',
      metallic_factor: 0.25, roughness_factor: 0.5, metallic_roughness_texture: 'mr.png',
      emissive_factor: [0.1, 0.2, 0.3], emissive_strength: 2, emissive_texture: 'emit.png',
      base_alpha: 0.3, alpha_mode: 'mask', alpha_cutoff: 0.4 }));
    assert.deepEqual(material.color.toArray(), [0.2, 0.4, 0.6]);
    assert.equal(material.map.colorSpace, SRGBColorSpace);
    assert.equal(material.metalness, 0.25);
    assert.equal(material.roughness, 0.5);
    assert.deepEqual(material.emissive.toArray(), [0.2, 0.4, 0.6]);
    assert.equal(material.opacity, 0.3);
    assert.equal(material.alphaTest, 0.4);
    assert.equal(material.transparent, false);
    assert.equal(material.alphaMap, null, 'base map alpha must only be applied once');
    assert.deepEqual([...material.metalnessMap.image.data], [40, 80, 160, 200]);
    assert.deepEqual([...material.roughnessMap.image.data], [40, 80, 160, 200]);
  } finally { context.delegate.dispose(); }
});

test('separate opacity maps extract their channel as linear data and respect masking', async () => {
  const context = setup();
  try {
    const material = await update(context, omni({ enable_opacity: true, enable_opacity_texture: true,
      opacity_texture: 'opacity.png', opacity_mode: 0, opacity_threshold: 0.4 }));
    assert.deepEqual([...material.alphaMap.image.data], [40, 200, 160, 200]);
    assert.equal(material.alphaMap.colorSpace, LinearSRGBColorSpace);
    assert.equal(material.alphaTest, 0.4);
    assert.equal(material.transparent, false);
  } finally { context.delegate.dispose(); }
});

test('retiring a textured material detaches it while its replacement is pending', async () => {
  const context = setup();
  try {
    const document = omni({ enable_opacity: true, enable_opacity_texture: true,
      opacity_texture: 'opacity.png', opacity_mode: 1, opacity_threshold: .5 });
    const previous = await update(context, document);
    assert.ok(previous.alphaMap); assert.equal(context.mesh._mesh.visible, true);
    context.delegate.destroySPrim('/Material');
    assert.notEqual(context.mesh._mesh.material, previous);
    assert.equal(context.mesh._mesh.material.alphaMap, null);
    assert.equal(context.mesh._mesh.visible, false);
    context.material = context.delegate.createSPrim('material', '/Material');
    const replacement = await update(context, document);
    assert.equal(context.mesh._mesh.material, replacement);
    assert.equal(context.mesh._mesh.visible, true);
    assert.equal(replacement.alphaTest, .5);
  } finally { context.delegate.dispose(); }
});

test('known glTF texture lookups retain independent UV transforms, sampler and resolved asset metadata', async () => {
  const context = setup();
  try {
    const material = await update(context, { ...gltf({ base_color_factor: [1, 1, 1, 0.3], alpha_mode: 2 }),
      sourceAsset: 'gltf/pbr_3.mdl', textureInputs: {
        base_color_texture: { sourceAsset: 'gltf/pbr_3.mdl', subIdentifier: 'gltf_texture_lookup',
          inputs: { texture: '../base.png', scale: [2, 3], offset: [0.1, 0.2], wrap_s: 33071 },
          resolvedPaths: { texture: '/assets/base.png' }, colorSpaces: { texture: 'sRGB' } },
        normal_texture: { sourceAsset: 'gltf/pbr_3.mdl', subIdentifier: 'gltf_normal_texture_lookup',
          inputs: { texture: '../normal.png', scale: [4, 5], normal_scale_factor: 0.25 } },
      },
    });
    assert.ok(context.requests.includes('/assets/base.png'));
    assert.equal(material.map.wrapS, ClampToEdgeWrapping);
    assert.deepEqual(material.map.repeat.toArray(), [2, 3]);
    assert.deepEqual(material.normalMap.repeat.toArray(), [4, 5]);
    const transformed = new Vector2(0.25, 0.75).applyMatrix3(material.map.matrix);
    assert.ok(Math.abs(transformed.x - 0.6) < 1e-10);
    assert.ok(Math.abs(transformed.y - 0.05) < 1e-10);
    assert.deepEqual(material.normalScale.toArray(), [0.25, 0.25]);
    assert.equal(material.opacity, 0.3);
    assert.equal(material.transparent, true);
  } finally { context.delegate.dispose(); }
});

test('known clearcoat variants approximate their layer without accepting arbitrary OmniPBR prefixes', async () => {
  const context = setup();
  try {
    let material = await update(context, omni({ enable_clearcoat: true, clearcoat_weight: 0.6, clearcoat_reflection_roughness: 0.2 },
      { sourceAsset: 'OmniPBR_ClearCoat.mdl', subIdentifier: 'OmniPBR_ClearCoat' }));
    assert.equal(material.clearcoat, 0.6);
    assert.equal(material.clearcoatRoughness, 0.2);
    material = await update(context, omni({}, { sourceAsset: 'OmniPBR_Custom.mdl', subIdentifier: 'OmniPBR_Custom' }));
    assert.equal(material, context.mesh._ownedMaterial);
  } finally { context.delegate.dispose(); }
});

test('missing textures preserve scalar fallback and malformed values do not reach Three', async () => {
  const context = setup();
  context.delegate.registry.getTexture = async () => { throw Error('missing fixture texture'); };
  try {
    const material = await update(context, omni({ diffuse_texture: 'missing.png', diffuse_color_constant: [0.3, 0.4, 0.5],
      reflection_roughness_constant: NaN, metallic_constant: -1 }));
    assert.deepEqual(material.color.toArray(), [0.3, 0.4, 0.5]);
    assert.equal(material.roughness, 0.5);
    assert.equal(material.metalness, 0);
    assert.ok(context.mesh._mesh.visible);
  } finally { context.delegate.dispose(); }
});

test('unknown MDL and connected expressions retain per-mesh display colors and can later become supported', async () => {
  const context = setup();
  try {
    context.mesh.setDisplayColor([0.2, 0.4, 0.6], 'constant');
    let material = await update(context, omni({}, { sourceAsset: 'CustomOmniPBR.mdl' }));
    assert.equal(material, context.mesh._ownedMaterial);
    assert.ok(context.mesh._mesh.visible);
    material = await update(context, omni({}, { unsupportedInputs: ['diffuse_texture'] }));
    assert.equal(material, context.mesh._ownedMaterial);
    assert.equal(context.delegate.getDiagnostics().materialFallbacks, 1);
    material = await update(context, omni({ diffuse_color_constant: [0, 1, 0] }));
    assert.deepEqual(material.color.toArray(), [0, 1, 0]);
    assert.equal(material.vertexColors, false);
  } finally { context.delegate.dispose(); }
});

test('PreviewSurface base alpha remains valid when its asynchronous lookup finishes before base color', async () => {
  const context = setup();
  const pending = [];
  context.delegate.registry.getTexture = () => new Promise(resolve => pending.push(resolve));
  try {
    context.material.beginMaterialSync();
    context.material.updateNode('surface', '/Material/Preview', {
      identifier: 'UsdPreviewSurface',
      diffuseColor: { inputName: 'rgb', nodeIn: { file: 'base.png' } },
      opacity: { inputName: 'a', nodeIn: { file: 'base.png' } },
    });
    context.material.updateFinished('surface', []);
    assert.equal(pending.length, 2);
    pending[1](context.texture);
    await Promise.resolve();
    pending[0](context.texture);
    await context.delegate.waitForMaterialsReady();
    assert.ok(context.material._material.map);
    assert.equal(context.material._material.alphaMap, null);
    assert.equal(context.material._material.transparent, true);
  } finally { context.delegate.dispose(); }
});

test('PreviewSurface separate alpha conversion leaves the cached color texture and alpha data intact', async () => {
  const context = setup();
  try {
    context.material.beginMaterialSync();
    context.material.updateNode('surface', '/Material/Preview', {
      identifier: 'UsdPreviewSurface', diffuseColor: [1, 1, 1],
      opacity: { inputName: 'a', nodeIn: { file: 'alpha.png' } }, opacityThreshold: 0.5,
    });
    context.material.updateFinished('surface', []);
    await context.delegate.waitForMaterialsReady();
    const material = context.material._material;
    assert.deepEqual([...material.alphaMap.image.data], [40, 200, 160, 200]);
    assert.deepEqual([...context.texture.image.data], [40, 80, 160, 200]);
    assert.equal(material.alphaMap.colorSpace, LinearSRGBColorSpace);
    assert.equal(material.transparent, false);
    assert.equal(material.alphaTest, 0.5);
  } finally { context.delegate.dispose(); }
});

test('PreviewSurface preserves repeated and independent scalar-map sampling', async () => {
  const context = setup();
  try {
    for (const scale of [8, 9]) {
      context.material.beginMaterialSync();
      const mapping = { scale: [scale, scale], translation: [0, 0], rotation: 0 };
      context.material.updateNode('surface', '/Material/Preview', {
        identifier: 'UsdPreviewSurface',
        roughness: { inputName: 'g', nodeIn: { file: 'orm.png', st: { nodeIn: mapping }, wrapS: 'repeat', wrapT: 'repeat' } },
        metallic: { inputName: 'b', nodeIn: { file: 'orm.png', st: { nodeIn: mapping }, wrapS: 'repeat', wrapT: 'repeat' } },
      });
      context.material.updateFinished('surface', []);
      await context.delegate.waitForMaterialsReady();
      for (const map of [context.material._material.roughnessMap, context.material._material.metalnessMap]) {
        assert.ok(map);
        assert.deepEqual(map.repeat.toArray(), [scale, scale]);
        assert.equal(map.wrapS, RepeatWrapping);
        assert.equal(map.wrapT, RepeatWrapping);
        assert.deepEqual([...map.image.data], [40, 80, 160, 200]);
      }
    }
    context.material.beginMaterialSync();
    context.material.updateNode('surface', '/Material/Preview', {
      identifier: 'UsdPreviewSurface',
      roughness: { inputName: 'r', nodeIn: { file: 'rough.png', st: { nodeIn: { scale: [2, 3], translation: [0.25, 0.5] } }, wrapS: 'repeat', wrapT: 'clamp' } },
      metallic: { inputName: 'a', nodeIn: { file: 'metal.png', st: { nodeIn: { scale: [4, 5], translation: [0.75, 0.125] } }, wrapS: 'mirror', wrapT: 'repeat' } },
    });
    context.material.updateFinished('surface', []);
    await context.delegate.waitForMaterialsReady();
    const { roughnessMap, metalnessMap, aoMap } = context.material._material;
    assert.notEqual(roughnessMap, metalnessMap);
    assert.deepEqual(roughnessMap.repeat.toArray(), [2, 3]);
    assert.deepEqual(roughnessMap.offset.toArray(), [0.25, 0.5]);
    assert.deepEqual([roughnessMap.wrapS, roughnessMap.wrapT], [RepeatWrapping, ClampToEdgeWrapping]);
    assert.deepEqual(metalnessMap.repeat.toArray(), [4, 5]);
    assert.deepEqual(metalnessMap.offset.toArray(), [0.75, 0.125]);
    assert.deepEqual([metalnessMap.wrapS, metalnessMap.wrapT], [MirroredRepeatWrapping, RepeatWrapping]);
    assert.deepEqual([...roughnessMap.image.data], [40, 40, 160, 200]);
    assert.deepEqual([...metalnessMap.image.data], [40, 80, 200, 200]);
    assert.deepEqual([...context.texture.image.data], [40, 80, 160, 200]);
    assert.equal(aoMap, null, 'unconnected occlusion stays disabled');
  } finally { context.delegate.dispose(); }
});

test('Preview normal maps honor noncanonical scale/bias and identity defaults without changing cached pixels', async () => {
  const context = setup();
  try {
    for (const [scale, bias] of [
      [[-2, 2, 1, 2], [1, -1, 0, -1]],
      [[2, -2, 2, 2], [-1, 1, -1, -1]],
      [undefined, undefined],
      [[2, 2, 2, 2], [-1, -1, -1, -1]],
    ]) {
      context.material.beginMaterialSync();
      context.material.updateNode('surface', '/Material/Preview', {
        identifier: 'UsdPreviewSurface',
        normal: { inputName: 'rgb', nodeIn: { identifier: 'UsdUVTexture', file: 'normal.png', scale, bias,
          sourceColorSpace: 'raw', st: { nodeIn: { scale: [8, 9], translation: [0.25, 0.5] } }, wrapS: 'repeat', wrapT: 'mirror' } },
      });
      context.material.updateFinished('surface', []);
      await context.delegate.waitForMaterialsReady();
      const map = context.material._material.normalMap;
      assert.ok(map);
      for (let i = 0; i < 3; i++) {
        const desired = context.texture.image.data[i] / 255 * (scale?.[i] ?? 1) + (bias?.[i] ?? 0);
        const decoded = map.image.data[i] / 255 * 2 - 1;
        assert.ok(Math.abs(decoded - desired) <= 1 / 255 + 1e-7, `${decoded} should decode to ${desired}`);
      }
      assert.deepEqual(map.repeat.toArray(), [8, 9]);
      assert.deepEqual(map.offset.toArray(), [0.25, 0.5]);
      assert.deepEqual([map.wrapS, map.wrapT], [RepeatWrapping, MirroredRepeatWrapping]);
      assert.deepEqual([...context.texture.image.data], [40, 80, 160, 200]);
      assert.equal(map.image.data[3], 200);
      if (scale?.[0] === 2 && scale?.[1] === 2) assert.equal(map.source, context.texture.source, 'canonical normals keep the zero-copy path');
      else assert.notEqual(map.source, context.texture.source);
    }
  } finally { context.delegate.dispose(); }
});

test('noncanonical normal conversion retains half floats and promotes integer samples instead of clipping', async () => {
  const context = setup();
  const halfPixels = Uint16Array.from([0.25, 2, 4, 0.5], DataUtils.toHalfFloat);
  const halfTexture = new DataTexture(halfPixels, 1, 1, RGBAFormat, HalfFloatType);
  try {
    for (const texture of [halfTexture, context.texture]) {
      context.delegate.registry.getTexture = async () => texture;
      context.material.beginMaterialSync();
      context.material.updateNode('surface', '/Material/Preview', {
        identifier: 'UsdPreviewSurface',
        normal: { inputName: 'rgb', nodeIn: { identifier: 'UsdUVTexture', file: 'normal.exr', scale: [4, 4, 4, 1], bias: [-2, -2, -2, 0] } },
      });
      context.material.updateFinished('surface', []);
      await context.delegate.waitForMaterialsReady();
      const map = context.material._material.normalMap;
      assert.equal(map.isDataTexture, true);
      assert.equal(map.type, texture === halfTexture ? HalfFloatType : FloatType);
      const decode = texture === halfTexture ? DataUtils.fromHalfFloat : value => value;
      for (let i = 0; i < 3; i++) {
        const input = texture === halfTexture ? DataUtils.fromHalfFloat(halfPixels[i]) : texture.image.data[i] / 255;
        assert.ok(Math.abs((decode(map.image.data[i]) * 2 - 1) - (input * 4 - 2)) < 1e-6);
      }
    }
    assert.deepEqual(Array.from(halfPixels, DataUtils.fromHalfFloat), [0.25, 2, 4, 0.5]);
    assert.deepEqual([...context.texture.image.data], [40, 80, 160, 200]);
  } finally { context.delegate.dispose(); halfTexture.dispose(); }
});

test('scalar texture remapping decodes half floats and preserves untouched HDR color channels', async () => {
  const context = setup();
  const pixels = Uint16Array.from([0.25, 3, 4, 0.5], DataUtils.toHalfFloat);
  const texture = new DataTexture(pixels, 1, 1, RGBAFormat, HalfFloatType);
  context.delegate.registry.getTexture = async () => texture;
  try {
    const material = await update(context, omni({ reflectionroughness_texture: 'roughness.exr', reflection_roughness_texture_influence: 1 }));
    assert.equal(material.roughnessMap.type, HalfFloatType);
    assert.deepEqual(Array.from(material.roughnessMap.image.data, DataUtils.fromHalfFloat), [0.25, 0.25, 4, 0.5]);
    assert.deepEqual(Array.from(texture.image.data, DataUtils.fromHalfFloat), [0.25, 3, 4, 0.5]);
  } finally { context.delegate.dispose(); }
});

test('normalized 16-bit and float scalar textures retain their numeric representation', async () => {
  for (const [pixels, type, expected] of [
    [new Uint16Array([16384, 32768, 49152, 65535]), UnsignedShortType, [16384, 16384, 49152, 65535]],
    [new Float32Array([0.25, 3, 4, 0.5]), FloatType, [0.25, 0.25, 4, 0.5]],
  ]) {
    const context = setup();
    context.delegate.registry.getTexture = async () => new DataTexture(pixels, 1, 1, RGBAFormat, type);
    try {
      const material = await update(context, omni({ reflectionroughness_texture: 'roughness.data', reflection_roughness_texture_influence: 1 }));
      assert.equal(material.roughnessMap.type, type);
      assert.deepEqual([...material.roughnessMap.image.data], expected);
    } finally { context.delegate.dispose(); }
  }
});

test('RGB scalar textures expand to RGBA while color textures retain their declared layout', async () => {
  const context = setup();
  const texture = new DataTexture(new Uint8Array([64, 128, 192]), 1, 1, RGBFormat);
  context.delegate.registry.getTexture = async () => texture;
  try {
    const material = await update(context, omni({ diffuse_texture: 'color.rgb',
      reflectionroughness_texture: 'roughness.rgb', reflection_roughness_texture_influence: 1 }));
    assert.equal(material.map.format, RGBFormat);
    assert.deepEqual([...material.map.image.data], [64, 128, 192]);
    assert.equal(material.roughnessMap.format, RGBAFormat);
    assert.deepEqual([...material.roughnessMap.image.data], [64, 64, 192, 255]);
  } finally { context.delegate.dispose(); }
});

test('OmniPBR texture brightness leaves constant fallback unchanged and opacity ignores diffuse alpha', async () => {
  const context = setup();
  try {
    let material = await update(context, omni({ diffuse_color_constant: [0.4, 0.6, 0.8],
      diffuse_tint: [0.5, 0.5, 0.5], albedo_brightness: 0.25 }));
    assert.deepEqual(material.color.toArray(), [0.2, 0.3, 0.4]);
    material = await update(context, omni({ diffuse_texture: 'shared.png', enable_opacity: true,
      enable_opacity_texture: true, opacity_texture: 'shared.png', opacity_mode: 0 }));
    assert.deepEqual([...material.map.image.data], [40, 80, 160, 255]);
    assert.deepEqual([...material.alphaMap.image.data], [40, 200, 160, 200]);
    assert.deepEqual([...context.texture.image.data], [40, 80, 160, 200]);
    assert.equal(material.transparent, true);
  } finally { context.delegate.dispose(); }
});

test('zero normal and material factors disable maps while glTF specular factors are preserved', async () => {
  const context = setup();
  try {
    const doc = gltf({ metallic_factor: 0, roughness_factor: 0, metallic_roughness_texture: 'unused.png',
      occlusion_strength: 0, occlusion_texture: 'unused.png', emissive_factor: [0, 0, 0], emissive_texture: 'unused.png',
      specular_color_factor: [2.3, 1.2, 0.5], specular_factor: 0.4 });
    doc.textureInputs = { normal_texture: { sourceAsset: 'pbr.mdl', subIdentifier: 'gltf_normal_texture_lookup',
      inputs: { texture: 'unused.png', normal_scale_factor: 0 } } };
    let material = await update(context, doc);
    assert.deepEqual(context.requests, []);
    assert.deepEqual(material.specularColor.toArray(), [2.3, 1.2, 0.5]);
    assert.equal(material.specularIntensity, 0.4);
    assert.equal(material.normalMap, null);
    material = await update(context, omni({ normalmap_texture: 'unused.png', enable_normal_texture: false }));
    assert.equal(material.normalMap, null);
    assert.deepEqual(context.requests, []);
  } finally { context.delegate.dispose(); }
});

test('glTF MDL enums accept numeric, qualified and explicit alpha-mode and wrap tokens', async () => {
  const context = setup();
  try {
    for (const [alpha_mode, transparent, cutoff] of [
      ['gltf_alpha_mode::mask', false, 0.5], ['gltf::alpha_mode_mask', false, 0.5],
      ['alpha_mode::blend', true, 0], ['gltf::alpha_mode_blend', true, 0],
      ['gltf_alpha_mode::opaque', false, 0], ['gltf::alpha_mode_opaque', false, 0],
    ]) {
      const doc = gltf({ alpha_mode, base_alpha: 0.25 });
      doc.textureInputs = { base_color_texture: { sourceAsset: 'pbr.mdl', subIdentifier: 'gltf_texture_lookup',
        inputs: { texture: 'base.png', wrap_s: 'gltf_wrapping_mode::clamp_to_edge', wrap_t: 'tex::wrap_mirrored_repeat' } } };
      const material = await update(context, doc);
      assert.equal(material.transparent, transparent, alpha_mode);
      assert.equal(material.alphaTest, cutoff, alpha_mode);
      assert.equal(material.map.wrapS, ClampToEdgeWrapping);
      assert.equal(material.map.wrapT, MirroredRepeatWrapping);
    }
  } finally { context.delegate.dispose(); }
});

test('PreviewSurface identification and defaults take precedence over a paired MDL approximation', async () => {
  const context = setup();
  try {
    context.material.beginMaterialSync();
    context.material.updateMdlMaterial(omni({ diffuse_color_constant: [1, 0, 0] }));
    context.material.updateNode('surface', '/Material/Unrelated', { identifier: 'CustomNode', diffuseColor: [0, 1, 0] });
    context.material.updateNode('surface', '/Material/Preview', { identifier: 'UsdPreviewSurface', roughness: 0.125 });
    context.material.updateFinished('surface', []);
    await context.delegate.waitForMaterialsReady();
    const material = context.material._material;
    assert.deepEqual(material.color.toArray(), [0.18, 0.18, 0.18]);
    assert.equal(material.roughness, 0.125);
    assert.equal(material.metalness, 0);
    assert.equal(material.clearcoatRoughness, 0.01);
    assert.equal(material.opacity, 1);
    assert.equal(material.ior, 1.5);
    assert.equal(material.userData.usdMdlApproximation, undefined);
  } finally { context.delegate.dispose(); }
});

test('OmniGlass retains transmission, IOR, roughness and explicitly enabled cutout coverage', async () => {
  const context=setup();
  const glass=inputs=>({sourceAsset:'materials/OmniGlass.mdl',subIdentifier:'OmniGlass',inputs});
  try{
    let material=await update(context,glass({glass_color:[.8,.9,1],glass_ior:1.4,frosting_roughness:.1,cutout_opacity:.007}));
    assert.equal(material.transmission,1);assert.equal(material.opacity,1,'disabled cutout must not erase the glass shell');
    assert.equal(material.ior,1.4);assert.equal(material.roughness,.1);assert.deepEqual(material.color.toArray(),[.8,.9,1]);
    assert.equal(material.userData.usdMdlApproximation,'OmniGlass');
    material=await update(context,glass({enable_opacity:true,cutout_opacity:.25}));
    assert.equal(material.opacity,.25);assert.equal(material.transparent,true);assert.equal(material.depthWrite,false);
    material=await update(context,glass({enable_opacity:true,cutout_opacity:.25,opacity_threshold:-1}));
    assert.equal(material.opacity,1);assert.equal(material.transparent,false);
  }finally{context.delegate.dispose();}
});
