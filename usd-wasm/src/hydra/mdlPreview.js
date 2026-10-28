// Authored-input approximations only: no MDL module loading or expression evaluation.
// Parameter contracts: NVIDIA OmniPBR documentation and MDL SDK gltf_support.
// https://docs.omniverse.nvidia.com/materials-and-rendering/latest/templates/OmniPBR.html
// https://github.com/NVIDIA/MDL-SDK/blob/master/examples/mdl/nvidia/sdk_examples/gltf_support.mdl
const scalar = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const unit = (value, fallback) => Math.max(0, Math.min(1, scalar(value, fallback)));
const vector = (value, fallback) => Array.isArray(value) && value.length >= fallback.length && value.every(Number.isFinite)
  ? value.slice(0, fallback.length) : [...fallback];
const multiply = (a, b) => a.map((value, index) => value * b[index]);
const enabled = value => value === true || value === 1;
const basename = path => String(path || '').replace(/\\/g, '/').split('/').pop();
const gltfModule = module => module === 'gltf_support.mdl' || /^pbr(?:_\d+)?\.mdl$/.test(module);

export function mdlToPreview(document) {
  const module = basename(document?.sourceAsset);
  const identifier = String(document?.subIdentifier || module.replace(/\.mdl$/, '')).split('::').pop();
  const omni = ['OmniPBR', 'OmniPBR_ClearCoat', 'OmniPBR_Opacity'].includes(identifier) && module === `${identifier}.mdl`;
  const gltf = gltfModule(module) && identifier === 'gltf_material';
  if ((!omni && !gltf) || document.unsupportedInputs?.length) return null;
  const inputs = document.inputs || {};
  if (omni && (enabled(inputs.project_uvw) || scalar(inputs.uv_space_index, 0) !== 0)) return null;
  const lookups = document.textureInputs || {};
  for (const lookup of Object.values(lookups)) {
    const id = String(lookup.subIdentifier || '').split('::').pop();
    if (!gltf || !gltfModule(basename(lookup.sourceAsset)) ||
      !['gltf_texture_lookup', 'gltf_normal_texture_lookup'].includes(id) ||
      lookup.unsupportedInputs?.length || scalar(lookup.inputs?.tex_coord_index, 0) !== 0) return null;
  }
  const main = { identifier: 'UsdPreviewSurface', diffuseColor: [1, 1, 1], metallic: 0, roughness: 0.5, opacity: 1 };
  const settings = {};
  const texture = (parameter, input, channel = 'rgb', factor = 1, transform) => {
    const lookup = lookups[input];
    const file = lookup ? lookup.inputs?.texture : inputs[input];
    if (typeof file !== 'string' || !file.trim()) return false;
    main[parameter] = {
      inputName: channel, fallback: main[parameter], factor,
      nodeIn: {
        file, resolvedPath: lookup ? lookup.resolvedPaths?.texture : document.resolvedPaths?.[input],
        sourceColorSpace: lookup ? lookup.colorSpaces?.texture : document.colorSpaces?.[input],
        sampleTransform: transform,
        wrapS: lookup?.inputs?.wrap_s,
        wrapT: lookup?.inputs?.wrap_t,
        // Keep each map's sampling state; packing unrelated maps destroys it.
        mdlUV: omni ? {
          scale: vector(inputs.texture_scale, [1, 1]),
          translation: vector(inputs.texture_translate, [0, 0]),
          rotation: scalar(inputs.texture_rotate, 0) * Math.PI / 180,
        } : lookup ? {
          scale: vector(lookup.inputs.scale, [1, 1]),
          translation: vector(lookup.inputs.offset, [0, 0]),
          rotation: scalar(lookup.inputs.rotation, 0),
          gltf: true,
        } : undefined,
      },
    };
    return true;
  };

  if (omni) {
    const tint = vector(inputs.diffuse_tint, [1, 1, 1]);
    main.diffuseColor = multiply(vector(inputs.diffuse_color_constant, [0.2, 0.2, 0.2]), tint);
    texture('diffuseColor', 'diffuse_texture', 'rgb', tint.map(value => value * Math.max(0, scalar(inputs.albedo_brightness, 1))));
    main.roughness = unit(inputs.reflection_roughness_constant, 0.5);
    main.metallic = unit(inputs.metallic_constant, 0);
    const orm = enabled(inputs.enable_ORM_texture) && typeof inputs.ORM_texture === 'string' && inputs.ORM_texture.length;
    for (const [parameter, input, influence, channel] of [
      ['roughness', 'reflectionroughness_texture', 'reflection_roughness_texture_influence', 'g'],
      ['metallic', 'metallic_texture', 'metallic_texture_influence', 'b'],
    ]) {
      const weight = unit(inputs[influence], 0);
      if (weight > 0) texture(parameter, orm ? 'ORM_texture' : input, orm ? channel : 'r', 1,
        { scale: weight, bias: main[parameter] * (1 - weight) });
    }
    settings.aoMapIntensity = unit(inputs.ao_to_diffuse, 0);
    if (settings.aoMapIntensity > 0) texture('occlusion', orm ? 'ORM_texture' : 'ao_texture', 'r');
    if (enabled(inputs.enable_emission)) {
      main.emissiveColor = vector(inputs.emissive_color, [1, 0.1, 0.1]).map(value => value * Math.max(0, scalar(inputs.emissive_intensity, 40)));
      if (main.emissiveColor.some(value => value > 0)) texture('emissiveColor', 'emissive_mask_texture', 'rgb', main.emissiveColor);
    }
    if (enabled(inputs.enable_opacity)) {
      main.opacity = unit(inputs.opacity_constant, 1);
      main.opacityThreshold = unit(inputs.opacity_threshold, 0);
      if (enabled(inputs.enable_opacity_texture)) {
        const mode = inputs.opacity_mode;
        const channel = mode === 0 || mode === 'mono_alpha' ? 'a'
          : mode === 2 || mode === 'mono_luminance' ? 'luminance'
          : mode === 3 || mode === 'mono_maximum' ? 'maximum' : 'average';
        texture('opacity', 'opacity_texture', channel);
      }
      settings.transparent = main.opacityThreshold === 0 && (!!main.opacity?.nodeIn || main.opacity < 1);
      // OmniPBR's diffuse texture contributes RGB only; opacity is independent.
      if (main.diffuseColor?.nodeIn) main.diffuseColor.nodeIn.ignoreAlpha = true;
    }
    const strength = Math.max(0, scalar(inputs.bump_factor, 1));
    if (strength > 0 && inputs.enable_normal_texture !== false && inputs.enable_normal_texture !== 0) texture('normal', 'normalmap_texture');
    settings.normalScale = [enabled(inputs.flip_tangent_u) ? -strength : strength,
      inputs.flip_tangent_v === false || inputs.flip_tangent_v === 0 ? strength : -strength];
    if (enabled(inputs.enable_clearcoat)) {
      main.clearcoat = unit(inputs.clearcoat_weight, 1);
      main.clearcoatRoughness = unit(inputs.clearcoat_reflection_roughness, 0);
    }
  } else {
    main.diffuseColor = vector(inputs.base_color_factor, [1, 1, 1]);
    texture('diffuseColor', 'base_color_texture', 'rgb', main.diffuseColor);
    main.metallic = unit(inputs.metallic_factor, 1);
    main.roughness = unit(inputs.roughness_factor, 1);
    if (main.metallic > 0) texture('metallic', 'metallic_roughness_texture', 'b', main.metallic);
    if (main.roughness > 0) texture('roughness', 'metallic_roughness_texture', 'g', main.roughness);
    const normalScale = Math.max(0, scalar(lookups.normal_texture?.inputs?.normal_scale_factor, scalar(inputs.normal_scale, 1)));
    if (normalScale > 0) texture('normal', 'normal_texture');
    settings.normalScale = [normalScale, normalScale];
    settings.aoMapIntensity = unit(inputs.occlusion_strength, 1);
    if (settings.aoMapIntensity > 0) texture('occlusion', 'occlusion_texture', 'r');
    main.emissiveColor = vector(inputs.emissive_factor, [0, 0, 0]).map(value => value * Math.max(0, scalar(inputs.emissive_strength, 1)));
    if (main.emissiveColor.some(value => value > 0)) texture('emissiveColor', 'emissive_texture', 'rgb', main.emissiveColor);
    main.clearcoat = unit(inputs.clearcoat_factor, 0);
    main.clearcoatRoughness = unit(inputs.clearcoat_roughness_factor, 0);
    if (main.clearcoat > 0) {
      texture('clearcoat', 'clearcoat_texture', 'r', main.clearcoat);
      if (main.clearcoatRoughness > 0) texture('clearcoatRoughness', 'clearcoat_roughness_texture', 'g', main.clearcoatRoughness);
    }
    settings.specularColor = vector(inputs.specular_color_factor, [1, 1, 1]);
    settings.specularIntensity = unit(inputs.specular_factor, 1);
    main.ior = Math.max(1, scalar(inputs.ior, 1.5));
    const mode = String(inputs.alpha_mode ?? 'opaque').split('::').pop().toLowerCase();
    const mask = mode === 'mask' || mode === 'alpha_mode_mask' || mode === '1';
    const blend = mode === 'blend' || mode === 'alpha_mode_blend' || mode === '2';
    if (mask || blend) {
      main.opacity = unit(inputs.base_alpha, unit(inputs.base_color_factor?.[3], 1));
      // The base-color map's alpha is already multiplied by Three's map chunk.
      settings.transparent = blend;
      main.opacityThreshold = mask ? unit(inputs.alpha_cutoff, 0.5) : 0;
    }
  }
  return { main, settings, family: omni ? 'OmniPBR' : 'gltf_material' };
}
