# Advanced USD coverage fixtures

This corpus covers skeletal animation and blend shapes, Gaussian particle fields, physics, volumes, curves, points, NURBS and scene schemas. `manifest.json` identifies the roots, dependencies, feature scope, and assertions. The generator writes an ignored local `native-validation.json` report with native OpenUSD 26.05 stage opens, composition errors, and schema/data checks. These checks do not establish viewer rendering, animation, or simulation correctness.

Regenerate from `usd-wasm` with native OpenUSD Python bindings:

```sh
python3 scripts/generate-advanced-coverage-fixtures.py
```

The skeletal fixtures loop over frames 1–97 at 24 fps. The articulated scenes
are a waving toy (rest transforms), flapping bird (bind transforms), dancing
flower (joint names), kelp (multiple influences), twisting column (dual
quaternions), periscope robot (translations), and pinwheel (rotations). Their
motions use separate joint hierarchies and weights, densely sampled transforms,
and matching start/end poses.

The rounded faces use localized smile, wink and surprise targets. Head
features follow one rigid head joint, while expressions affect the mouth, lids,
brows and cheeks. The sparse case indexes only affected features; the inbetween
case holds a distinct closed-mouth half-smile before the open grin. Position
and normal offsets share topology and indices. Static visibility alone is not
a skinning test.

Regenerate just these fixtures by passing their names to the generator.
`skel_faces.py` and `skeletal_props.py` contain the modeling helpers. Native card
captures use each manifest entry's `thumbnailFrame`; the helper bakes skinning on
a private layer with native `UsdSkel.BakeSkinning` before Storm rendering. This
avoids the installed Storm 26.05 GPU skinning's faceted normals and occasional
missing blend-shape draws. Source assets retain their skeletons and animation.

`tests/public-viewer/skeletal-loops.spec.ts` checks the scenes in both viewer
modes at sampled cycle times, including exact endpoints and backward seeks. Compare
its world-point captures against native USD with:

```sh
python3 scripts/validate-skeletal-loops.py --browser-dir .cache/skeletal-loops-compact
```

The comparison script writes native checks and source hashes to the ignored
`.cache/skeletal-loops/native-validation.json` report. Matching points
establish deformation agreement; the native pose sheets separately support
visual review of expressions and attachments.

The Gaussian particle fields use the `ParticleField3DGaussianSplat` type and attributes, which OpenUSD 26.05 preserves but does not provide as a schema class. A particle-field renderer such as Spark is needed to display the splats; Storm rendering is not evidence of splat support. Physics fixtures preserve their authored initial state and simulate on demand with the optional Rapier adapter. They include mass/gravity, fixed/revolute/prismatic joints, collision groups, a domino chain and a compound pendulum. The simulator and public dragging/reset controls have separate runtime tests; native Storm cards show the initial state. The four volume fixtures render their actual local OpenVDB grids with the optional node-renderer factory: density, density plus heat emission, transformed volume, and a filled → empty → filled file sequence. Grid transforms and precise occupied bounds are preserved; shading is the viewer’s default density/heat visualization. Points render per-point world-space widths, colors and opacity; Bézier, periodic B-spline and rational NURBS curves are evaluated into round tubes. Velocity attributes are authored but do not provide motion blur. Curve, NURBS, render settings, spatial audio, draw mode and camera optics likewise require feature-specific verification beyond stage opening.

The VDB files are copied from the OpenUSD test suite's `pxr/usdImaging/usdImagingGL/testenv/testUsdImagingGLVdbVolume/` directory (OpenUSD is distributed under the Apache License 2.0). The generated half-second mono WAV is an original 440 Hz test tone. The generator uses the checked-in VDB copies; if missing, it attempts to copy the files from the local OpenUSD source tree specified by the `OPENUSD_SOURCE` environment variable.
