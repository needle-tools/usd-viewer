#!/usr/bin/env python3
"""Native Storm companion-scene card for the VDB volume-light fixture.

Native Storm in the local OpenUSD build has no VDB field plugin. An anonymous
change would be lost by usdrecord, so save a temporary session-style layer that
sublayers the original stage and deactivates only the unsupported volume/field.
The resulting image is explicitly indexed as a companion scene, not volume light
transport. The authored fixture is never modified.
"""
import hashlib, importlib.util, json
from pathlib import Path
from types import SimpleNamespace
from pxr import Usd

root=Path(__file__).resolve().parents[1]
fixture=root/'tests/fixtures/coverage/lighting-mdl/volume-light.usda'
work=root/'.cache/coverage-thumbnails/volume-light-companion';work.mkdir(parents=True,exist_ok=True)
layer=work/'companion.usda'
if layer.exists():layer.unlink()
stage=Usd.Stage.CreateNew(str(layer));stage.GetRootLayer().subLayerPaths=[str(fixture)]
for prim in ('/World/GlowVolume','/World/GlowDensity'):stage.OverridePrim(prim).SetActive(False)
stage.GetRootLayer().Save()
spec=importlib.util.spec_from_file_location('capture',root/'scripts/render-coverage-thumbnails.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
entry=next(x for x in json.loads((fixture.parent/'manifest.json').read_text()) if x['id']=='lighting-mdl-volume-light');entry['root']=str(layer)
options=SimpleNamespace(helper=str(Path.home()/'git/usd-thumbnail-generator/generate_thumbnail.py'),usdrecord=str(Path.home()/'OpenUSD-26.05-native/bin/usdrecord'),force=True,width=448)
result=module.render((entry,options));assert result['status']=='rendered' and result['capture']=='surface',result
result['capture']='companion scene only; VDB volume and volume light transport omitted because native Storm has no VDB plugin'
record=root/'.cache/coverage-thumbnails/lighting-mdl-volume-light/capture.json';record.write_text(json.dumps(result,indent=2)+'\n')
index=root/'tests/fixtures/coverage/native-captures.json';data=json.loads(index.read_text());image=root/'tests/fixtures/thumbnails/lighting-mdl-volume-light.png'
row=next(x for x in data['results'] if x['id']==entry['id']);row.update(renderer='Storm',camera='/Camera',capture=result['capture'],sha256=hashlib.sha256(image.read_bytes()).hexdigest())
index.write_text(json.dumps(data,indent=2)+'\n');print(result['capture'])
