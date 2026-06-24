# OpenUSD 26.05 Modernization Status

Date: 2026-06-24

This note records the first modernization pass from the Autodesk/Needle OpenUSD wasm fork toward upstream OpenUSD 26.05.

## Branches

- `usd-viewer`: `modernize-openusd-26-05-wasm`
- `OpenUSD`: `modernize-openusd-26-05-wasm`, based on upstream tag `v26.05`
- `USD-Fileformat-plugins`: `modernize-openusd-26-05-gltf`, based on Adobe tag `2026.03`

## Provenance SHAs

These are the source and dependency commits for this checkpoint.

- `usd-viewer`: this branch commit; use `git rev-parse HEAD` after applying these docs, because a commit cannot embed its own final SHA.
- `OpenUSD`: `ea0adc529bb72ee2c621878469d05921c507cf42`
- `USD-Fileformat-plugins`: `ca3c2de5553648ae280077ddde079b6f3362a830`
- `needle-engine-materialx`: `4b56764aca58c1760037975c34cb748f4ff15f27`
- `MaterialX` sample source: `ab218c56f016a9a2d398e8d306f3aeb439ae9e9e`

## Source Provenance

The viewer runtime is based on the Autodesk/Needle wasm Hydra path. The existing README points at Autodesk's `adsk/feature/webgpu` branch and originally expected these generated files:

- `emHdBindings.js`
- `emHdBindings.wasm`
- `emHdBindings.worker.js`
- `emHdBindings.data`

The viewer code imports these in `usd-wasm/src/bindings/index.js` and constructs `HdWebSyncDriver` in `usd-wasm/src/create.three.js`.

Upstream OpenUSD 26.05 does not generate `emHdBindings.*`, and it no longer contains the Autodesk/Needle `hdEmscripten` layer that exposed Hydra to JavaScript. This branch ports that bridge forward as `pxr/usdImaging/hdEmscripten` and emits the modern sidecars used by the viewer:

- `emHdBindings.js`
- `emHdBindings.wasm`
- `emHdBindings.data`

Modern Emscripten does not emit a separate `emHdBindings.worker.js` sidecar for this build.

## Upstream References

- OpenUSD release: https://github.com/PixarAnimationStudios/OpenUSD/releases/tag/v26.05
- OpenUSD documentation: https://openusd.org/release/index.html
- Adobe USD file-format plugins: https://github.com/adobe/USD-Fileformat-plugins
- Adobe plugin release used here: https://github.com/adobe/USD-Fileformat-plugins/releases/tag/2026.03

## Native OpenUSD 26.05

Install prefix:

```sh
/Users/herbst/OpenUSD-26.05-native
```

Build command:

```sh
cd /Users/herbst/git/OpenUSD
PATH="/Applications/CMake.app/Contents/bin:$PATH" \
  /usr/local/bin/python3 build_scripts/build_usd.py \
  --build-variant release \
  --no-examples \
  --no-tutorials \
  --no-usdview \
  --jobs 8 \
  /Users/herbst/OpenUSD-26.05-native
```

Result:

- Build completed successfully.
- OpenUSD built MaterialX and OpenSubdiv as dependencies.
- OpenSubdiv artifacts are installed under `/Users/herbst/OpenUSD-26.05-native/include/opensubdiv` and `/Users/herbst/OpenUSD-26.05-native/lib/libosd*.dylib`.

Native smoke-test environment:

```sh
export PYTHONPATH=/Users/herbst/OpenUSD-26.05-native/lib/python
export PATH=/Users/herbst/OpenUSD-26.05-native/bin:$PATH
export DYLD_LIBRARY_PATH=/Users/herbst/OpenUSD-26.05-native/lib
```

Native smoke-test results:

- `usdcat --help` works.
- Python imports work: `from pxr import Plug, Sdf, Usd`.
- `Sdf.FileFormat.FindByExtension("mtlx")` returns `mtlx`.
- Plugin registry includes `usdMtlx`.
- `usdcat` can flatten `pxr/usdImaging/usdImagingGL/testenv/testUsdImagingGLMaterialXBasic/basicMxZup.usda`.
- `usdchecker` on that upstream sample only reports sample metadata issues (`metersPerUnit`, `defaultPrim`), not plugin loading failures.

## Adobe glTF Plugin

Repository:

```sh
/Users/herbst/git/USD-Fileformat-plugins
```

