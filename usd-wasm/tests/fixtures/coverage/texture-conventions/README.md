# Texture conventions

Conformance scenes for texture orientation, UV transforms, image formats,
packaging and color spaces. Each scene is a unit quad (UV 0,0 at its
bottom-left) with an unlit material, so a correct renderer shows every texture
value directly. The expected value at each sample point comes from the USD and
MaterialX specifications and is stored in [the manifest](manifest.json); no
renderer serves as the reference.

| Group | Covers |
| --- | --- |
| Texture orientation | UsdUVTexture with UsdTransform2d translation, rotation, scale and wrap modes, including unauthored wrap modes; MaterialX `image` with default, explicit and geomprop texture coordinates, address modes, `tiledimage`, `place2d` in both operation orders, `hextiledimage`, `gltf_image`, MaterialX's UsdUVTexture and UsdTransform2d nodes, texture coordinates shown as color, and a second UV set |
| Texture orientation: formats | 16-bit PNG, JPEG, TGA with top-left and bottom-left origins, float EXR, and KTX2 with top-left and bottom-left orientation, through both UsdPreviewSurface and MaterialX |
| Texture color spaces | `sourceColorSpace` sRGB, raw and auto (8-bit RGB, 8-bit gray, float); `colorSpace` metadata on the file; MaterialX file color spaces by MaterialX and OpenUSD names, including Display P3 and ACEScg; a color space applied with UsdColorSpaceAPI to an enclosing NodeGraph; color values with a color space |
| Texture packaging | The same scenes packaged as USDZ, and a package whose material layer lives in a subfolder |

## Conventions the expectations follow

- USD `st` (0,0) and MaterialX `texcoord` (0,0) address the image's bottom-left.
- UsdTransform2d: `R(rotation) · (scale · in) + translation`, counter-clockwise
  degrees, no pivot (`UsdTransform2d.osl`).
- MaterialX `tiledimage`: `image(texcoord · uvtiling − uvoffset)`. `place2d` and
  `gltf_image` follow their stdlib node graphs. `rotate2d` follows the
  implementation, which turns clockwise for positive angles although the
  specification text says counter-clockwise (MaterialX issue #2154).
- `sourceColorSpace` `auto` (UsdPreviewSurface specification) first uses the
  image's own gamma or color space metadata (PNG `sRGB`, `iCCP` named sRGB, `gAMA`),
  then decodes sRGB only for 8-bit images with three or four channels, whatever
  input the texture feeds. Single-channel and float images are used as stored.
- A UsdUVTexture's color space is its `sourceColorSpace` when that is sRGB or raw,
  else the asset's `colorSpace` metadata, else UsdColorSpaceAPI on an enclosing
  prim, else `auto`. The specifications leave this precedence open; OpenUSD's
  scene-index implementation lets an authored `auto` win instead
  (see [OpenUSD #4072](https://github.com/PixarAnimationStudios/OpenUSD/issues/4072)).
  OpenUSD's `unknown` and `identity` mean `auto`.
- Unauthored UsdUVTexture wrap modes are `useMetadata`, which the specification
  resolves to the file's own wrap opinion, else black. PNG and JPEG have none.
  MaterialX's own `ND_UsdUVTexture_23` defaults to `periodic` instead.
- KTX2 files are RGBA8 (`--target_type RGBA`), stored top-left first (`rd`) or
  bottom-left first (`ru`).
- MaterialX `constant` addressing returns the image's `default` value.
- Color spaces convert to linear Rec.709; Display P3 and ACEScg use the MaterialX
  cmlib matrices. Color space names are the MaterialX names, including the
  `*_scene` names MaterialX shares with OpenUSD.
- An image's `default` keeps its own color space; the file's color space applies
  to the file's texels only.

## Native Storm

Storm is a comparison, not the reference. The manifest records each known Storm
difference as `stormDeviation`:

- Storm has no KTX2 reader.
- Storm applies only `sRGB` and `raw` to UsdUVTexture; other color space names
  fall back to `auto` without a gamut conversion.
- Storm does not convert UsdPreviewSurface color values from their color space.
- Storm samples MaterialX `constant` addressing as transparent black.
- HdMtlx cannot generate MaterialX's `UsdPrimvarReader_vector2` in Storm 26.05.

## MaterialXView

MaterialXView from MaterialX `main` is a second comparison for the MaterialX
scenes: render each material as a standalone `.mtlx` document on a quad and
check the same manifest sample points. It
matches the specification except:

- MaterialXView converts an image's `default` with the file's color space
  (see [the constant-addressing scene](orient-mx-address-constant-periodic.usda)).
- An OBJ mesh has one unnamed UV set, so scenes that read the USD primvars `st`
  or `st1` cannot be rendered.
- MaterialX has no KTX2 reader, and reads EXR only when built with OpenImageIO.

## Regeneration

From `usd-wasm`, with the native OpenUSD Python that includes MaterialX:

```sh
PYTHONPATH=<native OpenUSD>/lib/python python3 scripts/generate-texture-convention-fixtures.py
```

`--storm` also renders every scene with `usdrecord` and writes a comparison to
`.cache/texture-conventions/storm-report.json`. It stops unless usdrecord
reports `HdStormRendererPlugin`: an install that registers other Hydra renderers
can select one of them even when Storm is requested. `USD_STORM_ROOT` selects
the install and `USD_STORM_ARCH=x86_64` runs an Intel build under Rosetta.

Browser checks: `tests/public-viewer/texture-conventions.spec.ts` renders each
scene in three.js (WebGPU and its WebGL backend) and Needle Engine and compares
every sample with the manifest.
