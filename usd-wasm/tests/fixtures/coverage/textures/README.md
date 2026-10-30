# Texture formats

- KTX2 Mosaic: original ceramic artwork encoded as UASTC with mipmaps and sRGB metadata.
- EXR Neon: original linear RGB scanline OpenEXR, with authored texel values up to 6, used as surface emission.
- PNG, JPEG and TGA: different vessels with three original tiled patterns.

Generate with native USD/Pillow and Khronos `ktx` using
`scripts/generate-production-texture-fixtures.py`. The viewer decodes the actual
KTX2. For native Storm thumbnails, `native_texture_reference.py` extracts that
KTX2 into an equivalent private PNG because installed Storm/OIIO lacks a KTX2
plugin. The original scene retains its KTX2 reference. Solid domes similarly use
an equivalent constant HDR texture for native Storm's image-based lighting path.
