# Corpus export checks

Create a portable viewer from the current JavaScript sources and existing native runtimes:

```sh
node scripts/build-portable-viewer.mjs <new-build-directory>
```

The destination must be new. The build records source revisions, native runtime metadata, and checksums for the files it actually serves. It does not rebuild OpenUSD.

Install the portable build's dependencies, then run against a catalogue generated from composed USD assets:

```sh
node <build>/corpus/run.mjs --build <build> --assets <asset-directory> \
  --catalogue <catalogue.json> --output <results-directory> \
  --workers 2 --usd-reimport
```

`--chrome` selects a browser executable. `--only` accepts comma-separated root substrings or catalogue IDs. `--textures preview` tests preview textures; the default exports original resolution. Matching completed results resume automatically; `--force` reruns them. Each export lane reuses its browser, page, USD runtime and renderer across assets. Contexts are recycled after failures or large WebAssembly heap growth.

Assets with at least 500 MiB of composed source files or two million triangles run one at a time. Smaller assets can use the remaining workers. This limits overlapping memory peaks; source file sizes are not decoded-memory estimates.

The harness supplies shared WebAssembly memory with a 16 MB initial allocation and a 4 GB growth limit, matching the desktop viewer. The SDK retains its existing defaults when callers do not supply memory.

Checks include Khronos glTF validation, visible triangle counts and bounds, SDK SimReady snapshots and mechanism construction, material/shader errors, resource failures, and comparison captures. `--usd-reimport` additionally opens the GLB with the native USD file-format plugin and checks its geometry and render against the SDK import. Bounds use rendered vertex positions and active draw ranges, preserving the measurement when material primitives split or unused vertices are removed. The browser captures use the same lighting and preview texture budget; they are diagnostic comparisons, not native USD reference images. Image differences and material fallbacks remain review results. Unsupported source mechanism features are recorded separately from interchange failures. The authored default asset configuration is tested; alternate USD variants need separate runs.

Per-asset JSON reports and PNG captures live beside `run.json`, `index.json`, `progress.json`, and `summary.json`. Successful GLBs are retained by default. `--discard-success` removes successful exports; failed and review exports remain available for investigation. Allow adequate temporary storage for embedded textures and retained exports.

The resume identity covers the frozen viewer build, export texture mode and native reimport option. Reports also record the harness checksums, so a runner update can resume the same viewer without losing its provenance. Run records are retained under `runs/`. Temporary Windows sharing violations are retried while publishing reports; persistent filesystem errors still stop the run.

Validation runs in isolated Node workers so its CPU work and large input buffers do not block the asset server. Each worker exits after validating its file. Network failures retain the requested URL and browser error in the report.

Serve a frozen build, source assets, and reports for inspection:

```sh
node <build>/corpus/serve.mjs --build <build> --assets <asset-directory> \
  --results <results-directory> --port 8770
```

The server binds to loopback. `/reports/index.json` is suitable for a catalogue mirror; `/artifacts/` serves retained GLBs and captures. The run exits unsuccessfully when any asset fails or needs review. Consult the generated reports for coverage and exact provenance.
