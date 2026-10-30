"""Represent solid UsdLux dome emission with a constant texture for native Storm.

Storm's image-based lighting path requires a texture for specular illumination.
The private overlay preserves the authored color, intensity and transform; the
source layer and its materials are never changed.
"""
from pathlib import Path
from pxr import Sdf, Usd


def textured_dome_reference(stage, destination):
    domes = [prim for prim in stage.Traverse()
             if prim.GetTypeName() == 'DomeLight'
             and not (prim.GetAttribute('inputs:texture:file').Get() or Sdf.AssetPath()).path]
    if not domes:
        return stage, False
    destination = Path(destination)
    texture = destination.parent / 'constant-white.hdr'
    # Linear RGBE white. Uncompressed scanlines are valid Radiance HDR.
    texture.write_bytes(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 32 +X 64\n'
                        + bytes([128, 128, 128, 129]) * 64 * 32)
    layer = Sdf.Layer.FindOrOpen(str(destination)) if destination.exists() else Sdf.Layer.CreateNew(str(destination))
    layer.Clear()
    layer.subLayerPaths = [stage.GetRootLayer().identifier]
    reference = Usd.Stage.Open(layer)
    for key in ['upAxis', 'metersPerUnit', 'startTimeCode', 'endTimeCode',
                'timeCodesPerSecond', 'framesPerSecond']:
        if stage.HasAuthoredMetadata(key):
            reference.SetMetadata(key, stage.GetMetadata(key))
    default = stage.GetDefaultPrim()
    if default:
        reference.SetDefaultPrim(reference.GetPrimAtPath(default.GetPath()))
    for dome in domes:
        reference.OverridePrim(dome.GetPath()).CreateAttribute(
            'inputs:texture:file', Sdf.ValueTypeNames.Asset).Set(Sdf.AssetPath(str(texture)))
    layer.Save()
    return reference, True
