"""Prepare portable RTX scene references and MDL SDK material probes.

Run with native OpenUSD Python. Source fixtures and materials are not modified.
The bundle may be copied to Windows and rendered by render-mdl-rtx.py.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
from pxr import Gf, Sdf, Usd, UsdGeom, UsdLux, UsdRender, UsdShade

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / 'tests/fixtures/coverage/lighting-mdl'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def attr(prim, name, kind, value):
    prim.CreateAttribute(name, kind).Set(value)


def prepare(out, width, height, samples):
    out.mkdir(parents=True, exist_ok=True)
    entries = [entry for entry in json.loads((FIXTURES/'manifest.json').read_text()) if entry['group']=='MDL']
    # Include imported MDL modules as well as USD's direct asset dependencies.
    for entry in entries:
        for name in entry['files']:
            source = ROOT / 'tests/fixtures' / name
            target = out / source.relative_to(FIXTURES)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
    shutil.copyfile(ROOT.parent/'public/environments/neutral.hdr', out/'neutral.hdr')
    imports = ['mdl 1.8;', 'import ::tex::*;', 'import ::base::*;']
    probes = []
    records = []
    for entry in entries:
        name = Path(entry['root']).stem
        source = out/(name+'.usda')
        original = Usd.Stage.Open(str(source))
        effect=original.GetPrimAtPath('/World/Looks/MDL').GetVariantSet('effect')
        for choice in ('enabled','disabled'):
            effect.SetVariantSelection(choice)
            render_name=name if choice=='enabled' else name+'-disabled'
            shader = UsdShade.Shader(original.GetPrimAtPath('/World/Looks/MDL/Shader'))
            module = Path(shader.GetSourceAsset('mdl').path).stem
            definition = str(shader.GetSourceAssetSubIdentifier('mdl'))
            imports.append(f'import ::{module}::*;')
            values = []
            for inp in shader.GetInputs():
                key, value = inp.GetBaseName(), inp.Get()
                if isinstance(value, Sdf.AssetPath):
                    gamma = 'gamma_srgb' if key=='diffuse_texture' else 'gamma_linear'
                    literal = f'texture_2d({json.dumps(value.path)}, ::tex::{gamma})' if value.path else 'texture_2d()'
                elif key=='opacity_mode':
                    literal = '::base::mono_average'
                elif isinstance(value, bool): literal = 'true' if value else 'false'
                elif isinstance(value, (int, float)): literal = str(value)
                else: literal = 'color('+', '.join(str(v) for v in value)+')'
                values.append(f'    {key}: {literal}')
            probes.append(f'export material {render_name.replace("-", "_")}() = ::{module}::{definition}(\n'+',\n'.join(values)+'\n);')
            stage = Usd.Stage.CreateNew(str(out/(render_name+'-rtx.usda')))
            stage.GetRootLayer().subLayerPaths = [name+'.usda']
            stage.OverridePrim('/World/Looks/MDL').GetVariantSets().GetVariantSet('effect').SetVariantSelection(choice)
            camera = UsdGeom.Camera(stage.GetPrimAtPath('/World/Camera'))
            camera.CreateHorizontalApertureAttr(36)
            camera.CreateVerticalApertureAttr(36*height/width)
            for key, value in [('exposure',0),('exposure:fStop',1),('exposure:iso',100),('exposure:time',1),('exposure:responsivity',1)]:
                attr(camera.GetPrim(),key,Sdf.ValueTypeNames.Float,value)
            attr(camera.GetPrim(),'omni:rtx:autoExposure:enabled',Sdf.ValueTypeNames.Bool,False)
            dome = UsdLux.DomeLight.Define(stage,'/Reference/Environment')
            dome.CreateTextureFileAttr(Sdf.AssetPath('./neutral.hdr')); dome.CreateTextureFormatAttr('latlong')
            dome.CreateIntensityAttr(1)
            # Direction calibration of the pinned RTX renderer against neutral.hdr.
            rotation=Gf.Matrix4d().SetRotate(Gf.Rotation(Gf.Vec3d(1,0,0),-90))*Gf.Matrix4d().SetRotate(Gf.Rotation(Gf.Vec3d(0,1,0),180))
            dome.AddTransformOp().Set(rotation)
            attr(dome.GetPrim(),'visibleInPrimaryRay',Sdf.ValueTypeNames.Bool,False)
            attr(dome.GetPrim(),'omni:rtx:domeLight:mode',Sdf.ValueTypeNames.Token,'infinite')
            settings = UsdRender.Settings.Define(stage,'/ReferenceRender/Settings')
            attr(settings.GetPrim(),'renderingColorSpace',Sdf.ValueTypeNames.Token,'lin_rec709_scene')
            stage.SetMetadata('renderSettingsPrimPath','/ReferenceRender/Settings')
            product=UsdRender.Product.Define(stage,'/ReferenceRender/Camera')
            product.CreateCameraRel().SetTargets([camera.GetPath()]); product.CreateResolutionAttr(Gf.Vec2i(width,height))
            settings.CreateProductsRel().SetTargets([product.GetPath()])
            for key, kind, value in [('omni:rtx:rendermode',Sdf.ValueTypeNames.Token,'PathTracing'),('omni:rtx:pt:samplesPerPixel',Sdf.ValueTypeNames.UInt,samples),('omni:rtx:pt:limits:maxBounces',Sdf.ValueTypeNames.UInt,8),('omni:rtx:pt:denoising:enabled',Sdf.ValueTypeNames.Bool,False),('omni:rtx:pt:adaptiveSampling:enabled',Sdf.ValueTypeNames.Bool,False),('omni:rtx:pt:radianceCache:enabled',Sdf.ValueTypeNames.Bool,False),('omni:rtx:autoExposure:enabled',Sdf.ValueTypeNames.Bool,False),('omni:rtx:post:tonemap:operator',Sdf.ValueTypeNames.Token,'none')]:
                attr(product.GetPrim(),key,kind,value)
            variables=[]
            for key in ('LdrColor','HdrColor','DistanceToCameraSD'):
                var=UsdRender.Var.Define(stage,str(product.GetPath())+'/'+key);var.CreateSourceNameAttr(key);variables.append(var.GetPath())
            product.CreateOrderedVarsRel().SetTargets(variables)
            stage.GetRootLayer().Save()
            records.append({'name':render_name,'fixture':name,'effect':choice,'stage':render_name+'-rtx.usda','sourceSha256':digest(source),'module':module,'definition':definition})
    (out/'fixture_reference.mdl').write_text('\n'.join(dict.fromkeys(imports))+'\n\n'+'\n\n'.join(probes)+'\n')
    (out/'scenes.json').write_text(json.dumps({'resolution':[width,height],'samples':samples,'scenes':records},indent=2)+'\n')
    inputs={str(path.relative_to(out)).replace('\\','/'):digest(path) for path in sorted(out.rglob('*')) if path.is_file() and path.name!='inputs.json'}
    (out/'inputs.json').write_text(json.dumps(inputs,indent=2)+'\n')
    print(f'Prepared {len(records)} real-MDL scenes and SDK probes in {out}')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',type=Path,default=ROOT/'.cache/mdl-reference/gallery')
    parser.add_argument('--width',type=int,default=640);parser.add_argument('--height',type=int,default=480)
    parser.add_argument('--samples',type=int,default=256)
    args=parser.parse_args();prepare(args.out.resolve(),args.width,args.height,args.samples)
