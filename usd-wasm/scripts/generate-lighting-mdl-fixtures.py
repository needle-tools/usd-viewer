#!/usr/bin/env python3
"""Author local lighting and MDL-input approximation coverage assets."""
from pathlib import Path
import json, math, struct, zlib
from pxr import Usd, UsdGeom, UsdShade, UsdLux, UsdVol, Sdf, Gf

BASE=Path(__file__).resolve().parents[1]/'tests/fixtures'; OUT=BASE/'coverage/lighting-mdl'; OUT.mkdir(parents=True,exist_ok=True)
entries=[]; validation=[]
def hdr(name,night=False):
    # Radiance RGBE scanlines, with asymmetric luminous panels and a horizon.
    w,h=64,32; out=bytearray(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 32 +X 64\n')
    for y in range(h):
        channels=[bytearray() for _ in range(4)]
        for x in range(w):
            sky=max(0,1-abs(y-14)/20); base=(.07,.12,.27) if night else (.45,.6,.8); rgb=[v*(.35+sky) for v in base]
            if 8<x<16 and 4<y<13: rgb=[v+(4 if night else 10)*k for v,k in zip(rgb,(.35,.5,1) if night else (1,.78,.52))]
            if 43<x<53 and 7<y<19: rgb=[v+(8 if night else 5)*k for v,k in zip(rgb,(1,.12,.48) if night else (.35,.65,1))]
            if y>24: rgb=[v*.25 for v in rgb]
            m=max(rgb); mantissa,exponent=math.frexp(m); scale=mantissa*256/m if m>1e-32 else 0
            rgba=[min(255,int(v*scale)) for v in rgb]+[exponent+128 if scale else 0]
            for c,v in zip(channels,rgba): c.append(v)
        out.extend([2,2,0,w])
        for c in channels: out.append(w); out.extend(c)
    (OUT/name).write_bytes(out)

def exr(name):
    # Original 64x32 linear, uncompressed scanline RGB OpenEXR environment.
    w,h=64,32
    def attr(n,t,v):return n.encode()+b'\0'+t.encode()+b'\0'+struct.pack('<I',len(v))+v
    channels=b''.join(c.encode()+b'\0'+struct.pack('<iB3xii',2,0,1,1) for c in ('B','G','R'))+b'\0'
    box=struct.pack('<iiii',0,0,w-1,h-1)
    header=struct.pack('<II',20000630,2)+attr('channels','chlist',channels)+attr('compression','compression',b'\0')+attr('dataWindow','box2i',box)+attr('displayWindow','box2i',box)+attr('lineOrder','lineOrder',b'\0')+attr('pixelAspectRatio','float',struct.pack('<f',1))+attr('screenWindowCenter','v2f',struct.pack('<ff',0,0))+attr('screenWindowWidth','float',struct.pack('<f',1))+b'\0'
    offset=len(header)+8*h; lines=[]; offsets=[]
    for y in range(h):
        row=[]
        for c in range(3):
            for x in range(w):
                rgb=[.12,.18,.28] if y<22 else [.035,.03,.025]
                if 9<x<20 and 4<y<13:rgb=[rgb[i]+(6,3.7,1.8)[i] for i in range(3)]
                if 40<x<50 and 8<y<20:rgb=[rgb[i]+(.7,2.3,5)[i] for i in range(3)]
                row.append(rgb[2-c])
        data=struct.pack('<'+str(w*3)+'f',*row);line=struct.pack('<ii',y,len(data))+data;offsets.append(offset);lines.append(line);offset+=len(line)
    (OUT/name).write_bytes(header+struct.pack('<'+str(h)+'Q',*offsets)+b''.join(lines))

def png(name,kind):
    w=h=32; raw=bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            if kind=='color': p=(225,85,34,255) if ((x//4+y//4)%2) else (25,155,180,255)
            elif kind=='normal': p=(128+int(28*math.sin(x*math.tau/8)),128+int(28*math.cos(y*math.tau/8)),245,255)
            else: p=(240,240,240,255) if ((x//5+y//5)%2) else (15,15,15,255)
            raw.extend(p)
    def chunk(k,data): return struct.pack('>I',len(data))+k+data+struct.pack('>I',zlib.crc32(k+data)&0xffffffff)
    (OUT/name).write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(bytes(raw)))+chunk(b'IEND',b''))
hdr('studio-day.hdr'); hdr('studio-night.hdr',True); exr('studio-panels.exr')
for k in ('color','normal','opacity'): png('pattern-'+k+'.png',k)
# Local identity-only modules make identifiers resolvable; approximation is
# driven by USD-authored inputs, not these minimal MDL implementations.
for name in ['OmniPBR','OmniPBR_ClearCoat','OmniPBR_Opacity']:
    (OUT/(name+'.mdl')).write_text('mdl 1.7;\nexport material '+name+'() = material();\n')
(OUT/'gltf_support.mdl').write_text('mdl 1.7;\nexport material gltf_material() = material();\n')

def setup(name):
    p=OUT/(name+'.usda'); s=Usd.Stage.CreateNew(str(p)); UsdGeom.SetStageUpAxis(s,'Y'); UsdGeom.SetStageMetersPerUnit(s,1); s.SetStartTimeCode(1); s.SetEndTimeCode(48)
    root=UsdGeom.Xform.Define(s,'/World');s.SetDefaultPrim(root.GetPrim())
    cam=UsdGeom.Camera.Define(s,'/World/Camera');cam.CreateFocalLengthAttr(42);cam.CreateHorizontalApertureAttr(36);cam.CreateVerticalApertureAttr(27);cam.AddTransformOp().Set(Gf.Matrix4d().SetLookAt(Gf.Vec3d(5,3.4,8),Gf.Vec3d(0,.8,0),Gf.Vec3d(0,1,0)).GetInverse())
    return s,p

def box(s,path,pos,scale,color):
    g=UsdGeom.Cube.Define(s,path);g.CreateSizeAttr(1);g.AddTranslateOp().Set(Gf.Vec3d(*pos));g.AddScaleOp().Set(Gf.Vec3f(*scale));g.CreateDisplayColorAttr([Gf.Vec3f(*color)]);return g

def material(s,name,color,metal=0,rough=.5,opacity=1):
    m=UsdShade.Material.Define(s,'/World/Looks/'+name);sh=UsdShade.Shader.Define(s,'/World/Looks/'+name+'/Preview');sh.CreateIdAttr('UsdPreviewSurface')
    for key,typ,v in [('diffuseColor',Sdf.ValueTypeNames.Color3f,Gf.Vec3f(*color)),('metallic',Sdf.ValueTypeNames.Float,metal),('roughness',Sdf.ValueTypeNames.Float,rough),('opacity',Sdf.ValueTypeNames.Float,opacity)]:sh.CreateInput(key,typ).Set(v)
    m.CreateSurfaceOutput().ConnectToSource(sh.ConnectableAPI(),'surface');return m

def bind(g,m):UsdShade.MaterialBindingAPI.Apply(g.GetPrim()).Bind(m)
def torus(s,path,center=(0,1,0),R=.75,r=.18):
    n,k=96,32; pts=[];normals=[];uv=[];indices=[]
    for i in range(n):
        a=math.tau*i/n
        for j in range(k):
            b=math.tau*j/k;pts.append((center[0]+(R+r*math.cos(b))*math.cos(a),center[1]+(R+r*math.cos(b))*math.sin(a),center[2]+r*math.sin(b)));normals.append((math.cos(b)*math.cos(a),math.cos(b)*math.sin(a),math.sin(b)));uv.append((i/n,j/k))
    for i in range(n):
        for j in range(k): indices.extend([i*k+j,((i+1)%n)*k+j,((i+1)%n)*k+(j+1)%k,i*k+(j+1)%k])
    m=UsdGeom.Mesh.Define(s,path);m.CreatePointsAttr(pts);m.CreateFaceVertexCountsAttr([4]*(n*k));m.CreateFaceVertexIndicesAttr(indices);m.CreateSubdivisionSchemeAttr('none');m.CreateDoubleSidedAttr(True);m.CreateDisplayColorAttr([Gf.Vec3f(.55,.65,.72)])
    m.CreateNormalsAttr(normals);m.SetNormalsInterpolation(UsdGeom.Tokens.vertex)
    UsdGeom.PrimvarsAPI(m).CreatePrimvar('st',Sdf.ValueTypeNames.TexCoord2fArray,'vertex').Set(uv);return m

def lathe(s,path,profile):
    sides=40; pts=[]; uv=[]; indices=[]
    for row,(y,r) in enumerate(profile):
        for i in range(sides):
            a=math.tau*i/sides;pts.append((r*math.cos(a),y,r*math.sin(a)))
    for row in range(len(profile)-1):
        for i in range(sides):
            j=(i+1)%sides;indices.extend([row*sides+i,row*sides+j,(row+1)*sides+j,(row+1)*sides+i])
            u0,u1=i/sides,(i+1)/sides;v0,v1=row/(len(profile)-1),(row+1)/(len(profile)-1);uv.extend([(u0,v0),(u1,v0),(u1,v1),(u0,v1)])
    g=UsdGeom.Mesh.Define(s,path);g.CreatePointsAttr(pts);g.CreateFaceVertexCountsAttr([4]*(len(profile)-1)*sides);g.CreateFaceVertexIndicesAttr(indices);g.CreateSubdivisionSchemeAttr('catmullClark');g.CreateInterpolateBoundaryAttr('edgeAndCorner');g.CreateFaceVaryingLinearInterpolationAttr('cornersPlus1');g.CreateDoubleSidedAttr(True);g.CreateDisplayColorAttr([Gf.Vec3f(.45,.55,.6)])
    # Keep the two open profile rims defined while the body refines smoothly.
    rims=[(row*sides+i,row*sides+(i+1)%sides) for row in (0,len(profile)-1) for i in range(sides)]
    g.CreateCreaseIndicesAttr([v for edge in rims for v in edge]);g.CreateCreaseLengthsAttr([2]*len(rims));g.CreateCreaseSharpnessesAttr([4]*len(rims))
    UsdGeom.PrimvarsAPI(g).CreatePrimvar('st',Sdf.ValueTypeNames.TexCoord2fArray,'faceVarying').Set(uv);return g

def subdivision_variants(mesh):
    scheme=mesh.GetSubdivisionSchemeAttr();scheme.Clear();variants=mesh.GetPrim().GetVariantSets().AddVariantSet('surface')
    for name,value in [('smooth','catmullClark'),('cage','none')]:
        variants.AddVariant(name);variants.SetVariantSelection(name)
        with variants.GetVariantEditContext(): scheme.Set(value)
    variants.SetVariantSelection('smooth')

def check_subdivision_variants(stage):
    mesh=UsdGeom.Mesh.Get(stage,'/World/MaterialRing');variants=mesh.GetPrim().GetVariantSet('surface');original=variants.GetVariantSelection()
    try:
        for choice,expected in [('smooth','catmullClark'),('cage','none')]:
            variants.SetVariantSelection(choice)
            if mesh.GetSubdivisionSchemeAttr().Get()!=expected:return False
        uv=UsdGeom.PrimvarsAPI(mesh).GetPrimvar('st')
        values=uv.Get();seam_ok=all(max(v[0] for v in values[i:i+4])-min(v[0] for v in values[i:i+4])<.026 for i in range(0,len(values),4))
        return uv.GetInterpolation()=='faceVarying' and len(values)==len(mesh.GetFaceVertexIndicesAttr().Get()) and seam_ok and len(mesh.GetCreaseLengthsAttr().Get())==80
    finally:variants.SetVariantSelection(original)

def panel(s,path):
    g=UsdGeom.Mesh.Define(s,path);g.CreatePointsAttr([(-1.3,.1,0),(1.3,.1,0),(1.3,2.3,0),(-1.3,2.3,0)]);g.CreateFaceVertexCountsAttr([4]);g.CreateFaceVertexIndicesAttr([0,1,2,3]);g.CreateSubdivisionSchemeAttr('none');g.CreateDoubleSidedAttr(True);g.CreateDisplayColorAttr([Gf.Vec3f(.4,.7,.5)]);UsdGeom.PrimvarsAPI(g).CreatePrimvar('st',Sdf.ValueTypeNames.TexCoord2fArray,'vertex').Set([(0,0),(3,0),(3,3),(0,3)]);return g

def crystal(s,path):
    points=[(0,2.4,0),(-.8,1.05,-.6),(.8,1.05,-.6),(.8,1.05,.6),(-.8,1.05,.6),(0,.1,0)]
    g=UsdGeom.Mesh.Define(s,path);g.CreatePointsAttr(points);g.CreateFaceVertexCountsAttr([3]*8);g.CreateFaceVertexIndicesAttr([0,1,2,0,2,3,0,3,4,0,4,1,5,2,1,5,3,2,5,4,3,5,1,4]);g.CreateSubdivisionSchemeAttr('none');g.CreateDoubleSidedAttr(True);g.CreateDisplayColorAttr([Gf.Vec3f(.2,.55,.9)]);return g

def scene(s,mode):
    mats=[material(s,'Matte',(.16,.5,.55),0,.8),material(s,'Metal',(.78,.43,.18),.95,.19),material(s,'Glass',(.32,.65,.8),0,.09,.38),material(s,'Base',(.15,.18,.22),.15,.5)]
    base=box(s,'/World/Stage',(0,-.24,0),(5,.35,3.3),(.15,.18,.22));bind(base,mats[3])
    if mode!='rigs':
        if mode in ('domes','exr'):
            g=lathe(s,'/World/Vase',[(.1,.35),(.3,.68),(.8,.75),(1.3,.48),(1.8,.38),(2.05,.5)]);bind(g,mats[1]);g=crystal(s,'/World/Crystal');UsdGeom.Xformable(g).AddTranslateOp().Set((1.5,.05,0));UsdGeom.Xformable(g).AddScaleOp().Set((.5,.65,.5));bind(g,mats[0])
        elif mode in ('rect','disk','portal'):
            for i,(x,y,w) in enumerate([(-1.4,.65,.65),(0,1.05,.85),(1.4,.8,.7)]):
                g=box(s,'/World/Column'+str(i),(x,y,0),(w,y*2,w),(.5,.5,.5));bind(g,mats[i%2])
            g=torus(s,'/World/Crown',(0,2.05,0),.68,.13);bind(g,mats[1])
        elif mode in ('sphere','cylinder','meshlight'):
            for i,x in enumerate((-1.1,0,1.1)):
                g=torus(s,'/World/Orbital'+str(i),(x,.85,0),.48+i*.08,.12);bind(g,mats[i%2])
            g=crystal(s,'/World/Centerpiece');UsdGeom.Xformable(g).AddScaleOp().Set((.45,.7,.45));bind(g,mats[1])
        elif mode=='spot':
            g=crystal(s,'/World/Crystal');bind(g,mats[1]);
            for i,x in enumerate((-1.45,1.45)):
                g=box(s,'/World/Pillar'+str(i),(x,.5,-.25),(.45,1,.45),(.3,.5,.5));bind(g,mats[0])
        elif mode=='distant':
            for i in range(5):
                g=box(s,'/World/Terrace'+str(i),((i-2)*.65,.18+i*.23,0),(.58,.36+i*.46,1.2),(.3,.5,.5));bind(g,mats[i%2])
        else:
            g=lathe(s,'/World/Spindle',[(.1,.55),(.3,.65),(.65,.35),(1.1,.7),(1.6,.35),(2.1,.15)]);bind(g,mats[1]);g=torus(s,'/World/Halo',(0,1.45,0),1,.1);bind(g,mats[0])
        return
    ring=torus(s,'/World/Ring',(0,1.45,0));bind(ring,mats[1])
    for i in range(3):
        x=(i-1)*1.45; pedestal=box(s,'/World/Pedestal'+str(i),(x,.08,.22),(.9,.28,.9),(.3,.32,.36));bind(pedestal,mats[3]); ball=UsdGeom.Sphere.Define(s,'/World/Sphere'+str(i));ball.CreateRadiusAttr(.46);ball.AddTranslateOp().Set(Gf.Vec3d(x,.68,.22));ball.CreateDisplayColorAttr([Gf.Vec3f(*[(.16,.5,.55),(.78,.43,.18),(.32,.65,.8)][i])]);bind(ball,mats[i])

def aimed(light,pos,target=(0,.8,0)):
    light.AddTransformOp().Set(Gf.Matrix4d().SetLookAt(Gf.Vec3d(*pos),Gf.Vec3d(*target),Gf.Vec3d(0,1,0)).GetInverse())
def rect(s,name,pos,color,intensity=350):
    l=UsdLux.RectLight.Define(s,'/World/Lights/'+name);l.CreateWidthAttr(2.5);l.CreateHeightAttr(2);l.CreateColorAttr(color);l.CreateIntensityAttr(intensity);aimed(l,pos);return l
def sphere(s,name,pos,color,intensity=220):
    l=UsdLux.SphereLight.Define(s,'/World/Lights/'+name);l.CreateRadiusAttr(.25);l.CreateColorAttr(color);l.CreateIntensityAttr(intensity);aimed(l,pos);return l
def dome(s,file,rotation=0):
    l=UsdLux.DomeLight.Define(s,'/World/Lights/Environment');l.CreateTextureFileAttr(Sdf.AssetPath('./'+file));l.CreateTextureFormatAttr('latlong');l.CreateIntensityAttr(1);l.AddRotateYOp().Set(rotation);return l

def finish(name,label,group,s,p,features,checks,files=(),environment=None):
    s.GetRootLayer().Save()
    if group=='Lights': p.write_text(p.read_text().rstrip()+'\n')
    st=Usd.Stage.Open(str(p),load=Usd.Stage.LoadAll);assert st;out=[]
    for label_,fn in checks:
        try: ok=bool(fn(st))
        except Exception as e:raise RuntimeError(name+': '+label_) from e
        if not ok:raise RuntimeError(name+': '+label_)
        out.append({'assertion':label_,'passed':True})
    errs=[str(e) for e in st.GetCompositionErrors()];assert not errs,(name,errs)
    paths=[str(p.relative_to(BASE))]+[str((OUT/f).resolve().relative_to(BASE)) for f in files]
    expected='Authored USD lights and/or HDR maps; illumination depends on viewer support' if group=='Lights' else 'MDL-only binding exercises supported authored-input approximation; MDL module compilation is not asserted'
    e=dict(id='lighting-mdl-'+name,label=label,group=group,root=paths[0],files=paths,features=features,expected={'native':'Stage opens and authored schema assertions pass; renderer support varies','needle':expected},assertions=[a for a,_ in checks])
    if any(prim.IsA(UsdGeom.Mesh) and UsdGeom.Mesh(prim).GetSubdivisionSchemeAttr().Get()=='catmullClark' for prim in st.Traverse()):e.update(complexity='high',thumbnailComplexity='high')
    if group=='Lights':e['thumbnailCameraLight']=False
    if environment is not None:e['environment']=environment
    entries.append(e);validation.append({'id':e['id'],'root':paths[0],'opens':True,'compositionErrors':errs,'assertions':out})

def check_light_variants(stage, set_name, expected):
    variants=stage.GetPrimAtPath('/World/Lights').GetVariantSet(set_name)
    original=variants.GetVariantSelection()
    try:
        for choice,required in expected.items():
            variants.SetVariantSelection(choice)
            if any(not stage.GetPrimAtPath('/World/Lights/'+name).IsValid() for name in required): return False
            if set_name=='environment':
                asset=stage.GetPrimAtPath('/World/Lights/Environment').GetAttribute('inputs:texture:file').Get()
                if not asset or not asset.resolvedPath: return False
        return True
    finally: variants.SetVariantSelection(original)

def check_shadow_variants(stage):
    prim=stage.GetPrimAtPath('/World/Lights/Sun');variants=prim.GetVariantSet('shadows');original=variants.GetVariantSelection()
    try:
        for name,enabled in [('enabled',True),('disabled',False)]:
            variants.SetVariantSelection(name)
            if UsdLux.ShadowAPI(prim).GetShadowEnableAttr().Get()!=enabled:return False
        return True
    finally:variants.SetVariantSelection(original)

def light_case(name,label,mode):
    s,p=setup(name);scene(s,mode);s.DefinePrim('/World/Lights','Xform'); files=[]; checks=[]
    if mode=='rigs':
        prim=s.GetPrimAtPath('/World/Lights');v=prim.GetVariantSets().AddVariantSet('lighting')
        for variant in ('warmStudio','coolRim','nightNeon'):
            v.AddVariant(variant);v.SetVariantSelection(variant)
            with v.GetVariantEditContext():
                if variant=='warmStudio':rect(s,'Key',(3,5,5),(1,.62,.32),420);sphere(s,'Fill',(-4,2,1),(.3,.55,1),100)
                elif variant=='coolRim':rect(s,'Key',(-3,5,3),(.3,.65,1),350);rect(s,'Rim',(3,4,-3),(1,.35,.18),450)
                else:sphere(s,'Magenta',(-3,3,2),(1,.03,.35),260);sphere(s,'Cyan',(3,3,-2),(.05,.8,1),260)
        v.SetVariantSelection('warmStudio'); checks.append(('Three complete light rig variants',lambda st:check_light_variants(st,'lighting',{'warmStudio':['Key','Fill'],'coolRim':['Key','Rim'],'nightNeon':['Magenta','Cyan']})))
    elif mode=='domes':
        prim=s.GetPrimAtPath('/World/Lights');v=prim.GetVariantSets().AddVariantSet('environment')
        for variant,file,angle in [('day','studio-day.hdr',0),('night','studio-night.hdr',0),('dayRotated','studio-day.hdr',90)]:
            v.AddVariant(variant);v.SetVariantSelection(variant)
            with v.GetVariantEditContext(): dome(s,file,angle)
        v.SetVariantSelection('day');files=['studio-day.hdr','studio-night.hdr'];checks.append(('Three HDR dome variants resolve',lambda st:check_light_variants(st,'environment',{'day':['Environment'],'night':['Environment'],'dayRotated':['Environment']})))
    elif mode=='exr':
        dome(s,'studio-panels.exr');files=['studio-panels.exr'];checks.append(('EXR dome asset resolves',lambda st:bool(st.GetPrimAtPath('/World/Lights/Environment').GetAttribute('inputs:texture:file').Get().resolvedPath)))
    elif mode=='portal':
        environment=dome(s,'studio-panels.exr');portal=UsdLux.PortalLight.Define(s,'/World/Lights/Portal');portal.CreateWidthAttr(2);portal.CreateHeightAttr(1.5);aimed(portal,(-2,4,3));environment.CreatePortalsRel().SetTargets([portal.GetPath()]);files=['studio-panels.exr'];checks.append(('Dome references rectangular portal',lambda st:bool(UsdLux.DomeLight(st.GetPrimAtPath('/World/Lights/Environment')).GetPortalsRel().GetTargets())))
    elif mode=='meshlight':
        emitter=s.GetPrimAtPath('/World/Orbital1');UsdLux.MeshLightAPI.Apply(emitter);UsdLux.LightAPI(emitter).CreateIntensityAttr(8);dome(s,'studio-panels.exr');files=['studio-panels.exr'];checks.append(('Mesh light API applied to orbital mesh',lambda st:st.GetPrimAtPath('/World/Orbital1').HasAPI(UsdLux.MeshLightAPI)))
    elif mode=='geometry':
        emitter=s.GetPrimAtPath('/World/Halo');light=UsdLux.GeometryLight.Define(s,'/World/Lights/Geometry');light.CreateGeometryRel().SetTargets([emitter.GetPath()]);light.CreateIntensityAttr(8);dome(s,'studio-panels.exr');files=['studio-panels.exr'];checks.append(('Geometry light targets halo mesh',lambda st:UsdLux.GeometryLight(st.GetPrimAtPath('/World/Lights/Geometry')).GetGeometryRel().GetTargets()==[Sdf.Path('/World/Halo')]))
    elif mode=='volumelight':
        # Keep the camera outside the model so native bounds-only fallback can
        # still address it when Storm lacks a VDB field plugin.
        s.RemovePrim('/World/Camera');camera=UsdGeom.Camera.Define(s,'/Camera');camera.CreateFocalLengthAttr(42);camera.CreateHorizontalApertureAttr(36);camera.CreateVerticalApertureAttr(27);camera.AddTransformOp().Set(Gf.Matrix4d().SetLookAt(Gf.Vec3d(5,3.4,8),Gf.Vec3d(0,.8,0),Gf.Vec3d(0,1,0)).GetInverse())
        volume=UsdVol.Volume.Define(s,'/World/GlowVolume');UsdLux.VolumeLightAPI.Apply(volume.GetPrim());UsdLux.LightAPI(volume.GetPrim()).CreateIntensityAttr(8)
        bounds=json.loads((BASE/'coverage/advanced/vdb-bounds.json').read_text())['densityAndHeat.vdb'];volume.CreateExtentAttr([tuple(bounds['min']),tuple(bounds['max'])]);volume.AddTranslateOp().Set((0,.6,-.5));volume.AddScaleOp().Set((.05,.05,.05))
        field=UsdVol.OpenVDBAsset.Define(s,'/World/GlowDensity');field.CreateFieldNameAttr('density');field.CreateFilePathAttr(Sdf.AssetPath('../advanced/densityAndHeat.vdb'));volume.CreateFieldRelationship('density',field.GetPath());dome(s,'studio-panels.exr');files=['studio-panels.exr','../advanced/densityAndHeat.vdb'];checks.append(('Volume light has a resolved density field',lambda st:st.GetPrimAtPath('/World/GlowVolume').HasAPI(UsdLux.VolumeLightAPI) and bool(st.GetPrimAtPath('/World/GlowDensity').GetAttribute('filePath').Get().resolvedPath)))
    elif mode=='linking':
        light=rect(s,'Linked',(2,4,3),(1,.75,.45),120);api=UsdLux.LightAPI(light.GetPrim());api.GetLightLinkCollectionAPI().CreateIncludesRel().SetTargets([Sdf.Path('/World/Spindle')]);api.GetShadowLinkCollectionAPI().CreateExcludesRel().SetTargets([Sdf.Path('/World/Halo')])
        lightlist=UsdLux.LightListAPI.Apply(s.GetPrimAtPath('/World'));lightlist.CreateLightListRel().SetTargets([light.GetPath()]);lightlist.CreateLightListCacheBehaviorAttr('consumeAndContinue')
        checks.append(('Light and shadow collections and light list are authored',lambda st:bool(UsdLux.LightAPI(st.GetPrimAtPath('/World/Lights/Linked')).GetLightLinkCollectionAPI().GetIncludesRel().GetTargets()) and bool(UsdLux.LightAPI(st.GetPrimAtPath('/World/Lights/Linked')).GetShadowLinkCollectionAPI().GetExcludesRel().GetTargets()) and bool(UsdLux.LightListAPI(st.GetPrimAtPath('/World')).GetLightListRel().GetTargets())))
    elif mode=='rect':rect(s,'Softbox',(-2,4,3),(1,.75,.45),35);rect(s,'Rim',(2,3,-3),(.3,.55,1),22)
    elif mode=='disk':
        l=UsdLux.DiskLight.Define(s,'/World/Lights/Disk');l.CreateRadiusAttr(1.1);l.CreateIntensityAttr(100);l.CreateColorAttr((1,.55,.3));aimed(l,(-2,4,3));checks.append(('Disk light radius authored',lambda st:abs(st.GetPrimAtPath('/World/Lights/Disk').GetAttribute('inputs:radius').Get()-1.1)<1e-5))
    elif mode=='cylinder':
        l=UsdLux.CylinderLight.Define(s,'/World/Lights/Tube');l.CreateRadiusAttr(.2);l.CreateLengthAttr(2.4);l.CreateIntensityAttr(200);l.CreateColorAttr((.45,.7,1));aimed(l,(0,4,3));checks.append(('Cylinder light length authored',lambda st:abs(st.GetPrimAtPath('/World/Lights/Tube').GetAttribute('inputs:length').Get()-2.4)<1e-5))
    elif mode=='temperature':
        l=rect(s,'Warm',(-2,4,3),(1,1,1),120);l.CreateEnableColorTemperatureAttr(True);l.CreateColorTemperatureAttr(2400);l.CreateNormalizeAttr(True)
        l=rect(s,'Cool',(2,4,3),(1,1,1),120);l.CreateEnableColorTemperatureAttr(True);l.CreateColorTemperatureAttr(8000);l.CreateNormalizeAttr(True)
        checks.append(('Warm and cool normalized emitters authored',lambda st:all(st.GetPrimAtPath('/World/Lights/'+n).GetAttribute('inputs:normalize').Get() and st.GetPrimAtPath('/World/Lights/'+n).GetAttribute('inputs:enableColorTemperature').Get() for n in ('Warm','Cool'))))
    elif mode=='sphere':sphere(s,'Orb',(1.4,2.7,2),(.8,.35,1),350);sphere(s,'Fill',(-2,1.8,1),(.2,.75,1),140)
    elif mode=='spot':
        l=sphere(s,'Spot',(0,5,3),(1,.8,.55),600);shape=UsdLux.ShapingAPI.Apply(l.GetPrim());shape.CreateShapingConeAngleAttr(28);shape.CreateShapingConeSoftnessAttr(.18);checks.append(('Spot cone angle authored',lambda st:st.GetPrimAtPath('/World/Lights/Spot').GetAttribute('inputs:shaping:cone:angle').Get()==28))
    elif mode=='distant':
        l=UsdLux.DistantLight.Define(s,'/World/Lights/Sun');l.CreateIntensityAttr(300);l.CreateColorAttr((1,.78,.5));l.CreateAngleAttr(10);aimed(l,(5,7,5));checks.append(('Distant light exists',lambda st:st.GetPrimAtPath('/World/Lights/Sun').IsA(UsdLux.DistantLight)))
        shadow=UsdLux.ShadowAPI.Apply(l.GetPrim());variants=l.GetPrim().GetVariantSets().AddVariantSet('shadows')
        for name_,enabled in [('enabled',True),('disabled',False)]:
            variants.AddVariant(name_);variants.SetVariantSelection(name_)
            with variants.GetVariantEditContext():shadow.CreateShadowEnableAttr(enabled)
        variants.SetVariantSelection('enabled');checks.append(('ShadowAPI enabled and disabled variants compose correctly',check_shadow_variants))
    else:
        l=rect(s,'Animated',(2,4,4),(1,.4,.2),220);l.GetIntensityAttr().Set(100,1);l.GetIntensityAttr().Set(600,48);checks.append(('Light intensity has time samples',lambda st:len(st.GetPrimAtPath('/World/Lights/Animated').GetAttribute('inputs:intensity').GetTimeSamples())==2))
    checks.append(('Scene contains a stage and authored lights',lambda st:bool(st.GetPrimAtPath('/World/Stage')) and len(list(st.GetPrimAtPath('/World/Lights').GetChildren()))>0))
    finish(name,label,'Lights',s,p,['UsdLux',mode]+(['ShadowAPI','shadow:enable'] if mode=='distant' else []),checks,files,environment='none')
    # Use the authored UsdLux luminance, without per-fixture brightness overrides.
    entries[-1]['scenePrimitiveLightIntensityScale'] = 1
    if mode in ('portal','meshlight','geometry','volumelight'):
        entries[-1]['expected']['needle']='The EXR dome provides illumination. The authored '+mode+' schema requires delegate-specific support; its light transport is not established by this fixture.'
    if mode=='linking': entries[-1]['expected']['needle']='Light and shadow linking collections and cached light lists are authored; selective linking requires delegate support.'
    if mode=='volumelight': entries[-1]['renderer']='bounded-volume'
for x in [('studio-variants','Studio light rig variants','rigs'),('hdr-variants','HDR dome variants','domes'),('exr-dome','EXR studio dome','exr'),('area-softboxes','Area softboxes','rect'),('disk-light','Disk light','disk'),('cylinder-light','Cylinder light','cylinder'),('temperature-lights','Color temperature and normalize','temperature'),('colored-spheres','Colored sphere lights','sphere'),('shaped-spot','Shaped spotlight','spot'),('distant-sun','Distant sun','distant'),('animated-light','Animated light intensity','animated'),('portal-light','Dome portal','portal'),('mesh-light','Mesh light','meshlight'),('geometry-light','Geometry light','geometry'),('volume-light','Volume light','volumelight'),('light-linking','Light and shadow linking','linking')]:light_case(*x)

def mdl_case(name,label,mode):
    s,p=setup(name); files=[]
    family={'clearcoat':'OmniPBR_ClearCoat','opacity':'OmniPBR_Opacity','gltf':'gltf_material'}.get(mode,'OmniPBR')
    module='gltf_support' if family=='gltf_material' else family;files.append(module+'.mdl')
    m=UsdShade.Material.Define(s,'/World/Looks/MDL');sh=UsdShade.Shader.Define(s,'/World/Looks/MDL/Shader');sh.SetSourceAsset(Sdf.AssetPath('./'+module+'.mdl'),'mdl');sh.SetSourceAssetSubIdentifier(family,'mdl');sh.CreateOutput('out',Sdf.ValueTypeNames.Token);m.CreateSurfaceOutput('mdl').ConnectToSource(sh.ConnectableAPI(),'out')
    def inp(n,t,v):sh.CreateInput(n,t).Set(v)
    if family=='gltf_material':
        inp('base_color_factor',Sdf.ValueTypeNames.Color4f,Gf.Vec4f(.18,.55,.9,1));inp('metallic_factor',Sdf.ValueTypeNames.Float,.75);inp('roughness_factor',Sdf.ValueTypeNames.Float,.22)
    else:
        inp('diffuse_color_constant',Sdf.ValueTypeNames.Color3f,Gf.Vec3f(*({'metal':(.85,.43,.1),'clearcoat':(.45,.05,.11),'texture':(.9,.9,.9),'normal':(.18,.42,.7),'opacity':(.35,.8,.55)}[mode])));inp('metallic_constant',Sdf.ValueTypeNames.Float,.9 if mode=='metal' else .1);inp('reflection_roughness_constant',Sdf.ValueTypeNames.Float,.16 if mode in ('metal','clearcoat') else .42)
        if mode=='clearcoat':inp('enable_clearcoat',Sdf.ValueTypeNames.Bool,True);inp('clearcoat_weight',Sdf.ValueTypeNames.Float,.85);inp('clearcoat_reflection_roughness',Sdf.ValueTypeNames.Float,.1)
        if mode=='texture':inp('diffuse_texture',Sdf.ValueTypeNames.Asset,Sdf.AssetPath('./pattern-color.png'));files.append('pattern-color.png')
        if mode=='normal':inp('enable_normal_texture',Sdf.ValueTypeNames.Bool,True);inp('normalmap_texture',Sdf.ValueTypeNames.Asset,Sdf.AssetPath('./pattern-normal.png'));inp('bump_factor',Sdf.ValueTypeNames.Float,.9);files.append('pattern-normal.png')
        if mode=='opacity':inp('enable_opacity',Sdf.ValueTypeNames.Bool,True);inp('enable_opacity_texture',Sdf.ValueTypeNames.Bool,True);inp('opacity_texture',Sdf.ValueTypeNames.Asset,Sdf.AssetPath('./pattern-opacity.png'));inp('opacity_mode',Sdf.ValueTypeNames.Int,1);inp('opacity_threshold',Sdf.ValueTypeNames.Float,.5);files.append('pattern-opacity.png')
    # A ring and three beads create a compact material test object, with UVs on the ring.
    platform=box(s,'/World/Plinth',(0,-.28,0),(4.1,.35,2.6),(.18,.22,.25));platform.CreateDisplayColorAttr([Gf.Vec3f(.18,.22,.25)])
    if mode=='metal': obj=lathe(s,'/World/MaterialRing',[(.1,.42),(.22,.4),(.28,.18),(.7,.18),(.8,.42),(1.0,.63),(1.5,.72),(1.75,.82),(1.82,.78)])
    elif mode=='clearcoat': obj=lathe(s,'/World/MaterialRing',[(.12,.08),(.22,.3),(.45,.62),(.75,.84),(.9,.89),(1.1,.77),(1.35,.48),(1.55,.16),(1.8,.1)])
    elif mode=='texture': obj=lathe(s,'/World/MaterialRing',[(.1,.35),(.2,.46),(.4,.68),(.8,.77),(1.2,.65),(1.55,.38),(1.85,.34),(1.9,.42)])
    elif mode=='opacity': obj=panel(s,'/World/MaterialRing')
    elif mode=='gltf': obj=crystal(s,'/World/MaterialRing')
    else: obj=torus(s,'/World/MaterialRing',(0,1.18,0),.9,.28)
    if mode in ('metal','clearcoat','texture'):subdivision_variants(obj)
    bind(obj,m)
    for i in range(3):
        b=UsdGeom.Sphere.Define(s,'/World/Bead'+str(i));b.CreateRadiusAttr(.35);b.AddTranslateOp().Set(Gf.Vec3d((i-1)*1.2,.35,.6));b.CreateDisplayColorAttr([Gf.Vec3f(.35,.5,.55)]);bind(b,m)
    if mode == 'gltf':
        inner=torus(s,'/World/InnerRing',(0,1.18,.08),.45,.12);bind(inner,m)
    if mode in ('texture','normal'):
        for i in range(2):
            column=box(s,'/World/Panel'+str(i),((i-.5)*2.8,1.0,0),(.3,1.5,.3),(.25,.5,.6));bind(column,m)
    if mode=='opacity':
        second=torus(s,'/World/OuterRing',(0,1.18,-.26),1.15,.1);bind(second,m)
    if mode=='metal':
        for i in range(2):
            bar=box(s,'/World/Bar'+str(i),((i-.5)*2.4,.48,-.3),(.22,.9,.24),(.8,.5,.2));bind(bar,m)
    checks=[('MDL terminal is connected without Preview surface',lambda st: bool(UsdShade.Material(st.GetPrimAtPath('/World/Looks/MDL')).GetSurfaceOutput('mdl').GetConnectedSources()[0]) and not bool(UsdShade.Material(st.GetPrimAtPath('/World/Looks/MDL')).GetSurfaceOutput().GetConnectedSources()[0]) if UsdShade.Material(st.GetPrimAtPath('/World/Looks/MDL')).GetSurfaceOutput() else bool(UsdShade.Material(st.GetPrimAtPath('/World/Looks/MDL')).GetSurfaceOutput('mdl').GetConnectedSources()[0])),('Material ring bound to MDL',lambda st:bool(UsdShade.MaterialBindingAPI(st.GetPrimAtPath('/World/MaterialRing')).GetDirectBindingRel().GetTargets())),('MDL source asset resolves',lambda st: bool(UsdShade.Shader(st.GetPrimAtPath('/World/Looks/MDL/Shader')).GetSourceAsset('mdl').resolvedPath))]
    if mode in ('metal','clearcoat','texture'):checks.append(('Smooth and cage variants preserve creases and seam UVs',check_subdivision_variants))
    if mode in ('texture','normal','opacity'):
        field={'texture':'diffuse_texture','normal':'normalmap_texture','opacity':'opacity_texture'}[mode];checks.append(('Texture asset resolves',lambda st,field=field: bool(st.GetPrimAtPath('/World/Looks/MDL/Shader').GetAttribute('inputs:'+field).Get().resolvedPath)))
    finish(name,label,'MDL',s,p,['MDL',family,mode],checks,files)
for x in [('mdl-metal','MDL metallic gold','metal'),('mdl-clearcoat','MDL clearcoat enamel','clearcoat'),('mdl-color-texture','MDL patterned enamel','texture'),('mdl-normal-texture','MDL engraved normal','normal'),('mdl-opacity-mask','MDL cutout lattice','opacity'),('mdl-gltf','MDL glTF material','gltf')]: mdl_case(*x)
assert len(entries)==22
(OUT/'manifest.json').write_text(json.dumps(entries,indent=2)+'\n')
(OUT/'native-validation.json').write_text(json.dumps({'openusdVersion':list(Usd.GetVersion()),'loadPolicy':'LoadAll','results':validation},indent=2)+'\n')
print('Generated and validated',len(entries),'lighting/MDL fixtures')
