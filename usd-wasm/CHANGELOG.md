# Changelog
All notable changes to this package will be documented in this file.


The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Asset Info reads the authored SimReady profile, mass and dimensions, and distinguishes moving parts from independent joints. Examples search also discovers OEM assets in SimReady Central, including datasets outside NVIDIA's own library.

- Asset Info shows source-file counts and byte totals split into USD/geometry, textures and other files; scene counts, colliders, rigid bodies, constraints, and an inspectable schema array. SDK summary inspection includes shared prototypes without reading geometry data.

- Collapsible Properties list with remembered expansion state and property-follow navigation. Asset Info links to the loaded Hugging Face revision and NVIDIA's matching SimReady asset; interaction helpers use Needle green.

- Optional `/kinematics` SDK entry using closed-chain-ik/core: bounded hinge/slider manipulation, fixed links, independent frames, native instance identities, mimic dependencies, closed linkages, joint controls and viewport constraint helpers. Interact loads no physics engine.

- Contextual Interact action in Properties for rigid bodies and joints, opening Simulation with viewport dragging enabled. Lightweight physics inspection exposes body and joint paths without extracting collision meshes.

- Native instance/proxy badges, distinct PointInstancer icons, a generated-prototype toggle and links between instances, shared prototypes and instance roots. SDK inspection exposes composition flags and instancing summaries, with lazy read-only prototype traversal.

- Typed metadata reads and edits, dictionary-key authoring with explicit Sdf types, metadata clearing and typed transform-operation reads. Composition-stack `metadataValues` retains authored list-operation buckets, including prepend/delete opinions.
- Typed unsigned/64-bit integer, half, matrix2d/matrix3d, timecode and asset-array authoring, with exact 64-bit input validation and save/reopen coverage.
- Expandable instance-proxy branches in the hierarchy, including composed material scopes and binding navigation. Instance children are inspectable and read-only.
- Typed metadata inspection and native `GetAllMetadataValues()`: schema lists display as arrays, with expandable dictionaries and preserved scalar types. Existing string metadata bindings remain compatible.

- View-menu and SDK display helpers for curve centerlines, NURBS/curve control points, point markers, USD light shapes and cameras; remembered app preferences, helper picking and depth-tested overlays in both path tracers.

- Joint interaction mode for inspecting SimReady mechanisms: held assembly base, authored limits and dependent attachments, with optional Rapier loading on demand.
- Linked Code navigation follows hierarchy selection to declarations through USD composition, with a remembered link toggle. Property copy actions and physics schemas use dedicated icons.
- Complete NVIDIA SimReady catalog in the app's Examples tree, with lazy loading, category folders, searchable package IDs, pinned USD URLs, NVIDIA's dark/light previews and source attribution.
- USD Viewer / USD Studio switch in the app header. Viewer keeps a full viewport with Examples in a menu; Studio retains its dockable workspace. Mode changes preserve the loaded scene and saved Studio layout, with a remembered preference and `workspace` URL option.

### Fixed

- Reuse shared section headers, property rows and link buttons in Info; version viewer styles with the UI modules and preserve host stylesheet ownership during SDK initialization. NVIDIA links scope the matching asset by publisher as well as file path.

- Page large attribute arrays in Properties instead of eagerly copying and stringifying mesh topology. Expose native `GetValuePage` and optional bounded SDK inspection; retain full-value API reads and correct point-instance counts.
- Avoid the empty physics JSON error on large assets: Interact reads only body/joint/collider metadata; simulation reads collision geometry through owned typed buffers. Keep interaction and simulation snapshots separate.

- Prevent Code from freezing or crashing on large crate geometry layers: export authored USDA asynchronously to bytes, compact numeric arrays in a worker, page expanded text, and release source workers on document changes. Guard byte-backed array edits against changes to the expected value.

- Outline selected and hovered face GeomSubsets, preserve authored face identities through subdivision, and add viewport Mesh subsets picking. Release selection proxies when clearing or changing scenes.
- Downsample oversized PNG textures in a worker without allocating full-resolution browser bitmaps; retain bounded decoded memory for large assets with missing published previews. Serve worker scripts with the required isolation headers.

- Refresh WebGPU instance transforms for textureless material groups as well as textured surfaces, keeping handles and other subsets attached during joint interaction.
- Frame selected mesh GeomSubsets with **F**, using their authored elements and current instance pose instead of falling back to the whole stage. Expose reusable `getSelectionBounds` from `/viewer/inspect`.

