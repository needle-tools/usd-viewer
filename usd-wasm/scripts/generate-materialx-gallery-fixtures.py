#!/usr/bin/env python3
"""Package the existing MaterialX procedural volume and nodegraph examples as USD stages."""
from pathlib import Path
import argparse, importlib.util, json, re, shutil
import xml.etree.ElementTree as ET
from pxr import Gf, Sdf, Usd, UsdGeom, UsdLux, UsdShade

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tests/fixtures/coverage/materialx'
SOURCE=Path('/Users/herbst/git/needle-engine-dev/modules/needle-engine/modules/needle-engine-materialx/tests/three/examples/pr-repros')
spec=importlib.util.spec_from_file_location('shading_fixtures',ROOT/'scripts/generate-shading-coverage-fixtures.py')
shading=importlib.util.module_from_spec(spec);spec.loader.exec_module(shading)
CASES=[
 ('ember-torus','Ember torus','volumes',['MaterialX','volume','absorption_vdf','uniform_edf','object-space toroidal density']),
 ('jade-plume','Jade plume','volumes',['MaterialX','volume','anisotropic_vdf','curved density field','single scattering']),
 ('violet-lattice','Violet lattice','volumes',['MaterialX','volume','anisotropic_vdf','periodic lattice density','emission']),
 ('nested','Electric zebra','nodegraph-implementations',['MaterialX','nested custom nodedef','interface forwarding','noise-warped bands']),
 ('multi-output-uv','Cartographic grid','nodegraph-implementations',['MaterialX','custom multi-output nodedef','named output routing','UV grid']),
 ('two-instances','Violet woven silk','nodegraph-implementations',['MaterialX','multiple custom node instances','independent interface defaults','woven pattern']),
 ('wrapped-standard_surface','Copper patina','nodegraph-implementations',['MaterialX','custom surfaceshader implementation','wrapped standard_surface','interface defaults']),
 ('filename-interface-colorspace','Indigo dragon scales','nodegraph-implementations',['MaterialX','filename interface','sRGB texture color space','custom image node']),
 ('explicit-version','Mint ribs','nodegraph-implementations',['MaterialX','versioned nodedef','explicit version selection','procedural ribs']),
]

def xform(obj,position=None,scale=None):
 x=UsdGeom.Xformable(obj)
 if position:x.AddTranslateOp().Set(position)
 if scale:x.AddScaleOp().Set(scale)


def build(name,label,kind,features):
 out=OUT/(name+'.usda')
 st=Usd.Stage.CreateNew(str(out)) if not out.exists() else Usd.Stage.Open(str(out));st.GetRootLayer().Clear()
 world=UsdGeom.Xform.Define(st,'/World');st.SetDefaultPrim(world.GetPrim());UsdGeom.SetStageUpAxis(st,'Y');UsdGeom.SetStageMetersPerUnit(st,1)
 st.SetMetadata('documentation',label+'; '+', '.join(features)+'.')
 reference=st.DefinePrim('/World/MaterialX');reference.GetReferences().AddReference('./graphs/'+name+'.mtlx','/MaterialX')
 materials=[p for p in Usd.PrimRange(reference) if p.IsA(UsdShade.Material)]
 assert len(materials)==1,(name,materials)
 mat=UsdShade.Material(materials[0]);isvolume=kind=='volumes'
 if isvolume:
  # A closed, outward-facing proxy. The density graph uses object coordinates in [-1,1].
  obj=UsdGeom.Mesh.Define(st,'/World/Medium')
  obj.CreatePointsAttr([(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)])
  obj.CreateFaceVertexCountsAttr([4]*6);obj.CreateFaceVertexIndicesAttr([0,3,2,1,4,5,6,7,0,1,5,4,3,7,6,2,0,4,7,3,1,2,6,5]);obj.CreateSubdivisionSchemeAttr('none')
 else:
  obj=shading.mesh(st,'/World/Artifact','sphere',(0,0,0),1)
  UsdGeom.Xformable(obj).AddRotateXOp().Set(-90)
 UsdShade.MaterialBindingAPI.Apply(obj.GetPrim()).Bind(mat)
 # Small stage furniture gives scale; it is not a fallback for the featured graph.
 plinth=UsdGeom.Cylinder.Define(st,'/World/Plinth');plinth.CreateRadiusAttr(1.18);plinth.CreateHeightAttr(.12);plinth.CreateAxisAttr('Y');xform(plinth,(0,-1.12,0))
 plinthmat,_=shading.preview(st,'/World/PlinthFinish',(.025,.035,.055),.32)
 UsdShade.MaterialBindingAPI.Apply(plinth.GetPrim()).Bind(plinthmat)
 light=UsdLux.DistantLight.Define(st,'/World/Key');light.CreateIntensityAttr(4 if isvolume else 2)
 # Normalized distant lights author illuminance, rather than solar-disc luminance.
 light.CreateNormalizeAttr(True)
 UsdGeom.Xformable(light).AddRotateXYZOp().Set((-25,-35,0))
 fill=UsdLux.DomeLight.Define(st,'/World/Fill');fill.CreateIntensityAttr(.28)
 camera=UsdGeom.Camera.Define(st,'/World/Camera');camera.CreateFocalLengthAttr(50);camera.CreateHorizontalApertureAttr(24);camera.CreateVerticalApertureAttr(24)
 eye=Gf.Vec3d(.2,.15,5.8) if isvolume else Gf.Vec3d(2,.7,5.5)
 UsdGeom.Xformable(camera).AddTransformOp().Set(Gf.Matrix4d().SetLookAt(eye,Gf.Vec3d(0,-.05,0),Gf.Vec3d(0,1,0)).GetInverse())
 st.GetRootLayer().Save()
 return out


