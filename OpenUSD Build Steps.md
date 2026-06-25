# OpenUSD Build Steps

This file is a local companion note for the current `usd-viewer` modernization
branch. The authoritative, reproducible build documentation lives in
[README_BUILDING.md](README_BUILDING.md). Keep this note short; avoid copying old
one-off build history back into it.

## Current Repos

```text
/Users/herbst/git/usd-viewer
/Users/herbst/git/OpenUSD
/Users/herbst/git/USD-Fileformat-plugins
/Users/herbst/git/MaterialX
/Users/herbst/git/emsdk
/Users/herbst/git/needle-engine-dev/modules/needle-engine/modules/needle-tools/materialx
```

## Current Branches

- `usd-viewer`: `modernize-openusd-26-05-wasm`
- `OpenUSD`: `modernize-openusd-26-05-wasm`, based on upstream `v26.05`
- `USD-Fileformat-plugins`: `modernize-openusd-26-05-gltf`, based on Adobe `2026.03`

## Toolchain

- Python: `/usr/local/bin/python3`
- CMake: `/Applications/CMake.app/Contents/bin`
- Emscripten: emsdk commit recorded in `README_BUILDING.md`, currently `emcc 4.0.23`

Activate the local build tools in a fresh shell:

```sh
source /Users/herbst/git/emsdk/emsdk_env.sh
export PATH="/Applications/CMake.app/Contents/bin:$PATH"
```

## Native OpenUSD

Build the native dependency/runtime prefix first:

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

Smoke it:

```sh
export PYTHONPATH=/Users/herbst/OpenUSD-26.05-native/lib/python
export PATH="/Users/herbst/OpenUSD-26.05-native/bin:$PATH"
export DYLD_LIBRARY_PATH=/Users/herbst/OpenUSD-26.05-native/lib
usdcat --help
/usr/local/bin/python3 - <<'PY'
from pxr import Plug, Sdf, Usd
print(Sdf.FileFormat.FindByExtension("mtlx"))
PY
```

## Adobe glTF Plugin

Build Adobe USD file-format plugins against the native OpenUSD prefix:

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
      -Dpxr_ROOT=/Users/herbst/OpenUSD-26.05-native \
      -DCMAKE_BUILD_TYPE=Release

cmake --build /Users/herbst/USD-Fileformat-plugins-2026.03-openusd-26.05-build --target install --parallel 8
```

## Wasm Hydra Bundle

Use the scripts in the OpenUSD repo. They are intentionally the path of record
so the result does not depend on manual copy steps:

```sh
cd /Users/herbst/git/OpenUSD
./herbst/smoke/build-wasm-opensubdiv.sh
./herbst/smoke/build-wasm-materialx-openusd.sh
./herbst/smoke/build-wasm-adobe-gltf-plugin.sh
./herbst/smoke/configure-wasm-hydra-materialx.sh
./herbst/smoke/build-wasm-hydra-materialx.sh
./herbst/smoke/wasm-hydra-bindings-node.sh
```

Expected output prefix:

```text
/Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe
```

Expected installed files:

```text
/Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe/bin/emHdBindings.js
/Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe/bin/emHdBindings.wasm
/Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe/share/hdEmscripten/usd-core-bindings.d.ts
```

## Update usd-viewer

Copy the generated bundle into the package only after the OpenUSD smoke tests
pass:

```sh
cd /Users/herbst/git/usd-viewer
cp /Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe/bin/emHdBindings.js usd-wasm/src/bindings/
cp /Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe/bin/emHdBindings.wasm usd-wasm/src/bindings/
cp /Users/herbst/OpenUSD-26.05-wasm-hydra-mtlx-probe/share/hdEmscripten/usd-core-bindings.d.ts usd-wasm/src/types/
```

Then validate:

```sh
cd /Users/herbst/git/usd-viewer/usd-wasm
npm run test:bindings
npm --prefix examples run build
USD_THREE_MATRIX_BROWSER=chromium USD_THREE_MATRIX_HEADED=1 npm run test:three-matrix -- --versions 0.185.0 --renderer-modes webgl,webgpu
USD_VIEWER_VISUAL_BROWSER=chromium USD_VIEWER_VISUAL_HEADED=1 npm run test:viewer-visual
```

## MaterialX Package

The client shader-generation package source lives at:

```text
/Users/herbst/git/needle-engine-dev/modules/needle-engine/modules/needle-engine-materialx
```

The release-candidate viewer uses the published package:

```sh
cd /Users/herbst/git/usd-viewer/usd-wasm
npm ls @needle-tools/materialx
```

Expected version: `@needle-tools/materialx@1.7.0`.

## Current Shape

- OpenUSD resolves USD assets and composition.
- Hydra exposes scene data to the Needle wasm render delegate.
- JavaScript/three.js renders the Hydra stream.
- MaterialX shader generation uses Hydra-provided MaterialX documents only.
- The Adobe `usdGltf` plugin is linked into the wasm bundle.
- OpenSubdiv is linked into the wasm bundle.

See [docs/openusd-26.05-modernization.md](docs/openusd-26.05-modernization.md)
for provenance SHAs and the production release checklist.
