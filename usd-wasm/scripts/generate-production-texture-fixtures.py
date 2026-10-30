#!/usr/bin/env python3
"""Small production composition and texture-format scenes, authored with native USD.

Requires native pxr, Pillow and Khronos `ktx` (UASTC encoding). All art is generated
here; textures and source geometry are original. Rerunning touches only these suites.
"""
import json, math, struct, subprocess
from pathlib import Path
from PIL import Image, ImageDraw
from pxr import Usd, UsdGeom, UsdShade, UsdLux, UsdUtils, Sdf, Gf
BASE=Path(__file__).resolve().parents[1]/'tests/fixtures'
PROD=BASE/'coverage/production'; TEX=BASE/'coverage/textures'
for folder in [PROD,TEX]: folder.mkdir(parents=True,exist_ok=True)
C=Sdf.ValueTypeNames.Color3f; F=Sdf.ValueTypeNames.Float
teal=(.035,.54,.5); coral=(.9,.22,.12); gold=(.95,.62,.12); ink=(.055,.09,.12); cream=(.85,.8,.65)

def stage(path,root='/World'):
    layer=Sdf.Layer.FindOrOpen(str(path)) if path.exists() else Sdf.Layer.CreateNew(str(path));layer.Clear()
    s=Usd.Stage.Open(layer);UsdGeom.SetStageUpAxis(s,'Y');UsdGeom.SetStageMetersPerUnit(s,1)
    s.SetDefaultPrim(UsdGeom.Xform.Define(s,root).GetPrim());return s

def pose(g,pos=(0,0,0),scale=(1,1,1),rotation=None):
    x=UsdGeom.XformCommonAPI(g);x.SetTranslate(Gf.Vec3d(*pos));x.SetScale(Gf.Vec3f(*scale))
    if rotation:x.SetRotate(Gf.Vec3f(*rotation))
    return g

def material(s,path,color,rough=.4,metal=0,texture=None,linear=False,emission=False):
    m=UsdShade.Material.Define(s,path);sh=UsdShade.Shader.Define(s,path+'/Surface');sh.CreateIdAttr('UsdPreviewSurface')
    sh.CreateInput('diffuseColor',C).Set(Gf.Vec3f(*(ink if emission else color)));sh.CreateInput('roughness',F).Set(rough);sh.CreateInput('metallic',F).Set(metal)
    if texture:
        uv=UsdShade.Shader.Define(s,path+'/UV');uv.CreateIdAttr('UsdPrimvarReader_float2');uv.CreateInput('varname',Sdf.ValueTypeNames.String).Set('st')
        tx=UsdShade.Shader.Define(s,path+'/Texture');tx.CreateIdAttr('UsdUVTexture');tx.CreateInput('file',Sdf.ValueTypeNames.Asset).Set(Sdf.AssetPath(texture))
        tx.CreateInput('sourceColorSpace',Sdf.ValueTypeNames.Token).Set('raw' if linear else 'sRGB');tx.CreateInput('st',Sdf.ValueTypeNames.Float2).ConnectToSource(uv.CreateOutput('result',Sdf.ValueTypeNames.Float2))
        sh.CreateInput('emissiveColor' if emission else 'diffuseColor',C).ConnectToSource(tx.CreateOutput('rgb',Sdf.ValueTypeNames.Float3))
        for channel in 'rgba':tx.CreateOutput(channel,F)
    m.CreateSurfaceOutput().ConnectToSource(sh.ConnectableAPI(),'surface');return m

def bind(g,m,color):
    UsdShade.MaterialBindingAPI.Apply(g.GetPrim()).Bind(m)
    UsdGeom.Gprim(g).CreateDisplayColorAttr([Gf.Vec3f(*color)])
    return g

def box(s,p,pos,scale,m,color,round=False):
    if round:
        g=UsdGeom.Mesh.Define(s,p)
        g.CreatePointsAttr([Gf.Vec3f(x,y,z) for x,y,z in [(-.5,-.5,-.5),(.5,-.5,-.5),(.5,.5,-.5),(-.5,.5,-.5),(-.5,-.5,.5),(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5)]])
        g.CreateFaceVertexCountsAttr([4]*6);g.CreateFaceVertexIndicesAttr([0,3,2,1,4,5,6,7,0,4,7,3,1,2,6,5,3,7,6,2,0,1,5,4]);g.CreateSubdivisionSchemeAttr('catmullClark')
    else:g=UsdGeom.Cube.Define(s,p)
    if not round:g.CreateSizeAttr(1)
    return bind(pose(g,pos,scale),m,color)

