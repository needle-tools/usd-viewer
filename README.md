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
- Use OpenSubdiv, Adobe `usdGltf` with Draco-compressed glTF/GLB import, native `usdDraco` payloads, and Hydra-provided MaterialX documents in the modern OpenUSD 26.11.1 wasm bundle.
- Render meshes, Gaussian particle fields and bounded volumes together with WebGPURenderer. Choose Basic, Beauty, MuTracer or gkjohnson path tracing; optional tracers load when selected.
- Evaluate uniform or adaptive OpenSubdiv surfaces, including animated creases, corners and holes.
- Inspect and follow individual properties, pick native/point instances, select multiple objects and run the embedded JavaScript REPL.
- Arrange Stage, Examples, Properties, Layers, Code, Timeline and Console in a persistent workspace. The viewer preserves user-chosen timeline placement and open/closed state.
- Package/export authored stages as USDZ through the OpenUSD wasm API.

The header switches between **USD Viewer**, with a full viewport and an Examples
menu, and **USD Studio**, with the dockable inspection and authoring workspace.
Switching keeps the loaded scene and Studio layout. The choice is remembered;
new visitors start in Viewer, while existing saved workspaces open in Studio.
Use `?workspace=viewer` or `?workspace=studio` to link to a specific mode.

Examples includes the complete [NVIDIA SimReady library](https://huggingface.co/datasets/nvidia/simready-assets),
with NVIDIA's published previews and CC BY 4.0 attribution. The catalog is loaded
when opened; USD files and their relative dependencies stream from Hugging Face
when selected. Both asset and preview URLs use the dataset revision recorded in
[the catalog](public/data/nvidia-simready.json). Refresh it with
`npm run prepare:simready-manifest` (or pass a full dataset commit SHA after `--`).
The generator paginates the complete file tree, verifies entry points and preview
paths, and caches its inventory under `.cache/`. It does not download the asset
library. Folder names group assets by their package-name prefixes.

SimReady browsing defaults to 512 px texture previews where NVIDIA publishes
those images. Maps without a published preview use their original URL and are
resized after decoding. **View → Scene → Textures → Original** keeps full source
resolution; the menu shows the asset's original texture download size. Geometry
and authored material values appear before textures finish, and download activity
remains visible in the viewport. The generated resource indexes also let the app
warm bounded geometry and composition layers while OpenUSD initializes.
The expandable download list shows per-file and combined byte totals,
percentages, transfer speed and estimated time remaining. Unknown file sizes
stay indeterminate until reported; totals cover dependencies discovered so far.
Pinned SimReady URLs are cached without revalidation; cached reloads reuse the
files across native worker threads. Exports retain the
original USD dependencies, independently of this display setting.

Both native runtimes are built from OpenUSD commit
`c34f374d042b1579855f63f142a6082cb95a0cfc` on the local
`git/openusd` branch `wasm/openusd-26.11.1`. The bridge yields the browser thread
while opening stages and changing remote variants/payloads, forwards worker
transfer progress, and delivers change notifications on the JavaScript thread.
It also exposes typed reads and authoring for metadata and attributes, reference-counted
root-layer handles, lazy instance/prototype inspection, and animation ranges independent
of hierarchy expansion, plus authored face identities for subset picking and
outlines through triangulation and subdivision.
Only the affected bridge files were recompiled; the OpenUSD libraries were reused.

The viewer uses `SharedArrayBuffer`, so it must be served with the required
COOP/COEP headers:

```js
res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
```

## Development

```sh
npm install
npm run prepare:public
npm run start
```

Then open the local URL printed by the server. `0.0.0.0` is not a good browser
origin for this app because `SharedArrayBuffer` requires a secure isolated
context.

The public viewer entrypoint lives in `public/`. The package and the three.js
Hydra bridge live under `usd-wasm/`. Node.js 22.12 or newer is required for local
development. The npm package version is maintained in `usd-wasm/package.json`;
the private server has its own version.
`prepare:public` also generates lossless Brotli/gzip runtime files for HTTP
delivery. They stay out of the npm package; rerun preparation after updating
the native artifacts. The development server serves the current original if
its compressed files are missing or older.
Minimal package usage examples for plain three.js and Needle Engine live in
[usd-wasm/README.md](usd-wasm/README.md).

The app owns its workspace, catalogs, URL state and input policy. Reusable USD
loading, scene operations, source reads, editing commands and export live in the
package. Code and Console load when opened. Embedded viewers can use `/runtime`,
`/three` and `/viewer/inspect`, then import `/editing`, `/viewer/repl` or
`/viewer/download` on demand; see the package README for the loading boundary.

## Examples and render settings

Use **Examples** to browse local Needle fixtures, the 14 NVIDIA SimReady assets,
USD Working Group assets and glTF samples. Needle includes 192 coverage fixtures
and 63 executable JavaScript lessons. The Examples footer switches between
Beauty previews and the retained native usdview/Storm captures, and remembers
your choice. Beauty captures use two camera fits in a 4:3 viewport; faint media,
splats and the unmaterialed triangle use a dark background for contrast.
The animation collection includes a rolling cube, heartbeat, lighthouse day/night
cycle, orrery, waving flag, bellows and chasing beacon lights. Continuous loops
return to their first pose, including the referenced and value-clip examples.
**Subdivision → Pip and Pop** demonstrates animated hole faces and crease/corner
sharpness in a five-second loop.

Regenerate Beauty previews against the running app with
`node usd-wasm/scripts/render-beauty-thumbnails.mjs --base-url http://localhost:3003 --include-remote`.
Use `--only <id>` or `--group <category>` for a focused capture. Native cards still
use `usd-wasm/scripts/render-coverage-thumbnails.py` and
`usd-wasm/scripts/render-api-thumbnails.py` with local OpenUSD/Storm. Beauty
capture metadata and image hashes live in
`usd-wasm/tests/fixtures/thumbnails/beauty/index.json`.

**Window → Code** shows the current JavaScript lesson or USDA for any composed
layer. Layer text comes from the USD API, includes unsaved authored edits and
updates when the stage changes. A filterable file tree appears when the pane
is wide enough, with an adjustable sidebar; narrow panes use a source picker.
Supplied files, JS helpers, material source and loaded textures are available
alongside the layers. Text can be copied, raster images can be previewed, and
other binary files show metadata. Selecting a file preserves the loaded root.
Selection and sidebar preferences are remembered. Layer and texture references,
JavaScript imports and USD prim/property paths are clickable. Relative file
references resolve from the containing layer, and Back/Forward restores source
locations. Following a USD target also updates the stage inspector while keeping
Code visible.

Literal arrays collapse to compact controls. Open one to inspect named columns,
color swatches or matrix grids in a paged table in the resizable right sidebar.
**Expand arrays** shows their values inline; **Compact arrays** restores the
table links. This toggle appears only for sources containing expandable arrays.

Large geometry layers export on a native worker. Code keeps their numeric arrays
compact and reads raw text in bounded pages; opening a data table decodes that
array on demand. Copy uses the complete authored source.

The sidebar remembers its width. Cells support spreadsheet paste,
row insertion/removal, keyboard navigation and a raw view. USD attribute edits
use the native API and support undo/redo; they are included in stage downloads.
Variant-source arrays and metadata remain inspectable without guessing an edit
context. JavaScript lesson edits stay in a draft until **Run**. **Edit source**
opens the lesson text, and **Array** creates or edits a literal at the cursor.
The Console uses the same **Array** tool while writing new commands. Computed
expressions remain source code and are never evaluated for inspection.

**Production → Workshop Shot / Workshop Asset** demonstrates relative references,
a geometry payload, separate material layers, finish variants and shot lighting.
**Texture Formats** contains real KTX2 UASTC, linear EXR, PNG, JPEG and TGA inputs.

For movable assemblies, select a rigid body or joint and click **Interact** in
Properties, or open **Window → Simulation → Interact**. Drag the part in the
viewport; joints keep their authored limits and attachments. **Reset** restores
the scene. Joint sliders are also available in Simulation, and **View → Helpers →
Joint constraints** controls viewport axes and limits. Interact uses an optional
kinematics core; **Simulate** loads Rapier for supported contact simulations.

Fresh viewer settings select Beauty and Adaptive. Render mode, quality and detail
choices are remembered; an explicit URL overrides them. Scene background and UI
light/dark theme are separate settings. The Examples panel preserves selection,
category and scroll position, and its divider/width can be adjusted.

Adaptive uses camera-independent curvature rates with a bounded triangle budget.
MDL materials use documented authored-input approximations. Path-tracer, volume,
physics and NURBS limitations are described in the [SDK README](usd-wasm/README.md).

Native MDL reference rendering is available through SSH on `felix-win` for
complete USD scenes, and with the installed NVIDIA MDL SDK on this Mac for
material probes. Commands, input preparation and reference images are documented
in [Native MDL references](docs/mdl-reference-rendering.md).

## Viewer URL Options

The main options are `viewer=three|needle`,
`render=basic|beauty|pathtraced|pathtraced-gk`,
`complexity=adaptive|low|medium|high|very-high` and `background=light|dark`.
Use `file=` for a USD URL; relative dependencies resolve from its source.

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

For release preparation, run the package checks and exact-tarball consumer tests:

```sh
cd usd-wasm
npm run test:release
npm run test:package
npm publish --dry-run --ignore-scripts --json
```

`test:package` packs the SDK, installs that artifact through npm in fresh modern
and legacy Three.js consumers, builds them for production and exercises the
modern viewer/renderers in Chrome. Install Chrome for Playwright first with
`npx playwright install chrome`. It preserves the tarball, hashes, logs and
captures under `usd-wasm/.cache/package-validation/`. These commands do not
publish the package. The release workflow performs these checks before its
existing publication steps.

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