Install prefix:

```sh
/Users/herbst/USD-Fileformat-plugins-2026.03-openusd-26.05
```

Configure command:

```sh
cd /Users/herbst/git/USD-Fileformat-plugins
rm -rf /Users/herbst/USD-Fileformat-plugins-2026.03-openusd-26.05-build \
       /Users/herbst/USD-Fileformat-plugins-2026.03-openusd-26.05

env PYTHONPATH=/Users/herbst/OpenUSD-26.05-native/lib/python \
    PATH="/Users/herbst/OpenUSD-26.05-native/bin:/Applications/CMake.app/Contents/bin:$PATH" \
    DYLD_LIBRARY_PATH=/Users/herbst/OpenUSD-26.05-native/lib \
    cmake -S . \
      -B /Users/herbst/USD-Fileformat-plugins-2026.03-openusd-26.05-build \
      -DCMAKE_INSTALL_PREFIX=/Users/herbst/USD-Fileformat-plugins-2026.03-openusd-26.05 \
      -DCMAKE_BUILD_TYPE=Release \
      -Dpxr_ROOT=/Users/herbst/OpenUSD-26.05-native \
      -DOpenImageIO_ROOT=/opt/homebrew \
      -DUSD_FILEFORMATS_BUILD_TESTS=OFF \
      -DUSD_FILEFORMATS_ENABLE_FBX=OFF \
      -DUSD_FILEFORMATS_ENABLE_GLTF=ON \
      -DUSD_FILEFORMATS_ENABLE_OBJ=OFF \
      -DUSD_FILEFORMATS_ENABLE_PLY=OFF \
      -DUSD_FILEFORMATS_ENABLE_SPZ=OFF \
      -DUSD_FILEFORMATS_ENABLE_STL=OFF \
      -DUSD_FILEFORMATS_ENABLE_SBSAR=OFF \
      -DUSD_FILEFORMATS_ENABLE_DRACO=ON \
      -DUSD_FILEFORMATS_FETCH_DRACO=ON \
      -DUSD_FILEFORMATS_FETCH_TINYGLTF=ON \
      -DUSD_FILEFORMATS_FETCH_ZLIB=OFF \
      -DUSD_FILEFORMATS_ENABLE_MTLX=ON \
      -DPYTHON_EXECUTABLE=/usr/local/bin/python3
```

Build and install:

```sh
env PYTHONPATH=/Users/herbst/OpenUSD-26.05-native/lib/python \
    PATH="/Users/herbst/OpenUSD-26.05-native/bin:/Applications/CMake.app/Contents/bin:$PATH" \
    DYLD_LIBRARY_PATH=/Users/herbst/OpenUSD-26.05-native/lib \
    cmake --build /Users/herbst/USD-Fileformat-plugins-2026.03-openusd-26.05-build \
      --config Release \
      --parallel 8

env PYTHONPATH=/Users/herbst/OpenUSD-26.05-native/lib/python \
    PATH="/Users/herbst/OpenUSD-26.05-native/bin:/Applications/CMake.app/Contents/bin:$PATH" \
    DYLD_LIBRARY_PATH="/Users/herbst/OpenUSD-26.05-native/lib:/opt/homebrew/lib" \
    cmake --install /Users/herbst/USD-Fileformat-plugins-2026.03-openusd-26.05-build \
      --config Release
```

Patch required in Adobe plugin repo:

- `utils/CMakeLists.txt` links USD libraries before Homebrew `OpenImageIO`.
- Without this, `/opt/homebrew/include` comes before OpenUSD's bundled headers and mixes Homebrew oneTBB headers with OpenUSD's TBB usage.

Plugin smoke-test environment:

```sh
export PYTHONPATH=/Users/herbst/OpenUSD-26.05-native/lib/python
export PATH=/Users/herbst/OpenUSD-26.05-native/bin:$PATH
export DYLD_LIBRARY_PATH=/Users/herbst/USD-Fileformat-plugins-2026.03-openusd-26.05/plugin/usd:/Users/herbst/USD-Fileformat-plugins-2026.03-openusd-26.05/lib:/Users/herbst/OpenUSD-26.05-native/lib:/opt/homebrew/lib
export PXR_PLUGINPATH_NAME=/Users/herbst/USD-Fileformat-plugins-2026.03-openusd-26.05/plugin/usd
```