- Hold mechanism bases and preserve attached parts without contact integration during Interact; respect occluding surfaces when picking. Reject incomplete contact simulations in the app, including unsupported SDF collision meshes, before downloading Rapier.

- Use a damped grab constraint so dragging beyond a mechanism's range yields to authored joint limits, including off-axis pulls on slider assemblies.

- Align Code file-tree icons and labels across files and folders. Replace the misleading Raw source button with Expand arrays / Compact arrays, shown only when arrays need expansion. Restore the selected USD layer after reload instead of incorrectly selecting the JavaScript example.

- Detect animation in collapsed instances by scanning each shared prototype once; unused abstract source animation no longer creates a stage time range.
- Recompute inherited hierarchy visibility after seeking and preserve the distinction between explicitly and indirectly hidden prims.
- Distinguish inactive prims, abstract classes and undefined overs in the hierarchy while retaining USD's composed children and variant/payload behavior.

- Preserve root-layer ownership when JavaScript layer handles are deleted or retained after their stage closes.
- Return typed attribute values from scene inspection; read MaterialX asset paths, shadow flags, physics flags and visibility directly through the typed API instead of parsing display strings.
- Dim inherited visibility icons in the hierarchy to distinguish children hidden by an ancestor from explicitly hidden prims.

- Keep native mesh prototypes hidden when their visible instance count reaches zero. Hierarchy visibility includes hidden ancestors; showing a child uses OpenUSD MakeVisible and includes its view purpose. Expose unloaded payload state and a guide-geometry toggle.

- Prevent area lights from entering a render before asynchronous lookup-table initialization completes.

- Retain the complete viewport during asynchronous stage edits and preserve hierarchy DOM rows, focus and scroll through refresh instead of blanking or shifting the tree.

- Show concurrent downloads in an expandable list with received/total bytes, percentages, speed and ETA. Preserve progress through initial package loading and distinguish unknown sizes from known totals.
- Expose source files relative to the root layer's folder, preserving parent dependencies and package members. Code and Layers no longer show resolver mount directories; root-relative source paths also work in SDK reads.
- Keep Beauty silhouettes in the temporal AA result; using jittered depth to restore raw background pixels caused stationary edges to flicker.
- App hover picking pauses during camera navigation. Large static meshes use cached worker-built BVHs from private buffer copies, preserving render geometry, material groups and instance identities; edits invalidate the cache.
- Preserve OmniGlass transmission instead of using an opaque exported PreviewSurface; clear shells no longer hide the contents of assets such as blood bags.
- Resolve physics render instances to composed body identities. Preserve independent hinge/slider frames, unbounded limits and supported motor force limits.
- Show PreviewSurface/MDL constants while textures stream; prevent disposed or superseded material updates from writing into replacements. Remove stale prototype material warnings after variant and payload resyncs.
- Stage controls and Needle loader completion no longer wait for textures unless requested. Static stages stop unnecessary animation draws. Pending HTTP textures are cancelled on disposal.
- Open stages and recompose scoped variants/payloads on workers while yielding the browser thread; forward resolver progress and deliver owned, revocation-safe change notices on the JavaScript thread. Both native runtimes reference OpenUSD `913db557e9d077094fd4bcfe17e3385930836764`.

### Changed

- Remove bundled SimReady texture replacements. All assets use NVIDIA's published previews where available, otherwise their original source textures.
- SimReady browsing offers published 512 px texture previews with an explicit original-resolution option, bounds raster texture memory, warms small composition layers and reports continuing downloads after geometry appears. Texture resolution and HTTP texture progress hooks are available to SDK consumers.

- Organize the app's Examples browser as one folder tree, with search in its pane header. Retain the previous render during sample replacement and use delayed, compact tooltips positioned beside menu items and within screen bounds.
- Start the viewer's runtime and initial USDZ download alongside the UI module graph, and precompress both runtimes for HTTP delivery without adding compressed duplicates to the npm package.
- Defer native MaterialX library initialization until a material terminal needs a MaterialX document. PreviewSurface-only assets avoid the extra library parse; mixed materials, custom nodedefs and volumes retain their existing path.
- Load EXR/HDR/TGA texture decoders and USD area-light lookup tables on demand. `createWebGpuSupport({lazyAreaLights: true})` opts into deferred WebGPU lookup preparation while preserving eager support for host-created lights by default.
- Reduce viewer startup transfer with lossless HDR compression and full WOFF2 fonts; overlap required lighting downloads with stage preparation and load glTF tools when used.

