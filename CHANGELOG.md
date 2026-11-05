# Changelog

## [1.2.1] - 2026-11-05

- Inspect and edit animated properties and large arrays in Code and Properties, with table controls and undo/redo.
- Download USD scenes as GLB files or share them on Needle Cloud.
- Choose original or preview textures for ZIP, USDZ, GLB and Cloud exports, independently of viewport quality.
- Refine the Viewer/Studio switch and restore Feedback, What’s New, About and example links. New sessions use the light theme.
- Fix header movement on hover and leave joint helpers hidden until enabled or selected.
- Simulate USD assets alongside Needle Engine objects, with shared collisions, physics queries, joint controls and motors. Export SimReady physics, object identities and schema metadata to GLB, including for compatible Mesh Baker workflows.

## [1.2.0] - 2026-11-02

### Added

- Reveal selected cameras, lights, curves, points and NURBS control cages independently of global helper settings.

- USD Viewer and USD Studio modes. Viewer presents the viewport and Examples menu; Studio adds a persistent, dockable workspace with Stage, Examples, Properties, Layers, Code, Timeline, Console and Simulation panels.
- Basic, Beauty, MuTracer and gkjohnson render modes on the Three.js WebGPU surface, with remembered render/detail settings, tone mapping, bloom and optional denoising. New sessions start in Beauty with Adaptive detail.
- View menus for display/render settings and helpers, standard menu navigation, light/dark themes, thin scrollbars, viewport selection/hover outlines, instance/subset picking, multi-selection and **F** to focus.
- Responsive Examples folders with adjustable splitters, remembered selection/scroll/preview size, and selectable Beauty/native Storm cards. Include executable JavaScript API lessons, layered production examples, texture-format cases and animated subdivision, rigging, lighting and volume fixtures.
- Complete NVIDIA SimReady browsing with revision-pinned entry points and published previews, a separate Hugging Face test set and AGIBOT collection. Additional dataset/folder URLs register their own folders through repeatable `collection=` parameters.
- Code inspection for JavaScript and live USDA layers, an adjustable file sidebar, navigable references and hierarchy-linked declarations. Large arrays open in a resizable editing sidebar; the Console uses the same structured array tools.
- Properties with collapsible sections, typed/schema inspection, instance/prototype links and property navigation. Asset Info includes source links, file/byte totals, authored SimReady profile/mass/dimensions, scene counts, moving parts, independent joints and schema arrays.
- Lightweight mechanism interaction with green constraint helpers, authored limits and dependent parts. Contact simulation is separate, optional and validates unsupported configurations before starting.
- Reusable Download split control for ZIP/USDZ with asynchronous export progress; exports include authored edits and original dependencies.

### Fixed

- Update to MaterialX 1.8.1 and Three.js 0.185.2-alpha.8 with the complete MaterialX loader, corrected TSL default inputs and expanded node-library coverage.

- Preserve user-owned panel arrangements and Timeline visibility when switching assets. Keep viewport frames, hierarchy rows, focus and scroll stable during stage updates and resizing.
- Correct inherited visibility, native-instance branches, payload state, prototype animation detection, hover/selection outlines and animated subset framing.
- Fix package texture decoding, image-based domes, normal-texture remapping, MDL preview materials, glass transmission, analytic normals and textureless instance updates.
- Keep remote composition, large texture decoding, mesh inspection, layer source analysis and viewport picking responsive. Loading UI reports concurrent dependencies, known/unknown totals, percentages, speed and ETA.
- Show readable source paths in Code and Layers, including parent dependencies. Hide empty edit layers and preview images inside packages.
- Fix stale scripts and styles after updates. Keep remote assets cached between visits while checking for updates when needed.
- Load original textures reliably and offer published previews as an optional quality setting. Keep original dependencies available for viewing and export.

See the [USD SDK changelog](usd-wasm/CHANGELOG.md) for package changes.
