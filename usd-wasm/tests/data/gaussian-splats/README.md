# Gaussian splat fixture

`chamaeleon.usdc` is a 10,000-particle, degree-3 spherical-harmonics
`ParticleField3DGaussianSplat` generated from a 3D Gaussian Splatting PLY.

Regenerate the text layer before converting it to USDC:

```sh
node scripts/convert-3dgs-ply-to-usda.mjs input.ply chamaeleon.usda
usdcat chamaeleon.usda -o chamaeleon.usdc
usdchecker chamaeleon.usdc
```

The converter maps the common 3DGS PLY representation to the OpenUSD schema:

- logarithmic PLY scales become linear `scales`
- opacity logits become linear `opacities`
- PLY quaternions become USD `(real, imaginary)` `quatf` values
- channel-major `f_rest_*` values become per-particle RGB SH coefficients

OpenUSD 26.05 validates and opens this stage. Storm currently displays only its
extent because Storm does not implement the Hydra `particleField` Rprim; that is
not evidence of an invalid fixture. A particle-field-capable render delegate is
required to render the splats.

Verify the native hdPrman path with the x86_64 OpenUSD reference build:

```sh
./scripts/verify-native-prman-splats.sh
```

The command validates the stage, renders it through `HdPrmanLoaderRendererPlugin`,
rejects renderer diagnostics, and checks the resulting foreground and color data.
hdPrman uses OpenUSD's particle-field-to-points conversion, including the authored
positions, scale-derived Gaussian support widths, and spherical-harmonics color.
