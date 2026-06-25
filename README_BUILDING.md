# Building OpenUSD 26.05 for usd-viewer

This note records how to reproduce the current OpenUSD modernization results for `usd-viewer`.

Date last checked: 2026-06-25

## Scope

The current working branch keeps the existing three.js Hydra bridge architecture and moves it onto OpenUSD 26.05.

Current branches:

- `usd-viewer`: `modernize-openusd-26-05-wasm`
- `OpenUSD`: `modernize-openusd-26-05-wasm`, based on upstream `v26.05`
- `USD-Fileformat-plugins`: `modernize-openusd-26-05-gltf`, based on Adobe `2026.03`

Provenance SHAs for this checkpoint:

- `usd-viewer`: this branch commit; use `git rev-parse HEAD` after applying these docs, because a commit cannot embed its own final SHA.
- `OpenUSD`: `091e1c02196d7bbda8b536ec745b36824da71589`
- `USD-Fileformat-plugins`: `ca3c2de5553648ae280077ddde079b6f3362a830`
- `needle-engine-materialx`: `57183d693f33ed230e199c73bb6fe70df934c0ab` (`@needle-tools/materialx@1.7.0`)
- `MaterialX` sample source: `ab218c56f016a9a2d398e8d306f3aeb439ae9e9e`
- `emsdk`: `af78ec5c14c4ae7d14cfef39fc46a6c43ccd844f` (`emcc 4.0.23`, Emscripten `7a5d93b50f6a3a35e85a0d2fc9e667b8498e6aed`)

Important local repositories:

```sh
/Users/herbst/git/usd-viewer
/Users/herbst/git/OpenUSD
/Users/herbst/git/USD-Fileformat-plugins
/Users/herbst/git/MaterialX
/Users/herbst/git/emsdk
```

## Current Result

This checkpoint is a release-candidate modernization baseline for the
OpenUSD 26.05 wasm + three.js Hydra path. The wasm bundle includes OpenSubdiv,
OpenUSD MaterialX/`hdMtlx`, and Adobe `usdGltf`. Hydra-provided MaterialX
documents are wired into `@needle-tools/materialx`; USD Preview Surface and
glTF-derived Preview Surface networks stay on the existing Preview Surface path.

Working now:

- OpenUSD 26.05 builds natively.
- Adobe's glTF plugin builds natively against OpenUSD 26.05.
- Upstream OpenUSD 26.05 wasm builds and runs the shipped `wasmFetchResolver` example.
- The modernized `hdEmscripten` Hydra bridge builds for wasm and produces `emHdBindings.js` and `emHdBindings.wasm`; resources are embedded into the JS/wasm output and there is no `.data` sidecar.
- The core USD programmatic API exposed by that bridge is generated from `pxr/usdImaging/hdEmscripten/bindgen/core-bindings.json`; the same generator emits `usd-core-bindings.d.ts`.
- The viewer branch now checks in the MaterialX-enabled OpenUSD 26.05 Hydra wasm sidecars with Adobe `usdGltf` statically linked.
- The checked-in sidecars load in Node and expose the viewer runtime APIs, including `HdWebSyncDriver`, filesystem helpers, `driver.GetStage()`, stage authoring helpers, and USDZ packaging.
- The core inspection API now exposes usdview-style stage/prim/property/composition data from USD itself, including `Prim.GetAttributes()`, `Prim.GetRelationships()`, `Prim.GetPrimStackWithLayerOffsets()`, `Prim.GetPrimIndex()`, `Prim.GetCompositionArcs()`, `Stage.GetLayerStack()`, `Stage.GetUsedLayers()`, `Stage.GetCompositionErrors()`, and stage-scoped `UsdNotice::ObjectsChanged` callbacks via `Stage.RegisterObjectsChanged()`/`Stage.RevokeObjectsChanged()`. The three.js demo panel uses those APIs for prim hierarchy inspection, selectable layer-stack/spec-stack navigation, selected layer details, ObjectsChanged notices, and timeline controls backed by the active Hydra `SetTime` state.
- The example viewer includes a Svelte 5 runes-based `Usdview` panel, built with Vite 8 and `@sveltejs/vite-plugin-svelte` 7, that reads those USD APIs directly from `driver.GetStage()`. It is an inspection UI layered beside the Hydra viewport, not a Hydra projection.
- Browser matrix validation passes in headed Chromium for the supported cases listed below.
- OpenSubdiv is built for wasm and linked into the Hydra bundle; the matrix includes a Catmull-Clark cube fixture that verifies the runtime geometry is refined beyond the authored 8-point control cage.
- Variant and payload composition edits are applied through `HdWebSyncDriver.Repopulate()` so Hydra rebuilds the populated prim set after the USD stage changes.
- Hydra deletion is mirrored through the official `HdRenderDelegate::DestroyRprim` and `DestroySprim` hooks; the wasm render delegate notifies the JS bridge before deleting the C++ prim so Three objects are removed instead of lingering through variant switches.
- Hydra visibility and purpose/render-intent support is bridged from USD imaging. The initial viewer pass includes USD `default` and `render` purposes; `proxy`, `guide`, and invisible rprims stay hidden unless a caller switches the view through `handle.setIncludedPurposes(...)` or provides an initial `createThreeHydra({ includedPurposes })` value before first draw.
- Hydra native instances and PointInstancer prims are forwarded through hdEmscripten instancer transforms and represented as Three `InstancedMesh` objects. Prototype meshes remain present for shared geometry/material ownership but are hidden; matrix assertions expand the instance matrices and verify authored instance positions.
- USD `Camera` and USD Lux light prims are bridged as Hydra Sprims. The wasm render delegate pulls composed camera/light state through Hydra `Sync()` and the JS render delegate owns the corresponding Three objects. `createThreeHydra({ showScenePrimitiveHelpers: true })`, or the camera/light-specific helper flags, add visible Three helpers for inspection; the default renderer path does not add helper geometry. USD Lux `inputs:intensity` and `inputs:exposure` are applied when creating preview Three lights, with `scenePrimitiveLightIntensityScale` defaulting to `0.01` so authored Lux values do not overexpose the demo scene.
- MaterialX shader generation is enabled through Hydra-provided documents only. There is no sidecar-harvesting fallback path.
- HTTP/browser asset loading in the hdEmscripten resolver now uses Asyncify-backed `fetch()` instead of synchronous `XMLHttpRequest`. The resolver emits `needle-usd-asset-fetch-progress` browser events and the package-level `getUsdModule({ onAssetFetchProgress })` callback reports active downloads and byte progress.
- Async USD APIs that can cross resolver fetches are registered with Embind `async()`, including `OpenStage`, `CreateUsdzPackage`, `Prim.Load`, `Prim.Unload`, `Prim.SetVariantSelection`, `HdWebSyncDriver.Draw`, and `HdWebSyncDriver.Repopulate`.
- The viewer pauses Hydra draw calls while an async USD edit is in flight, then repopulates and draws once after the edit. This avoids re-entering Hydra during variant/payload composition changes.
- Raw `.glb` opens are validated for BoomBox, CesiumMan, and DamagedHelmet through Adobe's glTF plugin.
- The previous Asset Explorer CesiumMan USDZ was removed because it was a 10 KB Three.js export with no `Mesh` prims. The checked-in `CesiumMan.glb.openusd.usdz` was regenerated from `CesiumMan.glb` through the OpenUSD/Adobe `usdGltf` path and is renderable.
- `CesiumMan.glb.openusd.usdz` intentionally keeps the diffuse texture as a bracket-addressed GLB subasset, `@CesiumMan.glb[Cesium_Man-effect_diffuse.jpg]@`. OpenUSD commit `60936c01a` fixes nested package resolver dispatch so `USDZ[GLB[image]]` opens through the inner glTF package resolver; OpenUSD commit `ea0adc529` anchors hdEmscripten browser asset reads to the stage root layer.
- The viewer texture bridge now falls through to Hydra's `driver.getFile()` for absolute package paths, so OpenUSD's resolver remains the authority for bracket-addressed images instead of JS rejecting them early.
- The checked-in viewer opens the regression assets that previously broke during modernization: cube, teapot, Carbon Frame Bike USDA/USDZ, and McUsd.
- The example viewer includes local buttons for MaterialX external references, nested MaterialX references, variant-authored MaterialX bindings, payloads, nested variants, texture/noise MaterialX, MaterialX marble and procedural brick samples, mixed Preview Surface + MaterialX stages, raw GLB assets, regenerated CesiumMan USDZ, USD concept fixtures, nested material-in-USDZ package resolution, and API-constructed scenes.

Still to do before publishing a public package:

- Publish/deploy from the checked `@needle-tools/usd` package artifacts.
- Decide whether to keep or silence known non-fatal warnings for fixtures without tangents and glTF assets that expose separate metalness/roughness textures.
- Watch bundle size/performance after enabling full Asyncify instrumentation. The current Emscripten 4.0.23 build intentionally removed the old broad `ASYNCIFY_REMOVE` list because it stripped instrumentation from USD/Sdf/Crate paths that can fetch assets during composition.

The viewer currently has the MaterialX-enabled OpenUSD 26.05 Hydra wasm bundle checked in under:

```sh
usd-wasm/src/bindings/
```

Files:

- `emHdBindings.js`
- `emHdBindings.wasm`
- `openusd-build-info.json`

Modern Emscripten does not emit `emHdBindings.worker.js` for this build, so the old worker import was removed from `usd-wasm/src/bindings/index.js`.

Installed source bundle:

```sh
/Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe/bin
/Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe/share/hdEmscripten/usd-core-bindings.d.ts
/Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe/share/hdEmscripten/openusd-build-info.json
```

