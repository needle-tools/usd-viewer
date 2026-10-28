# USD feature fixtures

These 174 additional fixtures are available in **Load Sample → Needle**, grouped by feature. Each suite manifest lists the stage, all local dependencies, authored feature assertions and areas requiring runtime verification.

| Suite | Fixtures | Coverage |
| --- | ---: | --- |
| [Core](core/README.md) | 45 | Composition arcs, variants, clips, topology, subdivision, primvars, animation, instancing, transforms, purposes, cameras and lights |
| [Shading](shading/README.md) | 45 | MaterialX graphs and lobes, custom geomprops, texture sampling, UsdShade interfaces, render contexts and binding rules |
| [Advanced](advanced/README.md) | 34 | Skeletons, blend shapes, Gaussian splats, interactive physics, real VDB fields, curves, points, NURBS, draw modes, render schemas and spatial audio |
| [Lighting and MDL](lighting-mdl/README.md) | 22 | Sixteen light stages covering HDR/EXR domes, rigs and UsdLux emitters/APIs; six MDL authored-input approximations |
| [MaterialX gallery](materialx/README.md) | 9 | Three bounded media and six custom/nested surface graphs from the Needle MaterialX examples |
| [Curved surfaces](curved-surfaces/README.md) | 19 | Original subdivision car, crease/boundary/valence studies, multispan and rational NURBS patches and curves |

The suites contain 244 feature tags. They complement the existing MDL, MaterialX, subdivision, Draco, resolver and USD concept fixtures. They are a growing coverage corpus, not a claim of complete USD conformance. USD includes extensible schemas, plugins and renderer-specific behavior; a finite gallery cannot establish “100% of USD.”

All 174 stages pass native composition and authored-data assertions; the new curved-surface suite and two physics stages also pass native compliance checks. The original 122 and sixteen lighting stages pass native compliance checks. The six MDL cases report the native installation’s missing MDL shader registry; the nine imported MaterialX stages have composition, binding and terminal checks. Each suite's `native-validation.json` records those checks. The 29 MaterialX feature materials have no universal PreviewSurface fallback, so a visible floor or plinth cannot conceal failure to render the featured material.

The geomprop fixes are verified through the public viewer's default WebGL path. They do not establish custom Preview primvar evaluation in a WebGPU node-material backend.

The shading suite uses its authored light intensity at scale 1. The former 0.01 preview scale made those materials too dark after disabling the viewer's fallback lighting. Rectangular-light checks isolate the featured MaterialX mesh and compare illuminated pixels against the same mesh with its lights off.

`native-captures.json` records the native OpenUSD/Storm card images. The installed native build is 26.05: four particle-field images use native bounds draw mode because Storm predates their schema, and four VDB images use bounds because this native build lacks the VDB field plugin. These eight images do not establish splat or volume rendering. Physics cards show the authored initial state. Simulation is checked separately with real Rapier: all eight scenes stay finite, joint anchors align, compound door/slider visuals follow their bodies, the pendulum swings and all nine dominoes topple. Pointer dragging, pause and reset are tested in both public viewer modes. Skinning is additionally compared with native baked positions as described below. The three bounded MaterialX media use native proxy surfaces for cards because Storm does not implement their transport. Native Storm also approximates NURBS as control cages; NURBS cards instead capture independently evaluated rational proxy geometry, with provenance recorded in the index.

From `usd-wasm`, regenerate the suites using a Python interpreter matching the native USD installation, then rebuild the catalog:

```sh
python3 scripts/generate-core-coverage-fixtures.py
python3 scripts/generate-shading-coverage-fixtures.py
python3 scripts/generate-advanced-coverage-fixtures.py
python3 scripts/generate-lighting-mdl-fixtures.py
python3 scripts/generate-materialx-gallery-fixtures.py
python3 scripts/generate-curved-surfaces-fixtures.py
npm run fixtures:catalog
```

For native cards, use `scripts/render-coverage-thumbnails.py --force` with the native USD Python bindings on `PYTHONPATH`. The script uses the local thumbnail helper and `usdrecord --renderer Storm`; `--helper`, `--usdrecord`, `--suite` and `--asset` select local tools or a subset. It writes only temporary work layers and logs into `.cache`.

