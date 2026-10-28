# Hydra material regressions and runtime measurements

Run `npm run test:hydra` from `usd-wasm/`. Tests use synthetic data and the
checked-in WASM; they do not download third-party assets or rebuild USD.
They cover material subsets, fallback colors, geometry, lights, texture loading,
resource ownership and renderer integration.

## External asset checks

Use `node scripts/validate-asset-corpus.mjs` for the linked comparison assets.
Downloaded assets, captures and result reports belong in the ignored `.cache/`
directory. Asset attribution and license links are in
[`public/thumbnails/usd-assets/README.md`](../../../public/thumbnails/usd-assets/README.md).

## Runtime measurements

Measure fresh-process Node memory and compressed payload sizes:

```sh
node scripts/measure-runtime.mjs --runs 3 > .cache/runtime-measurements.json
```

To compare a preserved directory containing `index.js`, `emHdBindings.js` and
`emHdBindings.wasm`, add `--baseline /path/to/old/bindings`.
Reserved linear memory and process RSS are reported separately. Node timings
do not measure browser frame rate or mobile memory use.

The shipped artifact's source identity is in
`src/bindings/openusd-build-info.json`. Post-link optimization tools, flags and
input/output hashes are in `src/bindings/openusd-optimization-info.json`;
the binding artifact tests verify the shipped hash.
