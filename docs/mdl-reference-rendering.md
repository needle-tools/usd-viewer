# Native MDL references

The browser approximates known MDL inputs. Use the native tools below to render
the original MDL definitions. `felix-win` renders complete USD scenes with RTX;
the local Mac SDK renders materials on its own sphere, without loading USD geometry.
Storm does not evaluate MDL in our native OpenUSD installation.

The six MDL gallery fixtures include unmodified NVIDIA material definitions,
their imports, BSD licenses and checksums in
[`mdl-sources.json`](../usd-wasm/tests/fixtures/coverage/lighting-mdl/mdl-sources.json).
Regeneration verifies these files rather than overwriting them.

## Prepare the inputs on this Mac

From the repository root, using Python matching the installed native OpenUSD:

```sh
PYTHONPATH=/Users/herbst/OpenUSD-26.05-native/lib/python /usr/local/bin/python3 \
  usd-wasm/scripts/prepare-mdl-references.py
```

This writes `usd-wasm/.cache/mdl-reference/gallery/`: enabled/disabled scene overlays for six materials,
original fixture geometry, NVIDIA modules, textures, the viewer's `neutral.hdr`,
SDK material wrappers and input checksums. The overlays use `/World/Camera`,
640 × 480, HDR illumination only, 256 samples, eight bounces and no denoising.
Use `--width`, `--height`, `--samples` or `--out` to change those values.
The source fixtures remain unchanged.

## Complete USD scenes on felix-win

The working installation is in `D:\usd-mdl-reference-20261028`, with
`ovrtx 0.5.1.385782`, `ovstage 0.2.1.385922` and its `ovrtx-venv` Python.
The renderer runs on the RTX 3060 Ti. These are the verified installed versions,
not a request to upgrade them.

```sh
scp -r usd-wasm/.cache/mdl-reference/gallery \
  'felix-win:D:/usd-mdl-reference-20261028/'
scp usd-wasm/scripts/render-mdl-rtx.py usd-wasm/scripts/render-mdl-rtx-batch.ps1 \
  usd-wasm/scripts/ovstage_mdl_audit.py 'felix-win:D:/usd-mdl-reference-20261028/'
ssh felix-win 'powershell -NoProfile -File D:\usd-mdl-reference-20261028\render-mdl-rtx-batch.ps1 -Bundle D:\usd-mdl-reference-20261028\gallery -Out D:\usd-mdl-reference-20261028\gallery-results -Python D:\usd-mdl-reference-20261028\ovrtx-venv\Scripts\python.exe'
scp -r 'felix-win:D:/usd-mdl-reference-20261028/gallery-results' \
  usd-wasm/.cache/mdl-reference/
PYTHONPATH=/Users/herbst/OpenUSD-26.05-native/lib/python /usr/local/bin/python3 usd-wasm/scripts/collect-mdl-references.py \
  --captures usd-wasm/.cache/mdl-reference/gallery-results
```

For one scene, run the worker directly through SSH:

```sh
ssh felix-win 'D:\usd-mdl-reference-20261028\ovrtx-venv\Scripts\python.exe D:\usd-mdl-reference-20261028\render-mdl-rtx.py --stage D:\usd-mdl-reference-20261028\gallery\mdl-normal-texture-rtx.usda --out D:\usd-mdl-reference-20261028\gallery-results\mdl-normal-texture --verify-inputs D:\usd-mdl-reference-20261028\gallery\inputs.json'
```

Each capture retains the linear HDR output, primary depth, native log and hashes.
`render.png` applies **Needle AgX**, exposure 1, sRGB and the viewer's light
backdrop; `render-rtx-ldr.png` retains the renderer's separate LDR output.
The worker fails on input checksum mismatches, invalid HDR or shader/runtime
errors. It registers USD schemas and the wheel's DLL directories before loading
the scene. The standalone worker explicitly destroys the renderer and exits
after flushing files to avoid the pinned SDK's interpreter-teardown hang.

## Material probes on this Mac

The installed SDK is
`usd-wasm/.cache/mdl-reference/MDL-SDK-2026.0.2-391700.2276-macosx-aarch64`.
Its `df_native-local-jit` copy was separately signed during the earlier setup
and is ready to use. No new signing or security change is needed:

```sh
python3 usd-wasm/scripts/render-mdl-sdk.py \
  --sdk usd-wasm/.cache/mdl-reference/MDL-SDK-2026.0.2-391700.2276-macosx-aarch64 \
  --bundle usd-wasm/.cache/mdl-reference/gallery \
  --out usd-wasm/.cache/mdl-reference/gallery-macos
```

The script renders both states of all six authored materials through NVIDIA's CPU MDL renderer,
using the exact typed parameters extracted from USD. It preserves per-material
logs, commands, image hashes and exit codes. The SDK's sphere and environment
differ from the USD scene; use these images to check material compilation and
evaluation, and use the Windows scene captures for the fixture's appearance.

If setting up a new SDK copy, the original NVIDIA macOS example needs JIT and
library-loading entitlements. The previously used, scoped setup command is
`bash /Users/herbst/.codex/reports/usd-viewer-2026-10-28/test-macos-mdl-jit.sh`.
That one-time script requires `df_native-local-jit` not to exist; do not rerun it
over the working copy. It copies and signs only that executable. The original
SDK executable and global macOS settings are unchanged.

## References

The checked-in scene references are in
[`lighting-mdl/references`](../usd-wasm/tests/fixtures/coverage/lighting-mdl/references/).
Each scene has `effect = enabled / disabled` variants on `/World/Looks/MDL`.
The native `*-disabled.png` images use the same mesh, camera and light as the
enabled images. Collection checks the visible image change in the central
subject region and fails if the named effect is negligible. The normal fixture
uses a 512² normalized tangent-space relief on a flat panel, torus and UV spheres;
the control sets only normal strength to zero. Clearcoat has a matte base with a
sharp outer coat, color textures have large ceramic tiles, and opacity uses
circular perforations with independent coverage. Metallic controls set metalness
to zero. Browser tests check disabling and restoring each effect in both viewers.

Raw scene captures and material probes remain in the ignored
`usd-wasm/.cache/mdl-reference/` directory. They include commands, logs and
input/output checksums; only reference images and their portable manifest are
checked in.

For a browser comparison choose `/World/Camera`, `neutral` HDR, exposure 1,
Needle AgX and the light background. Native transport and rasterized Beauty can
still differ even with those inputs matched.