The checked-in runtime exposes the same provenance at runtime via
`USD.GetBuildInfoJson()` and the package helper `getOpenUsdBuildInfo(USD)`.
The current bundle reports OpenUSD `091e1c02196d7bbda8b536ec745b36824da71589`
with `usdImaging`, `hydraBridge`, `materialX`, `openSubdiv`, and `usdGltf`
enabled.

## Done Criteria For This Modernization

Treat the modernization as production-ready only when all of these are true:

- The MaterialX-enabled wasm Hydra bundle is the checked-in viewer bundle.
- `npm run test:bindings` passes.
- The three.js matrix passes for the supported three.js versions in WebGL and WebGPU modes; the older local Three `^0.164.1` runtime reports WebGPU modes as unsupported.
- At least one USD Preview Surface fixture renders correctly.
- MaterialX shader generation is enabled through Hydra-provided data with browser coverage.
- At least one glTF/GLB-derived USD path is validated.
- Raw `.glb` opens are validated after the Adobe plugin is linked into wasm.
- Browser tests run from a clean checkout without relying on local installed prefixes except where documented.

## Existing Prefixes

```sh
/Users/herbst/OpenUSD-26.05-native
/Users/herbst/OpenUSD-26.05-wasm
/Users/herbst/OpenUSD-26.05-wasm-hydra-exp
/Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe
/Users/herbst/MaterialX-1.39.5-wasm-openusd
/Users/herbst/USD-Fileformat-plugins-2026.03-openusd-26.05
/Users/herbst/USD-Fileformat-plugins-2026.03-wasm-probe
```

## Quick Verification

From the OpenUSD repo:

```sh
cd /Users/herbst/git/OpenUSD
./herbst/smoke/wasm-hydra-bindings-node.sh

OPENUSD_WASM_HYDRA_PREFIX=/Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe \
  ./herbst/smoke/wasm-hydra-bindings-node.sh

bash -n herbst/smoke/*.sh
```

From the viewer repo:

```sh
cd /Users/herbst/git/usd-viewer/usd-wasm
npm run test:bindings

node --check src/create.three.js
node --check src/bindings/index.js
node --check tests/bindings/bindings-artifacts.test.mjs
node --check scripts/cache-three-matrix.mjs
node --check tests/three-matrix/static/main.js
node --check tests/three-matrix/usd-three-matrix.spec.ts
npx vite build
```

Expected current result:

- Both OpenUSD Node smoke tests pass and expose `HdWebSyncDriver`, filesystem helpers, and `ready.then`.
- `npm run test:bindings` passes 7 tests, including generated authoring/USDZ packaging and usdview-style inspection/notice APIs.
- The syntax checks and example build pass.
- The `usd-wasm/examples` build runs on Vite 8/Svelte 5 with rune-backed inspector state.

## Browser Matrix Status

Run:

```sh
cd /Users/herbst/git/usd-viewer/usd-wasm
USD_THREE_MATRIX_BROWSER=chromium USD_THREE_MATRIX_HEADED=1 npm run test:three-matrix -- --versions 0.184.0
```

Current result on this machine:

- The Three matrix cache is generated.
- The manifest is written for 168 cases: local Three `^0.164.1` and cached Three `0.184.0`, each across WebGL, WebGPU forced-WebGL2, and WebGPU modes, with twenty-eight fixtures.
- The test passes in headed Chromium.
- The latest dependency-refresh pass uses the published `@needle-tools/materialx@1.7.0` package, not a local `npm link`.

Observed result on 2026-06-25:

```text
summary: passed 112, unsupported 56, failed 0
```

To isolate a renderer backend while debugging, pass a comma-separated mode list
through the repo-local cache script filter:

```sh
USD_THREE_MATRIX_BROWSER=chromium USD_THREE_MATRIX_HEADED=1 npm run test:three-matrix -- --versions 0.184.0 --renderer-modes webgl
USD_THREE_MATRIX_BROWSER=chromium USD_THREE_MATRIX_HEADED=1 npm run test:three-matrix -- --versions 0.184.0 --renderer-modes webgpu-force-webgl2,webgpu
```

Renderable fixtures that pass with geometry and materials:

- `examples/public/test.usdz`
- `tests/fixtures/materialx/mxSimple.usda` plus `mtlxFiles/standard_surface_default.mtlx`
- `tests/fixtures/materialx/materialx_nested_reference.usda` plus `mtlxFiles/standard_surface_default.mtlx`
- `tests/fixtures/materialx/materialx_variant_bindings.usda` plus `mtlxFiles/standard_surface_default.mtlx`
- `tests/fixtures/materialx/usdshade_preview_with_mtlx_peer.usda` plus `mtlxFiles/standard_surface_default.mtlx`
- `tests/fixtures/materialx/materialx_texture_noise.usda` plus `mtlxFiles/texture_noise_surface.mtlx` and `textures/checker.png`
- `tests/fixtures/materialx/materialx_marble.usda` plus MaterialX sample `mtlxFiles/standard_surface_marble_solid.mtlx`
- `tests/fixtures/materialx/materialx_procedural_brick.usda` plus MaterialX sample `mtlxFiles/standard_surface_brick_procedural.mtlx` and `textures/brick_*.jpg`
- `tests/fixtures/payloads/payload_root.usda` plus `payload_payload.usda`
- `tests/fixtures/variants/nested_variants.usda`
- `tests/fixtures/variants/material_binding_overrides.usda`
- `tests/fixtures/subdivision/catmull_clark_cube.usda`
- `tests/fixtures/usd-concepts/native_instances.usda`
- `tests/fixtures/usd-concepts/point_instancer.usda`
- `tests/fixtures/usd-concepts/reference_override.usda` plus `reference_base.usda`
- `tests/fixtures/usd-concepts/inherits_specializes.usda`
- `tests/fixtures/usd-concepts/collection_binding.usda`
- `tests/fixtures/usd-concepts/visibility_purpose.usda`
- `tests/fixtures/usd-concepts/purpose_render_intent.usda`
- `tests/fixtures/usd-concepts/camera_light.usda`
- `tests/fixtures/usd-concepts/time_samples.usda`
- `tests/fixtures/usdz-nested-material.usdz`, which contains a root reference, nested sublayered material, and package-internal texture
- Asset Explorer `BoomBox.glb.three.usdz`
- Asset Explorer `BoomBox.glb`
- OpenUSD/Adobe `usdGltf` converted `CesiumMan.glb.openusd.usdz`
- Asset Explorer `CesiumMan.glb`
- Asset Explorer `DamagedHelmet.glb.three.usdz`
- Asset Explorer `DamagedHelmet.glb`

The old `CesiumMan.glb.three.usdz` fixture was removed after inspection showed it contained no `def Mesh` prims. The replacement `CesiumMan.glb.openusd.usdz` was generated from the tracked `CesiumMan.glb` with the OpenUSD 26.05 wasm Adobe `usdGltf` plugin path; its USDA layer records `generator = "Adobe usdGltf 1.0; glTF generator: COLLADA2GLTF"` and the matrix now treats it as renderable.

The checked-in CesiumMan USDZ keeps the original GLB subasset texture reference:
`@CesiumMan.glb[Cesium_Man-effect_diffuse.jpg]@`. The browser matrix asserts
that this nested `USDZ[GLB[image]]` path resolves to a textured material, so
future regressions in bracket-addressed package extraction fail visibly.

Variant-specific matrix assertions now verify that `material_binding_overrides.usda`
switches from one `Painted` mesh to one `Metal` mesh, `nested_variants.usda`
switches shape/finish without double-rendering stale geometry, CesiumMan USDZ
has at least one textured material, `visibility_purpose.usda` keeps invisible
geometry hidden, `purpose_render_intent.usda` shows only `default`/`render`
purpose meshes by default and then reveals `proxy`/`guide` after a runtime
`handle.setIncludedPurposes(["default", "render", "proxy", "guide"])` switch,
`native_instances.usda` renders two visible instance placements from one
`InstancedMesh`, `point_instancer.usda` renders three point-instanced placements
from hidden prototype meshes, `camera_light.usda` exposes a Three camera and
light plus opt-in helpers, and `usdz-nested-material.usdz` resolves the internal
texture on a material authored in a nested package layer.

## Headed Viewer Regression Pass

The actual `usd-wasm/examples` viewer was also validated in headed Chromium at:

```text
http://127.0.0.1:5175/
```

Latest report:

```text
/Users/herbst/git/usd-viewer/.cache/browser-validation-isolated-2026-06-24T15-42-40-530Z/report.json
/Users/herbst/git/usd-viewer/.cache/browser-validation-bike-usdz-long-2026-06-24T16-23-43-543Z/report.json
```

Passing assets:

```text
USDZ Cube                scene=1 invalidPreviewSurface=0 fatal=0 networkFailures=0 usdErrors=0
Teapot USD               scene=1 invalidPreviewSurface=0 fatal=0 networkFailures=0 usdErrors=0
Carbon Frame Bike USDZ   scene=1 invalidPreviewSurface=0 fatal=0 networkFailures=0 usdErrors=0
Carbon Frame Bike USDA   scene=1 invalidPreviewSurface=0 fatal=0 networkFailures=0 usdErrors=0
McUsd USDA               scene=1 invalidPreviewSurface=0 fatal=0 networkFailures=0 usdErrors=0
```

Additional real-page buttons validated after the local fixture expansion:

