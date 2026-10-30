"""Decode KTX2 into an equivalent private image for native Storm captures.

Installed Storm/OIIO has no KTX2 image plugin. Khronos ktx extracts the actual
compressed image; the original stage keeps its KTX2 asset reference.
"""
from pathlib import Path
import hashlib, shutil, subprocess
from pxr import Usd, Sdf


def decoded_texture_reference(stage, destination):
    replacements = []
    for prim in stage.Traverse():
        attribute = prim.GetAttribute('inputs:file')
        if not attribute or str(attribute.GetTypeName()) != 'asset':
            continue
        value = attribute.Get()
        if value and value.path.lower().endswith('.ktx2'):
            replacements.append((attribute.GetPath(), value.resolvedPath))
    if not replacements:
        return stage, False
    tool = shutil.which('ktx')
    if not tool:
        raise RuntimeError('KTX2 native captures require Khronos ktx extract.')
    destination = Path(destination)
    layer = Sdf.Layer.FindOrOpen(str(destination)) if destination.exists() else Sdf.Layer.CreateNew(str(destination))
    layer.Clear(); layer.subLayerPaths = [stage.GetRootLayer().identifier]
    reference = Usd.Stage.Open(layer)
    for key in ['upAxis','metersPerUnit','startTimeCode','endTimeCode','timeCodesPerSecond','framesPerSecond']:
        if stage.HasAuthoredMetadata(key): reference.SetMetadata(key, stage.GetMetadata(key))
    if stage.GetDefaultPrim(): reference.SetDefaultPrim(reference.GetPrimAtPath(stage.GetDefaultPrim().GetPath()))
    for path, source in replacements:
        if not source: raise RuntimeError(f'Unresolved KTX2 reference: {path}')
        image = destination.parent / (hashlib.sha256(Path(source).read_bytes()).hexdigest()[:16] + '.png')
        subprocess.run([tool,'extract','--transcode','rgba8',source,str(image)],check=True,capture_output=True)
        reference.OverridePrim(path.GetPrimPath()).CreateAttribute(path.name, Sdf.ValueTypeNames.Asset).Set(Sdf.AssetPath(str(image)))
    layer.Save()
    return reference, True