Plugin smoke-test results:

- `Sdf.FileFormat.FindByExtension("gltf")` returns `gltf`.
- `Sdf.FileFormat.FindByExtension("glb")` returns `gltf`.
- `Sdf.FileFormat.FindByExtension("mtlx")` returns `mtlx`.
- Plugin registry finds `usdGltf_plugin` at the installed `libusdGltf.dylib`.
- `usdcat --loadOnly gltf/tests/SanityCube.gltf test/assets/gltf/cube-colors.glb` succeeds.
- `usdcat gltf/tests/SanityCube.gltf -o /tmp/usdff-sanity.usda` succeeds.
- Python can open `gltf/tests/SanityCube.gltf`, find default prim `/SanityCube`, and find one mesh.
- Exporting the SanityCube stage to `/tmp/usdff-sanity.glb` succeeds, and the exported GLB can be reopened.

## Adobe glTF Plugin Wasm

Additional wasm install prefix:

```sh
/Users/herbst/USD-Fileformat-plugins-2026.03-wasm-probe
```

The Adobe glTF plugin builds as Emscripten static archives and is linked into the MaterialX-enabled `emHdBindings` bundle.

Wasm-specific Adobe plugin patches:

- `USD_FILEFORMATS_ENABLE_OPENIMAGEIO` is available and defaults off for Emscripten. `utils/src/images.cpp` uses warning-return stubs for OIIO-backed image read/write/transcode helpers in that mode.
- Hio image includes and code paths are guarded for base wasm prefixes that do not include all imaging headers.
- Emscripten TBB imported-target locations are fixed up from `TBB_tbb_LIBRARY_RELEASE` and `TBB_tbbmalloc_LIBRARY_RELEASE`.
- Native-only `-m64` is disabled for Emscripten to keep plugin objects wasm32-compatible.
- The generated `plugInfo.json` keeps `LibraryPath: ""` for Emscripten/static builds. USD rejects a missing `LibraryPath`, while a non-empty `../libusdGltf.so` path causes bogus dynamic loading attempts in the browser.

OpenUSD links this plugin when configured with:

```sh
-DPXR_HD_EMSCRIPTEN_GLTF_PLUGIN_PREFIX=/Users/herbst/USD-Fileformat-plugins-2026.03-wasm-probe
```

The resulting browser bundle embeds `/usd/usdGltf/resources/plugInfo.json` and raw `.glb` opens are validated in the headed matrix for BoomBox, CesiumMan, and DamagedHelmet.

## Upstream OpenUSD Wasm

Install prefix:

```sh
/Users/herbst/OpenUSD-26.05-wasm
```

Emscripten:

```sh
/Users/herbst/git/emsdk
emcc 3.1.74
```

Build command:

```sh
cd /Users/herbst/git/OpenUSD
source /Users/herbst/git/emsdk/emsdk_env.sh
PATH="/Applications/CMake.app/Contents/bin:$PATH" \
  /usr/local/bin/python3 build_scripts/build_usd.py \
  --build-target wasm \
  --build-variant release \
  --jobs 8 \
  /Users/herbst/OpenUSD-26.05-wasm
```

Result:

- Build completed successfully.
- Static USD libraries are installed in `/Users/herbst/OpenUSD-26.05-wasm/lib`.
- The upstream `wasmFetchResolver` example is installed in `/Users/herbst/OpenUSD-26.05-wasm/share/usd/examples/bin/wasmFetchResolver`.
- No `emHdBindings.*` artifacts are generated.

Upstream wasm browser smoke test:

```sh
cd /Users/herbst/OpenUSD-26.05-wasm/share/usd/examples/bin/wasmFetchResolver
npm install
npm install --save-dev playwright
npm run server -- --port 8095
```

Tested in headless Chrome with Playwright against `http://localhost:8095/wasmFetchResolver.html`.

Results:

- `Module.calledRun === true`.
- `Module.ShowTree` is available.
- Stage list loads one stage: `stages/teapots/stage.usda`.
- `Show Tree` returns the teapot prim tree.
- `Compute All Dependencies` returns two layers and no unresolved paths.
- No page errors.
- One console 404 was observed for `/favicon.ico`.

## OpenUSD 26.05 Wasm Hydra Bridge

Install prefix:

```sh
/Users/herbst/OpenUSD-26.05-wasm-hydra-exp
```