def validate(path,kind):
 st=Usd.Stage.Open(str(path));assert st and not st.GetCompositionErrors(),path
 obj=st.GetPrimAtPath('/World/Medium' if kind=='volumes' else '/World/Artifact')
 mat=UsdShade.MaterialBindingAPI(obj).ComputeBoundMaterial()[0];assert mat
 terminal=mat.GetVolumeOutput('mtlx') if kind=='volumes' else mat.GetSurfaceOutput('mtlx')
 assert terminal and terminal.HasConnectedSource(),(path,mat.GetPath())
 assert not mat.GetSurfaceOutput().HasConnectedSource(),(path,'unexpected fallback')
 connections=0
 for p in st.Traverse():
  for a in p.GetAttributes():
   for target in a.GetConnections():assert st.GetAttributeAtPath(target),(a.GetPath(),target);connections+=1
 return {'opens':True,'compositionErrors':[],'boundMaterial':str(mat.GetPath()),'terminal':str(terminal.GetAttr().GetPath()),'connectionCount':connections}


def main():
 parser=argparse.ArgumentParser();parser.add_argument('--validate-only',action='store_true');args=parser.parse_args()
 OUT.mkdir(parents=True,exist_ok=True);(OUT/'graphs').mkdir(exist_ok=True)
 manifest=[];results=[]
 for name,label,kind,features in CASES:
  source=SOURCE/kind/(name+'.mtlx');graph=OUT/'graphs'/(name+'.mtlx')
  if not args.validate_only:
   text=source.read_text();text=re.sub(r'<!--.*?-->','',text,flags=re.S);graph.write_text(text)
  deps=[]
  for inp in ET.parse(graph).getroot().iter('input'):
   if inp.get('type')=='filename' and inp.get('value'):
    filename=inp.get('value');assert not Path(filename).is_absolute()
    if not args.validate_only:shutil.copy2(source.parent/filename,graph.parent/filename)
    deps.append('coverage/materialx/graphs/'+filename)
  path=OUT/(name+'.usda') if args.validate_only else build(name,label,kind,features)
  evidence=validate(path,kind);results.append({'id':'materialx-'+name,'root':'coverage/materialx/'+name+'.usda',**evidence})
  manifest.append({'id':'materialx-'+name,'label':label,'group':'MaterialX Volumes' if kind=='volumes' else 'MaterialX Graphs','root':'coverage/materialx/'+name+'.usda','files':['coverage/materialx/'+name+'.usda','coverage/materialx/graphs/'+name+'.mtlx']+sorted(set(deps)),'features':features,'renderer':'bounded-volume' if kind=='volumes' else 'surface','scenePrimitiveLightIntensityScale':1,'expected':{'native':'USD composition and volume/surface terminal are valid; Storm does not implement MaterialX bounded-medium transport.' if kind=='volumes' else 'Native USD material reference and graph composition are valid.','needle':'Requires the bounded-volume renderer with WebGPURenderer, forceWebGL or WebGPU, single-sample depth, and materialXVolumeFactory.' if kind=='volumes' else 'Must compile the authored custom nodedef graph, preserving interface and named-output semantics.'},'assertions':evidence})
 if not args.validate_only:(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 (OUT/'native-validation.json').write_text(json.dumps({'openusdVersion':list(Usd.GetVersion()),'results':results},indent=2)+'\n')
 print('Validated',len(results),'referenced MaterialX gallery roots')
if __name__=='__main__':main()