```text
MaterialX External Ref   Loaded, console errors=0
MaterialX Nested Ref     Loaded, console errors=0
MaterialX Variants       Loaded, console errors=0
Preview + MaterialX      Loaded, console errors=0
MaterialX Texture+Noise  Loaded, console errors=0
MaterialX Marble         Loaded, console errors=0
MaterialX Bricks         Loaded, console errors=0
Payload Root             Loaded, unload/load controls work, console errors=0
Nested Variants          Loaded, root and nested dropdowns work, console errors=0
Binding Override Variant Loaded, dropdown material switch works, console errors=0
DamagedHelmet GLB        Loaded, console errors=0
BoomBox GLB              Loaded, console errors=0
CesiumMan GLB            Loaded, console errors=0
CesiumMan USDZ           Loaded, console errors=0
Preview Material API     Loaded, console errors=0
Animated Color API       Loaded, console errors=0
Variant Sphere API       Loaded, shape dropdown works, root-layer variants preserved
Variant Cube API         Loaded, console errors=0
```

Known warnings from that headed pass:

- MaterialX reports missing tangents for the simple sphere MaterialX fixtures. The texture/noise, marble, and procedural brick MaterialX fixtures author tangents and run without that warning.

Additional headed async resolver check on 2026-06-25:

```text
Teapot USD -> modelVariant Fancy -> Applied, console errors=0
HTTPS References -> Loaded, resolver progress events=172, console errors=0
HTTPS References -> USDZ Cube switch -> Loaded, console errors=0
Gingerbread USDC -> Loaded
Gingerbread USDA -> Loaded
Headed WebGL matrix slice with OpenSubdiv fixture -> 36 passed, 0 failed; Catmull-Clark cube refined to 576 positions from 8 authored control points
Full headed matrix -> 108 cases, 72 passed, 36 unsupported, 0 failed
Stress sequence DamagedHelmet GLB -> BoomBox USDZ -> CesiumMan USDZ -> MaterialX Texture+Noise -> MaterialX Bricks -> Gingerbread USDA -> Loaded, visible textures correct, no out-of-memory errors
Order-dependent visual goldens -> MaterialX Texture+Noise and MaterialX Bricks stay flat, textured panels after USDZ Cube, payload, variants, GLB/USDZ, and subdivision warmup loads
Headed 0.184.0 matrix after instancer/camera-light bridge -> 168 cases, 112 ready, 56 unsupported on old local Three WebGPU modes, 0 failed
Headed 0.185.0 matrix after 1.0 prerelease prep -> 116 cases, 87 ready, 29 unsupported on old local Three WebGPU modes, 0 failed
Headed Needle Engine matrix -> @needle-tools/engine 5.1.2 dist + module runtime shapes, both ready, Three r169.19
```

Known caveat from that pass:

- `Hydra draw is still pending after 15000ms` can still appear after the `HTTPS References` load. The app remains responsive and the asset reaches `Loaded HTTPS References`; the measured recent frame gap after load was about 10ms, with one earlier heavy-work gap around 683ms.
- CesiumMan raw GLB reports an unsupported tangent primvar.

Run the viewer visual golden checks from `usd-wasm` with:

```bash
USD_VIEWER_VISUAL_BROWSER=chromium npm run test:viewer-visual
```

For local headed validation:

```bash
USD_VIEWER_VISUAL_BROWSER=chromium USD_VIEWER_VISUAL_HEADED=1 npm run test:viewer-visual
```

To run only the usdview-style panel regression:

```bash
USD_VIEWER_VISUAL_BROWSER=chromium USD_VIEWER_VISUAL_HEADED=1 npm run test:viewer-visual -- -g "Usdview panel"
```

These tests intentionally load several local assets before the target MaterialX
asset. The MaterialX panel fixtures explicitly author
`uniform token subdivisionScheme = "none"` because USD's mesh fallback scheme is
Catmull-Clark; omitting it lets a refined Hydra path correctly subdivide what
was intended to be a polygonal test panel.

The final long Bike USDZ recheck also has `cannotSaveLayer=0`, confirming that
the browser no longer attempts to save a package-backed layer after the
in-memory skinning bake.

## Why Upstream Wasm Disables USD Imaging

Upstream OpenUSD's stock wasm build is meant to produce embeddable static USD libraries, not a browser renderer. The upstream README says the wasm target produces static libraries in monolithic mode and does not build command-line tools. The CMake wasm instructions explicitly set:

```sh
-DPXR_BUILD_IMAGING=OFF
```

In `build_scripts/build_usd.py`, the default `--build-target wasm` path also suppresses USD Imaging:

- the normal default is `--usd-imaging`;
- for wasm, `buildUsdImaging` is forced off;
- passing `--usd-imaging` with a wasm target is rejected with `Cannot build Usd Imaging for wasm build targets`;
- passing `--materialx` is also rejected by the stock build script.

This does not mean the wasm build cannot read geometry or material scene data. The core USD libraries still include packages such as `usdGeom`, `usdShade`, `usdLux`, `usdRender`, and `usdSkel`. The installed `/Users/herbst/OpenUSD-26.05-wasm` prefix includes, for example:

