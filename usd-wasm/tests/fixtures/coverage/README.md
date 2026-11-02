# USD feature fixtures

These fixtures appear under **Examples → Needle**, grouped by feature.
Each suite manifest lists root layers, dependencies and authored assertions.

| Suite | Coverage |
| --- | --- |
| [Core](core/README.md) | Composition, variants, clips, topology, primvars, animation, instancing, purposes, cameras and lights |
| [Shading](shading/README.md) | MaterialX graphs, geometry properties, textures, UsdShade interfaces and bindings |
| [Advanced](advanced/README.md) | Skeletons, blend shapes, splats, physics, VDB, curves, points and scene schemas |
| [Lighting and MDL](lighting-mdl/README.md) | UsdLux emitters, dome maps, light rigs and MDL input approximations |
| [MaterialX gallery](materialx/README.md) | Bounded media and custom or nested surface graphs |
| [Curved surfaces](curved-surfaces/README.md) | Subdivision, animated creases and holes, splines and rational NURBS |
| [Production](production/README.md) | Separate geometry, material, layout and lighting layers |
| [Textures](textures/README.md) | KTX2, EXR, PNG, JPEG and TGA |

The remote comparison assets are separate under **Examples → Hugging
Face test set**. Executable JavaScript lessons have their own category.

## Regeneration

From `usd-wasm`, use Python matching the installed native OpenUSD:

```sh
python3 scripts/generate-core-coverage-fixtures.py
python3 scripts/generate-shading-coverage-fixtures.py
python3 scripts/generate-advanced-coverage-fixtures.py
python3 scripts/generate-lighting-mdl-fixtures.py
python3 scripts/generate-materialx-gallery-fixtures.py
python3 scripts/generate-curved-surfaces-fixtures.py
python3 scripts/generate-production-texture-fixtures.py
npm run fixtures:catalog
```

Generators reopen stages and check authored data and composition. Their
`native-validation.json` outputs are ignored local reports. Run
`npm run test:coverage` for browser samples, then
`node scripts/summarize-coverage-validation.mjs` for a summary in
`.cache/coverage-validation/`. These reports are diagnostics, not conformance
certificates. Keep raw validation output out of version control.

## Previews and references

`scripts/render-coverage-thumbnails.py --force` uses native OpenUSD/Storm.
`--helper`, `--usdrecord`, `--suite` and `--asset` select tools or a subset.
`native-captures.json` records the renderer, reference method and image hashes.
Installed Storm versions may use bounds for splats and VDB, proxy surfaces for
bounded MaterialX media, or independently evaluated proxies for rational NURBS.
Those previews do not establish rendering support for the underlying feature.

The optional Beauty preview inventory contains image locations and source
fingerprints; per-run camera fits, pixel measurements and errors stay in
`.cache/beauty-thumbnails/`. MDL reference rendering commands are in
[Native MDL references](../../../../docs/mdl-reference-rendering.md).

## Feature checks

Use the focused browser tests for visual behavior, animation, picking, light
variants and physics. `scripts/validate-skeletal-loops.py` compares sampled
world-space points against native `UsdSkel.BakeSkinning`. Physics cards show
the authored initial state; simulation is opt-in. VDB materials use the viewer's
density/heat visualization. The MDL cases demonstrate known input
approximations; the browser does not compile arbitrary MDL.

The corpus is representative rather than exhaustive. Stage opening alone does
not establish transport, simulation, render-product/AOV execution, spatial
audio or every composition combination. See the individual suite manifests and
READMEs for each example's intended scope.
