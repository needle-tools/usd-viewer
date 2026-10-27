# USD Viewer

A web viewer for Universal Scene Description files, created and maintained by
[Needle](https://needle.tools).

[Open USD Viewer](https://usd-viewer.needle.tools/)

The project has two main pieces:

- WebAssembly bindings built from modern [OpenUSD](https://github.com/PixarAnimationStudios/OpenUSD).
- A Needle-maintained three.js Hydra render delegate that turns Hydra scene updates into WebGL/WebGPU renderable three.js objects.

For commercial use of the source code, please contact [hi@needle.tools](mailto:hi@needle.tools).

## Features

- Load USD, USDA, USDC, USDZ, and glTF/GLB assets in the browser.
- Load folders or multiple dropped files so USD references, payloads, textures, and nested packages can resolve together.
- Render OpenUSD composition through Hydra, including variants, payloads, visibility, purpose filtering, native instances, PointInstancer prims, cameras, and USD Lux lights.
- Use OpenSubdiv, Adobe `usdGltf` with Draco-compressed glTF/GLB import, native `usdDraco` payloads, and Hydra-provided MaterialX documents in the modern OpenUSD 26.05 wasm bundle.
- Render OpenUSD 26.05 Gaussian particle fields through the optional Spark integration.
- Inspect stages with usdview-style stage, prim, property, layer-stack, composition, notices, and timeline UI in the development viewer.
- Package/export authored stages as USDZ through the OpenUSD wasm API.

The viewer uses `SharedArrayBuffer`, so it must be served with the required
COOP/COEP headers:

```js
res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
```

## Development

```sh
npm install
npm run start
```

Then open the local URL printed by the server. `0.0.0.0` is not a good browser
origin for this app because `SharedArrayBuffer` requires a secure isolated
context.

The public viewer entrypoint lives in `public/`. The package and the three.js
Hydra bridge live under `usd-wasm/`.
Minimal package usage examples for plain three.js and Needle Engine live in
[usd-wasm/README.md](usd-wasm/README.md).

## Viewer URL Options

The viewer environment can be selected with `?environment=` or `?env=`.
Supported values include:

- `neutral` - local default HDR environment.
- `helicopter` or `helicopter-landing-pad` - local HDR test environment.
- `room` - three.js `RoomEnvironment`; maps to Needle's studio environment for the Needle Engine loader.
- `none` or `off` - disables the authored viewer environment.
- Needle Engine magic names: `studio`, `blurred-skybox`, `quicklook`, `quicklook-ar`.
- FastHDR aliases: `fasthdr-studio`, `photo-studio`, `brown-photostudio`, `venice-sunset`, `spruit-sunrise`, `meadow`, `canary-wharf`, `shanghai-bund`, `cayley-interior`, `fireplace`, `sky-on-fire`, `dikhololo-night`.
- Direct `.hdr`, `.exr`, `.ktx2`, `.png`, `.jpg`, or `.jpeg` URLs.

Example:

```txt
http://localhost:3003/?viewer=needle&environment=fasthdr-studio&file=/test-fixtures/usd-concepts/camera_light.usda
```

## OpenUSD Wasm Runtime

The checked-in OpenUSD wasm runtime is maintained by Needle. Internal rebuild
and deployment instructions live in the Needle team wiki, not in this public
source repository.

## Tests

From the package directory:

```sh
cd usd-wasm
npm run test:bindings
npm run test:three-matrix
npm run test:viewer-visual
```

`test:three-matrix` runs a representative compatibility set. To regenerate the
full cross-version renderer status matrix, run:

```sh
npm run test:three-matrix:full
```

For headed browser validation:

```sh
USD_THREE_MATRIX_BROWSER=chromium USD_THREE_MATRIX_HEADED=1 npm run test:three-matrix -- --versions 0.185.0 --renderer-modes webgl,webgpu
USD_VIEWER_VISUAL_BROWSER=chromium USD_VIEWER_VISUAL_HEADED=1 npm run test:viewer-visual
```

## License

This project is licensed under the
[PolyForm Noncommercial License 1.0.0](LICENSE.txt). Third-party notices are
preserved in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).

## Links

- [Needle](https://needle.tools)
- [Needle Cloud](https://cloud.needle.tools)
- [OpenUSD](https://openusd.org)
- [Repository](https://github.com/needle-tools/usd-viewer)