```text
libusd_usdGeom.a
libusd_usdShade.a
libusd_usdLux.a
libusd_usdRender.a
```

The intended upstream wasm usage is: write an Emscripten app that links the USD core libraries, exposes the C++ functions you need with Embind, and handles browser file access through a resolver. Pixar's shipped example is `wasmFetchResolver`; it opens a `UsdStage`, prints the prim/property tree, computes dependencies with `UsdUtilsComputeAllDependencies`, and creates a USDZ package. It does not display or render the stage.

For `usd-viewer`, we need more than that stock usage. We need:

- `usdImaging`, so USD scene data is converted into Hydra prims and material networks.
- a wasm render delegate / bridge, so Hydra data is handed to JavaScript.
- the three.js side, so JS turns that Hydra stream into WebGL/WebGPU renderable objects.

That is why this branch carries the Needle-maintained `hdEmscripten` Hydra bridge on top of modern upstream OpenUSD instead of relying on upstream's stock wasm target alone.

## Rebuild: Wasm Hydra Bundle

The reproducible scripts live in the OpenUSD repo under `herbst/smoke`.

Build OpenSubdiv for wasm into the upstream wasm prefix:

```sh
cd /Users/herbst/git/OpenUSD
./herbst/smoke/build-wasm-opensubdiv.sh
```

By default this uses the OpenUSD 26.05 native build's vendored OpenSubdiv 3.6.1
source zip. To intentionally test the checked-out OpenSubdiv repo instead, run
with `OPENSUBDIV_SRC_DIR=/Users/herbst/git/OpenSubdiv`.

Configure and build the non-MaterialX Hydra wasm bundle:

```sh
./herbst/smoke/configure-wasm-hydra-imaging.sh
./herbst/smoke/build-wasm-hydra-imaging.sh
./herbst/smoke/wasm-hydra-bindings-node.sh
```

The install prefix defaults to:

```sh
/Users/herbst/OpenUSD-26.05-wasm-hydra-exp
```

To update the viewer with that bundle:

```sh
cd /Users/herbst/git/usd-viewer
cp /Users/herbst/OpenUSD-26.05-wasm-hydra-exp/bin/emHdBindings.js usd-wasm/src/bindings/
cp /Users/herbst/OpenUSD-26.05-wasm-hydra-exp/bin/emHdBindings.wasm usd-wasm/src/bindings/
rm -f usd-wasm/src/bindings/emHdBindings.data usd-wasm/src/bindings/emHdBindings.worker.js
```

Then run the viewer checks from `usd-wasm`.

## Rebuild: MaterialX-Enabled Wasm Hydra Probe

Do not use OpenUSD's stock `build_usd.py --build-target wasm --materialx`; OpenUSD's build script currently disables MaterialX for wasm. Use the CMake path below.

First build a minimal pthread-compatible wasm MaterialX dependency:

```sh
cd /Users/herbst/git/OpenUSD
./herbst/smoke/build-wasm-materialx-openusd.sh
```

Then configure, build, install, and smoke the MaterialX-enabled Hydra bundle:

```sh
./herbst/smoke/configure-wasm-hydra-materialx.sh
./herbst/smoke/build-wasm-hydra-materialx.sh
```

Expected result:

- `usdMtlx` builds for wasm.
- `hdMtlx` builds for wasm.
- `emHdBindings` links with `PXR_ENABLE_MATERIALX_SUPPORT=ON`.
- `HdWebSyncDriver.SetIncludedPurposes()` is exported and maps USD `default` to Hydra `geometry` while preserving `render`, `proxy`, and `guide` render tags.
- `pxr/usdImaging/hdEmscripten/bindgen/generate_bindings.py` generates `emHdCoreBindings.inc` and `usd-core-bindings.d.ts`.
- Node smoke passes against `/Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe`.
- `emHdBindings.js`/`emHdBindings.wasm` embed USD resource files, including `usdShaders/resources/shaders/shaderDefs.usda` and the `usdMtlx/resources/libraries` MaterialX documents needed by the browser bundle.

Observed sidecar sizes:

```text
MaterialX Emscripten 4.0.23: emHdBindings.js 164K, emHdBindings.wasm 33M
```

Before copying the sidecars, sanity-check the generated embedded resource table:

```sh
rg "usdShaders/resources/shaders/shaderDefs.usda|usdMtlx/resources/libraries/.+\\.mtlx|usdGltf/resources/plugInfo.json" \
  /Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe/bin/emHdBindings.js
```

If the generated `emHdBindings.js` only lists `/usd/plugInfo.json` and
`/usd/usdGltf/resources/plugInfo.json`, the browser bundle will load geometry
but reject `UsdPreviewSurface` shader nodes with `Invalid info:id` diagnostics.
That means the OpenUSD branch is missing the hdEmscripten/USD resource embedding
fixes; rebuild after applying those source fixes.

To update the viewer with the MaterialX-enabled bundle:

