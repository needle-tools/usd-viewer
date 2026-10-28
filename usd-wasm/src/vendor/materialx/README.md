# MaterialX bounded volumes

These MIT-licensed loader/addon sources come from the existing three.js fork,
commit `6c236842315497d50dce95ff10418b1c92889b4e` (`fork/materialx-upstream-api`).
The bounded-volume feature is also maintained on the `materialx/volumes` branch.
They are included here because the registry package `@needle-tools/three@0.185.2-alpha.6`
does not contain this unpublished loader work. The viewer uses the registry
renderer and TSL runtime. The optional `@needle-tools/usd/volumes` entry exposes
the factory for `createThreeHydra({ materialXVolumeFactory })`; the base entry
points do not import this loader or require the newer node renderer APIs.

Local changes:

- `MaterialXArchive.js` imports the public three.js fflate addon.
- The existing MaterialX TSL math/noise helpers are included under `nodes/`.
  Their renderer imports use public `three/tsl`; loader imports select these
  helpers to preserve the fork's MaterialX semantics and missing public exports.
- `BoundedVolumeNodeMaterial.setupLighting()` always enters the integration
  model, including scenes with no lights, so absorption and emission still work.

Supported: a medium bounded by box mesh geometry, procedural absorption and
emission, anisotropic single scattering with directional/point/spot lights,
and VDF/EDF add, multiply, and mix. Coefficients use inverse world units.

Requires `WebGPURenderer({ antialias: false })`, including its `forceWebGL`
backend. The legacy `WebGLRenderer` adapter cannot provide the required opaque
color and depth buffers. Overlapping media, arbitrary mesh boundaries,
environment/area-light scattering, `standard_volume`, and UsdVol/OpenVDB field
loading are not implemented by this path.

`manifest.json` records original Git blob SHA-256 and vendored file SHA-256 for
each source file. `LICENSE` preserves the original three.js MIT notice.
