# Advanced USD coverage fixtures

This corpus has 34 stages: 10 skeletal animation and blend shape cases, 4 Gaussian particle fields, 8 physics cases, 4 volume cases, 4 curve/point/NURBS cases, and 4 scene-schema cases. `manifest.json` identifies the roots, dependencies, feature scope, and assertions; `native-validation.json` records native OpenUSD 26.05 stage opens, composition errors, and schema/data checks. These checks do not establish viewer rendering, animation, or simulation correctness.

Regenerate from `usd-wasm` with native OpenUSD Python bindings:

```sh
PYTHONPATH=/Users/herbst/OpenUSD-26.05-native/lib/python /usr/local/bin/python3 scripts/generate-advanced-coverage-fixtures.py
```

The two-joint rigs contain distinct bound, weighted multi-band meshes with additional articulated panels. Animation uses frames 1–48; different stages exercise rest/bind matrices, joint names, multiple influences, dual quaternion skinning, sampled joint transforms, full and sparse blend shapes, and an inbetween. The authored undeformed mesh is visible even in a renderer without skinning; its visibility alone is not a skinning test.

The Gaussian particle fields use the `ParticleField3DGaussianSplat` type and attributes, which OpenUSD 26.05 preserves but does not provide as a schema class. A particle-field renderer such as Spark is needed to display the splats; Storm rendering is not evidence of splat support. Physics fixtures preserve their authored initial state and simulate on demand with the optional Rapier adapter. They include mass/gravity, fixed/revolute/prismatic joints, collision groups, a domino chain and a compound pendulum. The simulator and public dragging/reset controls have separate runtime tests; native Storm cards show the initial state. The four volume fixtures render their actual local OpenVDB grids with the optional node-renderer factory: density, density plus heat emission, transformed volume, and a filled → empty → filled file sequence. Grid transforms and precise occupied bounds are preserved; shading is the viewer’s default density/heat visualization. Points render per-point world-space widths, colors and opacity; Bézier, periodic B-spline and rational NURBS curves are evaluated into round tubes. Velocity attributes are authored but do not provide motion blur. Curve, NURBS, render settings, spatial audio, draw mode and camera optics likewise require feature-specific verification beyond stage opening.

The VDB files are copied from the OpenUSD test suite's `pxr/usdImaging/usdImagingGL/testenv/testUsdImagingGLVdbVolume/` directory (OpenUSD is distributed under the Apache License 2.0). The generated half-second mono WAV is an original 440 Hz test tone. The generator uses the checked-in VDB copies; if missing, it attempts to copy the files from the local OpenUSD source tree at `/Users/herbst/git/OpenUSD`. No generated image is used as evidence for any of these features.