def sphere(s,p,pos,r,m,color,scale=(1,1,1)):
    g=UsdGeom.Sphere.Define(s,p);g.CreateRadiusAttr(r);return bind(pose(g,pos,scale),m,color)

def camera(s,eye,target=(0,1,0),path='/World/Camera'):
    cam=UsdGeom.Camera.Define(s,path);cam.CreateFocalLengthAttr(42);cam.CreateHorizontalApertureAttr(36);cam.CreateVerticalApertureAttr(27)
    cam.AddTransformOp().Set(Gf.Matrix4d().SetLookAt(Gf.Vec3d(*eye),Gf.Vec3d(*target),Gf.Vec3d(0,1,0)).GetInverse())

def lights(s,path='/World/Lights'):
    for name,angle,power,color in [('Key',(-35,-35,0),3,(1,.93,.82)),('Fill',(-15,125,0),.8,(.65,.8,1))]:
        g=UsdLux.DistantLight.Define(s,path+'/'+name);g.CreateNormalizeAttr(True);g.CreateIntensityAttr(power);g.CreateColorAttr(Gf.Vec3f(*color));g.AddRotateXYZOp().Set(Gf.Vec3f(*angle))
    UsdLux.DomeLight.Define(s,path+'/Sky').CreateIntensityAttr(.45)

def save(s):s.GetRootLayer().Save()

# An asset is split into payload geometry and reusable materials. The model
# interface supplies variants; the shot references this interface, not geometry.
looks=stage(PROD/'looks.usda','/Robot')
mats={name:material(looks,'/Robot/Looks/'+name,c,.3,.15) for name,c in [('Teal',teal),('Coral',coral),('Gold',gold),('Ink',ink),('Cream',cream)]};save(looks)
geo=stage(PROD/'geometry.usda','/Robot')
# Binding targets resolve when model.usda composes looks.usda alongside this payload.
get=lambda n:UsdShade.Material(geo.OverridePrim('/Robot/Looks/'+n))
for name,pos,size,col in [('Body',(0,.95,0),(.85,.95,.6),teal),('Head',(0,1.75,0),(1.15,.8,.72),teal)]:box(geo,'/Robot/'+name,pos,size,get('Teal'),col,True)
for i,x in enumerate([-.27,.27]):
    sphere(geo,f'/Robot/Eye{i}',(x,1.83,.34),.15,get('Ink'),ink,(1,1,.5));sphere(geo,f'/Robot/Glint{i}',(x-.035,1.87,.415),.035,get('Cream'),cream)
    box(geo,f'/Robot/Foot{i}',(x,.15,.12),(.32,.3,.58),get('Ink'),ink,True)
    box(geo,f'/Robot/Leg{i}',(x,.42,0),(.19,.48,.22),get('Cream'),cream,True)
for i,x in enumerate([-.62,.62]):
    sphere(geo,f'/Robot/Shoulder{i}',(x,1.2,0),.19,get('Gold'),gold)
    box(geo,f'/Robot/Arm{i}',(x,.85,0),(.24,.6,.28),get('Cream'),cream,True)
    sphere(geo,f'/Robot/Hand{i}',(x,.55,.04),.17,get('Ink'),ink)
box(geo,'/Robot/Mouth',(0,1.53,.36),(.35,.055,.04),get('Ink'),ink)
box(geo,'/Robot/Antenna',(0,2.2,0),(.06,.45,.06),get('Cream'),cream)
sphere(geo,'/Robot/Tip',(0,2.45,0),.13,get('Gold'),gold)
for i in range(3):box(geo,f'/Robot/Chest{i}',((i-1)*.2,1.02,.31),(.1,.1,.05),get('Gold'),gold,True)
# Don't leave placeholder material prims inside the geometry payload: bindings
# may target prims in another contributing layer without defining them here.
geo.RemovePrim('/Robot/Looks');save(geo)
model=stage(PROD/'model.usda','/Robot');model.GetRootLayer().subLayerPaths=['looks.usda'];robot=model.GetPrimAtPath('/Robot');robot.GetPayloads().AddPayload('geometry.usda','/Robot');Usd.ModelAPI(robot).SetKind('component')
variants=robot.GetVariantSets().AddVariantSet('finish')
for name,color in [('Teal',teal),('Coral',coral),('Gold',gold)]:
    variants.AddVariant(name);variants.SetVariantSelection(name)
    with variants.GetVariantEditContext():
        for part in ['Body','Head']:UsdShade.MaterialBindingAPI.Apply(model.OverridePrim('/Robot/'+part)).Bind(UsdShade.Material.Get(model,'/Robot/Looks/'+name))
