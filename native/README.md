# Native Three.js Hydra integration

This macOS integration exposes `HdNeedleRendererPlugin` to usdview, Blender and
Houdini Solaris. It drives the browser's `ThreeRenderDelegateInterface` and
Beauty pipeline, including SSGI and temporal antialiasing. The host sends Hydra
changes and camera matrices to an isolated Electron WebGPU renderer. Renderer
Sync consumes Hydra data; it never opens or traverses the host's USD stage.

For a developer handoff, normal Hydra plugin distribution and the remaining
work for a portable binary installer, see [DISTRIBUTION.md](DISTRIBUTION.md).
The current integration retains its Electron runtime. A browserless replacement
is deferred while the working host integrations are validated.

The native adapter handles meshes, implicit surfaces converted by
`HdsiImplicitSurfaceSceneIndex`, instancing, visibility, indexed primvars,
authored or generated normals, material subsets, OpenSubdiv refinement, UsdPreviewSurface and
MaterialX networks, and authored USD lights. Scenes without authored lights
use the browser's neutral HDR environment. Native curves, volumes and
host-specific MDL imaging adaptation remain separate adapter
work. The web renderer's existing coverage remains separate from native
adapter coverage.

## Run from this checkout

```sh
native/run-usdview path/to/scene.usda
native/run-blender
native/run-houdini-compat
```

In Blender, choose **Needle Three.js WebGPU** in the Render Engine menu.
The launcher registers the add-on for that session. Its Render Properties panel
controls SSGI, temporal samples and the fallback environment. F12 uses Blender's
normal Hydra render engine integration. Viewport picking and orange outlines
use Blender's native selection system.

In Houdini, enter Solaris and select **Needle Three.js WebGPU** in the viewport
renderer menu. Its Display Options expose SSGI, temporal samples and the fallback
environment through the standard renderer viewport controls.

Houdini 22.0.466 and 22.0.492 have a Retina CPU-AOV picking bug: their compositor
samples physical ID rasters using logical mouse coordinates. The diagnostic
pixel trace and actual selection results are in `.build/houdini/viewport-debug`.
`native/run-houdini-compat` uses Houdini's per-launch `HOUDINI_ENABLE_RETINA=0`
option; object and instance picking then use matching coordinates. This softens
Houdini's UI. If a saved Retina desktop restores an incorrectly sized image,
resize the window once. `native/run-houdini` preserves Retina rendering; use
the compatibility launcher for accurate viewport picking on these builds.

`python3 native/install-hosts.py` registers the built usdview plugin in the
standalone OpenUSD installation, installs the local Houdini package and links
the Blender add-on into its scripts directory. Ordinary `usdview` launches then
offer **Needle Three.js WebGPU** in the Renderer menu without needing the
checkout launcher or `PXR_PLUGINPATH_NAME`. Restart usdview after installation.
The standalone prefix defaults to `OPENUSD_NATIVE_PREFIX` or
`~/OpenUSD-26.05-native`; pass `--usd-prefix /path/to/OpenUSD` to select another
installation with a matching ABI. The installer adds a managed plugin include
and leaves the installation's existing registry and executable intact. Blender's
Preferences can enable that add-on for launches outside the script. Installed
links and packages refer to this checkout. Houdini requires a working local
license service even when Apprentice has already been activated.

Each build targets its host's exact USD ABI. Do not load the usdview binary into
Blender or Houdini. Blender's USD also uses a different C++ namespace. The
launchers clear inherited USD/Python library paths before starting the host.
Restart an existing host process after rebuilding its C++ plugin; switching the
renderer does not reliably unload an old plugin binary.
For a separately installed Houdini build, set `NEEDLE_HOUDINI_ROOT` to its
framework and `NEEDLE_HOUDINI_PLUGIN_ROOT` to the resource directory of the
plugin compiled against that build.
`NEEDLE_HOUDINI_HOST_ROOT` similarly selects an alternate Houdini metadata
directory. The installed package honors these explicit launch overrides.

## Lighting, display and selection

SSGI is enabled by default. `needle:ssgi`, `needle:samples`,
`needle:environment`, `needle:toneMapping` and `needle:exposure` are standard
Hydra render settings. The fallback environment is suppressed when authored
lights exist, following the browser lighting policy. MaterialX documents and
texture paths come from the host's Hydra material network and resolver.

Temporal filtering uses the shared Three.js SSGI/TRAA pipeline. Native hosts
default to 128 temporal samples after scene or camera changes; `needle:samples`
controls that scheduling budget. TRAA reuses history with temporal rejection and
can retain residual grain. Reaching the budget means the host stops scheduling
frames, rather than that the image has reached zero noise.

Blender and Houdini receive scene-linear color and apply their own display
management. usdview defaults to the viewer's Needle AgX tone mapping. To compare
raw color across hosts, set `needle:toneMapping` to `none` and compare linear
AOVs before display management. Exposure belongs to the host when it manages
the display transform.

