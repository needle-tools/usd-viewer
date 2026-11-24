# Changelog

See the [viewer changelog](https://github.com/needle-tools/usd-viewer/blob/main/CHANGELOG.md) for application changes.

## [2.2.0] - 2026-11-24

### Added

- The Node.js entry point `@needle-tools/usd/gltf/node` writes GLB exports to a file. Hydra's `textureMode: 'export'` retains encoded source textures where possible without creating a browser canvas.
- Hydra accepts a viewport texture compressor independently of the textures used for export.

### Improved

- PNG previews are resized off the main thread, and GLB export handles large textures and collider buffers with lower memory overhead.
- Beauty filters noisy indirect lighting before temporal anti-aliasing and keeps refraction sampling the current framebuffer across camera changes.

## [2.1.0] - 2026-11-23

### Added

- `exportSimreadyGltf` accepts `capturePose` and `exportChangedPose` to export either the authored SimReady pose (default) or the current simulated or dragged pose. Meshes, instances and physics bodies are captured in the same frame.
- USD export options accept `creator`, written to the exported root layer's `customLayerData`, and `bodyTransforms`, applied only to the exported copy.
- The download control accepts `exportUsdz` and `canExportChangedPose`; export and share callbacks receive `exportChangedPose`.

### Fixed

- glTF export reads material textures by their Three.js slot names. Hosts that wrap material properties, such as Needle Engine, now export correct colors, keep texture orientation and share textures across materials.
- Textures that are re-encoded for their glTF slot keep their orientation.

## [2.0.0] - 2026-11-10

### Breaking changes

- Binding operations that can load data now always return a Promise. Create Hydra drivers with `CreateHydraDriver`, and await `inspectStage` and `inspectPrim`. See the [upgrade guide](UpgradeGuide.md#from-1x-to-2x) for API changes and migration examples.

### Added

- Automatically select the smaller JSPI runtime in browsers that support it, with Asyncify as the compatibility fallback.
- Create USD physics assets as Needle Engine Rigidbody and Collider components, with collision events, raycasts and interaction in the shared physics world. Requires a Needle Engine 6 build with `physics.createAsset`.
- Support mimic joints, joint break thresholds and spherical cone limits where the physics engine supports them.
- Export large GLB files with `output: 'blob'`. The default export result remains an `ArrayBuffer`.
- Support named UV sets through MaterialX `geompropvalue` and all MaterialX color spaces, including Display P3, ACEScg and the `*_scene` names shared with OpenUSD.

### Improved

- Updated the Three.js integration to r186 and optional MuTracer path tracing to 0.3.0.
- Improved Gaussian splat rendering, FastHDR environment support and temporal anti-aliasing across supported backends.
- Load the property inspector's array editor when first opened, and show metadata lists such as `apiSchemas` inline.

### Fixed

- Export SimReady and physics metadata as optional glTF extensions so ordinary viewers can load the render scene without a simulation runtime.

- Textured OmniGlass retains its color multiplier and transmission after texture loading.
- Improved contact stability for thin SDF-source collision meshes in both physics adapters.
- Preserve authored body damping and stabilize off-centre physics grabs without discarding momentum on release.
- Motor-driven joints keep moving when their bodies would otherwise fall asleep.
- GLB export preserves integer custom attributes, multiple UV sets and source geometry metadata. Mesh colliders are retained with older supported Three.js versions.
- MaterialX image orientation, tiling offsets, fallback colors and inherited color spaces follow the authored material. Materials remain visible and report missing textures when an image cannot be loaded.
- UsdPreviewSurface materials use the correct specular workflow, texture rotation, wrap modes, UV sets and color-space metadata, including automatic color-space selection for single-channel images.
- MaterialX textures retain their own wrap settings across materials and stages in Needle Engine.
- Geometry updates and disposal release unused GPU buffers, including on supported Three.js versions before r186.
- Refined subdivision surfaces no longer cause long pauses during MikkTSpace tangent generation.
- Beauty's temporal anti-aliasing no longer darkens the image border on the WebGL backend.
- The Vite plugin resolves packaged WebAssembly assets correctly during development.

## [1.2.1] - 2026-11-05

- Export USD scenes as GLB through `/gltf`, including materials, instancing, cameras, lights, lines and points.
- Choose original or preview textures for ZIP, USDZ and GLB exports with the Download control, or share through Needle Cloud.
- Inspect and edit animated properties and large arrays in Code and Properties with typed values, table controls and undo/redo.
- Simulate USD assets in shared Needle Engine worlds, with collisions, physics queries, joint controls and motors. Use the optional `@needle-tools/simready` dependency for standalone Three.js and headless simulation.
- Export SimReady and USD physics data to GLB, including articulations, joint constraints, collision filters, object identities and schema metadata. Compatible Mesh Baker workflows retain this data during optimization.

## [1.2.0] - 2026-11-02

### Added

- OpenUSD 26.11.1 with Hydra imaging, MaterialX 1.39.5, OpenSubdiv 3.6.1 and glTF/Draco import support.
- An optional smaller JSPI runtime. Set `getUsdModule({asyncRuntime: 'auto'})` to use it where supported; Asyncify remains the default in 1.x.
- Separate `/runtime`, `/three`, `/scene`, `/editing`, `/viewer/inspect`, `/viewer/repl` and `/viewer/download` entry points, so applications can load only the tools they need.
- Render meshes, Gaussian particle fields and bounded media together with WebGPU. Optional `/renderers` provides Basic, Beauty with SSGI/AO/TAA, and MuTracer path tracing, with configurable samples, bounces, denoising and HDR bloom.
- Rational NURBS patches, evaluated Bézier/B-spline/NURBS curves, points with varying widths, and uniform or adaptive subdivision with animated creases, corners and holes. Adaptive tessellation evaluates OpenSubdiv limit surfaces within bounded triangle budgets.
- USD lights and cameras, authored shadows, dome environments, MaterialX geometry properties and nested graphs, MDL previews, and optional MaterialX/OpenVDB volume rendering.
- Instance and PointInstancer inspection and picking, composed hierarchy navigation, multiple selection, property following, and geometry-subset framing and outlines.
- Typed metadata and attribute inspection and editing, including dictionaries, list operations, matrices, quaternions, ordered sublayers and exact 64-bit integer inputs.
- Serialized `handle.readStage()` and `handle.editStage()` operations, resolver-aware source reads, and stage summaries covering schemas, SimReady metadata, scene contents and file sizes.
- Typed array editing through `/editing`, with undo/redo, conflict checks, paged tables, vector/color columns, matrices and spreadsheet paste.
- Asynchronous USDZ and ZIP export with scene edits and dependencies, progress feedback, cancellation and saved download preferences.
- Optional `/kinematics` for joint interaction, fixed attachments, mimic joints and closed linkages. Contact simulation loads Rapier on demand and reports unsupported configurations before starting.
- Configurable, selectable helpers for curves, control points, lights, cameras and joints, including overlays in optional path tracers.

### Improved

- MaterialX libraries initialize only when needed. PreviewSurface-only scenes open without parsing them.
- Added `onAssetFetchProgress`, `resolveTextureUrl` and `maxTextureSize` for application-controlled loading. Original textures remain the default; `waitForMaterials: true` waits for texture completion.
- Existing package-root exports and legacy Three.js integrations remain supported. Modern rendering features require compatible Three.js/WebGPU APIs; optional dependencies remain application-owned.
- Updated the MaterialX web dependency to 1.8.1 and the embedded MaterialX libraries to 1.39.5.

### Fixed

- Example inspection waits for asynchronous reads and keeps the stage available while reading.
- Materials preserve authored colors, UVs, tangents, smooth normals, MDL normal mapping and glass transmission through texture loading and scene changes.
- Package textures decode reliably, including EXR, HDR, TGA and KTX2, compressed color maps and scalar/normal textures.
- Animated instances and selection outlines update correctly, and face subsets remain selectable through triangulation and subdivision.
- Instance materials, inherited visibility, payload state and shared-prototype animation ranges remain correct. Instance-proxy children can be inspected as read-only.
- Opening remote scenes and changing variants or payloads stay responsive, with dependency progress and early geometry display while textures load.
- Large assets remain responsive during inspection, source analysis, texture decoding, picking and collider creation.
- Pending reads and exports keep their stages available. Closing or replacing scenes cancels outdated work and releases workers and rendering resources.
- Source inspection hides empty session layers while preserving edits and readable public filenames.
- Fixed host stylesheet handling, TypeScript declarations and browser imports for optional entry points.

## [1.1.2] - 2026-07-17

### Changed

- Updated package documentation and viewer styles.

## [1.1.1] - 2026-07-09

### Changed

- Updated the MaterialX runtime dependency to `@needle-tools/materialx@1.7.3`.
- Aligned Needle Engine loader autoplay with the three.js Hydra API: USD timeline playback is opt-in through `autoPlay` for both paths.

### Fixed

- Fixed Needle Engine loader readiness so loading completes after USD materials are present.

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