## [1.2.0] - 2026-10-30

### Added

- Optional JSPI runtime with native Wasm exceptions: 45.6% smaller Wasm and 38.7% smaller Brotli transfer, preserving the full native feature set. `getUsdModule({asyncRuntime: 'auto'})` selects it on supporting engines; the existing Asyncify runtime remains the SDK default and compatibility fallback.
- Asynchronous stage and prim inspection helpers, with serialized native reads across picking, properties, physics and shadows. API examples support both runtimes.
- Earlier viewer module loading and package downloads, with cancellation and single-fetch reuse. Native file readers copy temporary bytes before returning, and disposal waits for pending shadow reads.
- Narrow `/runtime`, `/viewer/inspect`, `/viewer/repl` and `/editing` entry points. Archive packaging loads on the first export; the app loads Code and Console tools only when opened.
- Serialized `handle.readStage()` and reusable resolver-aware source reads, scene/layer/variant inspection and lightweight physics overview for embedded consumers.
- Reusable typed array commands in `/editing`, with conflict-safe rollback that preserves newer edits and the original failure. Stage controls reject stale document mutations after asynchronous preparation or queue waits.
- Correct loader declarations distinguish JavaScript exports from methods on the initialized native USD module. REPL output keeps its scroll position and bottom-following state through resizing.
- Structured literal-array tables in Code’s resizable right sidebar and the JavaScript REPL: paged rows, vector/color columns, matrix grids, spreadsheet paste, validation and draft undo/redo. Code can apply typed USD array edits with reversible commands or run edited JavaScript lessons in the isolated worker.
- Native authoring for UV, four-component color/vector, integer-vector and boolean arrays, with numeric shape and range validation.

- Typed `Attribute.Get(timeCode)` readback returns owned JavaScript values and awaits remote value clips, without parsing USD display strings.
- Core WASM authoring for matrix4d and quaternion arrays, half3 scales, schema-typed metadata, references, instanceability and ordered sublayers. Variant edit targets scope definitions and attribute values together, with typed handle cleanup and asynchronous composition results.
- On-demand KTX2 surface textures with renderer capability detection, configurable self-hosted Basis decoders, preserved container color space, and separate readable decoding for scalar/normal remapping.
- Non-blocking stage export: native OpenUSD packaging on a scoped WASM thread, bounded archive readback, and ZIP compression in a browser worker. The reusable Download control shows an accessible animated export spinner, real per-phase progress and reduced-motion support; `exportUsdz({onProgress})` also exposes progress to hosts.
- Reusable `mountDownloadButton()` from `/viewer/download` (also exported by `/viewer`): split button, ZIP/USDZ settings, keyboard navigation, optional remembered format and standalone themeable styles. The viewer app uses this same component. Downloads include dependency-localized archives and unsaved authored edits; `handle.exportUsdz()` provides packaging without UI.
- OpenUSD 26.11.1 with MaterialX 1.39.5, OpenSubdiv 3.6.1 and ABI-matched Adobe `usdGltf`/Draco plugins.
- Adaptive subdivision using OpenSubdiv Bfr limit surfaces and crack-free shared-edge tessellation. Curvature-driven CPU rates are camera independent and bounded by the Very high triangle budget; Low through Very high retain uniform refinement.
- Optional `/renderers` and `/viewer` entry points: Basic, Beauty with SSGI/ambient occlusion/temporal antialiasing, MuTracer and gkjohnson WebGPU path tracing, and configurable samples, bounces and denoising. Tracers load on demand; OIDN supports self-hosted weights.
- Optional scene-linear HDR bloom in Basic and Beauty, with strength, radius and threshold controls before tone mapping.
- WebGPURenderer support for mixed surface meshes, Gaussian particle fields and bounded media. MaterialX surfaces use TSL, including custom geometry properties and nested graphs.
- OpenUSD Gaussian particle fields with full signed/HDR spherical harmonics through degree three. The legacy renderer integration uses optional Spark 2.2.
- World-space points with varying widths, evaluated Bézier/B-spline/NURBS curves, rational NURBS patches with analytic normals, optional bounded MaterialX media, and OpenVDB density/heat fields with animated file references.
- Authored HDR/EXR dome lighting, area lights and shaped spotlights. Directional, point and spot raster shadows respect animated and variant `UsdLuxShadowAPI` enable opinions.
- Authored-input approximations for known OmniPBR and glTF MDL definitions, including textures, factors, UV transforms, color spaces, opacity and normals. Arbitrary MDL compilation and procedural graphs remain unsupported.
- Optional composed-stage UsdPhysics simulation with injectable/on-demand Rapier loading, pause, reset and dragging controls.
- Stage inspection and reusable controls for cameras, purposes, variants, payloads, prims, properties, connections, relationships, metadata, provenance and layers.
- Multi-selection, native/point-instance picking with exact authored point IDs, viewport selection and framing, and navigation to individual properties with Back/Forward history.
- An embedded JavaScript REPL with top-level await, selection/property context and serialized live stage edits. Edits do not imply automatic undo or rollback.

