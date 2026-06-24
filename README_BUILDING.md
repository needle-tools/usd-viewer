# Building OpenUSD 26.05 for usd-viewer

This note records how to reproduce the current OpenUSD modernization results for `usd-viewer`.

Date last checked: 2026-06-24

## Scope

The current working branch keeps the existing three.js Hydra bridge architecture and moves it onto OpenUSD 26.05.

Current branches:

- `usd-viewer`: `modernize-openusd-26-05-wasm`
- `OpenUSD`: `modernize-openusd-26-05-wasm`, based on upstream `v26.05`
- `USD-Fileformat-plugins`: `modernize-openusd-26-05-gltf`, based on Adobe `2026.03`

Provenance SHAs for this checkpoint:

- `usd-viewer`: this branch commit; use `git rev-parse HEAD` after applying these docs, because a commit cannot embed its own final SHA.
- `OpenUSD`: `cfeddc19d1e3e6ad2d1c34342ed1c266cb61da7a`
- `USD-Fileformat-plugins`: `ca3c2de5553648ae280077ddde079b6f3362a830`
- `needle-engine-materialx`: `4b56764aca58c1760037975c34cb748f4ff15f27`

Important local repositories:

```sh
/Users/herbst/git/usd-viewer
/Users/herbst/git/OpenUSD
/Users/herbst/git/USD-Fileformat-plugins
/Users/herbst/git/MaterialX
/Users/herbst/git/emsdk
```

## Current Result

This checkpoint is a release-candidate modernization baseline. The remaining release blocker is publishing the local `@needle-tools/materialx` fixes and refreshing the `usd-wasm` lockfile against that published version.

Working now:

- OpenUSD 26.05 builds natively.
- Adobe's glTF plugin builds natively against OpenUSD 26.05.
- Upstream OpenUSD 26.05 wasm builds and runs the shipped `wasmFetchResolver` example.
- The modernized `hdEmscripten` Hydra bridge builds for wasm and produces `emHdBindings.js`, `emHdBindings.data`, and `emHdBindings.wasm`.
- The core USD programmatic API exposed by that bridge is generated from `pxr/usdImaging/hdEmscripten/bindgen/core-bindings.json`; the same generator emits `usd-core-bindings.d.ts`.
- The viewer branch now checks in the MaterialX-enabled OpenUSD 26.05 Hydra wasm sidecars with Adobe `usdGltf` statically linked.
- The checked-in sidecars load in Node and expose the viewer runtime APIs, including `HdWebSyncDriver`, filesystem helpers, `driver.GetStage()`, stage authoring helpers, and USDZ packaging.
- Browser matrix validation passes in headed Chromium for the supported cases listed below.
- Raw `.glb` opens are validated for BoomBox, CesiumMan, and DamagedHelmet through Adobe's glTF plugin.
- A local USDA + MTLX fixture creates real `MaterialXMaterial` instances through Hydra-provided MaterialX documents and `@needle-tools/materialx` in WebGL and WebGPU-capable matrix modes.
- The JS render delegate uses `@needle-tools/materialx` for Hydra MaterialX documents and keeps the USD Preview Surface / `MeshPhysicalMaterial` path for non-MaterialX or failed shader generation cases.

Not finished yet:

- The local `@needle-tools/materialx` package has been patched to load as raw browser ESM against the caller's Three import map. Publish those package fixes, then refresh `usd-wasm/package-lock.json` before a clean release.

The viewer currently has the MaterialX-enabled OpenUSD 26.05 Hydra wasm bundle checked in under:

```sh
usd-wasm/src/bindings/
```

Files:

- `emHdBindings.js`
- `emHdBindings.data`
- `emHdBindings.wasm`

Modern Emscripten does not emit `emHdBindings.worker.js` for this build, so the old worker import was removed from `usd-wasm/src/bindings/index.js`.

Installed source bundle:

```sh
/Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe/bin
/Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe/share/hdEmscripten/usd-core-bindings.d.ts
```

## Done Criteria For This Modernization

Treat the modernization as production-ready only when all of these are true:

- The MaterialX-enabled wasm Hydra bundle is the checked-in viewer bundle.
- `npm run test:bindings` passes.
- The three.js matrix passes for the supported three.js versions in both WebGL and WebGPU modes.
- At least one USD Preview Surface fixture renders correctly.
- At least one MaterialX-authored USD or `.mtlx` fixture renders correctly.
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
```

Expected current result:

- Both OpenUSD Node smoke tests pass and expose `HdWebSyncDriver`, filesystem helpers, and `ready.then`.
- `npm run test:bindings` passes 7 tests, including driver metadata helper checks and generated authoring/USDZ packaging.
- The syntax checks pass.

## Browser Matrix Status

Run:

```sh
cd /Users/herbst/git/usd-viewer/usd-wasm
USD_THREE_MATRIX_BROWSER=chromium USD_THREE_MATRIX_HEADED=1 npm run test:three-matrix -- --versions 0.184.0
```

Current result on this machine:

- The Three matrix cache is generated.
- The manifest is written for 48 cases: local Three `^0.164.1` and cached Three `0.184.0`, each across WebGL, WebGPU forced-WebGL2, and WebGPU modes, with eight fixtures.
- The test passes in headed Chromium.
- The latest headed pass used a local `npm link` to `@needle-tools/materialx` from `/Users/herbst/git/needle-engine-dev/modules/needle-engine/modules/needle-engine-materialx` at package version `1.7.0`.

Observed result on 2026-06-24:

```text
summary: passed 32, unsupported 16, failed 0
```

Renderable fixtures that pass with geometry and materials:

- `examples/public/test.usdz`
- `usd-wasm/tests/fixtures/materialx/mxSimple.usda` plus `mtlxFiles/standard_surface_default.mtlx` (`MaterialXMaterial` count: 2)
- Asset Explorer `BoomBox.glb.three.usdz`
- Asset Explorer `BoomBox.glb`
- Asset Explorer `CesiumMan.glb`
- Asset Explorer `DamagedHelmet.glb.three.usdz`
- Asset Explorer `DamagedHelmet.glb`

CesiumMan is included in the matrix and opens cleanly, but the current Asset Explorer generated USDZ is only about 10 KB and contains no `def Mesh` prims. The matrix marks it `fixtureExpectedRenderable: false` and requires zero scene objects rather than pretending it rendered. If Asset Explorer starts publishing a renderable CesiumMan USDZ, flip that fixture expectation and the geometry assertions will apply.

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

That is why this branch reintroduces and modernizes the Autodesk/Needle `hdEmscripten` bridge instead of relying on upstream's stock wasm target alone.

## Rebuild: Wasm Hydra Bundle

The reproducible scripts live in the OpenUSD repo under `herbst/smoke`.

Build OpenSubdiv for wasm into the upstream wasm prefix:

```sh
cd /Users/herbst/git/OpenUSD
./herbst/smoke/build-wasm-opensubdiv.sh
```

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
cp /Users/herbst/OpenUSD-26.05-wasm-hydra-exp/bin/emHdBindings.data usd-wasm/src/bindings/
cp /Users/herbst/OpenUSD-26.05-wasm-hydra-exp/bin/emHdBindings.wasm usd-wasm/src/bindings/
rm -f usd-wasm/src/bindings/emHdBindings.worker.js
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
- `pxr/usdImaging/hdEmscripten/bindgen/generate_bindings.py` generates `emHdCoreBindings.inc` and `usd-core-bindings.d.ts`.
- Node smoke passes against `/Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe`.
- `emHdBindings.data` embeds the `usdMtlx/resources/libraries` documents needed by the browser bundle, including `gltf_pbr.mtlx`, `open_pbr_surface.mtlx`, and `usd_preview_surface.mtlx`.

Observed sidecar sizes:

```text
non-MaterialX: emHdBindings.js 187K, emHdBindings.data 782K, emHdBindings.wasm 24M
MaterialX:     emHdBindings.js 190K, emHdBindings.data 2.2M, emHdBindings.wasm 29M
```

To update the viewer with the MaterialX-enabled bundle:

```sh
cd /Users/herbst/git/usd-viewer
cp /Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe/bin/emHdBindings.js usd-wasm/src/bindings/
cp /Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe/bin/emHdBindings.data usd-wasm/src/bindings/
cp /Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe/bin/emHdBindings.wasm usd-wasm/src/bindings/
rm -f usd-wasm/src/bindings/emHdBindings.worker.js
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