Source branch:

```sh
/Users/herbst/git/OpenUSD
modernize-openusd-26-05-wasm
```

Build helpers:

```sh
cd /Users/herbst/git/OpenUSD
./herbst/smoke/build-wasm-opensubdiv.sh
./herbst/smoke/configure-wasm-hydra-imaging.sh
./herbst/smoke/build-wasm-hydra-imaging.sh
./herbst/smoke/wasm-hydra-bindings-node.sh
```

Result:

- The wasm Hydra experiment build completed successfully.
- OpenSubdiv 3.6.1 was built for wasm into `/Users/herbst/OpenUSD-26.05-wasm`.
- The ported `pxr/usdImaging/hdEmscripten` target installs:
  - `/Users/herbst/OpenUSD-26.05-wasm-hydra-exp/bin/emHdBindings.js`
  - `/Users/herbst/OpenUSD-26.05-wasm-hydra-exp/bin/emHdBindings.data`
  - `/Users/herbst/OpenUSD-26.05-wasm-hydra-exp/bin/emHdBindings.wasm`
- `emHdBindings.worker.js` is not produced by this modern Emscripten build.
- The generated bundle exports `globalThis["NEEDLE:USD:GET"]`.
- The runtime shim also exposes the filesystem helpers the viewer expects: `FS_readdir`, `FS_rmdir`, and `FS_analyzePath`.
- The Node smoke test loads the installed bundle and verifies `HdWebSyncDriver`, `FS_createDataFile`, `FS_createPath`, `FS_analyzePath`, `FS_readdir`, `FS_rmdir`, `FS_unlink`, and `ready.then`.

The generated wasm sidecars were copied into `usd-wasm/src/bindings/` on the `usd-viewer` modernization branch.

## MaterialX Wasm Hydra Probe

Additional install prefix:

```sh
/Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe
```

MaterialX can be enabled in the OpenUSD 26.05 wasm Hydra build. The working shape is:

```sh
cd /Users/herbst/git/OpenUSD
./herbst/smoke/build-wasm-materialx-openusd.sh
./herbst/smoke/configure-wasm-hydra-materialx.sh
./herbst/smoke/build-wasm-hydra-materialx.sh
```

Result:

- A minimal wasm MaterialX dependency was built at `/Users/herbst/MaterialX-1.39.5-wasm-openusd`.
- MaterialX was built with `-pthread` so its static libraries are compatible with OpenUSD's shared-memory wasm build.
- OpenUSD configured with `PXR_ENABLE_MATERIALX_SUPPORT=ON`.
- `usdMtlx`, `hdMtlx`, and `emHdBindings` build successfully for wasm.
- The installed MaterialX-enabled bundle passes `herbst/smoke/wasm-hydra-bindings-node.sh`.
- Installed sidecar sizes are approximately `190K` for `emHdBindings.js`, `2.2M` for `emHdBindings.data`, and `29M` for `emHdBindings.wasm`.
- `usdMtlx/resources/libraries` installs 56 `.mtlx` files, including `gltf_pbr.mtlx`, `open_pbr_surface.mtlx`, and `usd_preview_surface.mtlx`.
- Adobe `usdGltf` is statically linked into `emHdBindings` when `PXR_HD_EMSCRIPTEN_GLTF_PLUGIN_PREFIX` points at the wasm plugin prefix.

OpenUSD source changes required for this probe:

- `cmake/macros/Private.cmake` now keeps absolute resource source paths intact when generating Emscripten embed/preload file arguments.
- `pxr/usdImaging/hdEmscripten/CMakeLists.txt` explicitly includes `usdMtlx` and `hdMtlx` resources and libraries when `PXR_ENABLE_MATERIALX_SUPPORT=ON`.
- `pxr/usdImaging/hdEmscripten/webRenderDelegate.cpp` advertises `mtlx` as a material render context and shader source type, while keeping the universal render context as fallback. This lets OpenUSD populate real material sprims for MaterialX-authored `outputs:mtlx:surface` materials.
- `pxr/usd/ar/resolver.cpp` dispatches nested package asset opens by the extension of the actual package asset being opened. This fixes `USDZ[GLB[image]]` paths such as `@CesiumMan.glb[Cesium_Man-effect_diffuse.jpg]@`, where the inner GLB package resolver must extract the embedded image.
- `pxr/usdImaging/hdEmscripten/webSyncDriver.h` anchors browser `getFile()` asset reads through the stage root layer so authored package-relative texture paths resolve the same way they do during USD composition.
- `pxr/usdImaging/hdEmscripten/bindgen/core-bindings.json` is now the source of truth for the core `Stage`, `Prim`, `Layer`, `Attribute`, and `Relationship` APIs exposed through `driver.GetStage()` and module-level stage authoring helpers.
- `pxr/usdImaging/hdEmscripten/bindgen/generate_bindings.py` generates both the Embind C++ include and `usd-core-bindings.d.ts` from that manifest. `emHdBindings.cpp` now only registers the generated core API and keeps the explicit `HdWebSyncDriver` bridge binding.