### Changed

- Pin the MaterialX runtime to `@needle-tools/materialx@1.8.0`; update the development viewer to Needle Engine 6 and Rapier 0.21.0.
- Provide Needle Engine's AgX look for WebGPURenderer and MuTracer, with common exposure/background handling. Also expose ACES Filmic, Khronos PBR Neutral and other host tone mappings.
- Retain Three.js r160 compatibility for the base loader and scene helpers. Modern renderer/viewer integrations require r185 or newer; the tested development renderer is `@needle-tools/three@0.185.2-alpha.6`.
- Include package licenses, third-party notices, clean native build provenance and a reproducible optional Binaryen optimization pass with input/output hashes.

### Fixed

- Defer hidden mesh geometry and primvar work until shown, applying edits and animation from the latest authored state. Invisible collision meshes remain available through native physics extraction without duplicating their data in render geometry.
- Repair collapsed analytic poles when uniform smooth normals are degenerate, and reject near-singular adaptive patch derivatives before generating normals. Cone tips retain finite outward normals at every detail level.
- Preserve reflections from solid-color UsdLux dome lights in WebGL by supplying an environment map large enough for PMREM filtering.
- Preserve alpha-test thresholds when creating or refreshing node-material copies for mixed single/double-sided USD meshes. MDL and Preview Surface cutouts now remain clipped in Three WebGPU as well as WebGL.
- Detach retired material textures from meshes during USD variant resync before releasing their GPU resources. Queue surviving assignments for the replacement material instead of rendering freed textures while it loads.
- Preserve authored hole faces and coarse-face identity during uniform subdivision, including material subsets and uniform primvars.
- Update time-sampled crease indices, lengths and sharpness, plus corner indices and sharpness, independently of mesh-point or hole changes. Playback and backward seeks update both uniform and adaptive subdivision.
- Preserve sharp crease normals and face-varying UV seams in adaptive geometry; enforce actual tessellation budgets and recompute rates after point deformation.
- Reuse uniform refinement, triangulation and adjacency during points-only animation; avoid duplicate point refinement and unchanged JavaScript attribute expansion. Refresh adaptive material subsets when deformation changes tessellation, and retain crease/corner tags after material refetches.
- Generate uniform subdivision normals from refined geometry, preserving flat creased faces and correct shading through deformation instead of interpolating coarse-cage normals.
- Convert UsdLux sphere/distant emission and area normalization to Three light units, including transformed emitter dimensions and cylinder length. Light examples use authored intensity without per-fixture brightness overrides; disk/cylinder transport remains approximate.
- Keep emissive surfaces independent of Beauty ambient occlusion, and preserve the host camera's aspect and view offset across temporal antialiasing.
- Restore purpose-filtered meshes, curves, points, splats and volumes correctly on repeated purpose changes without overwriting authored visibility.
- Preserve mesh display colors, custom vertex/face-varying geometry properties, constant tangents and face-subset material bindings, including fallback shading and late material assignment.
- Preserve custom MaterialX source assets and recursive implementation definitions. Add a normal-derived tangent basis for untextured materials while retaining authored tangents and UV-based MikkTSpace generation.
- Preserve PreviewSurface normal scale/bias, independent UV transforms/samplers, packed texture factors, 16-bit channels and shared texture ownership.
- Keep unsupported MDL-bound geometry visible with diagnostic fallback shading; update live and animated MDL inputs without rebuilding unrelated MaterialX materials.
- Composite transparent volumes and splats after opaque Beauty passes; preserve exit-face volume rendering, Gaussian tails, HDR radiance and directional SH ordering/precision.
- Keep bounded-medium proxies out of opaque shadow maps and preserve light-to-shadow-map ordering after authored light changes.
- Isolate resolver/imported files per Hydra handle, including HTTP sublayers, nested packages and sidecar textures. Release only owned files on disposal/failure and drain asynchronous factories before releasing native readers.
- Share concurrent module initialization, preserve supplied shared memories and stop pthread workers allocating unused private memories. Avoid eagerly touching unused WASM path-pool reservations.
- Draw the authored stage start time and await asynchronous fields/materials/geometry where required by readiness and edit operations.
- Keep environment lighting separate from viewport clear colors across rendering modes. Avoid repeated tracer resets from duplicate OrbitControls updates or imperceptible damping drift.
- Repair TypeScript declaration entry points, helper exports and strict Bundler/NodeNext consumers.

