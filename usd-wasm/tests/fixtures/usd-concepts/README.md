# USD Concept Fixtures

These fixtures exercise small, focused OpenUSD concepts through the three.js Hydra bridge and the Three matrix suite.

- `native_instances.usda`: instanceable internal references.
- `point_instancer.usda`: `PointInstancer` prototypes and instance positions.
- `reference_base.usda` and `reference_override.usda`: referenced layer composition with stronger local overrides.
- `inherits_specializes.usda`: class inheritance and specialization composition arcs.
- `collection_binding.usda`: collection-based `UsdShade` material binding using the OpenUSD relationship target pattern.
- `visibility_purpose.usda`: authored `visibility` and `purpose` values. The current Three delegate still emits the invisible guide mesh, so the matrix records the authored USD state and current render behavior until visibility culling is implemented.
- `camera_light.usda`: camera and light prims alongside renderable geometry.
- `time_samples.usda`: stage time metadata and animated transform/material time samples.
