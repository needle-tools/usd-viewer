# Changelog
All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-10-28
### Added
- Added optional Spark rendering for OpenUSD `ParticleField3DGaussianSplat` prims in both the plain three.js and Needle Engine integrations.
- Added authored-input approximations for known OmniPBR and glTF MDL materials, including texture factors, UV transforms, color spaces, opacity and normals.
- Added bounded MaterialX volume materials through WebGPURenderer, including its WebGL2 backend, using the existing volume implementation with recorded source provenance.

### Changed
- Updated the WASM runtime to OpenUSD 26.11.1 and rebuilt USD-dependent glTF/Draco plugins for its ABI.
- Updated the development viewer to Needle Engine 6 and MaterialX 1.7.4.
- Included the package license and third-party notices in npm artifacts.
- Included asynchronous particle-field creation and MaterialX tangent generation in the existing loader readiness barriers.
- Recorded an optional Binaryen post-link size pass with input/output hashes and exact optimizer flags.

### Fixed
- Stopped pthread workers allocating unused private shared memories; only the host allocates memory, and an explicitly supplied host memory is preserved.
- Shared one module initialization across concurrent first calls to `getUsdModule`, avoiding duplicate memories and worker pools.
- Preserved browser Forward history when normalizing the viewer URL on document startup.
- Applied PreviewSurface normal texture scale/bias, including reversed axes and nonstandard Z decoding, while preserving the canonical normal-map path.
- Preserved authored UV transforms and independent samplers on PreviewSurface roughness, metalness and occlusion textures instead of replacing them with a default-sampled packed texture.
- Isolated HTTP resolver and imported-file caches per Hydra handle so simultaneous stages with matching filenames load their own geometry and materials; disposal and failed loads release only their own files. Older unscoped runtimes reject overlapping handles before loading.
- Preserved sidecar texture loading with isolated HTTP cache paths by resolving their original URL before native file reads.
- Kept geometry visible with diagnostic fallback shading when Hydra cannot create a supported material surface (for example an MDL-only binding).
- Preserved face-subset material bindings over mesh fallback bindings, including late material assignments and uncovered faces.
- Added face-varying display colors to fallback shading without tinting authored surfaces.
- Preserved HalfFloat/16-bit scalar texture channels and independent opacity without mutating shared texture sources.
- Kept live MDL Material/NodeGraph input edits and animated inputs in sync without repeatedly rebuilding ordinary MaterialX materials.
- Preserved canonical MaterialX vector input types and zero-light volume absorption/emission.
- Avoided eagerly clearing unused WASM path-pool reservations, reducing resident memory while preserving the existing pool-handle ABI.
- Applied OpenUSD particle-field array truncation and default-value rules before creating Spark splat buffers.
- Reused a single scene-level Spark renderer across USD handles and existing Needle Engine splat integrations.

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