### Viewer and examples

- Add a dockable Code pane for the active JavaScript lesson and live USDA layer text, including session/referenced layers, source selection and copying.
- Correct authored lighting in the API/geomprop examples, clarify shared grove instances and contrast the unmaterialed triangle against its plinth; regenerate native Storm cards. Add two production assemblies and three texture-format scenes with real EXR, KTX2, PNG, JPEG and TGA inputs.
- Use WebGPURenderer throughout the public Three.js viewer. Fresh settings default to Beauty and Adaptive; explicit URL and saved render/detail choices take precedence.
- Add a Needle-branded light/dark workspace with dockable, resizable panels. Preserve user-chosen timeline placement and open/closed state when changing files.
- Move render/display settings into View menus; add standard menu navigation, thin scrollbars, stage visibility/activation icons, hover/selection outlines, viewport picking and focus shortcuts.
- Add an adjustable Examples panel with persisted library/category/selection/scroll state and an adaptive horizontal/vertical category divider.
- Add 192 coverage fixtures, 63 distinct executable JavaScript lessons and native Storm thumbnails. New scenes include lighting rigs, weighted/rigid skinning, Gaussian fields, layered compositions, complex subdivision/splines/NURBS, and animated creases/holes in Pip and Pop.
- Expand Pip and Pop into a seamless animated magic trick with expressive hole-based faces, crease-driven morphing, spring motion and native Storm previews.
- Keep the 14 NVIDIA SimReady assets in their own sample library. Fixtures demonstrate specific supported features; they are not a claim of complete USD or API conformance.

## [1.1.2] - 2026-07-17
### Changed
- Updated package documentation and viewer styles.

## [1.1.1] - 2026-07-09
### Changed
- Updated the MaterialX runtime dependency to `@needle-tools/materialx@1.7.3`.
- Aligned Needle Engine loader autoplay with the three.js Hydra API: USD timeline playback is opt-in through `autoPlay` for both paths.

### Fixed
- Fixed Needle Engine loader readiness so loading completes after USD materials are present

## [1.1.0] - 2026-07-08
### Changed
- Expanded the browser USD API surface for common `Usd`, `UsdGeom`, `UsdShade`, `Sdf`, `Gf`, and `Vt` workflows.

### Fixed
- Fixed empty geom subset material handling so unmaterialed empty subsets work.

## [1.0.2] - 2026-07-06
### Changed
- Updated the MaterialX runtime dependency to `@needle-tools/materialx@1.7.2`.
- Improved viewer asset caching for USD/glTF sample assets so repeated loads are less dependent on remote host availability.

### Fixed
- Fixed MaterialX texture resolution for USD/Hydra materials whose texture filenames are carried by non-`file` asset parameters.
- Fixed variant and stage edits so normal USD change processing can update Hydra without forcing full scene repopulation for every edit.
- Fixed subdivision normals at low complexity so subdivision surface normals are smooth even when topology is not tessellated.
- Fixed OpenChessSet MaterialX pawn rendering and added coverage for authored instance positions.

## [1.0.1] - 2026-07-03
### Added
- Added Draco support to the wasm Adobe `usdGltf` plugin so Draco-compressed glTF/GLB assets can be imported through OpenUSD.
- Added native `usdDraco` support for USD meshes that reference Draco `.drc` payloads.
- Added build metadata for the `usdDraco` and `usdGltf` Draco capabilities.
- Added sample assets that cover custom geomprops, LIVERPS composition, custom MaterialX NodeDefs, Draco payloads, and nested USD references.

### Changed
- Updated sample browsing so local examples, hosted assets, USD-WG assets, and glTF conversion variants are organized consistently.
- Updated the three.js Hydra and Needle Engine loader paths to use AgX tone mapping.

