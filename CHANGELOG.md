# Changelog

See the [USD SDK changelog](usd-wasm/CHANGELOG.md) for SDK changes.

## [2.2.0] - 2026-11-24

### Improved

- Spark texture compression is enabled by default in the Three.js viewer on WebGPU and WebGL. Downloads use the source textures.
- PNG previews and GLB downloads use less memory, and ZIP downloads are labeled **USD (ZIP archive)**.
- The flat viewport backdrop follows the panel theme, with Light and Dark overrides. Its displayed color is compensated for tone mapping while remaining visible through glass and volumes.
- Beauty filters indirect lighting and ambient occlusion before temporal anti-aliasing to reduce flicker.

### Fixed

- Click to select parts in Interact mode and continue dragging smoothly along joint limits.
- Tab close buttons appear consistently on hover.

## [2.1.0] - 2026-11-23

### Improved

- Downloads export the authored SimReady pose by default. Turn on “Export with changed SimReady pose” to keep a pose you dragged or simulated.
- In Interact, a dragged or typed pose becomes the joint's drive target and holds; joints you did not move return to their authored targets. Drags are weighted by the mass each joint carries, and the cursor shows which parts can be dragged.
- Interact and Simulate stay active when you open another compatible asset, and changing scene settings keeps the current camera.
- Studio's default layouts include Simulation.
- Texture quality distinguishes original resolution from preview (up to 512 px) and shows the size of the original texture files.
- OpenUSD startup and file transfers appear together in one progress panel.
- Searching examples covers the whole top-level category from any subfolder.
- GLB and USD exports record the viewer version that created them.

### Fixed

- glTF exports keep texture orientation and colors in the Needle Engine viewer mode, and textures shared by several materials are stored once.
- Viewer files served at stable URLs are revalidated, so updates load without stale cached code.

## [2.0.0] - 2026-11-10

### Improved

- Toggle joint axes and limits in Interact and Simulate. Inspect collision shapes with translucent surfaces and green outlines. Warning details appear in a tooltip.
- Browse the current Khronos glTF Sample Assets directly or use the separate glTF → USD conversions library.
- USD physics assets work with Needle Engine collision events, raycasts and drag interaction through regular Rigidbody and Collider components.
- Grippers and other mechanisms with mimic joints can now simulate. Joints respect authored break thresholds and spherical cone limits, and motor-driven joints keep moving instead of falling asleep.
- GLB downloads preserve custom attributes and multiple UV sets, including for Mesh Baker. Large scenes can download with full-resolution textures.
- Gaussian splats render more accurately, FastHDR environments display correctly, and temporal anti-aliasing works consistently across supported rendering backends.
- Updated MuTracer path tracing to 0.3.0.
- Code editing tools load when needed, reducing the code loaded when opening a scene.
- Metadata lists, such as applied schemas, appear directly in Properties.

### Fixed

- Casters on complex assemblies stay stable when simulation starts, with collision geometry that preserves their clearance from the chassis.
- A misaligned fixed attachment no longer prevents dragging valid hinges and sliders in Interact.
- Textured glass stays transmissive after its color texture finishes loading.
- Thin SDF collision meshes make more reliable contact, including the arms of glasses.
- Simulate holds isolated rigid assets and the bases of floating mechanisms in place while movable parts respond to joints and collisions. Turn off “Hold assembly bases” to simulate the whole assembly freely.
- Dragged physics parts settle without persistent oscillation or sudden kicks from cursor movement. Authored damping is respected; assets without it use the usual Needle rigid-body defaults.
- Saved panel layouts no longer override the default USD Viewer mode.
- The Viewer/Studio switch has a clearer selected state. Examples has aligned search controls and totals for every asset library.
- Textures inside USDZ archives load correctly in the native Hydra renderer for usdview, Blender and Houdini.
- Files dropped onto the viewport load reliably.
- Reloading after an update uses the latest viewer code and styles.
- MaterialX and USD textures use the correct orientation, rotation, tiling, wrap modes and UV sets. Color spaces, including Display P3 and ACEScg, are applied correctly.
- MaterialX assets open in view when their materials finish loading in Needle Engine.
- Switching scenes releases the previous scene's GPU memory.
- MaterialX materials remain visible when a texture cannot be loaded, using the material's fallback color and reporting the missing texture.
- Highly subdivided meshes load without long pauses during tangent generation.
- Beauty mode no longer darkens the image border on the WebGL backend.

## [1.2.1] - 2026-11-05

- Inspect and edit animated properties and large arrays in Code and Properties, with table controls and undo/redo.
- Download USD scenes as GLB files or share them on Needle Cloud.
- Choose original or preview textures for ZIP, USDZ, GLB and Cloud exports, independently of viewport quality.
- Switch between Viewer and Studio modes and access Feedback, What’s New, About and example links. New sessions use the light theme.
- Fixed header movement on hover. Joint helpers stay hidden until enabled or selected.
- Simulate USD assets alongside Needle Engine objects, with shared collisions, physics queries, joint controls and motors. Export SimReady physics, object identities and schema metadata to GLB, including for compatible Mesh Baker workflows.

## [1.2.0] - 2026-11-02

### Added

- USD Viewer and USD Studio modes. Viewer focuses on the scene and Examples menu; Studio adds a persistent, dockable workspace with Stage, Examples, Properties, Layers, Code, Timeline, Console and Simulation panels.
- Basic, Beauty and MuTracer rendering, with saved quality settings, tone mapping, bloom and optional denoising. New sessions start in Beauty with Adaptive detail.
- Display and rendering menus, light and dark themes, viewport selection and hover outlines, instance and subset picking, multiple selection and **F** to focus.
- Independently show selected cameras, lights, curves, points and NURBS control cages.
- An Examples browser with adjustable folders, saved selection and preview sizes, and a choice of Beauty or native Storm previews. Examples include executable JavaScript lessons, layered scenes, texture formats, animated subdivision, rigging, lights and volumes.
- Browse the complete NVIDIA SimReady library, a separate Hugging Face test set and AGIBOT assets. Open additional datasets or folders through repeatable `collection=` URL parameters.
- Inspect JavaScript and live USDA layers in Code, follow references and declarations, and edit large arrays in a resizable table. The Console offers the same array tools.
- Inspect typed properties and schemas, follow instance and prototype links, and view asset sources, sizes, dimensions, mass, moving parts and joint information.
- Interact with mechanisms using constraint helpers and authored joint limits. Contact simulation is optional and checks for unsupported configurations before starting.
- Download ZIP or USDZ archives with progress feedback, including scene edits and original dependencies.

### Fixed

- Improved MaterialX rendering and node support with MaterialX 1.8.1 and Three.js r185.
- Panel arrangements, Timeline visibility, selection, focus and scrolling stay stable when changing scenes or resizing the workspace.
- Corrected inherited visibility, instances, payloads, prototype animation and animated subset selection and framing.
- Fixed package textures, image-based dome lights, normal maps, MDL previews, glass, smooth normals and animated instances without textures.
- Large scene loading and picking stay responsive. Download progress shows active dependencies, known file sizes, speed and estimated time remaining.
- Code and Layers show readable source paths, including parent dependencies, and hide empty edit layers and package preview images.
- Reloading picks up updated scripts and styles while retaining cached remote assets where possible.
- Original textures load reliably. Preview textures remain an optional viewing quality setting; viewing and export retain access to the original files.
