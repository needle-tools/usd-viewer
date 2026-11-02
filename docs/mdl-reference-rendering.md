# Native MDL references

The browser approximates known MDL inputs. Use the native tools below to render
the original MDL definitions. An NVIDIA RTX renderer can render complete USD scenes;
the macOS SDK renders material probes on a sphere. Storm does not evaluate MDL.

The six MDL gallery fixtures include unmodified NVIDIA material definitions,
their imports, BSD licenses and checksums in
[`mdl-sources.json`](../usd-wasm/tests/fixtures/coverage/lighting-mdl/mdl-sources.json).
Regeneration verifies these files rather than overwriting them.

## Prepare the inputs

From the repository root, use Python with native OpenUSD bindings available
(`python3 -c "from pxr import Usd"` should succeed):

```sh
python3 \
  usd-wasm/scripts/prepare-mdl-references.py
```

This writes `usd-wasm/.cache/mdl-reference/gallery/`: enabled/disabled scene overlays for six materials,
original fixture geometry, NVIDIA modules, textures, the viewer's `neutral.hdr`,
SDK material wrappers and input checksums. The overlays use `/World/Camera`,
640 × 480, HDR illumination only, 256 samples, eight bounces and no denoising.
Use `--width`, `--height`, `--samples` or `--out` to change those values.
The source fixtures remain unchanged.

## Complete USD scenes on an RTX host

The reference captures use `ovrtx 0.5.1.385782` and `ovstage 0.2.1.385922`
in a Windows Python virtual environment. The commands below use `renderer-host`
as an SSH alias and `D:\mdl-reference` as a workspace; replace these with your host
and directory. Install the renderer packages in `ovrtx-venv` before running them.

```sh
scp -r usd-wasm/.cache/mdl-reference/gallery \
  'renderer-host:D:/mdl-reference/'
scp usd-wasm/scripts/render-mdl-rtx.py usd-wasm/scripts/render-mdl-rtx-batch.ps1 \
  usd-wasm/scripts/ovstage_mdl_audit.py 'renderer-host:D:/mdl-reference/'
ssh renderer-host 'powershell -NoProfile -File D:\mdl-reference\render-mdl-rtx-batch.ps1 -Bundle D:\mdl-reference\gallery -Out D:\mdl-reference\gallery-results -Python D:\mdl-reference\ovrtx-venv\Scripts\python.exe'
scp -r 'renderer-host:D:/mdl-reference/gallery-results' \
  usd-wasm/.cache/mdl-reference/
python3 usd-wasm/scripts/collect-mdl-references.py \
  --captures usd-wasm/.cache/mdl-reference/gallery-results
```

For one scene, run the worker directly through SSH:

```sh
ssh renderer-host 'D:\mdl-reference\ovrtx-venv\Scripts\python.exe D:\mdl-reference\render-mdl-rtx.py --stage D:\mdl-reference\gallery\mdl-normal-texture-rtx.usda --out D:\mdl-reference\gallery-results\mdl-normal-texture --verify-inputs D:\mdl-reference\gallery\inputs.json'
```

Each capture retains the linear HDR output, primary depth, native log and hashes.
`render.png` applies **Needle AgX**, exposure 1, sRGB and the viewer's light
backdrop; `render-rtx-ldr.png` retains the renderer's separate LDR output.
The worker fails on input checksum mismatches, invalid HDR or shader/runtime
errors and saves the logs alongside each capture.

## Material probes on macOS

Set `MDL_SDK_ROOT` to an extracted NVIDIA MDL SDK directory. The material probes
were captured with SDK `2026.0.2-391700.2276`. On macOS, prepare the signed example
copy described below, then run:

```sh
python3 usd-wasm/scripts/render-mdl-sdk.py \
  --sdk "$MDL_SDK_ROOT" \
  --bundle usd-wasm/.cache/mdl-reference/gallery \
  --out usd-wasm/.cache/mdl-reference/gallery-macos
```

The script renders both states of all six authored materials through NVIDIA's CPU MDL renderer,
using the exact typed parameters extracted from USD. It preserves per-material
logs, commands, image hashes and exit codes. The SDK's sphere and environment
differ from the USD scene; use these images to check material compilation and
evaluation, and use the Windows scene captures for the fixture's appearance.

The macOS example needs permission to execute JIT code and load the SDK libraries.
Sign a separate copy of the example executable once. These commands leave the
original executable and system security settings unchanged:

```sh
(
set -eu
example_dir="$MDL_SDK_ROOT/examples/mdl_sdk/df_native"
test ! -e "$example_dir/df_native-local-jit"
cp -p "$example_dir/df_native" "$example_dir/df_native-local-jit"
cat > /tmp/mdl-jit-entitlements.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
</dict></plist>
PLIST
codesign --force --sign - --options runtime --timestamp=none \
  --entitlements /tmp/mdl-jit-entitlements.plist "$example_dir/df_native-local-jit"
codesign --verify --strict "$example_dir/df_native-local-jit"
)
```

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
