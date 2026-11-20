# MaterialX bounded volumes

These MIT-licensed loader/addon sources come from Needle's three.js fork,
commit `c493364dc151230578999ff037a2966993d49643`.
They share the application's three.js renderer and TSL runtime.
The optional `@needle-tools/usd/volumes` entry exposes
the factory for `createThreeHydra({ materialXVolumeFactory })`; the base entry
points do not import this loader or require the newer node renderer APIs.

Adaptations:

- `MaterialXArchive.js` imports the public three.js fflate addon.
- The existing MaterialX TSL math/noise helpers are included under `nodes/`.
  Their renderer imports use public `three/tsl`; loader imports select these
  helpers to preserve the fork's MaterialX semantics and missing public exports.
- The unused UV-transform compile-context entry and import are omitted.
- Empty/non-scattering samples skip shadow integration; emitted and scattered radiance are unchanged.
- Optional opaque color/depth nodes let multi-pass compositors provide the resolved
  HDR scene and depth without extra framebuffer copies.

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