```sh
cd /Users/herbst/git/usd-viewer
cp /Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe/bin/emHdBindings.js usd-wasm/src/bindings/
cp /Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe/bin/emHdBindings.wasm usd-wasm/src/bindings/
cp /Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe/share/hdEmscripten/usd-core-bindings.d.ts usd-wasm/src/types/
cp /Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe/share/hdEmscripten/openusd-build-info.json usd-wasm/src/bindings/
rm -f usd-wasm/src/bindings/emHdBindings.data usd-wasm/src/bindings/emHdBindings.worker.js
```

Use the build-system install target, not raw `cmake --install` after a partial
target build. `cmake --build ... --target install` builds install dependencies
such as `usdShaders` before running install rules; raw `cmake --install` only
runs install rules for files that already exist.

## Native OpenUSD and Adobe glTF Plugin

Native OpenUSD 26.05 is installed at:

```sh
/Users/herbst/OpenUSD-26.05-native
```

It includes MaterialX and OpenSubdiv and has been smoke-tested with:

```sh
cd /Users/herbst/git/OpenUSD
./herbst/smoke/native-openusd.sh
```

Adobe's `USD-Fileformat-plugins` 2026.03 glTF plugin is installed at:

```sh
/Users/herbst/USD-Fileformat-plugins-2026.03-openusd-26.05
```

Smoke test:

```sh
cd /Users/herbst/git/OpenUSD
./herbst/smoke/adobe-gltf-plugin.sh
```

That validates `gltf`, `glb`, and `mtlx` file-format discovery, opens sample glTF/GLB assets, and round-trips a sample GLB export/reopen.

## Adobe glTF Plugin Wasm Build

The Adobe glTF plugin now builds as a wasm static archive and is linked into the MaterialX-enabled `emHdBindings` bundle.

Configure against the base OpenUSD wasm prefix:

```sh
cd /Users/herbst/git/USD-Fileformat-plugins
source /Users/herbst/git/emsdk/emsdk_env.sh

emcmake cmake -S . \
  -B /Users/herbst/USD-Fileformat-plugins-2026.03-wasm-probe-build \
  -DCMAKE_INSTALL_PREFIX=/Users/herbst/USD-Fileformat-plugins-2026.03-wasm-probe \
  -DCMAKE_BUILD_TYPE=Release \
  -Dpxr_ROOT=/Users/herbst/OpenUSD-26.05-wasm \
  -Dpxr_DIR=/Users/herbst/OpenUSD-26.05-wasm \
  -DCMAKE_PREFIX_PATH=/Users/herbst/OpenUSD-26.05-wasm \
  -DCMAKE_FIND_ROOT_PATH=/Users/herbst/OpenUSD-26.05-wasm \
  -DPXR_FIND_TBB_IN_CONFIG=OFF \
  -DTBB_INCLUDE_DIRS=/Users/herbst/OpenUSD-26.05-wasm/include \
  -DTBB_tbb_LIBRARY_RELEASE=/Users/herbst/OpenUSD-26.05-wasm/lib/libtbb.a \
  -DTBB_tbbmalloc_LIBRARY_RELEASE=/Users/herbst/OpenUSD-26.05-wasm/lib/libtbbmalloc.a \
  -DZLIB_ROOT=/Users/herbst/OpenUSD-26.05-wasm \
  -DUSD_FILEFORMATS_BUILD_TESTS=OFF \
  -DUSD_FILEFORMATS_ENABLE_FBX=OFF \
  -DUSD_FILEFORMATS_ENABLE_GLTF=ON \
  -DUSD_FILEFORMATS_ENABLE_OBJ=OFF \
  -DUSD_FILEFORMATS_ENABLE_PLY=OFF \
  -DUSD_FILEFORMATS_ENABLE_SPZ=OFF \
  -DUSD_FILEFORMATS_ENABLE_STL=OFF \
  -DUSD_FILEFORMATS_ENABLE_SBSAR=OFF \
  -DUSD_FILEFORMATS_ENABLE_DRACO=OFF \
  -DUSD_FILEFORMATS_ENABLE_OPENIMAGEIO=OFF \
  -DUSD_FILEFORMATS_FETCH_TINYGLTF=ON \
  -DUSD_FILEFORMATS_FETCH_ZLIB=OFF \
  -DUSD_FILEFORMATS_ENABLE_MTLX=ON \
  -DCMAKE_CXX_FLAGS="-pthread --use-port=zlib" \
  -DCMAKE_C_FLAGS="-pthread --use-port=zlib" \
  -DCMAKE_EXE_LINKER_FLAGS="-pthread"

cmake --build /Users/herbst/USD-Fileformat-plugins-2026.03-wasm-probe-build \
  --config Release \
  --target usdGltf \
  --parallel 8

cmake --install /Users/herbst/USD-Fileformat-plugins-2026.03-wasm-probe-build \
  --config Release
```

Wasm-specific Adobe plugin patches in this checkpoint:

