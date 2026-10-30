# Core USD coverage fixtures

These 45 small stages exercise composition arcs, topology, subdivision, primvar interpolation and indexing, animation, instancing, imageable purposes, transforms, cameras and lighting. Each entry in `manifest.json` lists its root, dependent files and native feature assertions. The supporting The generator writes an ignored local `native-validation.json` report with opening each root with payloads loaded, composition errors, and assertions using OpenUSD 26.05. These checks establish authored/composed data, not visual or playback conformance in any particular viewer. `expected.needle` describes an area to verify; it is not a claim that every feature is implemented.

Regenerate from `usd-wasm` using OpenUSD's Python bindings, e.g.:

```sh
PYTHONPATH=/Users/herbst/OpenUSD-26.05-native/lib/python /usr/local/bin/python3 scripts/generate-core-coverage-fixtures.py
```

All referenced asset layers live alongside their root and use relative identifiers. Animations loop over frames 1–97 at 24 fps, with matching values at both ends; the visibility blink loops over 1–49. Static stages declare no frame range. The clip, reference offset and sublayer offset examples specifically exercise composition timing; The generator validates the clip-time loop and the offset/scaled reference samples. The native validation opens with `Usd.Stage.LoadAll`, so the payload fixture represents a loaded payload, not deferred loading.

Coverage is deliberately targeted, not exhaustive: examples do not establish complete compliance for USD composition, complex multi-layer list editing, clip manifests and multiple clip sets, subdivision evaluation, instancer masks and motion blur, Hydra render delegates, or camera and light rendering. Rendered behavior and frame-by-frame playback still need viewer-specific tests and native Storm references.