Hydra exposure:

- The C++ bridge calls `sceneDelegate->GetMaterialResource()` and forwards every `HdMaterialNetworkMap` node to JavaScript via `updateNode(networkId, nodePath, parameters)`.
- It also forwards relationships via `updateFinished(networkId, relationships)`.
- When built with MaterialX support, it also asks `hdMtlx` to translate the Hydra material network into MaterialX XML and forwards that document to JavaScript through `updateMaterialXDocument(...)`.

Client-side MaterialX status:

- `usd-wasm/src/hydra/ThreeJsRenderDelegate.js` stores only Hydra-provided MaterialX documents and tries `@needle-tools/materialx` shader generation before falling back to the existing USD Preview Surface-to-`MeshPhysicalMaterial` path.
- The browser matrix includes `usd-wasm/tests/fixtures/materialx/mxSimple.usda` plus `mtlxFiles/standard_surface_default.mtlx`; this fixture creates two `MaterialXMaterial` instances named `Default_Smooth` and `Default_Green`.
- The matrix also includes MaterialX's standard surface marble sample (`standard_surface_marble_solid.mtlx`) and procedural brick sample (`standard_surface_brick_procedural.mtlx` with `brick_*.jpg` textures), wrapped by local USDA files that bind those materials through USD composition.
- The MaterialX fixture now uses the golden Hydra path: OpenUSD composes the `.mtlx` reference, Hydra creates material sprims for `/Materials/MaterialX/Materials/Default_Smooth` and `/Materials/MaterialX/Materials/Default_Green`, `hdMtlx` serializes the material documents, and JS passes those documents to `@needle-tools/materialx`.
- The matrix import map loads `@needle-tools/materialx` as raw browser ESM through `/__rawfs`, with `three` resolved by the selected matrix runtime.
- `@needle-tools/materialx` was patched in `/Users/herbst/git/needle-engine-dev/modules/needle-engine/modules/needle-engine-materialx` to avoid runtime `package.json` imports, `three/src/...` imports, and WebGL-only named imports from `three`.
- The latest headed matrix pass used `npm link @needle-tools/materialx` against that package source. Publish `@needle-tools/materialx@1.7.0`, then refresh the usd-viewer lockfile before publishing `@needle-tools/usd`.

## usd-viewer Wiring

Updated files:

- `usd-wasm/src/bindings/emHdBindings.js`
- `usd-wasm/src/bindings/emHdBindings.data`
- `usd-wasm/src/bindings/emHdBindings.wasm`
- `usd-wasm/src/bindings/index.js`
- `usd-wasm/src/create.three.js`
- `usd-wasm/src/hydra/ThreeJsRenderDelegate.js`
- `usd-wasm/src/types/bindings.d.ts`
- `usd-wasm/package.json`
- `usd-wasm/tests/bindings/bindings-artifacts.test.mjs`
- `usd-wasm/scripts/cache-three-matrix.mjs`
- `usd-wasm/tests/three-matrix/static/main.js`
- `usd-wasm/tests/three-matrix/usd-three-matrix.spec.ts`
- `usd-wasm/tests/three-matrix/playwright.config.ts`

Viewer binding changes:

- Removed the stale worker sidecar import from `usd-wasm/src/bindings/index.js`.
- Kept `locateFile()` for `.data` and `.wasm`.
- Switched `createThreeHydra` to mount caller-provided `buffer` data into Emscripten FS before opening the root layer.
- Replaced the JS-facing `UsdStageRefPtr` access with explicit driver metadata methods for up-axis, start/end time codes, and timecodes-per-second.
- Added `HdWebSyncDriver.Repopulate()` for composition edits such as variant selection and payload load/unload, then exposed it on the viewer handle as `repopulate()`.
- Added JS notifications from the wasm render delegate's `DestroyRprim` and `DestroySprim` hooks. This follows Hydra's render-delegate lifecycle: `HdRenderIndex` calls the render delegate destroy hook when prims are removed, so the JS bridge removes the corresponding Three mesh/material at the same boundary instead of carrying stale objects through variant switches.
- Added Node tests that verify the generated artifacts, runtime exports, Emscripten data-package size, memory configuration, wasm magic header, actual Node loading of the generated bundle, and programmatic authoring through the generated API.
- Extended the three.js matrix static page and Playwright assertions to report and check the Hydra binding API surface before exercising the renderer.
- Added a renderer-mode filter to the matrix cache script (`--renderer-modes webgl`, `--renderer-modes webgpu-force-webgl2,webgpu`) so WebGL and WebGPU can be validated independently while keeping the full 102-case matrix as the canonical run.
- Added `USD_THREE_MATRIX_BROWSER=chromium` as a matrix-test escape hatch for running against Playwright's bundled Chromium instead of the configured Chrome channel.
- Added `USD_THREE_MATRIX_HEADED=1` for headed browser validation.
- Added Asset Explorer fixtures for BoomBox, CesiumMan, and DamagedHelmet. The old `CesiumMan.glb.three.usdz` was removed because it was about 10 KB and contained no `Mesh` prims.
- Added `CesiumMan.glb.openusd.usdz`, generated from the tracked `CesiumMan.glb` through the OpenUSD/Adobe `usdGltf` path. Its packaged USDA layer records `generator = "Adobe usdGltf 1.0; glTF generator: COLLADA2GLTF"` and includes one mesh plus skeleton data.
- Restored `CesiumMan.glb.openusd.usdz` to the proper package form: USDA plus `CesiumMan.glb`, with texture references authored as `@CesiumMan.glb[Cesium_Man-effect_diffuse.jpg]@`. The headed matrix now verifies that the nested embedded JPEG resolves as a textured material.
- Added raw `.glb` fixtures for BoomBox, CesiumMan, and DamagedHelmet to exercise Adobe's wasm glTF plugin directly.
- Added local MaterialX USDA/MTLX fixtures and assertions for `sceneStats.materialXMaterials`, including external references, nested references, variant-authored bindings, texture/noise, marble, and procedural bricks.
- Added matrix fixture assertions for material binding variants, nested variants, and CesiumMan texture presence. These checks catch the double-rendering regression by asserting one mesh remains after each variant switch.

## Validation Status

Passed:

```sh
cd /Users/herbst/git/OpenUSD
./herbst/smoke/wasm-hydra-bindings-node.sh
```

```sh
cd /Users/herbst/git/usd-viewer/usd-wasm
npm run test:bindings
```

```sh
cd /Users/herbst/git/usd-viewer/usd-wasm
node --check src/bindings/index.js
node --check src/create.three.js
node --check src/hydra/ThreeJsRenderDelegate.js
node --check scripts/cache-three-matrix.mjs
node --check tests/bindings/bindings-artifacts.test.mjs
node --check tests/three-matrix/static/main.js
node --check tests/three-matrix/usd-three-matrix.spec.ts
```

Browser matrix status:

```sh
cd /Users/herbst/git/usd-viewer/usd-wasm
USD_THREE_MATRIX_BROWSER=chromium USD_THREE_MATRIX_HEADED=1 npm run test:three-matrix -- --versions 0.184.0
```

This full headed matrix run passes on this machine as of 2026-06-24:

```text
summary: passed 68, unsupported 34, failed 0
```

The unsupported cases are the older local Three `^0.164.1` runtime in WebGPU modes. Cached Three `0.184.0` passes WebGL, WebGPU forced-WebGL2, and native WebGPU for local USDZ, local MaterialX USDA/MTLX, Asset Explorer USDZ fixtures, and raw GLB fixtures.

Renderer-specific headed matrix commands:

```sh
USD_THREE_MATRIX_BROWSER=chromium USD_THREE_MATRIX_HEADED=1 npm run test:three-matrix -- --versions 0.184.0 --renderer-modes webgl
USD_THREE_MATRIX_BROWSER=chromium USD_THREE_MATRIX_HEADED=1 npm run test:three-matrix -- --versions 0.184.0 --renderer-modes webgpu-force-webgl2,webgpu
```

