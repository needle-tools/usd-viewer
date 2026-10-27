# MaterialX preview geometry

`needle-shaderball.usdc` is converted from Needle Engine's shader-ball asset:

https://cdn.needle.tools/static/models/shaderball.glb

The conversion uses the native Adobe glTF file-format plugin:

```sh
usdcat shaderball.glb -o needle-shaderball.usdc
```

The MaterialX preview wrapper binds the dropped material to `PreviewMesh` only.
`CalibrationMesh` keeps its authored material, matching Needle Engine's ShaderBall
primitive.