variants.SetVariantSelection('Teal');save(model)
layout=stage(PROD/'layout.usda')
wood=material(layout,'/World/Looks/Wood',(.3,.16,.08),.55);dark=material(layout,'/World/Looks/Ink',ink,.4);trim=material(layout,'/World/Looks/Trim',gold,.25,.65)
box(layout,'/World/Workbench/Top',(0,.95,0),(5.3,.18,2.2),wood,(.3,.16,.08))
for i,(x,z) in enumerate([(-2.2,-.7),(2.2,-.7),(-2.2,.7),(2.2,.7)]):box(layout,f'/World/Workbench/Leg{i}',(x,.43,z),(.18,1,.18),dark,ink)
for i,(name,x) in enumerate([('Teal',-1.65),('Coral',0),('Gold',1.65)]):
    ref=UsdGeom.Xform.Define(layout,'/World/Robots/'+name).GetPrim();ref.GetReferences().AddReference('model.usda','/Robot');ref.SetInstanceable(True);ref.GetVariantSets().GetVariantSet('finish').SetVariantSelection(name);pose(ref,(x,1.05,0),(.67,.67,.67),(0,-12+i*12,0))
box(layout,'/World/Workbench/Rail',(0,1.1,-.98),(4.9,.13,.13),trim,gold)
for i in range(12):box(layout,f'/World/Workbench/Tick{i}',(-2.2+i*.4,1.049,.9),(.025,.02,.14 if i%3==0 else .07),trim,gold)
box(layout,'/World/Ground',(0,-.18,0),(6.2,.16,3.3),dark,ink);save(layout)
rig=stage(PROD/'lighting.usda');lights(rig);camera(rig,(6,5,8),(0,1.6,0));save(rig)
shot=stage(PROD/'shot.usda');shot.GetRootLayer().subLayerPaths=['lighting.usda','layout.usda'];save(shot)
lookdev=stage(PROD/'lookdev.usda');ref=UsdGeom.Xform.Define(lookdev,'/World/Robot').GetPrim();ref.GetReferences().AddReference('model.usda','/Robot');ref.GetVariantSets().GetVariantSet('finish').SetVariantSelection('Coral')
lights(lookdev);camera(lookdev,(4,2.8,5),(0,1.2,0));ped=material(lookdev,'/World/Looks/Pedestal',ink,.3,.2);box(lookdev,'/World/Pedestal',(0,-.12,0),(2.2,.2,1.8),ped,ink,True);save(lookdev)

# Original texture art: asymmetric ceramic tiles make UV orientation obvious.
def tiles(path,palette,kind=0):
    image=Image.new('RGB',(256,256));d=ImageDraw.Draw(image)
    for y in range(8):
        for x in range(8):
            c=palette[(x+y+kind)%len(palette)];d.rectangle((x*32,y*32,x*32+31,y*32+31),fill=(38,46,49));d.rounded_rectangle((x*32+2,y*32+2,x*32+29,y*32+29),4,fill=c)
            if (x+2*y)%3==0:d.ellipse((x*32+9,y*32+9,x*32+22,y*32+22),fill=palette[(x+y+1)%len(palette)])
    d.polygon([(0,0),(80,0),(0,80)],fill=(245,207,97));image.save(path)
