# Shading coverage fixtures

These 45 stages exercise MaterialX procedural graphs and surface lobes, scalar/vector/color geometry properties, primvar interpolation and indexing, texture sampling, and UsdShade interfaces, render contexts and material bindings. The manifest records each root, dependencies, feature expectations and authored assertions. The generator writes an ignored local `native-validation.json` report with the native OpenUSD composition, Sdr identifier, connection, binding, topology, primvar and compliance checks.

The 29 `mx_` and `geomprop_` roots bind their featured artifact to a MaterialX-only material. That material has an `outputs:mtlx:surface` terminal and deliberately has no universal surface fallback. The floor and plinth use separate PreviewSurface materials for the display environment; seeing those materials render does not establish that the featured MaterialX graph works. `shade_render_contexts` is the explicit exception outside those 29 cases: it authors different MaterialX and universal colors to test source precedence.

Regenerate or validate with native OpenUSD Python bindings:

```sh
python3 usd-wasm/scripts/generate-shading-coverage-fixtures.py
python3 usd-wasm/scripts/generate-shading-coverage-fixtures.py --validate-only
```

The generator creates the three small original PNG textures using Python's standard library. All asset paths are relative. `/World/Camera` frames the artifact and plinth. Use the local native OpenUSD/Storm thumbnail path for reference images.

Validation establishes valid authored/composed data, not renderer support. In particular displacement, thin-film interference, subsurface scattering, transmission, material-purpose selection and specular workflow need separate runtime verification. The missing-primvar, nodegraph-interface and nested-forwarding cases also exercise reader fallback values; a default white result is a failure rather than proof of interface support. Geometry properties deliberately cover representative combinations, not every possible type/interpolation/indexing combination.
