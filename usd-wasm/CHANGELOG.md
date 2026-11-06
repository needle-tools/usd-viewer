# Changelog

## [1.3.0] - 2026-11-06

- Create Needle Engine dynamics through Engine physics assets: `createUsdPhysics` with `createNeedleSimulationWorld` adds the asset's bodies, colliders and joints as Engine Rigidbody and Collider components. Requires Needle Engine `6.0.0-canary.1793922509` or later; with older versions, `createNeedleSimulationWorld` throws an error asking to update Engine.
- Simulate mimic joints and pass joint break thresholds and spherical cone limits to physics engines that support them.
- Keep motor-driven joints moving when their bodies would otherwise fall asleep.
- Export integer custom attributes and multiple UV channels as valid glTF accessors while preserving source geometry and metadata.
- Add `output: 'blob'` for large GLB downloads. The default export result remains an `ArrayBuffer`.
- Retain mesh colliders when exporting with older supported Three.js versions.
- Sample MaterialX image nodes the right way up in three.js node materials. Their textures appeared vertically flipped.
- Load the property inspector's array editor when an array is first opened, so inspection without editing loads less code.

## [1.2.1] - 2026-11-05

- Export USD scenes as GLB through `/gltf`, including materials, instancing, cameras, lights, lines and points.
- Choose original or preview textures for ZIP, USDZ and GLB exports with the reusable Download control. Integrate Needle Cloud sharing through the same control.
- Inspect and edit animated properties and large arrays in Code and Properties with shared table controls, typed values and undo/redo.
- Simulate USD assets in shared Needle Engine worlds, with collisions, physics queries, joint controls and motors. Use `@needle-tools/simready` for standalone Three.js and headless simulation.
- Export authored SimReady and USD physics data with GLB scenes, including articulations, joint constraints and exclusions, collision filters, object identities and schema metadata. Compatible Mesh Baker workflows retain this data during optimization.

## [1.2.0] - 2026-11-02

### Added

- Reveal selected cameras, lights, curves, points and NURBS control cages independently of global helper settings.

- OpenUSD 26.11.1 with Hydra imaging, MaterialX 1.39.5, OpenSubdiv 3.6.1 and ABI-matched `usdGltf`, `usdDraco` and glTF Draco plugins.
- Optional JSPI runtime with native Wasm exceptions. Its Wasm is 45.9% smaller and its Brotli transfer 39.0% smaller than Asyncify. `getUsdModule({asyncRuntime:'auto'})` selects it where supported; Asyncify remains the default and compatibility fallback.
- Narrow `/runtime`, `/three`, `/scene`, `/editing`, `/viewer/inspect`, `/viewer/repl` and `/viewer/download` entry points. Inspection can load without the REPL, export controls or archive tools.
- WebGPU rendering for meshes, Gaussian particle fields and bounded media in the same scene. Optional `/renderers` provides Basic, Beauty with SSGI/AO/TAA, MuTracer and gkjohnson path tracing, configurable samples/bounces, OIDN denoising and scene-linear HDR bloom. Optional tracers load on selection.
- Rational NURBS patches, evaluated Bézier/B-spline/NURBS curves, world-space points with varying widths, and uniform/adaptive OpenSubdiv surfaces with animated creases, corners and holes. Adaptive tessellation uses camera-independent OpenSubdiv Bfr limit surfaces with bounded triangle budgets.
- UsdLux lights and cameras, authored shadow controls, dome environments including ordinary image textures, MaterialX geometry properties and nested graphs, MDL preview approximation, and optional bounded MaterialX/OpenVDB volume rendering.
- Native instance and PointInstancer inspection/picking, prototype traversal, composed hierarchy state, multi-selection, property following and geometry-subset framing/outlines through native face identities.
- Typed metadata and attribute reads/authoring, dictionary-key edits with explicit Sdf types, list-operation buckets, matrices/quaternions and ordered sublayers. Public reads retain owned values and exact 64-bit integer inputs are validated.
- Serialized `handle.readStage()` and `handle.editStage()` boundaries; resolver-aware source reads and root-relative public paths preserving parent traversal and USDZ membership. Stage summaries inspect schemas, SimReady metadata, scene counts and file sizes without reading mesh arrays.
- `/editing` typed array commands with sparse undo/redo, expected-value validation, conflict-safe rollback and document lifetime checks. Reusable array inspectors/editors support paged rows, vector/color columns, matrices and spreadsheet paste.
- Asynchronous native USDZ packaging with dependency localization and unsaved edits; worker-based ZIP compression and a reusable split Download control with progress, cancellation-safe ownership and remembered format.
- Optional `/kinematics` for bounded joint interaction, fixed attachments, mimic dependencies, independent frames and closed linkages. Interaction does not load a contact physics engine. Optional Rapier simulation loads on demand and reports unsupported configurations before starting.
- Configurable scene helpers for curves, control points, points, lights, cameras and joint constraints, including helper picking and depth-tested overlays in optional path tracers.

### Fixed

- Await asynchronous attribute reads in the SDK example inspector and retain the stage while reading.

- Refresh the embedded MaterialX libraries to the final upstream 1.39.5 data in both runtime builds.

- Update to MaterialX 1.8.1 and Three.js 0.185.2-alpha.8 with the complete MaterialX loader, corrected TSL default inputs and expanded node-library coverage.

- Honor authored colors, UVs, tangents, smooth normals, MDL normal scale/bias and OmniGlass transmission. Preserve textures through material replacement, package reads and variant/payload resyncs.
- Copy shared WASM texture bytes before browser image decoding. Preserve package image formats and support lazy EXR/HDR/TGA/KTX2 decoding, including compressed color maps and readable scalar/normal remapping.
- Update textureless WebGPU instance groups and selection outlines during animation and mechanism interaction. Retain authored subset identities through triangulation and subdivision.
- Preserve native instance material branches, inherited visibility, unloaded payload state and animation ranges in shared prototypes. Instance-proxy children remain inspectable and read-only.
- Yield while opening remote stages and recomposing variants/payloads; deliver owned change notices and dependency progress on the JavaScript thread. Geometry and material constants can appear before textures finish.
- Keep large assets responsive with bounded attribute pages, asynchronous layer exports, worker-backed source analysis, typed collider buffers, deferred hidden geometry and worker-built BVHs. Oversized PNGs resize with a scanline decoder before browser bitmap allocation.
- Retain native stages through pending reads/exports; cancel stale texture loads, guard superseded updates, release workers and restore host resources on disposal. Deleting a root-layer wrapper no longer invalidates its stage.
- Keep empty session layers out of embedded source lists while retaining authored session edits. Use public source filenames without exposing MEMFS mount identities.
- Match host stylesheet ownership and repair strict Bundler/NodeNext declarations, optional entry points and browser-safe imports.

### Changed

- Defer native MaterialX library initialization until a material requires it; PreviewSurface-only stages avoid the library parse without changing mixed-material or volume behavior.
- Expose `onAssetFetchProgress`, `resolveTextureUrl` and `maxTextureSize` for progressive host loading. Defaults retain original textures; `waitForMaterials:true` requests texture completion. Catalog and display-resolution policy belong to the host application.
- Preserve the legacy Three.js integration and existing package-root exports. Modern renderers require a compatible host Three.js/WebGPU setup; optional runtime and renderer dependencies remain host-owned.
- Update the MaterialX dependency to `@needle-tools/materialx@1.8.1`.

Viewer application changes and fixture updates are recorded in the repository's [viewer changelog](https://github.com/needle-tools/usd-viewer/blob/main/CHANGELOG.md).

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