## USD API Bindings

Upstream checks:

- OpenUSD's Python API is mostly maintained as explicit Boost.Python `wrap*.cpp` files, for example `pxr/usd/usd/wrapStage.cpp`, `wrapPrim.cpp`, and the schema-specific wrappers under packages such as `usdGeom` and `usdShade`.
- That Python layer is useful as a map of intended API shape and conversion behavior, but it is not directly reusable in wasm because it depends on Boost.Python and the Python runtime.
- OpenUSD does already generate C++ schema classes from `schema.usda` using `usdGenSchema`. Those schema definitions are a better source of truth for generating JS/TS schema wrappers than scraping the Python wrappers.
- Upstream's stock wasm path is the `wasmFetchResolver` example. Its Embind API is intentionally tiny: `InitWorkerThread`, `ShowTree`, `ComputeAllDependencies`, and `CreateNewUsdzPackage`. It is consumed from JS as `Module.ShowTree(...)` and friends after `wasmFetchResolver.js` initializes.
- The stock wasm example does not expose `UsdStage`, `UsdPrim`, schema classes, Hydra, or a general programmatic USD scene API. It demonstrates linking USD core libraries, fetch-based asset resolution, and hand-authored Embind entry points.

Current generated checkpoint:

- OpenUSD commit `ea0adc529bb72ee2c621878469d05921c507cf42` includes `pxr/usdImaging/hdEmscripten/bindgen`, the first generated authoring/package API checkpoint, `HdWebSyncDriver.Repopulate()`, render-delegate destroy callbacks for JS cleanup, nested package resolver dispatch, and stage-relative hdEmscripten browser asset reads.
- `core-bindings.json` allowlists the current core scene API: `SdfLayer`, `UsdStage`, `UsdPrim`, `UsdAttribute`, `UsdRelationship`, vector helpers, and module-level `CreateStage`, `OpenStage`, `ReleaseStage`, `CreateUsdzPackage`, and `ReadFile`.
- `generate_bindings.py` emits `generated/emHdCoreBindings.inc` for Embind and `generated/usd-core-bindings.d.ts` for TypeScript from that same manifest.
- The MaterialX wasm build script builds `emHdBindings`, runs the build-system `install` target, and installs `emHdBindings.js`, `emHdBindings.data`, `emHdBindings.wasm`, and `share/hdEmscripten/usd-core-bindings.d.ts` into `/Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe`.
- The bridge-specific `HdWebSyncDriver` binding remains explicit because it is the Hydra/three.js transport layer, not USD scene API.
- The binding tests now author a stage, define a prim, set color and animated float attributes, add/list/select variants, author a prim inside a selected variant, export USDA, package USDZ, read the USDZ bytes for download handoff, and reopen the stage to verify the selected variant and animated sample.

Recommended next step:

- Start with a generic core object model: `SdfPath`, `TfToken`, `VtValue` string/number/vector/matrix/color/asset conversions, `UsdStage`, `UsdPrim`, `UsdProperty`, `UsdAttribute`, `UsdRelationship`, `SdfLayer`, and the `Gf` math types commonly returned by USD schemas.
- Layer schema APIs on top from USD schema metadata, not handwritten JS. The schema `schema.usda` files know each schema's attributes, relationships, fallback values, and inheritance; those can generate TypeScript wrappers that call the generic attribute/relationship methods.
- Keep exact C++ method binding behind an allowlist. Binding all OpenUSD headers directly would produce a huge wasm surface, difficult overload/type mappings, many template/ref-pointer edge cases, and a much larger maintenance burden.

The practical target is not "every C++ symbol in OpenUSD" for the viewer package. The better target is "complete programmatic USD scene authoring and inspection from JS" with generated types, then explicit opt-in modules for advanced APIs such as `UsdGeom`, `UsdShade`, `UsdSkel`, `UsdLux`, `UsdUtils`, and `Sdf`.

## Remaining Work

- Publish `@needle-tools/materialx@1.7.0` with the local ESM/Three import fixes, then refresh `usd-wasm/package-lock.json`.
- Keep expanding fixture coverage for more production MaterialX networks and texture-heavy glTF/glb assets before publishing a new `@needle-tools/usd` release.
