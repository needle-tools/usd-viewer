export const fixtureBasePath = "/test-fixtures/";

export const testAssetLibrary = [
  { group: "glTF Plugin", label: "DamagedHelmet GLB", root: "asset-explorer/DamagedHelmet.glb-reference.usda", files: ["asset-explorer/DamagedHelmet.glb-reference.usda", "asset-explorer/DamagedHelmet.glb"] },
  { group: "glTF Plugin", label: "DamagedHelmet USDZ", root: "asset-explorer/DamagedHelmet.glb.three.usdz" },
  { group: "glTF Plugin", label: "BoomBox GLB", root: "asset-explorer/BoomBox.glb-reference.usda", files: ["asset-explorer/BoomBox.glb-reference.usda", "asset-explorer/BoomBox.glb"] },
  { group: "glTF Plugin", label: "BoomBox USDZ", root: "asset-explorer/BoomBox.glb.three.usdz" },
  { group: "glTF Plugin", label: "CesiumMan GLB", root: "asset-explorer/CesiumMan.glb-reference.usda", files: ["asset-explorer/CesiumMan.glb-reference.usda", "asset-explorer/CesiumMan.glb"] },
  { group: "glTF Plugin", label: "CesiumMan USDZ", root: "asset-explorer/CesiumMan.glb.openusd.usdz" },

  { group: "Composition", label: "Payload Root", root: "payloads/payload_root.usda", files: ["payloads/payload_root.usda", "payloads/payload_payload.usda"] },
  { group: "Composition", label: "Nested Variants", root: "variants/nested_variants.usda", files: ["variants/nested_variants.usda"] },
  { group: "Composition", label: "Binding Override Variants", root: "variants/material_binding_overrides.usda", files: ["variants/material_binding_overrides.usda"] },
  {
    group: "Composition",
    label: "Parent Folder References",
    root: "resolver-parent/assets/models/parent_ref_root.usda",
    files: [
      "resolver-parent/assets/models/parent_ref_root.usda",
      "resolver-parent/shared/geometry/referenced_cube.usda",
    ],
  },
  { group: "Composition", label: "Parent Folder References URL", root: "resolver-parent/assets/models/parent_ref_root.usda" },

  { group: "USD Concepts", label: "Native Instances", root: "usd-concepts/native_instances.usda", files: ["usd-concepts/native_instances.usda"] },
  { group: "USD Concepts", label: "Point Instancer", root: "usd-concepts/point_instancer.usda", files: ["usd-concepts/point_instancer.usda"] },
  { group: "USD Concepts", label: "Reference Override", root: "usd-concepts/reference_override.usda", files: ["usd-concepts/reference_override.usda", "usd-concepts/reference_base.usda"] },
  { group: "USD Concepts", label: "Inherits + Specializes", root: "usd-concepts/inherits_specializes.usda", files: ["usd-concepts/inherits_specializes.usda"] },
  { group: "USD Concepts", label: "Collection Binding", root: "usd-concepts/collection_binding.usda", files: ["usd-concepts/collection_binding.usda"] },
  { group: "USD Concepts", label: "Visibility + Purpose", root: "usd-concepts/visibility_purpose.usda", files: ["usd-concepts/visibility_purpose.usda"] },
  { group: "USD Concepts", label: "Render Intent Purposes", root: "usd-concepts/purpose_render_intent.usda", files: ["usd-concepts/purpose_render_intent.usda"] },
  { group: "USD Concepts", label: "Camera + Light", root: "usd-concepts/camera_light.usda", files: ["usd-concepts/camera_light.usda"] },
  { group: "USD Concepts", label: "Time Samples", root: "usd-concepts/time_samples.usda", files: ["usd-concepts/time_samples.usda"] },
  {
    group: "USD Concepts",
    label: "Separate ORM Textures",
    root: "usd-concepts/preview_separate_metal_rough.usda",
    files: [
      "usd-concepts/preview_separate_metal_rough.usda",
      "materialx/textures/brick_dirt_mask.jpg",
      "materialx/textures/brick_roughness.jpg",
      "materialx/textures/brick_mask.jpg",
    ],
  },
  { group: "USD Concepts", label: "Nested Material USDZ", root: "usdz-nested-material.usdz" },

  { group: "Edge Cases", label: "Animated Shared Material Mixed Cull", root: "edge-cases/shared_material_mixed_cull_animated.usda", files: ["edge-cases/shared_material_mixed_cull_animated.usda"] },
  { group: "Edge Cases", label: "Face-Varying Normals Matrix", root: "primvars/facevarying_normals_matrix.usda", files: ["primvars/facevarying_normals_matrix.usda"] },

  { group: "Subdivision", label: "Catmull-Clark Cube", root: "subdivision/catmull_clark_cube.usda", files: ["subdivision/catmull_clark_cube.usda"] },

  { group: "MaterialX", label: "MaterialX External Ref", root: "materialx/mxSimple.usda", files: ["materialx/mxSimple.usda", "materialx/mtlxFiles/standard_surface_default.mtlx"] },
  { group: "MaterialX", label: "MaterialX Nested Ref", root: "materialx/materialx_nested_reference.usda", files: ["materialx/materialx_nested_reference.usda", "materialx/mtlxFiles/standard_surface_default.mtlx"] },
  { group: "MaterialX", label: "MaterialX Variants", root: "materialx/materialx_variant_bindings.usda", files: ["materialx/materialx_variant_bindings.usda", "materialx/mtlxFiles/standard_surface_default.mtlx"] },
  { group: "MaterialX", label: "Preview + MaterialX", root: "materialx/usdshade_preview_with_mtlx_peer.usda", files: ["materialx/usdshade_preview_with_mtlx_peer.usda", "materialx/mtlxFiles/standard_surface_default.mtlx"] },
  { group: "MaterialX", label: "MaterialX Texture + Noise", root: "materialx/materialx_texture_noise.usda", files: ["materialx/materialx_texture_noise.usda", "materialx/mtlxFiles/texture_noise_surface.mtlx", "materialx/textures/checker.png"] },
  { group: "MaterialX", label: "MaterialX Marble", root: "materialx/materialx_marble.usda", files: ["materialx/materialx_marble.usda", "materialx/mtlxFiles/standard_surface_marble_solid.mtlx"] },
  {
    group: "MaterialX",
    label: "MaterialX Procedural Bricks",
    root: "materialx/materialx_procedural_brick.usda",
    files: [
      "materialx/materialx_procedural_brick.usda",
      "materialx/mtlxFiles/standard_surface_brick_procedural.mtlx",
      "materialx/textures/brick_base_gray.jpg",
      "materialx/textures/brick_dirt_mask.jpg",
      "materialx/textures/brick_mask.jpg",
      "materialx/textures/brick_normal.jpg",
      "materialx/textures/brick_roughness.jpg",
      "materialx/textures/brick_variation_mask.jpg",
    ],
  },
];

export function fixtureUrl(path, basePath = fixtureBasePath) {
  return `${basePath}${path}`;
}