The delegate supplies `color`, `depth`, `primId`, `instanceId` and `elementId`.
Host complexity selects Hydra's refinement level through OpenUSD's OpenSubdiv
factory, preserving schemes, subdivision tags, face-varying channels and coarse
face identities. Animated holes, crease sharpness and corner sharpness update
independently of animated points. A compatibility scene index compares Hydra
subdivision tag values on `sceneGlobals.currentFrame` notifications, supplying
missing dirty notices in host USD versions that omit them. Unchanged values do
not invalidate geometry; renderer Sync still consumes only Hydra data.
Scene-material disabling clears the shader resource and restores
each mesh's display-color fallback. Dome camera visibility controls the texture
background independently of environment illumination. Dome textures use linear
filtering and the same local longitude basis as Storm for both illumination and
backgrounds, including authored rotations and Z-up host lights.
Picking uses a separate unjittered pass, preserving full 32-bit IDs and depth;
Beauty's temporal jitter does not move the pick target. The host resolves IDs
back to USD prims and instances. A scoped compatibility task corrects the
installed OpenUSD generic selection task's instance encoding and invalidation.
A pristine GPU color cache lets host highlight tasks redraw or clear selection
without baking the previous highlight into a converged frame.

## GPU handoff and Hydra compatibility

Electron exports RGBA16F IOSurfaces from an extended-range `srgb-linear` WebGPU
canvas. A native N-API module transfers Mach rights to the Hydra process.
Metal shaders unpack the shared surface into Hgi AOV textures on HgiMetal's
own queue. Surface leases remain alive until consumption completes. Geometry
and control messages use a private Unix socket; framebuffer pixels do not
travel over that socket.

The compositor atlas contains linear HDR color and binary payload planes for
full 32-bit depth and IDs. Binary fractions leave room for compositor F16
rounding. Its dimensions are four times the AOV width and twice the height,
plus a small GPU completion metadata strip. The atlas and GPU unpack pass add
bandwidth overhead. The runtime requests the adapter's texture dimension
limit so Retina viewports are not constrained by WebGPU's default limit.
GPU-completed scene serials and temporal samples determine convergence.
When offscreen composition skips the final submission, the canvas republishes
its existing GPU attachments until the host acknowledges that scene and sample.
It does not restart temporal accumulation. Private AOVs survive render-pass
replacement, and queued Hydra changes invalidate convergence immediately.
Houdini background updates and buffer polling consume progressive surfaces even
when the camera is idle. Solaris receives positive camera-space linear depth,
with zero for background, matching its renderer metadata. This conversion and
its lossless transport run on GPU. Generic Hydra imaging engines retain their
normalized depth contract; a hidden Solaris viewport setting selects linear
depth before its AOV allocation.

`HdRenderBuffer::GetResource()` exposes Hgi textures where the host accepts
them. `Map()` implements standard CPU readback when requested, with page-aligned
memory and cached reads of unchanged attachments. Blender's installed macOS
Hydra viewport and final-render paths request CPU mapping/upload. Standard
Solaris integration in the installed Houdini supplies a Null Hgi driver and
imports AOVs through its compositor's CPU buffer contract. Standard Hydra
selection tasks may also map ID/depth attachments. These host paths are
supported; usdview uses HgiMetal textures directly, and the renderer-to-native
IOSurface color handoff itself stays on GPU in every host.

`experiments/gl-handoff` is an isolated Metal/IOSurface/OpenGL sharing probe,
built only with `NEEDLE_BUILD_TESTS=ON`. It is not the Solaris presentation
path: Houdini 22's Vulkan compositor does not consume that OpenGL texture path.

The pinned local Electron runtime is required for the linear HDR canvas path.
It is currently a prerelease. Requalify color, payload precision and shared
surface behavior before changing this dependency.

## Build

Install root npm dependencies and the native runtime. If npm is configured to
skip dependency lifecycle scripts, run Electron's installer explicitly.
`NODE_INCLUDE` selects Node headers outside Homebrew's standard include path.
The sibling OpenUSD checkout supplies the shared Hydra instancer and MaterialX
helpers; set `NEEDLE_OPENUSD_SOURCE` if it lives elsewhere.

```sh
npm install --prefix native
node native/node_modules/electron/install.js
node native/build.mjs
cmake -S native -B native/.build/usdview \
  -Dpxr_DIR="$HOME/OpenUSD-26.05-native" \
  -DCMAKE_BUILD_TYPE=Release
cmake --build native/.build/usdview --parallel 2
```