- `USD_FILEFORMATS_ENABLE_OPENIMAGEIO=OFF` disables OIIO for wasm and uses warning-return stubs for image read/write/transcode helpers.
- Hio image helpers are guarded because the base wasm prefix does not ship all imaging headers.
- Emscripten TBB imported-target locations are fixed up from the static TBB libraries.
- Native-only `-m64` is disabled for Emscripten so plugin objects are wasm32-compatible.
- `plugInfo.json` uses `LibraryPath: ""` for Emscripten/static builds. Missing `LibraryPath` is rejected by USD, while `../libusdGltf.so` triggers dynamic loading errors.

OpenUSD links the plugin when `PXR_HD_EMSCRIPTEN_GLTF_PLUGIN_PREFIX` points at `/Users/herbst/USD-Fileformat-plugins-2026.03-wasm-probe`. The resulting embedded-resource `emHdBindings.js`/`emHdBindings.wasm` bundle contains `/usd/usdGltf/resources/plugInfo.json`; raw `.glb` fixtures render in headed Chromium.

## MaterialX Client-Side Shape

OpenUSD/Hydra now builds with MaterialX support and embeds the `usdMtlx`
resources into the viewer wasm bundle. The MaterialX path is intentionally
single-source: USD composes the material, Hydra exposes the MaterialX document,
and `@needle-tools/materialx` generates the Three material from that
Hydra-provided document. Do not reintroduce caller-side `.mtlx` sidecar
harvesting or synthetic MaterialX fallback materials.

For browser/WebGPU compatibility, `@needle-tools/materialx` should not import
`three/src/...` and should not require WebGL-only exports such as
`WebGLRenderer` or `UniformsLib` from the host `three` module. Its version is
read from the package's exported `package.json`; Node tests use the JSON loader
registered by the package. The published package currently used by this branch
is:

```sh
cd /Users/herbst/git/usd-viewer/usd-wasm
npm ls @needle-tools/materialx
```

Expected version: `@needle-tools/materialx@1.7.0`. Root
`usd-viewer/package.json` also depends on the same package because `server.js`
serves `/materialx` from root `node_modules` for the production viewer import
map. The production viewer sets `globalThis.NEEDLE_MATERIALX_LOCATION` to
`/materialx/bin/`; the Vite example sets it to `package` so Vite copies the
package wasm/data assets locally. The `@needle-tools/usd` library itself does
not force that global because the raw-browser matrix and import-map viewer use
different asset-serving shapes.

Important current limitations:

- The glTF fixtures still report separate metalness/roughness texture handling as a TODO.
- The local MaterialX implementation is centered on `ShaderMaterial`, so WebGPU must be validated explicitly whenever this path changes.

## Generated USD API Bindings

The core USD API exposed through `driver.GetStage()` is no longer handwritten in
`emHdBindings.cpp`. In OpenUSD, edit:

```sh
pxr/usdImaging/hdEmscripten/bindgen/core-bindings.json
```

CMake runs:

```sh
pxr/usdImaging/hdEmscripten/bindgen/generate_bindings.py
```

and produces:

- `generated/emHdCoreBindings.inc`, included by `emHdBindings.cpp`
- `generated/usd-core-bindings.d.ts`, copied to `share/hdEmscripten`

The generated surface currently covers the core programmatic scene inspection API
needed by `usd-viewer`: `Layer`, `Stage`, `Prim`, `Attribute`, `Relationship`,
and vector helpers. The usdview-style browser surface includes composed prim
children, attributes, relationships, metadata, authored value/resolve info,
time samples, property stacks with layer offsets, prim stacks with layer
offsets, prim indexes, composition arcs, layer stack/used layer info arrays,
composition errors, and stage-scoped `UsdNotice::ObjectsChanged` callbacks.
Layer stack methods return serializable `USDLayerInfo[]` objects instead of live
`SdfLayerHandle` vectors so the browser UI does not depend on embind handle
lifetimes. It also covers the first authoring/package checkpoint:
`CreateStage`, `OpenStage`, `ReleaseStage`, `Stage.DefinePrim`, stage time/up-axis
metadata setters, `Prim.CreateAttribute`, variant add/list/select helpers,
`Prim.DefinePrimInVariant`, `Stage.TraverseAll` for unloaded payload discovery,
payload authoring/load/unload helpers, typed attribute setters including time
samples, `CreateUsdzPackage`, and `ReadFile` for browser download handoff.
Use `stage.GetRootLayer().Export(path)` when the authored layer must preserve
variant sets; `stage.Export(path)` writes a flattened composed stage. `HdWebSyncDriver`
remains an explicit bridge binding because it is the Hydra/three.js transport API
rather than USD itself.

The next API expansion should keep this split: generate generic USD value/path
and scene-editing primitives from the manifest, then generate schema-friendly
TypeScript wrappers from USD `schema.usda` metadata instead of handwriting schema
classes in JavaScript.