`npm run test:coverage` collects real Chromium render samples at frames 1, 24 and 48, geometry/material metadata, primvar attributes, animation changes, diagnostics and errors for every entry. The report is `.cache/coverage-validation/browser-results.json`. This is load/render evidence, not an automatic conformance verdict: authored cameras and lights, full material lobes and simulation require their own assertions and reference comparisons.

After collecting the full browser report and native skinning comparison, `node scripts/summarize-coverage-validation.mjs` updates the checked-in runtime summary. Focused geomprop regressions run with `USD_THREE_MATRIX_BROWSER=chromium npx playwright test -c tests/primvars/playwright.config.ts --workers=1`.

The full browser pass loads all 144 stages and produces foreground pixels for every stage. Focused checks additionally verify featured MaterialX pixels without furniture, actual VDB voxels and empty frames, authored lighting variants, and per-point/curve data. `RenderSettings` remains an explicitly unsupported execution schema; visible display geometry does not imply AOV/render-product execution.

Points render with per-point world-space widths, colors and opacity. Cubic Bézier, periodic B-spline and rational NURBS curves render as evaluated round tubes. Four VDB stages decode the actual density/heat voxels; the animated sequence tests filled, empty and filled frames. VDB and MaterialX bounded media select the node renderer in the public viewer; ordinary surface cases retain the standard renderer. VDB material visualization uses a default density/heat transfer rather than evaluating an arbitrary authored volume shader.

The ten articulated subjects and six general animation scenes have distinct structures. Lighting fixtures disable the host environment and provide their own lights; variant controls switch complete rigs or HDR maps and rotation. Six MDL examples exercise supported authored-input approximations, not arbitrary MDL compilation. The fourteen remote real-world files appear separately under **Load Sample → Hugging Face test set**.

All ten rig cases additionally match native `UsdSkel.BakeSkinning` point positions at frames 1, 24 and 48, with zero observed error at tolerance `1e-5`. This includes the authored multiple-influence, dual-quaternion, sparse blend-shape and inbetween cases. `scripts/validate-coverage-skinning.py` compares native points against the browser's expanded triangle corners; it does not validate topology ordering or all skeletal configurations. The checked-in [runtime summary](runtime-validation.json) records the scope and outcomes.

Known areas requiring further feature work or verification include velocity motion blur, oriented curve ribbons, independent field-prim transforms, arbitrary authored VDB shading, MaterialX hemisphere lighting, mesh/volume emission, portal transport and light/shadow linking, advanced physics constraints and animated kinematics, trimmed NURBS surfaces, render-product/AOV execution, spatial audio, PreviewSurface specular workflow, MaterialX displacement and complete transmission/subsurface/volume appearance. Composition coverage also remains representative rather than exhaustive: resolver plugins, payload lifecycle, arbitrary list edits and every clip/variant/layer-strength combination are not established by these cases.

The [picker, smooth-normal and shadow checks](interaction-shadow-validation.json) record persisted picker state, native and browser torus normals, actual PreviewSurface/MaterialX shadow occlusion in both viewers, and the Distant sun shadow variants. Shadow color/distance/falloff, light/shadow linking and area/dome shadow transport remain unsupported.

The [lighting and physics update](lighting-runtime-validation.json) records MaterialX 1.8.0 area lighting, shared Rapier 0.21.0 initialization, Timer advancement, authored-light defaults and the expanded 17-entry Lights section.

The [previous artifact checks](current-runtime-validation.json) record the final optimized runtime and exact npm artifact: 99 Hydra tests, 16 bindings, 18 public-viewer cases, six focused browser primitives, numerical NURBS/inertia checks and clean production consumers. These include real simulation of all eight physics stages and pointer dragging/reset in both viewer modes. The [previous material/volume checks](materials-runtime-validation.json) retain their original source and artifact hashes. The full-corpus summary likewise preserves its earlier tested hash and 144-stage scope.

The [subdivision checks](subdivision-validation.json) verify all 17 playground colors,
live Detail changes in both viewers, and smooth/cage MDL vessel variants. The ten
affected lighting/MDL stages default to high complexity and have refreshed native
Storm cards. These checks retain their exact package identity separately from
the older runtime summaries.

The [volume background checks](volume-background-validation.json) compare the jade
medium over the clear color and an equal-color opaque backdrop, verify its direct
lighting without opaque box self-shadowing, and exercise the Light/Dark control.
All 27 volume/shadow browser cases pass. VDB scene-pixel captures exclude toolbar
overlays; the pixel thresholds are unchanged. Native cards and authored materials
were not changed.