Configure separate build directories with `-DNEEDLE_HOST=blender` or
`-DNEEDLE_HOST=houdini`. CMake cache variables select the application and SDK
locations. Blender requires matching USD, OpenSubdiv, MaterialX, TBB and Python headers
from its official `blender/lib-macos_arm64` libraries repository; the SDK used
locally is recorded in `.build/blender-sdk` itself. OpenSubdiv headers come from
that SDK's `opensubdiv/include` directory. Houdini uses its installed toolkit
headers and libraries directly. No full OpenUSD/wasm rebuild is needed
for changes confined to this native integration.

## Verify

```sh
node --test native/tests/hydra-camera.test.mjs
python3 native/tests/install-hosts.py
python3 native/tests/animated-subdivision.py
python3 native/tests/dome-presentation.py
node native/tests/browser-parity-runner.mjs
python3 native/tests/native-parity-runner.py
native/run-blender --background --factory-startup --python native/tests/blender-parity.py
native/run-blender --factory-startup --python native/tests/blender-viewport.py
```

The browser/native comparison uses the actual wasm imaging bridge and each
native host's USD libraries with the same camera, lighting and Beauty/Basic
pipelines. Fixtures exercise fallback HDR, authored lights, UsdPreviewSurface
textures, MaterialX textures and instancing. Results and captures live under
`.build`; `parity-comparison.json` records numeric errors and measured GI effects.
Raw framebuffer readback is explicitly enabled for this diagnostic comparison.
It is not part of normal native presentation.

`native/tests/native-smoke.py` exercises a host's actual UsdImagingGL engine,
including intersection tests, object highlighting, individual-instance
highlighting and clearing selection. Set its Python/plugin paths to that host's
installation. After installing standalone USD discovery, use
`env -u PXR_PLUGINPATH_NAME python3 native/tests/native-smoke.py --default-discovery`
with that installation's Python environment to verify the same path as an
ordinary usdview launch. This check does not call `RegisterPlugins`.
`node native/tests/temporal-accumulation-runner.mjs` measures actual WebGPU pixels
through the shared Beauty graph: a valid first frame, temporal grain reduction,
history reset, resize and host projection preservation.
`native/tests/temporal-accumulation.py` checks progressive pixels and the default
sample budget through a host's actual UsdImagingGL engine. Configure the matching
Python/plugin paths as for `native-smoke.py`. Its framebuffer captures are test
readbacks; they do not change the normal presentation path.
`native/tests/host-controls.py` exercises complexity and live
scene-material/dome-background toggles through that engine, checks their
restoration, and verifies that refined picking retains coarse face identities.
`animated-subdivision.py` compares direct jumps with forward/backward frame
sequences for animated holes, creases and corners. Use `--scene /path/to/asset.usdz`
to exercise another asset, and `--ssgi` to include progressive Beauty rendering.
`dome-presentation.py` compares actual Storm and Needle backgrounds using
usdview's default dome light under several camera and light rotations.
Blender tests exercise actual rendered pixels, its viewport
selection operator, native outlines and live SSGI setting changes in a fresh
factory-startup process. They do not modify an already-open Blender scene.
Run `native/tests/houdini-smoke.py` in Houdini's Python Shell to load the test
fixture in a named Sublayer LOP and select the renderer, preserving other nodes.
With the Houdini Python/plugin environment configured, run
`native/tests/linear-depth.py` to compare GPU depth against known scene planes
under perspective and orthographic cameras, including Solaris' wide automatic
clip range. Its report is `.build/houdini/linear-depth.json`.
`native/tests/houdini-viewport-observer.py` records real UI selections in the
isolated test scene; it does not synthesize mouse input. The final host checks
and their evidence paths are recorded in `.build/integration-verification.json`.

`NEEDLE_HYDRA_TRACE=1` enables renderer logging.
`NEEDLE_HYDRA_STATS=/absolute/path/report.jsonl` appends handoff counters when
a delegate is destroyed. The engine's `GetRenderStats()` exposes current
counters, convergence, codec validation and fatal errors.
`NEEDLE_HYDRA_REQUIRE_GPU_HANDOFF=1` rejects **color** CPU mapping while allowing
standard ID/depth reads for picking. Leave it unset for normal host compatibility.
`NEEDLE_HYDRA_VALIDATE_CODEC=1` checks decorrelated payload values on GPU.
`NEEDLE_HYDRA_CAPTURE=/absolute/path/prefix` explicitly saves converged AOVs for
diagnostics and therefore enables CPU readbacks.

The wasm imaging refactor is preserved at OpenUSD commit
`d7aa0ef3bccda32648fd19873a21bffc7f60c6d8`, also referenced by the
`work/native-three-hydra` branch in the sibling checkout. USD-specific
MDL selection and rational NURBS attributes are supplied by
`WebImagingDelegate` as Hydra material resources and primvars. Renderer Sync
consumes those values. `usd-wasm/scripts/rebuild-hydra-bridge.py` can recompile
just the bridge translation units using an existing build's compile/link plans.
