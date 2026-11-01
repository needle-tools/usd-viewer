# Needle USD

OpenUSD WebAssembly runtime and three.js Hydra render delegate — render real,
composed USD stages (`.usd`, `.usda`, `.usdc`, `.usdz`) with MaterialX directly
in the browser. The same technology powers the
[Needle USD Viewer](https://usd-viewer.needle.tools) and
[OpenUSD support on Needle Cloud](https://cloud.needle.tools).

📖 **Documentation** — [OpenUSD & MaterialX with Needle](https://engine.needle.tools/docs/cloud/openusd)

Developed & maintained by [Needle](https://needle.tools).  
For commercial use, please contact [hi@needle.tools](mailto:hi@needle.tools).  

## Features

Built on upstream **OpenUSD 26.11.1** with Hydra imaging and **MaterialX 1.39.5**:

- **Composition** — references, payloads, variants, nested packages, and
  stage-owned HTTP asset resolution.
- **Instancing** — native instances and `PointInstancer` prims.
- **Visibility** — prim visibility and purpose-based filtering (`render`,
  `proxy`, `guide`).
- **Cameras & lights** — USD cameras and UsdLux lights.
- **Materials** — UsdPreviewSurface and MaterialX via Hydra material documents,
  including environment and authored direct lighting.
- **Geometry** — OpenSubdiv uniform/adaptive subdivision, animated creases, corners and
  holes, world-space points with varying widths, evaluated Bézier/B-spline/NURBS
  curves, and rational NURBS patches.
- **Volumes** — optional bounded MaterialX media and OpenVDB density/heat visualization.
- **Rendering** — WebGPURenderer with Basic, Beauty, MuTracer and gkjohnson modes.
- **Inspection and authoring** — stage/property navigation, multi-selection,
  instance picking, JavaScript REPL with a paged array table, and serialized in-memory edits.
  The app’s Code pane opens arrays beside the source in a resizable sidebar, with its width remembered.
- **glTF-in-USD** — Adobe `usdGltf` file format plugin loads glTF/GLB directly
  inside a USD stage, including Draco-compressed meshes.
- **Compression** — `usdDraco` and `usdGltfDraco` compressed mesh payloads.

### Progressive textures

`createThreeHydra({USD, scene, url, onAssetFetchProgress, resolveTextureUrl, maxTextureSize})`
can report HTTP texture transfers, choose published texture-resolution URLs, and
optionally cap ordinary raster images after decoding. Defaults preserve source
resolution. URL selection belongs to the host's catalog policy; composition and
material loading remain in the SDK. `waitForMaterials: true` waits for texture
completion; otherwise PreviewSurface/MDL constants render immediately and maps
update the same materials in place. Stage edits wait for native sync, independently
of outstanding texture downloads. Disposal aborts pending HTTP texture transfers.
The Needle plugin accepts the same options, including `getMaxTextureSize(url)`.

## Load only the tools you need

One package serves both embedded viewers and authoring applications. Use narrow
entry points, and import optional tools when the user opens them:

| Entry point | Purpose |
| --- | --- |
| `@needle-tools/usd/runtime` | Load OpenUSD, without importing Three.js or UI modules |
| `@needle-tools/usd/three` | Load and synchronize a USD stage into a host-owned Three.js scene |
| `@needle-tools/usd/viewer/inspect` | Stage, property, selection and renderer controls, without the REPL or download UI |
| `@needle-tools/usd/editing` | Typed array commands with sparse undo/redo |
| `@needle-tools/usd/viewer/repl` | Optional JavaScript console and array table |
| `@needle-tools/usd/viewer/download` | Optional ZIP/USDZ download control |
| `@needle-tools/usd/scene` | Scene inspection, variant/payload changes and resolver-aware source reads |

```js
import { getUsdModule } from '@needle-tools/usd/runtime';
import { createThreeHydra } from '@needle-tools/usd/three';

const USD = await getUsdModule();
const handle = await createThreeHydra({ USD, scene, url: 'model.usdz' });
await handle.ready();

// When your application opens its editing tools:
let currentHandle = handle; // Set to null before replacing or closing the document.
const { createArrayEdits } = await import('@needle-tools/usd/editing');
const stage = await handle.driver.GetStage();
const edits = createArrayEdits({
  usd: USD, stage,
  edit: action => handle.editStage(action),
  isCurrent: () => currentHandle === handle,
});
// Keep one command owner per document; dispose it before closing the document.
```

The package root and `/viewer` remain compatible convenience exports. Native
authoring methods such as `USD.CreateStage()` belong to the initialized OpenUSD
module, not the JavaScript loader. These entry points share one WASM runtime:
lazy imports defer JavaScript and UI initialization, not a second native download.
The native runtime already contains both composition and authoring support.
ZIP/USDZ packaging code loads on the first `handle.exportUsdz()` call. Physics,
path tracing and volume support remain separate opt-in features.

The hosted viewer uses the same SDK operations. Its Code and Console panels
load when opened, including when restored from a saved workspace. Docking,
example catalogs, URL state and host camera/light preferences belong to the
application; stage mutations, source resolution and export belong to the SDK.

## Core authoring

The low-level API returned by `getUsdModule()` authors rig data directly through
`Attribute.Set(value, timeCode)`. Use `Number.NaN` for the default value, or a
frame number for a time sample. Matrix arrays accept `GfMatrix4d` objects,
16-number row-major arrays, or four rows of four numbers. Quaternion arrays use
`[real, x, y, z]` order and support `quatf`, `quatd` and `quath`; skeleton scales
support `half3[]`. Malformed rig components throw `TypeError`.

UV arrays (`texCoord2f[]`, `texCoord2d[]`), four-component color/vector arrays,
integer vectors and boolean arrays also support typed authoring. Numeric vector
components are validated for dimension, finiteness and target-type range.

`await attribute.Get(timeCode)` reads numbers, booleans, strings and owned
JavaScript arrays directly. Vectors are component arrays, matrices are four rows,
and quaternions use `[real, x, y, z]`. Unset values return `undefined`. Await reads
when a value may come from a remote value clip; `GetValueString()` remains useful
for display and debugging.

`attribute.SetMetadata("interpolation", "vertex")` and
`attribute.SetMetadata("elementSize", 3)` author primvar metadata with the USD
field's proper type. `await prim.AddReference(assetPath, primPath)`,
`await prim.SetInstanceable(true)` and
`await layer.SetSubLayerPaths(["looks.usda", "layout.usda"])` author composition
without generating or rewriting USDA text. Earlier sublayers are stronger.

`await stage.OpenLayerStage(identifier)` returns an owned stage view over an
actual composed layer, preserving layer identity and the resolver context. Use it
to edit that file in its authored prim namespace; reopening a URL can produce a
separate layer. Unknown layer identifiers return `null`. Payloads start unloaded.
Release the view with `USD.ReleaseStage(view)` when finished.

For variant authoring, select the variant, save `stage.GetEditTarget()`, set the
selected variant's `prim.GetVariantEditTarget(setName)`, then author both prims
and values. Restore the previous target in `finally`, and call `delete()` on
both owned target handles. Complete examples are in
[`tests/fixtures/api`](tests/fixtures/api).

## Install

```sh
npm install @needle-tools/usd@1.2.0 three@npm:@needle-tools/three@0.185.2-alpha.6
```

Version 1.2.0 uses OpenUSD 26.11.1 and ships a Hydra imaging bridge for
three.js. The wasm bundle includes Adobe `usdGltf` with Draco-compressed
glTF/GLB import, native `usdDraco` mesh payloads, MaterialX, and OpenSubdiv
support.

The three.js bridge uses authored USD Preview Surface and MaterialX surfaces
before trying an MDL approximation. Known `OmniPBR`, `OmniPBR_ClearCoat`,
`OmniPBR_Opacity`, `OmniGlass`, and glTF `gltf_material` definitions are mapped to a physical
material from their authored inputs. This includes color, metallic/roughness,
emission, opacity, normal maps, texture color spaces, and UV transforms. glTF
texture lookup nodes in `gltf_support.mdl` and `pbr.mdl` (including numbered
copies) are recognized; texture factors and packed channels are preserved.
OmniGlass retains transmission, glass tint, IOR, roughness and enabled cutout
opacity, including when an exporter supplies an opaque universal preview that
cannot express transmission. It uses a thin-shell approximation; volumetric
absorption and dispersion are not evaluated.

This does not compile or evaluate MDL. Custom modules, connected procedural
expressions, projected coordinates, and secondary UV sets use the mesh fallback
and retain display colors. Known materials remain approximations: detail normals,
albedo color correction, arbitrary layers, and advanced glTF lobes are not
evaluated. Missing textures retain the authored constant. Diagnostics expose
`mdlApproximations`, `materialFallbacks`, and `unsupportedMaterialIds`.

## Runtime Requirements

This package ships a threaded Emscripten/OpenUSD wasm build. Browser pages that
use it must be served in a cross-origin isolated context so `SharedArrayBuffer`
and pthread workers are available:

```js
res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
```

For Vite projects, use the package plugin to set these headers during local
development:

```js
import { needleUSD } from "@needle-tools/usd/vite";

export default {
  plugins: [needleUSD()],
};
```

The default Asyncify runtime contains `emHdBindings.js` and
`emHdBindings.wasm`. An additional JSPI runtime uses `emHdBindings.jspi.js` and
`emHdBindings.jspi.wasm`. There is no separate worker script; pthread workers
load the selected generated JavaScript entrypoint directly.

Applications that await asynchronous native binding operations can opt into
the smaller JSPI runtime with `getUsdModule({ asyncRuntime: 'auto' })`. This
selects JSPI when both `WebAssembly.Suspending` and `WebAssembly.promising` are
available and otherwise selects Asyncify. JSPI binding operations marked
asynchronous return promises even when their data is already local. Use
`await` for these calls. `createThreeHydra` handles driver creation for both
runtimes. Direct binding consumers should select the optional async factory:

```js
const driver = await (USD.CreateHdWebSyncDriver
  ? USD.CreateHdWebSyncDriver(delegate, file)
  : new USD.HdWebSyncDriver(delegate, file));
```

Use `asyncRuntime: 'asyncify'` to retain the existing binding behavior or
`asyncRuntime: 'jspi'` to require JSPI and receive an error on unsupported
engines. Runtime initialization errors are reported without silently trying a
different runtime. Concurrent calls share one initialization; the first call's
options select the runtime. Custom `locateFile` and `mainScriptUrlOrBlob`
overrides must point to matching artifacts for the selected runtime.

The 1.2.0 JSPI Wasm artifact is 19.5 MB, versus 35.9 MB for Asyncify. With
Brotli quality 11, this is 3.32 MB versus 5.42 MB (39% less transfer). Both
contain the same native feature set. The package includes both runtimes;
applications download only the selected runtime. The viewer app uses `auto`.

Precompute Brotli compression for production Wasm delivery and serve it with
`Content-Type: application/wasm`, `Content-Encoding: br` and
`Vary: Accept-Encoding`, alongside the required isolation headers. Compression
belongs to the host's build/server configuration; the npm package contains the
original runtimes without compressed duplicates.

For inspection with either runtime, use `inspectStageAsync` or
`inspectPrimAsync` from `/scene` inside `handle.readStage()`. The synchronous
helpers remain available for existing Asyncify integrations.

Use `handle.sourcePaths.path(identifier)` for public file paths relative to the
root layer's folder, including `../` for dependencies above it. Pass the result
directly to `readStageAsset` or `readStageLayer` from `/scene` to read it.
`stageResources(handle.scene, handle.sourcePaths)` lists loaded textures in the
same form. Package members keep their USDZ identity; files on another HTTP
origin keep their URL. Native OpenUSD identifiers remain available for low-level
composition and editing operations.

Native JSPI builds use `-DPXR_EMSCRIPTEN_RUNTIME=JSPI` in a separate build
directory. Exception-using dependencies must also be rebuilt with
`-fwasm-exceptions` into a separate dependency prefix; mixing exception ABIs
is unsafe. The default `ASYNCIFY` build retains `-fexceptions`. Each shipped
runtime has its own `openusd-build-info[.jspi].json` and optimization manifest.

## Minimal Examples

All browser examples must be served with the COOP/COEP headers from
["Runtime Requirements"](#runtime-requirements). The import-map examples use
same-origin `/vendor/...` URLs so the threaded wasm worker can load the
Emscripten JavaScript from the page origin; replace those URLs with your own
served package paths.

### Needle Engine With Package Install

`package.json`

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1"
  },
  "dependencies": {
    "@needle-tools/engine": "6.0.0-canary.1783788842.warm-melon.3e41745a8",
    "@needle-tools/usd": "1.2.0",
    "three": "npm:@needle-tools/three@0.185.2-alpha.6",
    "vite": "^8.1.0"
  }
}
```

`index.html`

```html
<!doctype html>
<html>
  <body style="margin:0">
    <script type="module">
      import "@needle-tools/engine";
      import { addPluginForNeedleEngine } from "@needle-tools/usd/plugins";

      await addPluginForNeedleEngine({
        // Needle Engine loadfinished waits for the initial Hydra draw and
        // asynchronous USD material generation, so engine auto-fit and screenshot
        // tools see a presentable scene.
        // Pass autoPlay: true when the host app should start USD timeline
        // playback automatically after loading.
        getFiles: () => []
      });

      document.body.insertAdjacentHTML(
        "beforeend",
        '<needle-engine src="./model.usdz" camera-controls contactshadows="0.7"></needle-engine>'
      );
    </script>
  </body>
</html>
```

### Needle Engine With Import Map

`index.html`

```html
<!doctype html>
<html>
  <body style="margin:0">
    <script type="importmap">
      {
        "imports": {
          "three": "/vendor/@needle-tools/engine/dist/three.min.js",
          "three/addons/": "/vendor/@needle-tools/three/examples/jsm/",
          "@needle-tools/engine": "/vendor/@needle-tools/engine/dist/needle-engine.min.js",
          "@needle-tools/materialx": "/vendor/@needle-tools/materialx/index.js",
          "@needle-tools/usd": "/vendor/@needle-tools/usd/src/index.js",
          "@needle-tools/usd/three": "/vendor/@needle-tools/usd/src/create.three.js",
          "@needle-tools/usd/plugins": "/vendor/@needle-tools/usd/src/plugins/index.js"
        }
      }
    </script>
    <script type="module">
      import "@needle-tools/engine";
      import { addPluginForNeedleEngine } from "@needle-tools/usd/plugins";

      await addPluginForNeedleEngine({
        // Needle Engine loadfinished waits for the initial Hydra draw and
        // asynchronous USD material generation, so engine auto-fit and screenshot
        // tools see a presentable scene.
        // Pass autoPlay: true when the host app should start USD timeline
        // playback automatically after loading.
        getFiles: () => []
      });

      document.body.insertAdjacentHTML(
        "beforeend",
        '<needle-engine src="./model.usdz" camera-controls contactshadows="0.7"></needle-engine>'
      );
    </script>
  </body>
</html>
```

For folder/drop workflows, return the active file set from `getFiles()`. The
first file must be the root USD file, and each file should have a stable `path`
property so USD references can resolve.

### three.js With Package Install

`package.json`

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1"
  },
  "dependencies": {
    "@needle-tools/usd": "1.2.0",
    "three": "npm:@needle-tools/three@0.185.2-alpha.6",
    "vite": "^8.1.0"
  }
}
```

`index.html`

```html
<!doctype html>
<html>
  <body style="margin:0">
    <script type="module">
      import * as THREE from "three/webgpu";
      import { getUsdModule } from "@needle-tools/usd";
      import { createThreeHydra } from "@needle-tools/usd/three";
      import { createWebGpuSupport, configureNeedleAgx } from "@needle-tools/usd/renderers";

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 1000);
      camera.position.set(0, 1.5, 4);
      camera.lookAt(0, 0, 0);

      const renderer = new THREE.WebGPURenderer({ antialias: false });
      await renderer.init();
      await configureNeedleAgx(renderer);
      renderer.toneMapping = THREE.AgXToneMapping;
      renderer.setSize(innerWidth, innerHeight);
      document.body.append(renderer.domElement);

      const usd = await getUsdModule();
      const handle = await createThreeHydra({
        USD: usd,
        scene,
        url: "./model.usdz",
        renderer,
        webGpuSupport: await createWebGpuSupport(),
        complexity: "adaptive",
        autoPlay: true
      });
      await handle.ready();
      await handle.materialsReady();

      let authoredLights = false;
      scene.traverse(object => { if (object.isLight) authoredLights = true; });
      if (!authoredLights && !scene.environment) {
        scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7480, 2));
        const key = new THREE.DirectionalLight(0xffffff, 3);
        key.position.set(3, 5, 4);
        scene.add(key);
      }

      let last = performance.now();
      renderer.setAnimationLoop((time) => {
        const dt = (time - last) / 1000;
        last = time;
        handle.update(dt);
        renderer.render(scene, camera);
      });
    </script>
  </body>
</html>
```

For Vite projects, add the `needleUSD()` plugin shown in
["Runtime Requirements"](#runtime-requirements) so dev serving uses the
required COOP/COEP headers.

### three.js With Import Map

`index.html`

```html
<!doctype html>
<html>
  <body style="margin:0">
    <script type="importmap">
      {
        "imports": {
          "three": "/vendor/three/build/three.module.js",
          "three/webgpu": "/vendor/three/build/three.webgpu.js",
          "three/tsl": "/vendor/three/build/three.tsl.js",
          "three/addons/": "/vendor/three/examples/jsm/",
          "@needle-tools/materialx": "/vendor/@needle-tools/materialx/index.js",
          "@needle-tools/usd": "/vendor/@needle-tools/usd/src/index.js",
          "@needle-tools/usd/three": "/vendor/@needle-tools/usd/src/create.three.js",
          "@needle-tools/usd/renderers": "/vendor/@needle-tools/usd/src/renderers/index.js"
        }
      }
    </script>
    <script type="module">
      import * as THREE from "three/webgpu";
      import { getUsdModule } from "@needle-tools/usd";
      import { createThreeHydra } from "@needle-tools/usd/three";
      import { createWebGpuSupport, configureNeedleAgx } from "@needle-tools/usd/renderers";

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 1000);
      camera.position.set(0, 1.5, 4);
      camera.lookAt(0, 0, 0);

      const renderer = new THREE.WebGPURenderer({ antialias: false });
      await renderer.init();
      await configureNeedleAgx(renderer);
      renderer.toneMapping = THREE.AgXToneMapping;
      renderer.setSize(innerWidth, innerHeight);
      document.body.append(renderer.domElement);

      const usd = await getUsdModule();
      const handle = await createThreeHydra({
        USD: usd,
        scene,
        url: "./model.usdz",
        renderer,
        webGpuSupport: await createWebGpuSupport(),
        complexity: "adaptive",
        autoPlay: true
      });
      await handle.ready();
      await handle.materialsReady();

      let authoredLights = false;
      scene.traverse(object => { if (object.isLight) authoredLights = true; });
      if (!authoredLights && !scene.environment) {
        scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7480, 2));
        const key = new THREE.DirectionalLight(0xffffff, 3);
        key.position.set(3, 5, 4);
        scene.add(key);
      }

      let last = performance.now();
      renderer.setAnimationLoop((time) => {
        const dt = (time - last) / 1000;
        last = time;
        handle.update(dt);
        renderer.render(scene, camera);
      });
    </script>
  </body>
</html>
```

### Subdivision detail and animation

`createThreeHydra({ complexity: 'adaptive', ... })` and
`await handle.setComplexity('adaptive')` evaluate OpenSubdiv limit surfaces with
shared-edge, curvature-driven CPU tessellation. Catmull-Clark, Loop and bilinear
meshes preserve holes, sharp normals, face-varying UV seams and material subsets.
Rates change with geometry, not camera distance, and the triangle budget is
bounded by uniform Very high. Unsupported Bfr topology warns and falls back to
uniform refinement.

`low`, `medium`, `high`, `veryhigh` (also `very-high`) and numeric OpenUSD
complexity values select uniform refinement. The SDK default remains `low`;
the public viewer defaults to Adaptive and remembers user choices. Earlier
runtimes without `SetAdaptiveSubdivision` report a warning and use Very high.

Time-sampled hole indices are held between samples; crease/corner sharpness can
interpolate. Animated crease indices, crease lengths, corner indices and point
deformation also update on playback and seeking:

```js
handle.setPlaying(false);
await handle.setTime(61); // USD time codes, not seconds; waits for geometry sync.
await handle.setTime(1);  // Backward seeking restores subdivision and holes.
handle.setPlaying(true);
```

The public viewer's **Examples → Needle → Subdivision → Pip and Pop** demonstrates
winking hole faces and a stationary cage morphing between round and sharp shapes.
The repository also includes 63 executable JavaScript lessons under
**Examples → Needle → JavaScript API**, with native preview captures.

### Viewport helpers

Use **View → Helpers** in the app to toggle curve centerlines, curve/NURBS control
points, point markers, lights and cameras. Choices are remembered. Centerlines
make zero-width curves visible without changing their authored widths. The Scene
purpose selector controls whether guide geometry participates in the view.

Embedded viewers can use the same SDK helpers; all are off by default:

```js
const handle = await createThreeHydra({
  USD, scene, url: './scene.usda',
  helpers: { curves: true, lights: true },
});
handle.setHelpers({ controlPoints: true, cameras: true });
console.log(handle.helpers);
```

Helpers follow authored visibility, transforms, instances and animation. They
are excluded from framing, shadows, traced geometry and USD exports. With
`createRenderModes`, helpers use a depth-tested display overlay in both path
tracers. WebGPU point markers use instanced billboards through
`createWebGpuSupport()` so they remain legible beyond WebGPU's one-pixel point
primitive limit. A host can use `handle.isUpdating` to retain its last complete
frame while an asynchronous stage edit or recomposition is in progress.

### Gaussian Splats

OpenUSD `UsdVolParticleField3DGaussianSplat` prims use the native Three.js Gaussian
splat implementation with WebGPURenderer and `createWebGpuSupport()` (r185+).
Meshes, bounded volumes and splats share the renderer, camera and depth buffer.
Signed/HDR SH coefficients of degrees 0–3 are retained. WebGPU sorts on the GPU;
WebGPURenderer's WebGL2 backend uses CPU sorting. Splats are sorted within each
particle field; intersecting transparent fields/media do not have a global sort.

Legacy WebGLRenderer and Needle Engine integrations continue to use Spark.
Install Spark alongside Three.js 0.180 or newer and pass the host renderer:

```sh
npm install @sparkjsdev/spark@2.2.0 three@npm:@needle-tools/three@0.185.2-alpha.6
```

Spark is an optional peer dependency; scenes without `particleField` prims do
not load it. Needle Engine 6 already includes Spark, and the USD plugin passes
Needle's renderer into the same shared Hydra integration.

## Public Entrypoints

```js
import { getUsdModule, loadOpenUsdBuildInfo } from "@needle-tools/usd";
import { createThreeHydra } from "@needle-tools/usd/three";
import { addPluginForNeedleEngine } from "@needle-tools/usd/plugins";
import { needleUSD } from "@needle-tools/usd/vite";
```



## Authored shadows

USD punctual lights cast raster shadows when the host renderer has
`renderer.shadowMap.enabled = true`. Both public viewer modes enable this.
Directional, point and shaped spot lights respect `UsdLuxShadowAPI`'s
`inputs:shadow:enable` (default `true`), including time samples and variants.
PreviewSurface and MaterialX receivers are verified in both public viewers.
Shadow bounds follow the composed USD scene, and the owning handle releases
the shadow maps and attribute handles on disposal. Stages without active
shadow lights skip shadow-bound traversal.

**Examples → Needle → Lights → Distant sun** has `shadows` variants for
enabling and disabling its authored shadow.

Bounded-medium proxy boxes do not cast opaque surface shadows. Their material
integrates extinction along light rays and can receive shadows from scene geometry.
In the public node-rendered viewer, **Background → Light/Dark** changes the backdrop
without reloading the stage (`?background=dark`). Transparent media can be faint
against a bright background even when composition is correct.

Rectangular and dome-light shadow transport, `shadowLink` collections and the
artistic `shadow:color`, `shadow:distance`, `shadow:falloff` and
`shadow:falloffGamma` controls require additional renderer support. A shadow-map
camera's clipping range does not implement USD's occluder-to-receiver shadow
distance control.

## Bounded MaterialX volumes

USD materials with a MaterialX `volume` terminal can render a participating
medium inside an assigned **box mesh**. Supported closures include absorption,
emission, anisotropic single scattering, and VDF/EDF add, multiply, and mix.
Procedural inputs are evaluated along camera and light rays. Coefficients use
inverse world units.

Use the three.js node renderer with a single-sample depth buffer:

```js
import { WebGPURenderer, Scene, Color } from 'three/webgpu';
import { getUsdModule } from '@needle-tools/usd';
import { createThreeHydra } from '@needle-tools/usd/three';
import { createMaterialXVolumeMaterial } from '@needle-tools/usd/volumes';

const renderer = new WebGPURenderer({ antialias: false });
// Add forceWebGL: true to use the node renderer's WebGL2 backend.
await renderer.init();
const scene = new Scene();
scene.background = new Color(0xf0f0f0);
const stage = await createThreeHydra({
  USD: await getUsdModule(), scene, renderer, url: '/bounded-volume.usda',
  materialXVolumeFactory: createMaterialXVolumeMaterial,
});
await stage.ready();
await stage.materialsReady();
```

Set an opaque `scene.background` when embedding over a colored page. The medium
composites against the renderer’s opaque color/depth pass; a CSS background
behind a transparent canvas is not available to that pass.

Volume support is an explicit opt-in entry point and requires the recent
three.js node APIs (validated with `@needle-tools/three@0.185.2-alpha.6`).
The base entry points retain support for legacy three.js consumers without
importing those APIs. Missing volume configuration or a legacy `WebGLRenderer`
reports unsupported volume shading. The MaterialX factory does not load
`standard_volume`, overlapping media, or
arbitrary boundaries. Scattering supports directional, point, and spot lights;
environment and area-light scattering are not implemented. The existing
surface MaterialX/WASM path continues to handle surface materials.

`npm run test:materialx-volume` loads the real USD fixture and checks absorption
and emission against analytic pixel values on WebGPU and WebGL2, with no scene
lights. Vendored loader provenance and limitations are in
[`src/vendor/materialx/README.md`](src/vendor/materialx/README.md).

## OpenVDB fields

The same node renderer can display `UsdVolVolume` density and heat fields from
local/package or HTTP OpenVDB assets. Add the optional factory when loading:

```js
import { createVdbVolumeMesh } from '@needle-tools/usd/volumes';

const stage = await createThreeHydra({
  USD: await getUsdModule(), scene, renderer, url: '/smoke.usda',
  usdVolumeFactory: createVdbVolumeMesh,
});
await stage.ready();
await stage.setTime(24); // Includes any asynchronous field-file update.
```

The renderer preserves grid and volume transforms, varying field files and
valid empty frames. Its default transfer uses density for extinction/scattering
and heat for emission. Arbitrary authored volume shaders, independent field-prim
transforms, overlapping media and motion blur are not implemented.

## Low Level Usage

### Import
```js
import { getUsdModule } from '@needle-tools/usd';
```

### Load the Module

```js
getUsdModule({
  // We need to override where the initial module is loaded from, 
  // since after bundling we can't rely on paths anymore
  mainScriptUrlOrBlob: "/emHdBindings.js",
}).then(async (Usd: USD) => {
    // use Usd here
});
```

### Load a file into the virtual file system
```js
const blob = await fetch("test.usdz");
const arrayBuffer = await blob.arrayBuffer();
// Create a file in the virtual file system
Usd.FS_createDataFile("", "test.usdz", new Uint8Array(arrayBuffer), true, true, true);
```

### Load file into USD

```js
let driver = new Usd.HdWebSyncDriver(delegate, "test.usdz");
if (driver instanceof Promise) driver = await driver;

// This kicks off asynchronous tasks to look at everything that has changed – _SyncAll –
// which will then call into the delegate to create and update the scene graph.
driver.Draw();
```

## Interactive physics

The optional `@needle-tools/usd/physics` entry reads UsdPhysics from the composed
stage and simulates it with an initialized `@dimforge/rapier3d-compat` module
(tested with 0.19.3 and 0.21.0). Importing the renderer does not load Rapier.

```js
import RAPIER from '@dimforge/rapier3d-compat';
import { createUsdPhysics } from '@needle-tools/usd/physics';

await RAPIER.init();
const physics = await createUsdPhysics({ handle, rapier: RAPIER });
physics.play();
// In the render loop, after handle.update(dt):
physics.update(dt);
// Before disposing or editing/recomposing the USD stage:
physics.dispose();
```

The simulation overlays rendered transforms; it does not author stage edits.
`pause()` preserves poses; `reset()` restores authored poses and velocities.
Drag positions passed to `beginDrag`/`moveDrag` are in stage coordinates before
the root up-axis transform. `scenePath` selects among multiple PhysicsScenes;
ownerless bodies belong to the first scene, following USD semantics.

Supported colliders are cubes, spheres, capsules, cylinders, cones, planes,
static triangle meshes and authored convex-hull meshes. Fixed, spherical,
revolute and prismatic joints, unit-joint limits/drives and maximum-distance
ropes are supported. Stage units, gravity, mass/density, body center of mass
and inertia, materials, filtered pairs and collision groups are preserved.
Rapier 0.21.0 also preserves independently rotated hinge/slider frames and
motor force limits. Older supplied runtimes report unsupported frame/force
features. Spherical cone limits, D6 joints, reduced-coordinate articulations,
joint breaking, collider-local inertia overrides and other
mesh approximations appear in `physics.unsupported`. Kinematic bodies retain
their initial poses during simulation; animated kinematic driving is not yet
implemented. Reset/dispose before changing time or variants, then recreate
the simulation from the updated stage.

In the public viewer, open **Window → Simulation**, then choose **Interact**
to drag movable parts within authored joint limits. The assembly base is held
while dragging a connected part; fixed attachments and dependent joints remain
in the same solver. This mode disables gravity and contact collision, so PhysX
SDF collision meshes are not needed to inspect a mechanism. Choose **Simulate**
for contact dynamics and gravity. **Reset** restores the authored scene.
Both actions load the existing optional Rapier runtime on demand.

SDK hosts select the same behavior with
`createUsdPhysics({handle, rapier, mode: 'interaction'})`. Picking accepts
`bodyForObject(object, instanceIndex)`; each render instance resolves to its
composed USD body instead of borrowing its prototype's transform. Interaction
uses authored mass/inertia where available, with unit weights for missing
values; its motion is for joint inspection, not a dynamics reference.

To disable public-viewer physics completely, use `?physics=off` or set
`window.usdViewerOptions = { physics: false }` before the entry script loads.
No physics runtime is downloaded in that mode. In Needle mode, simulation uses
the engine's shared lazy module registry. The Three viewer loads the standalone
runtime only after **Interact** or **Simulate** is clicked.
The public viewer uses Rapier 0.21.0, including an import-map override of the
pinned engine bundle's older Rapier chunk. Both loaders resolve the same module;
the newer wrapper fixes the deprecated WASM initialization call.

Hosts can configure `init({ physics: { loadRapier: async () => module } })`, or
provide `physics.moduleUrl` for a different module location. For another physics
engine, `physics.createSimulation({ handle, snapshot, scenePath, mode })` can return an
adapter implementing the simulation methods used by the controls (`play`,
`pause`, `isPlaying`, `update`, `reset`, `dispose`, `bodyForObject`, `beginDrag`,
`moveDrag`, `endDrag`). This bypasses the Rapier loader. The package's composed
`readUsdPhysics()` snapshot remains available independently of a simulation.

## Useful References

Uses `Asyncify` to handle async calls in emscripten.  
> A synchronous call in C that waits for an asynchronous operation in JS to complete.
https://emscripten.org/docs/porting/asyncify.html


# Contact ✒️

For commercial use, please contact [hi@needle.tools](mailto:hi@needle.tools).

<b>[🌵 Needle](https://needle.tools)</b> • 
[Github](https://github.com/needle-tools) • 
[Twitter](https://twitter.com/NeedleTools) • 
[Discord](https://discord.needle.tools) • 
[Forum](https://forum.needle.tools) • 
[Youtube](https://www.youtube.com/@needle-tools)

### Render modes and stage controls

The optional `@needle-tools/usd/renderers` and `/viewer` entries use Three.js r185 or newer. The base loader and `/scene` inspection helpers continue to support r160. A host keeps ownership of its renderer, scene, controls and Hydra handle.

```js
import { WebGPURenderer } from 'three/webgpu';
import { createThreeHydra } from '@needle-tools/usd/three';
import { createWebGpuSupport, createRenderModes } from '@needle-tools/usd/renderers';
import { mountStagePanel } from '@needle-tools/usd/viewer';

const renderer = new WebGPURenderer({ antialias: false });
await renderer.init(); // WebGPU, with Three.js's WebGL2 fallback when needed
const handle = await createThreeHydra({
  USD, scene: usdRoot, renderScene: scene, renderer, url,
  webGpuSupport: await createWebGpuSupport(),
});
await handle.ready();
const modes = await createRenderModes({
  renderer, scene, camera, controls,
  settings: { maxSamples: 512, bounces: 8, denoiser: 'jnlm' },
  // npm install @meimu/mutracer@0.2.0; stays outside the base loader graph.
  loadPathTracer: () => import('@meimu/mutracer'),
  // npm install three-gpu-pathtracer@0.0.27 three-mesh-bvh@0.9.16 xatlas-web@0.1.0
  loadGkPathTracer: () => import('three-gpu-pathtracer/webgpu'),
});
await modes.setMode('beauty'); // 'basic' | 'beauty' | 'pathtraced' | 'pathtraced-gk'
// In the host animation loop, after handle.update(delta):
modes.render(camera);
// After renderer.setSize(...): modes.resize();
// On teardown: modes.dispose(); await handle.dispose(); renderer.dispose();
```

When `controls` is supplied, `modes.render()` owns its updates; do not also call `controls.update()` in the host loop. This keeps orbit damping and tracer activity detection in sync. Omit it if the application manages its own controls. `await modes.setSettings({ maxSamples: 256, bounces: 4, denoiser: null })` changes tracer settings; `modes.settings` returns a copy. A renderer clear color supplies the backdrop when `scene.background` is unset; an authored scene background takes precedence. Environment lighting remains separate.

To match Needle Engine's AgX look, call `await configureNeedleAgx(renderer)` before compiling materials on a `WebGPURenderer`, then select `AgXToneMapping` normally. This registers Needle's transform on that renderer, including its WebGL fallback. For MuTracer, pass `configurePathTracer: configureNeedleAgxDisplay` to `createRenderModes` or `mountRenderModePicker`; it applies the same transform after denoising through MuTracer's public display-pass API. This MuTracer integration requires WebGPU extended HDR output; unsupported devices report a mode error. Import both helpers from `@needle-tools/usd/renderers`. The default loader remains compatible with Three r160.

Basic renders directly. Beauty adds Three.js SSGI, ambient occlusion and temporal antialiasing. Path traced uses MuTracer with 512 samples, eight bounces and JNLM denoising; scene and camera edits reset accumulation. MuTracer is an optional peer and must be supplied with `loadPathTracer` when path tracing is enabled. It loads only when selected. A separate output canvas keeps the existing orbit controls connected; an application may supply its own `canvas` for embedded layouts.

Basic and Beauty support optional HDR bloom on `WebGPURenderer`, including its WebGL fallback. It is off by default. Enable it with `await modes.setSettings({ bloom: true, bloomStrength: 0.5, bloomRadius: 0.5, bloomThreshold: 1 })`. Strength ranges from 0 to 10, radius from 0 to 1, and the scene-linear luminance threshold from 0 to 100. Bloom runs after transparent compositing and before the selected tone mapping, retaining Needle AgX. Basic adds an offscreen pass only while bloom is enabled. The settings picker exposes these controls for Basic/Beauty; the two path tracers do not apply this effect.

UsdLux light conversion respects luminance, angular size and [area normalization](https://openusd.org/release/user_guides/schemas/usdLux/LightAPI.html). `scenePrimitiveLightIntensityScale` is an additional overall multiplier; the loader retains its legacy default of `0.01`. Pass `1` to use authored luminance without that multiplier, as the public viewer does by default. Catalog entries can override that viewer setting. Dome environments retain their authored intensity independently. Disk and cylinder lights remain geometric approximations, and native Storm thumbnails can differ in area-light transport and display transform. Preview Surface emissive colors remain linear HDR values; Beauty's ambient occlusion does not attenuate their emission.

WebGPU support translates MaterialX surfaces through the bundled TSL loader, including textures, nested graphs and geometry properties. Bounded MaterialX and VDB volumes additionally require the factories from `/volumes`. Gaussian splats use the same WebGPURenderer through the particle-field factory in `createWebGpuSupport()`.

For scenes whose rectangular lights come from USD, `createWebGpuSupport({ lazyAreaLights: true })` loads area-light lookup tables when an authored area light needs them. Hydra readiness waits for those tables before rendering. The default eagerly prepares them for host-created Three.js area lights; with the lazy option, call `await support.prepareAreaLights()` before rendering host-created area lights. EXR, HDR and TGA texture decoders also load only when a corresponding texture is encountered.

`pathtraced-gk` uses gkjohnson's WebGPU tracer on the host renderer and canvas, with 512 samples and eight bounces. It requires the WebGPU backend and ordinary MeshStandard/Physical materials; its library is also loaded only when selected. Private geometry copies isolate BVH index reordering and generated attributes from the application. Camera, transforms, material, geometry, visibility, lights and environment edits reset accumulation. It supports rectangular lights and uses Three.js PBR material properties directly. Arbitrary node graphs, volumes and Gaussian splats require the Basic/Beauty modes. MuTracer retains its separate output canvas. `denoiser` accepts `'jnlm'`, `'oidn-fast'`, `'oidn'` or `null`; OIDN selects the small or standard model. MuTracer filters progressively. For gkjohnson, supply `loadDenoiser: () => import('oidn-webgpu')` and `denoiserWeightsBaseUrl` pointing at self-hosted MuTracer-compatible OIDN weights, then set `gkDenoiser` to `'oidn-fast'`, `'oidn'` or `null`. Its OIDN pass runs after the sample budget completes. Without a denoiser loader, gkjohnson defaults to unfiltered output. The host owns installation/hosting of the optional OIDN runtime and weights.

`configureNeedleAgxDisplay(engine, () => renderer.toneMapping)` follows changes to the host's AgX (Needle), ACES Filmic, Khronos PBR Neutral, Linear, Reinhard or NoToneMapping choice. Needle AgX remains the default when no callback is supplied. NoToneMapping ignores exposure, matching Three's presentation.

The `/scene` entry also exports `setPrimVisible(handle, path, visible)` and `setPrimActive(handle, path, active)`. They synchronize through `handle.editStage`; activation recomposes descendants. Visibility edits the authored default for static visibility, or the current time for animated visibility. These are in-memory stage edits, like variants; the host decides whether to export them.

`await handle.exportUsdz()` returns a `Uint8Array` containing a self-contained
USDZ. It waits for pending `editStage` calls and includes unsaved authored layer
edits, referenced layers, textures and other asset dependencies, including
inactive variants. Composition and animation remain editable. Repackaging a
loaded USDZ also retains edits made inside the package. Missing dependencies
reject the export. The host can download the bytes as a Blob with MIME type
`model/vnd.usdz+zip`; the viewer's Download button also offers a compressed ZIP
containing the same localized files. Camera orbit, render settings and physics
overlays remain viewer state rather than authored USD edits.

With the bundled runtime, native packaging runs on a WASM thread and archive
readback yields between bounded chunks. ZIP conversion runs in a module worker,
including decompression, checksums and compression. The viewport and other UI
controls remain interactive. Authored stage mutations wait for the export to
finish so the archive captures a consistent stage. The shared button shows an
animated spinner and an accessible export status, respects reduced motion and
keeps its width stable. Closing the source discards its export; disposal or source
replacement also terminates any ZIP compression worker.

`handle.exportUsdz({onProgress})` and `mountDownloadButton({onProgress})` report
`{phase, completed, total}`. Phases cover preparation, dependency loading,
packaging, readback and (for ZIP) compression. Counts describe that phase; a zero
total is indeterminate. The native packaging phase has no fabricated percentage.
Older custom native modules retain their synchronous packaging fallback.

The split button is also available independently from `/viewer/download`, with its dropdown, keyboard
navigation, busy state, cancellation and themeable styles:

```js
import { mountDownloadButton } from '@needle-tools/usd/viewer/download';

const downloads = mountDownloadButton({
  container: toolbar,
  getSource: () => currentHandle
    ? { handle: currentHandle, filename: currentFilename }
    : null,
  stateKey: 'my-viewer-download-format', // optional localStorage persistence
  onError: error => console.error(error),
});
// After loading or closing a file:
downloads.refresh();
// When removing the toolbar:
downloads.dispose();
```

The aggregate `/viewer` entry also exports it; the lightweight entry above avoids
renderer imports and supports Three r160 consumers. ZIP is the default. `format`, `setFormat()` and `onFormatChange` support host-owned
preferences; omit `stateKey` to avoid localStorage. Set `style: false` for custom
styles, or override the shared viewer CSS variables and
`--usd-download-menu-width`. `getSource` may restrict `formats` and supply
`isCurrent()` for additional cancellation checks. Hosts with application menus
can coordinate through `onOpenChange`, `onMenuNavigate`, `openMenu()` and
`closeMenu()`; no workbench or global app state is required.

MuTracer's built-in conversion supports ordinary Three.js PBR surfaces, including the viewer's MDL input approximations. Arbitrary MaterialX graphs, bounded volumes, custom primvar shaders, per-point/curve opacity, Gaussian splats and PMREM-only environments cannot currently be translated by this integration; selecting path tracing preserves the current mode and reports the unsupported content. Applications can supply `convertMaterial` and `convertLight` for their own MuTracer conversions. Use an equirectangular HDR/EXR environment for path tracing.

For controls, `mountRenderModePicker` from `/viewer` wraps the same render-mode controller. `mountStagePanel({ handle, stage, scene, camera, controls, setCamera })` adds cameras, purposes, variants, payloads, a searchable prim tree, attributes, relationships, metadata, layers and a timeline. `setCamera` receives the selected, fully composed Hydra camera, or the supplied free camera. Use `beforeEdit`/`afterEdit` to coordinate host integrations such as physics. Dispose the panel before disposing its handle. The default stylesheet loads relative to the installed module; pass `style: false` to provide your own styles. `inspectStage`, `inspectPrim`, `setVariant`, `setPayloadLoaded` and `stageCameras` from `/scene` are available without the UI.


Use `mountRenderModePicker({ layout: 'settings', ... })` for mode, exposure and tracer controls in a settings panel. `onSettingsChange` reports preferences for host persistence; the default compact picker remains available.

Pass `containers: { stage, properties, layers, timeline, view }` to host the
stage controls in separate layout panels. These are plain HTMLElements; the SDK
has no framework or Dockview dependency. The optional `view` host places camera and purpose controls in a shared settings panel. Timeline controls provide frame stepping, range endpoints, numeric entry and scrubbing. `stateKey` persists the prim filter,
collapsed branches and selection. `onSelect` reports the selected prim path;
`panel.selectPrim(path)` connects viewport picking to the inspector. `onOpen`
lets a host reveal its panels, and `onStage` receives refreshed stage information.
The callback also receives the complete immutable selection as its second
argument. `panel.selectMany(items)` supports multiple authored identities;
`panel.selection` and `panel.selectedProperty` expose inspection context.
`panel.navigate('/Looks/Material/Shader.inputs:roughness')` follows a property
without framing the camera. Properties provides target/connection links,
Back/Forward, filtering, copying and selected-property provenance.

For viewport picks, `handle.resolvePick(renderPath, instanceIndex)` translates
the renderer's index to an authored path and instancer context. Point glyphs,
mixed prototypes, masking and nested instancers use the same mapping;
`handle.resolveSelection(renderPath, count, items)` returns renderer indices for
outlines/framing. Authored point IDs are exact strings. `panel.selectPrim(item)`
accepts these identities as well as ordinary prim paths.

`mountRepl` from `/viewer` mounts an inline JavaScript console with expression
results, top-level await, errors and bounded command history. Supply
`getContext()` for the current `{USD, stage, handle, panel, selection}` and
`edit: callback => panel.edit(callback)`. Return `null` from `getContext` before
closing the document. Ctrl/Cmd+Enter runs; `help` lists symbols/shortcuts.
Declarations are command-local; `scratch` persists only for the current
document. This is trusted in-page JavaScript, not a sandbox.

`panel.edit(callback)` serializes mutations through `handle.editStage` and the
host lifecycle. A failed arbitrary callback can leave authored changes; those
changes are synchronized and the host restored before the error is rethrown.
This is not automatic rollback/undo or a save/export workflow. Do not nest a
second `handle.editStage` inside the callback.

Embedded panels do not add a second Stage button. `inspectStage().time` is null
for static content, including files that only declare frame bounds; otherwise it
reports the composed animation range. Timeline contents refresh after variant and
payload edits, with regularly spaced frame ticks. In the public viewer, changing
files never reopens or redocks a timeline the user closed or arranged.

The development viewer uses Dockview Core for resizable, dockable, floating and
popout panels, saved workspace layouts and viewport maximization. Its local
Needle brand assets support system, light and dark UI themes independently of
the scene background.

## KTX2 material textures

UsdUVTexture and MaterialX image inputs can load 2D KTX2 textures. Basis workers
load on demand. Color maps retain GPU compression where supported; scalar-channel
or normal-value remapping requests a separate RGBA decode without changing the
shared color map. Authored color-space settings override container metadata.

Modern Three.js resolves its bundled Basis decoder assets by default. To host
them yourself (required with Three r160), pass the matching decoder directory:

```js
const handle = await createThreeHydra({
  USD, scene: usdRoot, renderScene: scene, renderer, url: '/model.usda',
  ktx2TranscoderPath: '/basis/', // basis_transcoder.js and basis_transcoder.wasm
});
```

Needle Engine's USD plugin accepts the same `ktx2TranscoderPath` option. The
loader owns its workers and drains active decodes before terminating them.
Dome environment images currently use HDR or EXR.
