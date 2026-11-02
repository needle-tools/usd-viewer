# Changelog

## [Unreleased]

## [1.2.0] - 2026-11-02

### Added

- USD Viewer and USD Studio modes. Studio adds a dockable workspace with Stage, Examples, Properties, Layers, Code, Timeline, Console and Simulation panels.
- Basic, Beauty, MuTracer and gkjohnson rendering, with tone mapping, bloom and optional denoising. New sessions start in Beauty with Adaptive detail.
- Display and helper menus, light/dark themes, selection outlines, instance and mesh-subset picking, multi-selection and **F** to focus.
- An Examples browser with remembered layout and selection, Beauty/native Storm previews, executable JavaScript lessons and new geometry, material, lighting and animation fixtures.
- NVIDIA SimReady and AGIBOT asset collections with published previews and source attribution. Additional Hugging Face datasets and folders can be opened with repeatable `collection=` URL parameters.
- Code inspection for JavaScript, live USDA layers, textures and other loaded files. References link to their sources, and large arrays open in an editable table. The Console shares the array tools.
- Typed property inspection, instance/prototype navigation and Asset Info summaries for dependencies, scene contents and authored simulation metadata.
- Mechanism interaction with joint limits and constraint helpers, plus optional contact simulation that reports unsupported configurations before starting.
- ZIP and USDZ downloads with progress reporting, including authored edits and original asset dependencies.

### Fixed

- Preserve panel arrangements, Timeline visibility, selection and scroll position when changing assets or updating the stage.
- Correct inherited visibility, native instances, unloaded payload state, prototype animation and animated mesh-subset framing.
- Correct package textures, image-based dome lighting, normal maps, MDL preview materials, glass transmission and animated instances without textures.
- Keep remote composition, large textures, source inspection and viewport picking responsive. Download progress includes concurrent dependencies, byte totals, transfer speed and estimated time remaining.
- Show source filenames consistently in Code and Layers, and omit empty session layers and package preview images.
- Prevent cached UI and SDK modules from loading incompatible versions together. Reuse cached assets according to their HTTP freshness and pinned dataset revisions.
- Offer published lower-resolution textures as a display option while preserving original dependencies for viewing and export.

The reusable npm SDK has a separate [changelog](usd-wasm/CHANGELOG.md).