### Fixed
- Fixed dropped GLB, GLTF, and MTLX loading.
- Fixed authored USD normals handling so authored data is not replaced by generated geometric normals.
- Avoided repeated MaterialX tangent generation warnings for meshes that cannot produce tangents because they have no UVs.
- Fixed async Hydra draw and subdivision readiness regressions across repeated stage loads.
- Fixed package-internal USDZ texture paths so authored paths like `asset.usdz[0/texture.png]` resolve through the staged USD filesystem instead of leaking to browser HTTP loading.
- Fixed missing or late material sprim assignment ordering so meshes can bind materials that arrive after the mesh assignment call.
- Fixed MaterialX and UsdPreviewSurface texture diagnostics so missing authored textures are reported without retaining large texture or scene objects in console logs.
- Fixed unavailable remote asset handling so HTTP failures are reported before Hydra stage opening.
- Fixed empty or meshless asset handling so zero-size camera fitting is skipped cleanly.

## [1.0.0] - 2026-06-30
### Added
- Added optional material readiness policy support for loaders that need to wait for asynchronous material generation and texture loading before reporting completion.
- Added matrix coverage for USD Working Group assets, Needle Engine runtime shapes, public viewer lifecycle cleanup, authored USD concepts, and culling/material edge cases.

### Changed
- Improved the existing Needle Engine integration so the Engine loader/component path uses the updated USD runtime, readiness, and cleanup behavior alongside the direct three.js Hydra path.
- Updated the public viewer examples so original glTF samples use the regular glTF loader path instead of wrapping glTF assets in USD.

### Fixed
- Fixed Hydra lifecycle cleanup when switching assets so stale RPrim/SPrim state and three.js resources are destroyed instead of accumulating across loads.
- Addressed repeated-load resource leaks that could cause out-of-memory failures after cycling between large USDZ assets.
- Improved browser asset resolution for nested package paths, authored relative paths, parent-directory references, USDZ-embedded textures, GLB-embedded texture assets, and MaterialX texture assets.
- Fixed known MaterialX and UsdPreviewSurface texture regressions, including separate metallic/roughness/occlusion maps, packed texture updates after async loads, texture transforms, procedural texture fixtures, and noise/bricks sample coverage.
- Fixed material culling so materials are only cloned when the same authored material is used with conflicting sidedness, preserving animation bindings for the common shared-material path.
- Fixed USD-authored normals/interpolation handling to better match OpenUSD/usdview flat-vs-smooth behavior.
- Fixed single-sided/double-sided rendering for USD meshes and added shared-material culling tests.
- Fixed variant and payload switching so old selections are removed instead of double-rendering alongside the new composed result.
- Fixed up-axis setup before the first Hydra draw and across repeated stage loads so one asset cannot leak orientation state into the next.
- Fixed camera/light SPrim routing and expanded coverage for visibility, purpose switching, native instances, point instancers, and nested package references.
- Fixed Needle Engine loader timing and readiness so USD stages, materials, and animations initialize consistently through the Engine loader path.
- Fixed three.js/Needle Engine import compatibility across vanilla three.js and Engine-provided three.js runtime mappings.
- Fixed animated HTTP/USD package loads so playback time updates cannot dirty Hydra while an async initial draw is still in progress.

## [1.0.0-next.0] - 2026-06-25
- Modernized the wasm runtime to upstream OpenUSD 26.05 with Hydra imaging enabled for the three.js render delegate.
- Added the Adobe glTF file-format plugin, MaterialX support through Hydra material documents, and OpenSubdiv-enabled builds.
- Added generated TypeScript declarations and usdview-style inspection/change APIs for programmatic stage interaction.
- Switched the client MaterialX shader path to `@needle-tools/materialx@1.7.0`.
- Added explicit package entrypoints for `@needle-tools/usd/three`, `@needle-tools/usd/plugins`, and `@needle-tools/usd/vite`.
- Added a Needle Engine browser matrix that validates the USD package through Engine `dist` and package-module runtime shapes.
- Added a technical demo render-host switch for viewing the same USD samples through plain three.js or a Needle Engine `Context`.
- Read stage metadata from the live `UsdStage` API so up-axis state remains stable across referenced asset reloads.
- Changed the license to PolyForm Noncommercial 1.0.0.

## [0.0.1-alpha] - 2025-05-14
- initial release