OpenUSD links the plugin when `PXR_HD_EMSCRIPTEN_GLTF_PLUGIN_PREFIX` points at `/Users/herbst/USD-Fileformat-plugins-2026.03-wasm-probe`. The resulting `emHdBindings.data` embeds `/usd/usdGltf/resources/plugInfo.json`; raw `.glb` fixtures render in headed Chromium.

## MaterialX Client-Side Shape

OpenUSD/Hydra now has the C++ side needed to expose MaterialX-authored material networks to JavaScript. The wasm render delegate advertises `mtlx` as a material render context and shader source type, so OpenUSD creates real material sprims for `outputs:mtlx:surface` materials instead of only the empty fallback sprim. The bridge forwards normal Hydra material nodes and also sends a serialized MaterialX document to JS through `updateMaterialXDocument(...)` when `hdMtlx` can translate the network.

The JS render delegate stores only Hydra-provided MaterialX documents and tries `@needle-tools/materialx` first via `Experimental_API.createMaterialXMaterial(...)`. If shader generation fails or no MaterialX document exists, it falls back to the existing USD Preview Surface-style `MeshPhysicalMaterial` path. It does not synthesize MaterialX materials from caller-provided `.mtlx` sidecars.

For browser/WebGPU compatibility, `@needle-tools/materialx` was adjusted in `/Users/herbst/git/needle-engine-dev/modules/needle-engine/modules/needle-engine-materialx` so it does not import `three/src/...`, does not import `package.json` at runtime, and does not require WebGL-only exports such as `WebGLRenderer` or `UniformsLib` from the host `three` module. The matrix import map now loads it through `/__rawfs/.../node_modules/@needle-tools/materialx/index.js`, so `three` resolves through the selected matrix runtime.

Until `@needle-tools/materialx@1.7.0` is published, validate the viewer with the local package linked:

```sh
cd /Users/herbst/git/needle-engine-dev/modules/needle-engine/modules/needle-engine-materialx
npm link

cd /Users/herbst/git/usd-viewer/usd-wasm
npm link @needle-tools/materialx
node -e "const fs=require('fs'); console.log(fs.realpathSync('node_modules/@needle-tools/materialx'))"
```

After publishing `@needle-tools/materialx@1.7.0`, refresh the usd-viewer lockfile so a clean checkout uses the fixed package instead of registry `1.6.0`.

Important current limitations:

- Publish `@needle-tools/materialx@1.7.0` and refresh `usd-wasm/package-lock.json` before publishing a new `@needle-tools/usd` release.
- Keep the MaterialX diagnostics in the browser matrix; they now verify real material sprims such as `/Materials/MaterialX/Materials/Default_Smooth`, two Hydra MaterialX documents, and two generated `MaterialXMaterial` instances.

The local `@needle-tools/materialx` package exposes `createMaterialXMaterial`, which is the promising entry point. Its current local implementation is centered on `ShaderMaterial`, so WebGPU must be validated explicitly whenever this path changes.

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
and vector helpers. It also covers the first authoring/package checkpoint:
`CreateStage`, `OpenStage`, `ReleaseStage`, `Stage.DefinePrim`, stage time/up-axis
metadata setters, `Prim.CreateAttribute`, variant add/list/select helpers,
`Prim.DefinePrimInVariant`, typed attribute setters including time samples,
`CreateUsdzPackage`, and `ReadFile` for browser download handoff. `HdWebSyncDriver`
remains an explicit bridge binding because it is the Hydra/three.js transport API
rather than USD itself.

The next API expansion should keep this split: generate generic USD value/path
and scene-editing primitives from the manifest, then generate schema-friendly
TypeScript wrappers from USD `schema.usda` metadata instead of handwriting schema
classes in JavaScript.
