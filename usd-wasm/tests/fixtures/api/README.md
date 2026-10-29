# Executable USD examples

`examples.js` is the source for the standalone REPL, binding tests, and
**Examples → Needle test assets → JavaScript API** in the public viewer.
It includes 63 examples, including weighted and rigid skinning, Gaussian fields,
light rigs, animated lighting, payload variants, layer composition and instancing.
`create-api-stage.js` also supplies the standalone API test buttons.

Selecting an example runs its JavaScript in a disposable worker with the same
OpenUSD wasm build as the viewer. The resulting root layer and dependencies load
through the normal viewer pipeline. Variants, references and payloads remain
authored; the result is not flattened. All examples author visible scenes,
including inspection and runtime examples. Printed values are available in
Window → Console. These are bundled executable
fixtures; ordinary remote JavaScript URLs are not executed as samples.

The worker is terminated on completion, failure, timeout, replacement or Clear.
This keeps the pxr adapter's prototype changes and temporary native allocations
out of the viewer's active runtime.

Run the shared execution checks from `usd-wasm`:

```sh
node --test tests/bindings/repl-examples.test.mjs
npx playwright test -c tests/public-viewer/playwright.config.ts api-examples.spec.ts --workers=1
```

Measure calls into the generated core bindings (requires the adjacent OpenUSD
checkout, or pass its `core-bindings.json` path as the first argument):

```sh
node scripts/audit-api-example-calls.mjs
```

The report goes to `.cache/api-example-call-audit.json`. This is call-entry
measurement for five core binding classes and five functions, excluding preview
serialization. It is not whole-SDK coverage or proof that results were asserted.

Regenerate preview inputs and images using the local native OpenUSD environment:

```sh
node scripts/export-api-example-stages.mjs
PYTHONPATH="$HOME/OpenUSD-26.05-native/lib/python" /usr/local/bin/python3 scripts/render-api-thumbnails.py
```

The export goes into `.cache`; only the native Storm images, preview IDs and
capture results are checked in. Every example has a distinct native thumbnail.
The exporter uses an isolated process per example, matching browser worker
isolation and avoiding edits retained in USD's layer registry between cases.
Captures use high complexity and validate native bounds and asset resolution.
Source fingerprints and image hashes prevent stale or duplicate previews.
Lighting lessons use their authored rigs with the native camera headlight disabled.
The viewer executes source code when selected, not the preview snapshots.

`python3 scripts/audit-api-previews.py` produces review contact sheets in
`.cache/api-scenes-review` and flags sparse, cropped or near-identical silhouettes.
The fixture scene kit handles native lowercase up-axis codes; its primitive
and parametric mesh helpers keep original Z-up fixtures aligned with their
added geometry. Parametric surfaces carry smooth vertex normals.

On a native USD installation older than 26.11, API Gaussian previews use an
independent capture layer of opaque 2-sigma covariance ellipsoids with authored
positions, scales, orientations and degree-zero radiance. These native Storm
cards show the authored field shape; they are not density-rendering references.
The capture record preserves that scope. Executing the sample still loads the
original Gaussian schema through the viewer.