tiles(TEX/'mosaic.png',[(14,142,151),(233,84,40),(231,205,146)])
tiles(TEX/'fabric.jpg',[(49,66,137),(130,157,216),(214,204,183)],1)
tiles(TEX/'signal.tga',[(209,48,69),(247,155,41),(66,50,83)],2)
subprocess.run(['ktx','create','--format','R8G8B8A8_SRGB','--encode','uastc','--generate-mipmap','--assign-tf','srgb','--testrun',str(TEX/'mosaic.png'),str(TEX/'mosaic.ktx2')],check=True)
# Linear 128x64 EXR containing values up to 6: a luminous patterned ribbon.
w,h=128,64
attr=lambda n,t,v:n.encode()+b'\0'+t.encode()+b'\0'+struct.pack('<I',len(v))+v
channels=b''.join(c.encode()+b'\0'+struct.pack('<iB3xii',2,0,1,1) for c in ['B','G','R'])+b'\0';bounds=struct.pack('<iiii',0,0,w-1,h-1)
header=struct.pack('<II',20000630,2)+attr('channels','chlist',channels)+attr('compression','compression',b'\0')+attr('dataWindow','box2i',bounds)+attr('displayWindow','box2i',bounds)+attr('lineOrder','lineOrder',b'\0')+attr('pixelAspectRatio','float',struct.pack('<f',1))+attr('screenWindowCenter','v2f',struct.pack('<ff',0,0))+attr('screenWindowWidth','float',struct.pack('<f',1))+b'\0'
def pixel(x,y):
    level=[.06,.3,1.5,6][min(3,x//32)];on=abs(y-h*.5-12*math.sin(x*.12))<3 or abs(y-12)<1 or abs(y-52)<1
    return tuple(v*(level if on else .012) for v in ((.18,.9,1) if x<64 else (1,.25,.08)))
lines=[];offsets=[];offset=len(header)+8*h
for y in range(h):
    data=struct.pack('<'+str(w*3)+'f',*(pixel(x,y)[c] for c in [2,1,0] for x in range(w)));line=struct.pack('<ii',y,len(data))+data;offsets.append(offset);lines.append(line);offset+=len(line)
(TEX/'neon.exr').write_bytes(header+struct.pack('<'+str(h)+'Q',*offsets)+b''.join(lines))

def lathe(s,path,profile,m,color,offset=(0,0,0),n=64):
    points=[];normals=[]
    for j,(r,y) in enumerate(profile):
        before=profile[max(0,j-1)];after=profile[min(len(profile)-1,j+1)];dr,dy=after[0]-before[0],after[1]-before[1];l=math.hypot(dr,dy)
        for i in range(n):
            a=2*math.pi*i/n;points.append(Gf.Vec3f(r*math.cos(a),y,r*math.sin(a)));normals.append(Gf.Vec3f(dy/l*math.cos(a),-dr/l,dy/l*math.sin(a)))
    ids=[];uv=[]
    for j in range(len(profile)-1):
        for i in range(n):
            ids.extend([j*n+i,(j+1)*n+i,(j+1)*n+(i+1)%n,j*n+(i+1)%n]);uv.extend([(i/n,j/(len(profile)-1)),(i/n,(j+1)/(len(profile)-1)),((i+1)/n,(j+1)/(len(profile)-1)),((i+1)/n,j/(len(profile)-1))])
    g=UsdGeom.Mesh.Define(s,path);g.CreatePointsAttr(points);g.CreateFaceVertexCountsAttr([4]*(len(ids)//4));g.CreateFaceVertexIndicesAttr(ids);g.CreateNormalsAttr(normals);g.SetNormalsInterpolation('vertex');g.CreateSubdivisionSchemeAttr('none');UsdGeom.PrimvarsAPI(g).CreatePrimvar('st',Sdf.ValueTypeNames.TexCoord2fArray,'faceVarying').Set(uv);return bind(pose(g,offset),m,color)

def texture_scene(name):
    s=stage(TEX/(name+'.usda'));camera(s,(4.8,3.4,6),(0,1.1,0));lights(s);mat=material(s,'/World/Looks/Base',ink,.3,.3);box(s,'/World/Base',(0,-.12,0),(4.5,.2,2.4),mat,ink,True);return s
s=texture_scene('ktx2-mosaic');m=material(s,'/World/Looks/Mosaic',teal,.23,.1,'mosaic.ktx2');lathe(s,'/World/Vase',[(.01,0),(.48,0),(.55,.1),(.7,.7),(.52,1.2),(.28,1.8),(.34,2.2),(.28,2.25)],m,teal)
lathe(s,'/World/Bowl',[(.01,0),(.3,0),(.45,.2),(.65,.65),(.6,.68)],m,coral,(1.4,0,.3));save(s)
s=texture_scene('image-formats')
for i,(file,col,profile) in enumerate([('mosaic.png',teal,[(.01,0),(.35,0),(.5,.7),(.3,1.4),(.4,1.45)]),('fabric.jpg',(.3,.4,.8),[(.01,0),(.42,0),(.42,1.9),(.38,1.95)]),('signal.tga',coral,[(.01,0),(.55,0),(.72,.5),(.52,.9),(.35,1.1)])]):
    m=material(s,'/World/Looks/Format'+str(i),col,.35,0,file);lathe(s,'/World/Pot'+str(i),profile,m,col,((i-1)*1.4,0,0))
save(s)
s=texture_scene('exr-neon');m=material(s,'/World/Looks/Neon',teal,.25,0,'neon.exr',True,True);dark=material(s,'/World/Looks/Housing',ink,.3,.55)
# A curved display ribbon, with analytical outward normals and UVs.
n=48;points=[];normals=[]
for y in [.3,2.3]:
    for i in range(n+1):
        a=(i/n-.5)*1.5;points.append(Gf.Vec3f(2.6*math.sin(a),y,2.6*math.cos(a)-2));normals.append(Gf.Vec3f(math.sin(a),0,math.cos(a)))
g=UsdGeom.Mesh.Define(s,'/World/Display');g.CreatePointsAttr(points);g.CreateFaceVertexCountsAttr([4]*n);g.CreateFaceVertexIndicesAttr([v for i in range(n) for v in [i,i+1,n+2+i,n+1+i]]);g.CreateNormalsAttr(normals);g.SetNormalsInterpolation('vertex');g.CreateSubdivisionSchemeAttr('none');g.CreateDoubleSidedAttr(True);UsdGeom.PrimvarsAPI(g).CreatePrimvar('st',Sdf.ValueTypeNames.TexCoord2fArray,'vertex').Set([(i/n,y) for y in [0,1] for i in range(n+1)]);bind(g,m,teal)
for i,x in enumerate([-1.7,1.7]):box(s,f'/World/Stand{i}',(x,.15,0),(.15,.5,.5),dark,ink,True)
ball=material(s,'/World/Looks/Ball',gold,.16,.8);sphere(s,'/World/Ball',(0,.35,1.2),.35,ball,gold);save(s)

# Dependency closure comes from USD, so downloads exercise real multi-file graphs.
for folder,definitions in [(PROD,[('shot','Workshop Shot','Production'),('lookdev','Workshop Asset','Production')]),(TEX,[('ktx2-mosaic','KTX2 Mosaic','Texture Formats'),('image-formats','PNG, JPEG and TGA','Texture Formats'),('exr-neon','EXR Neon','Texture Formats')])]:
    entries=[];validation=[]
    for name,label,group in definitions:
        root=folder/(name+'.usda');s=Usd.Stage.Open(str(root));layers,assets,unresolved=UsdUtils.ComputeAllDependencies(str(root))
        if unresolved:raise RuntimeError((root,unresolved))
        errors=[str(e) for e in s.GetCompositionErrors()]
        if errors:raise RuntimeError(errors)
        files=sorted({str(Path(l.realPath).relative_to(BASE)) for l in layers if l.realPath}|{str(Path(a).relative_to(BASE)) for a in assets})
        entry={'id':folder.name+'-'+name,'label':label,'group':group,'root':str(root.relative_to(BASE)),'files':files,'scenePrimitiveLightIntensityScale':1,'environment':'none','thumbnailCameraLight':False,'features':['layered composition','payload','material variants'] if folder==PROD else ['UsdUVTexture', 'KTX2 UASTC' if name=='ktx2-mosaic' else 'linear OpenEXR HDR' if name=='exr-neon' else 'PNG JPEG TGA']}
        entry['assertions']=['Native composition has no errors','All layer and texture dependencies resolve'] + (['Coral variant binds the Coral material'] if folder==PROD else [])
        entries.append(entry);validation.append({'id':entry['id'],'opens':True,'compositionErrors':errors,'files':files})
        if folder==PROD:
            prim=s.GetPrimAtPath('/World/Robot' if name=='lookdev' else '/World/Robots/Coral');assert prim.GetVariantSet('finish').GetVariantSelection()=='Coral';assert UsdShade.MaterialBindingAPI(s.GetPrimAtPath(str(prim.GetPath())+'/Body')).ComputeBoundMaterial()[0].GetPath().name=='Coral'
    (folder/'manifest.json').write_text(json.dumps(entries,indent=2)+'\n');(folder/'native-validation.json').write_text(json.dumps(validation,indent=2)+'\n')
print('Authored 2 production assemblies and 3 texture-format scenes.')
