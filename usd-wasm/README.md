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

- **Composition** — references, payloads, variants, and nested packages resolve
  exactly as they would in `usdview`.
- **Instancing** — native instances and `PointInstancer` prims.
- **Visibility** — prim visibility and purpose-based filtering (`render`,
  `proxy`, `guide`).
- **Cameras & lights** — USD cameras and UsdLux lights.
- **Materials** — UsdPreviewSurface and MaterialX via Hydra material documents,
  including environment lighting, real-time shadows, and vertex displacement.
- **Geometry** — OpenSubdiv smooth subdivision surfaces and creases.
- **glTF-in-USD** — Adobe `usdGltf` file format plugin loads glTF/GLB directly
  inside a USD stage, including Draco-compressed meshes.
- **Compression** — `usdDraco` and `usdGltfDraco` compressed mesh payloads.

## Install

```sh
npm install @needle-tools/usd@1.2.0 three
```

This development checkout uses upstream OpenUSD 26.11.1 and ships a Hydra imaging bridge for
three.js. The wasm bundle includes Adobe `usdGltf` with Draco-compressed
glTF/GLB import, native `usdDraco` mesh payloads, MaterialX, and OpenSubdiv
support.

The three.js bridge uses authored USD Preview Surface and MaterialX surfaces
before trying an MDL approximation. Known `OmniPBR`, `OmniPBR_ClearCoat`,
`OmniPBR_Opacity`, and glTF `gltf_material` definitions are mapped to a physical
material from their authored inputs. This includes color, metallic/roughness,
emission, opacity, normal maps, texture color spaces, and UV transforms. glTF
texture lookup nodes in `gltf_support.mdl` and `pbr.mdl` (including numbered
copies) are recognized; texture factors and packed channels are preserved.

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

The modern Emscripten output contains `emHdBindings.js` and
`emHdBindings.wasm`. It does not ship a separate `emHdBindings.worker.js`; the
pthread workers load the main generated JavaScript entrypoint directly.

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
    "@needle-tools/engine": "^5.1.2",
    "@needle-tools/usd": "1.2.0",
    "three": "npm:@needle-tools/three@^0.169.19",
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
    "three": "^0.185.0",
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
      import * as THREE from "three";
      import { getUsdModule } from "@needle-tools/usd";
      import { createThreeHydra } from "@needle-tools/usd/three";

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 1000);
      camera.position.set(0, 1.5, 4);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(innerWidth, innerHeight);
      document.body.append(renderer.domElement);

      const usd = await getUsdModule();
      const handle = await createThreeHydra({
        USD: usd,
        scene,
        url: "./model.usdz"
      });
      await handle.ready();

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
          "three/addons/": "/vendor/three/examples/jsm/",
          "@needle-tools/materialx": "/vendor/@needle-tools/materialx/index.js",
          "@needle-tools/usd": "/vendor/@needle-tools/usd/src/index.js",
          "@needle-tools/usd/three": "/vendor/@needle-tools/usd/src/create.three.js"
        }
      }
    </script>
    <script type="module">
      import * as THREE from "three";
      import { getUsdModule } from "@needle-tools/usd";
      import { createThreeHydra } from "@needle-tools/usd/three";

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 1000);
      camera.position.set(0, 1.5, 4);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(innerWidth, innerHeight);
      document.body.append(renderer.domElement);

      const usd = await getUsdModule();
      const handle = await createThreeHydra({
        USD: usd,
        scene,
        url: "./model.usdz"
      });
      await handle.ready();
      // By default ready() waits for the stage and first Hydra draw, but not for
      // async material generation. Pass waitForMaterials: true when correctness
      // requires a material/texture barrier, or await handle.materialsReady().

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

### Gaussian Splats

OpenUSD `UsdVolParticleField3DGaussianSplat` prims are rendered through Spark.
Install Spark alongside Three.js 0.180 or newer and pass the host renderer to
`createThreeHydra` as shown above:

```sh
npm install @sparkjsdev/spark@^2.1.0 three@^0.185.0
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

## Bounded MaterialX volumes

USD materials with a MaterialX `volume` terminal can render a participating
medium inside an assigned **box mesh**. Supported closures include absorption,
emission, anisotropic single scattering, and VDF/EDF add, multiply, and mix.
Procedural inputs are evaluated along camera and light rays. Coefficients use
inverse world units.

Use the three.js node renderer with a single-sample depth buffer:

```js
import { WebGPURenderer, Scene } from 'three/webgpu';
import { getUsdModule } from '@needle-tools/usd';
import { createThreeHydra } from '@needle-tools/usd/three';
import { createMaterialXVolumeMaterial } from '@needle-tools/usd/volumes';

const renderer = new WebGPURenderer({ antialias: false });
// Add forceWebGL: true to use the node renderer's WebGL2 backend.
await renderer.init();
const scene = new Scene();
const stage = await createThreeHydra({
  USD: await getUsdModule(), scene, renderer, url: '/bounded-volume.usda',
  materialXVolumeFactory: createMaterialXVolumeMaterial,
});
await stage.ready();
await stage.materialsReady();
```

Volume support is an explicit opt-in entry point and requires the recent
three.js node APIs (validated with `@needle-tools/three@0.185.2-alpha.6`).
The base entry points retain support for legacy three.js consumers without
importing those APIs. Missing volume configuration or a legacy `WebGLRenderer`
reports unsupported volume shading. This feature
does not load UsdVol/OpenVDB grids, `standard_volume`, overlapping media, or
arbitrary boundaries. Scattering supports directional, point, and spot lights;
environment and area-light scattering are not implemented. The existing
surface MaterialX/WASM path continues to handle surface materials.

`npm run test:materialx-volume` loads the real USD fixture and checks absorption
and emission against analytic pixel values on WebGPU and WebGL2, with no scene
lights. Vendored loader provenance and limitations are in
[`src/vendor/materialx/README.md`](src/vendor/materialx/README.md).

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

## Useful References

Uses `Asyncify` to handle async calls in emscripten.  
> A synchronous call in C that waits for an asynchronous operation in JS to complete.
https://emscripten.org/docs/porting/asyncify.html


# Contact ✒️
<b>[🌵 Needle](https://needle.tools)</b> • 
[Github](https://github.com/needle-tools) • 
[Twitter](https://twitter.com/NeedleTools) • 
[Discord](https://discord.needle.tools) • 
[Forum](https://forum.needle.tools) • 
[Youtube](https://www.youtube.com/@needle-tools)
