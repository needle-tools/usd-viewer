#!/usr/bin/env python3
"""Generate the core coverage corpus with native OpenUSD Python bindings.

Example: PYTHONPATH=/Users/herbst/OpenUSD-26.05-native/lib/python python3 scripts/generate-core-coverage-fixtures.py
"""
from pathlib import Path
import sys
import json, math
from pxr import Usd, UsdGeom, UsdLux, Sdf, Gf, Vt

BASE = Path(__file__).resolve().parents[1] / 'tests/fixtures'
OUT = BASE / 'coverage/core'
OUT.mkdir(parents=True, exist_ok=True)
entries=[]; validation=[]
SELECT=set(sys.argv[1:])
def wanted(name): return not SELECT or name in SELECT

def setup(name):
    path=OUT/(name+'.usda')
    stage=Usd.Stage.CreateNew(str(path)); stage.SetStartTimeCode(1); stage.SetEndTimeCode(48)
    stage.SetFramesPerSecond(24); UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y); UsdGeom.SetStageMetersPerUnit(stage, 1)
    root=UsdGeom.Xform.Define(stage, '/World'); stage.SetDefaultPrim(root.GetPrim())
    return stage, path

def cube(stage, path, pos=(0,0,0), color=(0.3,0.6,0.8), size=1):
    g=UsdGeom.Cube.Define(stage,path); g.CreateSizeAttr(size)
    g.AddTranslateOp().Set(Gf.Vec3d(*pos)); g.CreateDisplayColorAttr([Gf.Vec3f(*color)])
    return g

def mesh(stage,path,points,counts,indices,color=(0.3,0.6,0.8)):
    g=UsdGeom.Mesh.Define(stage,path); g.CreatePointsAttr(points); g.CreateFaceVertexCountsAttr(counts); g.CreateFaceVertexIndicesAttr(indices)
    g.CreateSubdivisionSchemeAttr('none'); g.CreateDisplayColorAttr([Gf.Vec3f(*color)])
    return g

def scaled_cube(stage, path, position, scale, color):
    item = cube(stage, path, position, color)
    item.AddScaleOp().Set(Gf.Vec3f(*scale))
    return item

def ornament(stage, prefix, style='tower'):
    """A compact architectural silhouette with recognizable separate parts."""
    scaled_cube(stage, prefix+'/Foot', (0,-.62,0), (1.45,.18,1.2), (.11,.19,.25))
    scaled_cube(stage, prefix+'/Cornice', (0,.58,0), (1.3,.16,1.15), (.95,.67,.24))
    for i, x in enumerate((-.43,.43)):
        scaled_cube(stage, prefix+'/Window'+str(i), (x,.08,.51), (.19,.35,.05), (.95,.82,.48))
    if style == 'garden':
        cap=UsdGeom.Sphere.Define(stage,prefix+'/Crown'); cap.CreateRadiusAttr(.52); cap.AddTranslateOp().Set(Gf.Vec3d(0,1.1,0)); cap.CreateDisplayColorAttr([Gf.Vec3f(.26,.65,.35)])
    else:
        cap=UsdGeom.Cone.Define(stage,prefix+'/Roof'); cap.CreateRadiusAttr(.8); cap.CreateHeightAttr(.75); cap.AddTranslateOp().Set(Gf.Vec3d(0,1.03,0)); cap.CreateDisplayColorAttr([Gf.Vec3f(.8,.27,.18)])
    scaled_cube(stage,prefix+'/Spire',(0,1.52,0),(.09,.45,.09),(.95,.76,.3))
    if style=='windmill':
        # Crossed sails make the reused composition asset a readable windmill.
        for i,angle in enumerate((45,-45)):
            sail=scaled_cube(stage,prefix+'/Sail'+str(i),(0,.25,.68),(2.4,.17,.08),(.94,.77,.42)); sail.AddRotateZOp().Set(angle)
        hub=UsdGeom.Sphere.Define(stage,prefix+'/Hub'); hub.CreateRadiusAttr(.2); hub.AddTranslateOp().Set(Gf.Vec3d(0,.25,.75)); hub.CreateDisplayColorAttr([Gf.Vec3f(.19,.29,.34)])
    elif style=='beacon':
        for i in range(3):
            arm=scaled_cube(stage,prefix+'/Beacon'+str(i),(0,1.5+i*.2,0),(1.7-i*.35,.06,.08),(.95,.55,.22)); arm.AddRotateYOp().Set(i*55)
    elif style=='gate':
        for i,x in enumerate((-.95,.95)):
            scaled_cube(stage,prefix+'/GatePier'+str(i),(x,.04,0),(.22,1.4,.3),(.45,.28,.20))
        scaled_cube(stage,prefix+'/GateLintel',(0,.69,0),(2.1,.18,.35),(.9,.51,.24))
    elif style=='lantern':
        for i,x in enumerate((-.38,.38)):
            scaled_cube(stage,prefix+'/LanternPost'+str(i),(x,1.1,0),(.08,1.0,.08),(.9,.65,.2))
        scaled_cube(stage,prefix+'/LanternGlass',(0,1.1,0),(.65,.65,.65),(.95,.84,.46))
        scaled_cube(stage,prefix+'/LanternCap',(0,1.62,0),(1,.1,1),(.18,.3,.35))

def composition_ground(stage, wide=False):
    scaled_cube(stage,'/World/Plinth',(0,-.85,0),(6 if wide else 3.5,.22,2.7),(.15,.22,.27))
    scaled_cube(stage,'/World/Trim',(0,-.73,0),(5.8 if wide else 3.3,.05,2.5),(.79,.6,.33))

def trio(stage):
    for i,c in enumerate([(0.9,0.35,0.2),(0.2,0.7,0.55),(0.35,0.45,0.9)]): cube(stage, '/World/Block'+str(i), ((i-1)*1.5,0,0), c)

def finish(name,label,group,stage,path,features,checks,files=None,needle='Geometry and authored data; individual feature support is viewer dependent'):
    stage.GetRootLayer().Save()
    del stage
    s=Usd.Stage.Open(str(path), load=Usd.Stage.LoadAll)
    if not s: raise RuntimeError(name+' did not open')
    results=[]
    for description,fn in checks:
        try: ok=bool(fn(s))
        except Exception as exc: raise RuntimeError(name+' '+description) from exc
        if not ok: raise RuntimeError(name+': '+description)
        results.append({'assertion':description,'passed':True})
    paths=[str(path.relative_to(BASE))]+[str(x.relative_to(BASE)) for x in (files or [])]
    entries.append(dict(id='core-'+name,label=label,group=group,root=paths[0],files=paths,features=features,expected={'native':'Composes and opens in native OpenUSD','needle':needle},assertions=[x[0] for x in checks]))
    validation.append({'id':'core-'+name,'root':paths[0],'opens':True,'compositionErrors':[str(e) for e in s.GetCompositionErrors()],'assertions':results})
    if validation[-1]['compositionErrors']: raise RuntimeError(str(validation[-1]))

def exists(p): return lambda s: s.GetPrimAtPath(p).IsValid()
def attr(p,a,v=None): return lambda s: s.GetPrimAtPath(p).GetAttribute(a).HasAuthoredValueOpinion() and (v is None or s.GetPrimAtPath(p).GetAttribute(a).Get()==v)
def make(name,label,group,feature,build,checks,needle='Geometry and authored data; individual feature support is viewer dependent'):
    if not wanted(name): return
    s,p=setup(name); build(s); finish(name,label,group,s,p,[feature],checks,needle=needle)

# Independent composition layers are kept next to their roots, with resolvable relative paths.
def composition(name,label,kind):
    if not wanted(name): return
    s,p=setup(name); companion=OUT/(name+'-asset.usda')
    a=Usd.Stage.CreateNew(str(companion)); UsdGeom.SetStageUpAxis(a, UsdGeom.Tokens.y); UsdGeom.SetStageMetersPerUnit(a, 1); r=UsdGeom.Xform.Define(a,'/Asset'); a.SetDefaultPrim(r.GetPrim()); cube(a,'/Asset/Body',(0,0,0),(0.2,0.65,0.85)); ornament(a,'/Asset', {'payload':'garden','instance':'garden','offset':'beacon','sublayer':'gate','listop':'windmill','over':'lantern'}.get(kind,'tower')); a.GetRootLayer().Save()
    prim=s.DefinePrim('/World/Model','Xform'); ref='./'+companion.name
    composition_ground(s, kind in ('instance','internal-reference','offset','clip'))
    if kind=='reference': prim.GetReferences().AddReference(ref,'/Asset')
    elif kind=='payload': prim.GetPayloads().AddPayload(ref,'/Asset')
    elif kind=='offset':
        body=a.GetPrimAtPath('/Asset/Body'); x=body.GetAttribute('xformOp:translate'); x.Set(Gf.Vec3d(-1,0,0),1); x.Set(Gf.Vec3d(1,0,0),11); a.GetRootLayer().Save()
        prim.GetReferences().AddReference(Sdf.Reference(ref,Sdf.Path('/Asset'),Sdf.LayerOffset(10,2)))
    elif kind=='sublayer':
        # The layer is imported as a sublayer with an offset and contributes its own /Asset.
        s.GetRootLayer().subLayerPaths.append(ref); s.GetRootLayer().subLayerOffsets[0]=Sdf.LayerOffset(3,1)
        cube(s,'/World/Local',(1.5,0,0),(0.9,0.4,0.2)); ornament(s,'/World','gate')
    elif kind=='variant':
        v=prim.GetVariantSets().AddVariantSet('shape')
        for n,col in [('warm',(0.9,0.3,0.2)),('cool',(0.2,0.5,0.9))]:
            v.AddVariant(n); v.SetVariantSelection(n)
            with v.GetVariantEditContext():
                cube(s,'/World/Model/Body',(0,0,0),col); ornament(s,'/World/Model','garden' if n=='cool' else 'tower')
        v.SetVariantSelection('cool')
    elif kind in ('inherits','specializes'):
        c=s.CreateClassPrim('/_Class'); cube(s,'/_Class/Body',(0,0,0),(0.7,0.35,0.8)); ornament(s,'/_Class','windmill' if kind=='inherits' else 'lantern')
        (prim.GetInherits() if kind=='inherits' else prim.GetSpecializes()).AddInherit('/_Class') if kind=='inherits' else prim.GetSpecializes().AddSpecialize('/_Class')
    elif kind=='internal-reference':
        source=UsdGeom.Xform.Define(s,'/World/Source'); source.AddTranslateOp().Set(Gf.Vec3d(-1.5,0,0)); cube(s,'/World/Source/Body',(0,0,0)); ornament(s,'/World/Source','gate'); prim.GetReferences().AddInternalReference('/World/Source')
        prim.GetAttribute('xformOp:translate').Set(Gf.Vec3d(1.5,0,0))
    elif kind=='listop':
        prim.GetReferences().AddReference(ref,'/Asset'); prim.GetReferences().AddReference(ref,'/Asset',position=Usd.ListPositionBackOfAppendList)
    elif kind=='instance':
        for i in range(3):
            q=s.DefinePrim('/World/Instance'+str(i),'Xform'); q.GetReferences().AddReference(ref,'/Asset'); q.SetInstanceable(True); UsdGeom.Xformable(q).AddTranslateOp().Set(Gf.Vec3d((i-1)*1.5,0,0))
    elif kind=='clip':
        body=a.GetPrimAtPath('/Asset/Body'); x=body.GetAttribute('xformOp:translate'); x.Set(Gf.Vec3d(-1,0,0),1); x.Set(Gf.Vec3d(1,0,0),48); a.GetRootLayer().Save()
        local=UsdGeom.Cube.Define(s,'/World/Model/Body'); local.CreateSizeAttr(1); local.CreateDisplayColorAttr([Gf.Vec3f(.2,.65,.85)]); local.AddTranslateOp(); ornament(s,'/World/Model','beacon')
        clips=Usd.ClipsAPI(prim); clips.SetClipAssetPaths([Sdf.AssetPath(ref)]); clips.SetClipPrimPath('/Asset'); clips.SetClipActive([(1,0)]); clips.SetClipTimes([(1,1),(48,48)])
    elif kind=='over':
        prim.GetReferences().AddReference(ref,'/Asset'); UsdGeom.Cube(s.GetPrimAtPath('/World/Model/Body')).CreateDisplayColorAttr([Gf.Vec3f(.9,.45,.1)])
    checks=[]
    if kind=='sublayer': checks=[('Sublayer contributes /Asset/Body',exists('/Asset/Body'))]
    elif kind=='instance': checks=[('Three instanceable prims share a prototype',lambda st: all(st.GetPrimAtPath('/World/Instance'+str(i)).IsInstance() for i in range(3)))]
    elif kind=='clip': checks=[('Clip drives translation at frame 48',lambda st: st.GetPrimAtPath('/World/Model/Body').GetAttribute('xformOp:translate').Get(48)==Gf.Vec3d(1,0,0))]
    elif kind=='internal-reference': checks=[('Internal reference resolves to a cube',lambda st: st.GetPrimAtPath('/World/Model/Body').IsA(UsdGeom.Cube))]
    else: checks=[('Composed body is present',exists('/World/Model/Body'))]
    metadata = {'reference':'references','payload':'payload','inherits':'inheritPaths','specializes':'specializes','listop':'references','internal-reference':'references','over':'references'}
    if kind in metadata:
        key=metadata[kind]
        checks.append(('Authored '+key+' composition arc',lambda st, key=key: st.GetPrimAtPath('/World/Model').HasAuthoredMetadata(key)))
    if kind=='listop': checks.append(('Reference list has prepend and append operations',lambda st: bool(st.GetPrimAtPath('/World/Model').GetMetadata('references').prependedItems) and bool(st.GetPrimAtPath('/World/Model').GetMetadata('references').appendedItems)))
    if kind=='over': checks.append(('Local display color wins over reference',lambda st: Gf.IsClose(UsdGeom.Cube(st.GetPrimAtPath('/World/Model/Body')).GetDisplayColorAttr().Get()[0],Gf.Vec3f(.9,.45,.1),.0001)))
    if kind=='sublayer': checks.append(('Sublayer offset is authored',lambda st: st.GetRootLayer().subLayerOffsets[0].offset==3))
    if kind=='variant': checks.append(('Cool variant selected',lambda st: st.GetPrimAtPath('/World/Model').GetVariantSet('shape').GetVariantSelection()=='cool'))
    if kind=='offset': checks.append(('Reference layer offset shifts samples',lambda st: st.GetPrimAtPath('/World/Model/Body').GetAttribute('xformOp:translate').GetTimeSamples()==[12.,32.]))
    finish(name,label,'Composition',s,p,[kind],checks,[companion], 'Composition support varies by arc; native OpenUSD is the reference')

for args in [('external-reference','External reference','reference'),('payload-loaded','Loaded payload','payload'),('reference-time-offset','Reference time offset','offset'),('sublayer-offset','Sublayer offset','sublayer'),('variant-selection','Variant selection','variant'),('class-inherits','Class inheritance','inherits'),('class-specializes','Class specialization','specializes'),('internal-reference','Internal reference','internal-reference'),('reference-listop','Reference list operation','listop'),('native-instances','Native instances','instance'),('value-clip','Value clip','clip'),('stronger-override','Stronger local override','over')]: composition(*args)

# Geometry: intentionally different topologies and schema types.
def geom(name,label,build,assertion):
    def staged(s):
        build(s)
        if name in ('quad-mesh','triangle-mesh','ngon-mesh','mesh-hole'):
            m=UsdGeom.Mesh(s.GetPrimAtPath('/World/Mesh'))
            if name=='triangle-mesh':
                m.GetDisplayColorAttr().Set([Gf.Vec3f(.12,.68,.69),Gf.Vec3f(.95,.53,.23)]); m.GetDisplayColorPrimvar().SetInterpolation('uniform')
            else: m.GetDisplayColorAttr().Set([Gf.Vec3f(*({'quad-mesh':(.2,.65,.78),'ngon-mesh':(.84,.4,.65),'mesh-hole':(.2,.72,.55)}[name]))])
            span=4.8 if name=='mesh-hole' else 2.8
            scaled_cube(s,'/World/FrameFront',(0,-.12,1.25),(span,.13,.16),(.84,.62,.28));scaled_cube(s,'/World/FrameBack',(0,-.12,-1.25),(span,.13,.16),(.84,.62,.28))
            for i,x in enumerate((-span/2,span/2)):
                scaled_cube(s,'/World/FrameSide'+str(i),(x,-.12,0),(.16,.13,2.6),(.18,.3,.37))
                for j,z in enumerate((-1.25,1.25)):scaled_cube(s,'/World/Leg'+str(i)+str(j),(x,-.45,z),(.16,.65,.16),(.18,.3,.37))
        elif name.startswith('subdivision-'):
            scaled_cube(s,'/World/Pedestal',(0,-1.25,0),(3.1,.24,3.1),(.18,.28,.35))
            for i,x in enumerate((-1.15,1.15)):scaled_cube(s,'/World/Marker'+str(i),(x,-1.08,-1.15),(.18,.1,.18),(.95,.62,.2))
    make(name,label,'Geometry',name,staged,[assertion])
    if wanted(name) and (name.startswith('subdivision-') or name=='bezier-curves'):
        entries[-1].update(complexity='high',thumbnailComplexity='high')
def plane(s,counts,indices,points=None):
    surface=mesh(s,'/World/Mesh',points or [(-1,0,-1),(1,0,-1),(1,0,1),(-1,0,1)],counts,indices)
    surface.CreateDoubleSidedAttr(True)
    return surface
geom('quad-mesh','Quad mesh',lambda s: plane(s,[4],[0,1,2,3]),('One quad',lambda s: list(UsdGeom.Mesh(s.GetPrimAtPath('/World/Mesh')).GetFaceVertexCountsAttr().Get())==[4]))
geom('triangle-mesh','Triangle mesh',lambda s: plane(s,[3,3],[0,1,2,0,2,3]),('Two triangles',lambda s: len(UsdGeom.Mesh(s.GetPrimAtPath('/World/Mesh')).GetFaceVertexCountsAttr().Get())==2))
geom('ngon-mesh','Pentagon mesh',lambda s: plane(s,[5],[0,1,2,3,4],[(math.cos(i*math.tau/5),0,math.sin(i*math.tau/5)) for i in range(5)]),('Five sided face',lambda s: UsdGeom.Mesh(s.GetPrimAtPath('/World/Mesh')).GetFaceVertexCountsAttr().Get()[0]==5))
geom('mesh-hole','Mesh with a hole',lambda s: (plane(s,[4,4],[0,1,2,3,1,4,5,2],[(-2,0,-1),(0,0,-1),(0,0,1),(-2,0,1),(2,0,-1),(2,0,1)]).CreateHoleIndicesAttr([1])),('One hole face',lambda s: list(UsdGeom.Mesh(s.GetPrimAtPath('/World/Mesh')).GetHoleIndicesAttr().Get())==[1]))
def subd(s,scheme):
    m=mesh(s,'/World/Mesh',[(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)],[4]*6,[0,3,2,1,4,5,6,7,0,1,5,4,1,2,6,5,2,3,7,6,3,0,4,7]); m.CreateSubdivisionSchemeAttr(scheme); m.CreateCreaseIndicesAttr([0,1]); m.CreateCreaseLengthsAttr([2]); m.CreateCreaseSharpnessesAttr([3])
for scheme in ['catmullClark','bilinear','loop']:
    # Loop is authored on triangulated topology.
    def b(s,scheme=scheme):
        subd(s,scheme)
        if scheme=='loop':
            m=UsdGeom.Mesh(s.GetPrimAtPath('/World/Mesh')); m.CreateFaceVertexCountsAttr([3]*12); m.CreateFaceVertexIndicesAttr([0,3,2,0,2,1,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7])
    geom('subdivision-'+scheme.lower(),scheme+' subdivision with crease',b,('Subdivision scheme',attr('/World/Mesh','subdivisionScheme',scheme)))
def shapes(s):
    for i,cls in enumerate((UsdGeom.Sphere,UsdGeom.Capsule,UsdGeom.Cone,UsdGeom.Cylinder)):
        x=cls.Define(s,'/World/'+cls.__name__); x.AddTranslateOp().Set(Gf.Vec3d((i-1.5)*1.8,0,0)); x.CreateDisplayColorAttr([Gf.Vec3f(.2+i*.2,.6,.8-i*.12)])
geom('analytic-primitives','Analytic primitives',shapes,('Sphere and cylinder exist',lambda s: s.GetPrimAtPath('/World/Sphere').IsA(UsdGeom.Sphere) and s.GetPrimAtPath('/World/Cylinder').IsA(UsdGeom.Cylinder)))
def curves(s):
    c=UsdGeom.BasisCurves.Define(s,'/World/Curves'); c.CreateTypeAttr('cubic'); c.CreateBasisAttr('bezier'); c.CreateWrapAttr('nonperiodic'); c.CreateCurveVertexCountsAttr([4,4]); c.CreatePointsAttr([(-2,0,0),(-1,2,0),(0,2,0),(1,0,0),(-2,-1,0),(-1,1,0),(0,1,0),(1,-1,0)]); c.CreateWidthsAttr([.12]); c.SetWidthsInterpolation('constant')
geom('bezier-curves','Bezier curves',curves,('Cubic Bezier basis',attr('/World/Curves','basis','bezier')))
def points(s):
    p=UsdGeom.Points.Define(s,'/World/Points'); p.CreatePointsAttr([(-1,0,0),(0,1,0),(1,0,0),(0,-1,0)]); p.CreateWidthsAttr([.35,.5,.35,.5]); p.SetWidthsInterpolation('vertex')
geom('points-widths','Points with widths',points,('Four point widths',lambda s: len(UsdGeom.Points(s.GetPrimAtPath('/World/Points')).GetWidthsAttr().Get())==4))
def orientation(s):
    for i,token in enumerate(['leftHanded','rightHanded']):
        m=mesh(s,'/World/'+token,[(-.6,0,0),(.6,0,0),(0,1,0)],[3],[0,1,2]); m.CreateOrientationAttr(token); m.AddTranslateOp().Set(Gf.Vec3d((i-.5)*2,0,0)); m.CreateDoubleSidedAttr(True)
geom('mesh-orientation','Mesh orientation',orientation,('Left-handed orientation',attr('/World/leftHanded','orientation','leftHanded')))
def indexed_topology(s):
    mesh(s,'/World/Mesh',[(-1,0,-1),(0,1,0),(1,0,-1),(1,0,1),(-1,0,1)],[3,3,3,3],[0,1,2,2,1,3,3,1,4,4,1,0])
geom('shared-vertex-pyramid','Shared vertex pyramid',indexed_topology,('Shared vertices across four faces',lambda s: len(UsdGeom.Mesh(s.GetPrimAtPath('/World/Mesh')).GetPointsAttr().Get())==5))

# Interpolations and indexed data have precise cardinality for the two-triangle mesh.
def primvar_case(name,interpolation,indexed=False,role='color'):
    def build(s):
        m=mesh(s,'/World/Mesh',[(-1,-1,0),(1,-1,0),(1,1,0),(-1,1,0)],[3,3],[0,1,2,0,2,3]); api=UsdGeom.PrimvarsAPI(m)
        n={'constant':1,'uniform':2,'vertex':4,'varying':4,'faceVarying':6}[interpolation]
        if role=='uv': pv=api.CreatePrimvar('st',Sdf.ValueTypeNames.TexCoord2fArray,interpolation); values=[Gf.Vec2f(0,0),Gf.Vec2f(1,0),Gf.Vec2f(1,1),Gf.Vec2f(0,1)]; pv.Set(values); pv.SetIndices([0,1,2,0,2,3])
        else:
            pv=api.CreatePrimvar('displayColor',Sdf.ValueTypeNames.Color3fArray,interpolation); colors=[Gf.Vec3f(.9,.25,.2),Gf.Vec3f(.2,.7,.45),Gf.Vec3f(.2,.4,.9),Gf.Vec3f(.9,.8,.2),Gf.Vec3f(.7,.3,.8),Gf.Vec3f(.2,.8,.8)]
            pv.Set(colors[:2] if indexed else colors[:n]);
            if indexed: pv.SetIndices([i%2 for i in range(n)])
    field='st' if role=='uv' else 'displayColor'
    make(name,interpolation+' '+('indexed UVs' if role=='uv' else 'colors'),'Primvars',interpolation,build,[('Interpolation is '+interpolation,lambda s: UsdGeom.PrimvarsAPI(s.GetPrimAtPath('/World/Mesh')).GetPrimvar(field).GetInterpolation()==interpolation),('Indexing matches fixture',lambda s: UsdGeom.PrimvarsAPI(s.GetPrimAtPath('/World/Mesh')).GetPrimvar(field).IsIndexed()==indexed or role=='uv')])
for interp in ['constant','uniform','vertex','varying','faceVarying']: primvar_case('color-'+interp.lower(),interp)
primvar_case('indexed-face-colors','faceVarying',True)
primvar_case('indexed-uv-seam','faceVarying',True,'uv')

# Animation cases use explicit time samples with a static readable first frame.
def animation(name,label,build,check): make(name,label,'Animation',name,build,[check], 'Time-sampled scene data; playback support varies by attribute')
def animation_base(s):
    scaled_cube(s,'/World/Base',(0,-1.05,0),(4.3,.2,2.8),(.15,.24,.29))
def anim_transform(s):
    animation_base(s); c=UsdGeom.Xform.Define(s,'/World/Animated');c.AddTranslateOp().Set(Gf.Vec3d(-1,0,0));cube(s,'/World/Animated/Body',(0,0,0),(.95,.55,.19),.65); a=c.GetPrim().GetAttribute('xformOp:translate'); a.Set(Gf.Vec3d(-1,0,0),1); a.Set(Gf.Vec3d(1,0,0),48)
    scaled_cube(s,'/World/Animated/Cap',(0,.45,0),(.9,.12,.9),(.22,.35,.4)); scaled_cube(s,'/World/Animated/Bottom',(0,-.45,0),(.9,.12,.9),(.22,.35,.4))
    scaled_cube(s,'/World/Marker',(0,-.78,0),(.13,.4,.13),(.7,.62,.4))
animation('animated-translation','Animated translation',anim_transform,('Translation has two samples',lambda s: s.GetPrimAtPath('/World/Animated').GetAttribute('xformOp:translate').GetTimeSamples()==[1.,48.]))
def anim_rotation(s):
    animation_base(s);scaled_cube(s,'/World/Tower',(0,-.15,0),(.45,1.6,.45),(.38,.47,.48))
    c=UsdGeom.Xform.Define(s,'/World/Animated');c.AddTranslateOp().Set(Gf.Vec3d(0,.55,0));cube(s,'/World/Animated/Hub',(0,0,0),(.95,.65,.22),.3); op=c.AddRotateYOp(); op.Set(0,1); op.Set(120,48)
    for i,(pos,scale) in enumerate([((.85,0,0),(1.65,.1,.22)),((-.85,0,0),(1.65,.1,.22)),((0,0,.65),(.22,.1,1.2))]):
        scaled_cube(s,'/World/Animated/Blade'+str(i),pos,scale,(.9,.4+.1*i,.22))
animation('animated-rotation','Animated rotation',anim_rotation,('Rotation has two samples',lambda s: len(s.GetPrimAtPath('/World/Animated').GetAttribute('xformOp:rotateY').GetTimeSamples())==2))
def anim_scale(s):
    animation_base(s);c=UsdGeom.Xform.Define(s,'/World/Animated');cube(s,'/World/Animated/Body',(0,0,0),(.24,.64,.65));op=c.AddScaleOp();op.Set(Gf.Vec3f(1,1,1),1);op.Set(Gf.Vec3f(2,.5,1),48)
    for i,x in enumerate((-.45,-.22,0,.22,.45)):
        scaled_cube(s,'/World/Animated/Fold'+str(i),(x,0,.55),(.08,1.12,.08),(.98,.68,.26))
    for i,x in enumerate((-.65,.65)):scaled_cube(s,'/World/Animated/End'+str(i),(x,0,0),(.18,1.3,.75),(.18,.3,.36))
animation('animated-scale','Animated scale',anim_scale,('Scale has two samples',lambda s: len(s.GetPrimAtPath('/World/Animated').GetAttribute('xformOp:scale').GetTimeSamples())==2))
def anim_points(s):
    animation_base(s); pts=[(-1.1,.15,0),(-.3,.15,0),(.55,.15,0),(1.3,.15,0),(-1.1,1.4,0),(-.3,1.4,0),(.55,1.4,0),(1.3,1.4,0)]
    m=mesh(s,'/World/Mesh',pts,[4,4,4],[0,1,5,4,1,2,6,5,2,3,7,6],(.2,.65,.78));m.CreateDoubleSidedAttr(True);a=m.GetPointsAttr();a.Set(Vt.Vec3fArray(pts),1);a.Set(Vt.Vec3fArray([(x,y,.45*math.sin(i*1.7)) for i,(x,y,z) in enumerate(pts)]),48)
    scaled_cube(s,'/World/Pole',(-1.18,.25,0),(.12,2.4,.12),(.92,.68,.3))
animation('animated-points','Animated mesh points',anim_points,('Mesh points have two samples',lambda s: len(s.GetPrimAtPath('/World/Mesh').GetAttribute('points').GetTimeSamples())==2))
def anim_visibility(s):
    animation_base(s);scaled_cube(s,'/World/Marker',(0,-.25,0),(.45,1.3,.45),(.3,.42,.46));c=UsdGeom.Xform.Define(s,'/World/Animated');c.AddTranslateOp().Set(Gf.Vec3d(0,.65,0));cube(s,'/World/Animated/Beacon',(0,0,0),(.95,.55,.12),.65);a=c.CreateVisibilityAttr();a.Set('inherited',1);a.Set('invisible',24)
    for i,x in enumerate((-.55,.55)):scaled_cube(s,'/World/Animated/Ray'+str(i),(x,0,0),(.3,.08,.08),(.98,.78,.27))
animation('animated-visibility','Animated visibility',anim_visibility,('Visibility changes at frame 24',lambda s: s.GetPrimAtPath('/World/Animated').GetAttribute('visibility').Get(24)=='invisible'))
def anim_color(s):
    animation_base(s);scaled_cube(s,'/World/Stand',(0,-.65,0),(1.3,.5,1.1),(.3,.36,.43));c=cube(s,'/World/Animated',(0,.15,0),(.9,.2,.1));a=c.GetDisplayColorAttr();a.Set([Gf.Vec3f(.9,.2,.1)],1);a.Set([Gf.Vec3f(.1,.3,.9)],48)
    for i,x in enumerate((-.52,.52)):scaled_cube(s,'/World/Frame'+str(i),(x,.15,.53),(.09,1.25,.08),(.95,.7,.25))
    scaled_cube(s,'/World/Top',(0,.78,0),(1.35,.14,1.2),(.2,.33,.4))
animation('animated-color','Animated display color',anim_color,('Display color has two samples',lambda s: len(s.GetPrimAtPath('/World/Animated').GetAttribute('primvars:displayColor').GetTimeSamples())==2))

# Scene schema and transform composition.
def scene(name,label,build,check):
    make(name,label,'Scene',name,build,[check])
    if wanted(name) and name=='sphere-light': entries[-1].update(group='Lights',environment='none',thumbnailCameraLight=False,scenePrimitiveLightIntensityScale=.1)
def point_instances(s):
    p=UsdGeom.PointInstancer.Define(s,'/World/Instances'); proto=cube(s,'/World/Instances/Prototype',(0,0,0),(.9,.5,.2),.7); p.CreatePrototypesRel().SetTargets([proto.GetPath()]); p.CreateProtoIndicesAttr([0,0,0,0]); p.CreatePositionsAttr([(-1.5,0,0),(-.5,0,0),(.5,0,0),(1.5,0,0)]); p.CreateScalesAttr([(1,1,1),(.7,1.5,.7),(1,.7,1),(.7,1,.7)])
scene('point-instancer','Point instancer',point_instances,('Four point instances',lambda s: len(UsdGeom.PointInstancer(s.GetPrimAtPath('/World/Instances')).GetPositionsAttr().Get())==4))
def purposes(s):
    for i,purpose in enumerate(['default','render','proxy','guide']):
        c=cube(s,'/World/'+purpose,((i-1.5)*1.5,0,0),(.2+i*.2,.65,.8-i*.1)); c.CreatePurposeAttr(purpose)
scene('imageable-purposes','Imageable purposes',purposes,('Guide purpose authored',attr('/World/guide','purpose','guide')))
def nested(s):
    x=UsdGeom.Xform.Define(s,'/World/Parent'); x.AddTranslateOp().Set(Gf.Vec3d(1,0,0)); x.AddRotateZOp().Set(35); cube(s,'/World/Parent/Child',(1,0,0)); cube(s,'/World/Origin',(0,0,0),(.9,.3,.2),.3)
scene('nested-transforms','Nested transforms',nested,('Parent has ordered transform operations',lambda s: len(UsdGeom.Xformable(s.GetPrimAtPath('/World/Parent')).GetOrderedXformOps())==2))
def reset(s):
    x=UsdGeom.Xform.Define(s,'/World/Parent'); x.AddTranslateOp().Set(Gf.Vec3d(2,0,0)); c=cube(s,'/World/Parent/Child',(0,0,0)); c.SetResetXformStack(True); cube(s,'/World/Marker',(2,0,0),(.9,.3,.2),.3)
scene('reset-transform','Reset transform stack',reset,('Child resets transform stack',lambda s: UsdGeom.Xformable(s.GetPrimAtPath('/World/Parent/Child')).GetResetXformStack()))
def camera_subjects(s):
    for i,(x,z,col) in enumerate([(-1.5,1.0,(.9,.35,.2)),(0,0,(.2,.7,.55)),(1.5,-1.0,(.35,.45,.9))]):
        cube(s,'/World/Block'+str(i),(x,0,z),col)
    scaled_cube(s,'/World/CameraBase',(0,-.65,0),(5,.2,4),(.15,.24,.3))
def camera_pose(cam):
    cam.AddTransformOp().Set(Gf.Matrix4d().SetLookAt(Gf.Vec3d(4,3.5,8),Gf.Vec3d(0,0,0),Gf.Vec3d(0,1,0)).GetInverse())
def cameras(s):
    camera_subjects(s);cam=UsdGeom.Camera.Define(s,'/World/Camera');cam.CreateProjectionAttr('perspective');cam.CreateFocalLengthAttr(35);cam.CreateHorizontalApertureAttr(36);cam.CreateVerticalApertureAttr(27);camera_pose(cam)
scene('perspective-camera','Perspective camera',cameras,('Focal length is 35',attr('/World/Camera','focalLength',35)))
def ortho(s):
    camera_subjects(s);cam=UsdGeom.Camera.Define(s,'/World/Camera');cam.CreateProjectionAttr('orthographic');cam.CreateHorizontalApertureAttr(75);cam.CreateVerticalApertureAttr(56.25);camera_pose(cam)
scene('orthographic-camera','Orthographic camera',ortho,('Orthographic projection',attr('/World/Camera','projection','orthographic')))
def lighting(s):
    camera_subjects(s);cam=UsdGeom.Camera.Define(s,'/World/Camera');cam.CreateFocalLengthAttr(35);cam.CreateHorizontalApertureAttr(36);cam.CreateVerticalApertureAttr(27);camera_pose(cam);l=UsdLux.SphereLight.Define(s,'/World/Key');l.CreateIntensityAttr(35);l.CreateRadiusAttr(1);l.AddTranslateOp().Set(Gf.Vec3d(2,4,3))
scene('sphere-light','Sphere light',lighting,('Sphere light intensity authored',attr('/World/Key','inputs:intensity',35)))
def bounds(s):
    trio(s); Usd.ModelAPI(s.GetPrimAtPath('/World')).SetKind('component'); m=UsdGeom.ModelAPI(s.GetPrimAtPath('/World')); m.SetExtentsHint([Gf.Vec3f(-2,-1,-1),Gf.Vec3f(2,1,1)])
scene('model-extents','Model extents hint',bounds,('Model kind is component',lambda s: s.GetPrimAtPath('/World').GetMetadata('kind')=='component'))

if SELECT:
    assert len(entries)==len(SELECT), (SELECT,len(entries))
    def merge(path,updates,key=None):
        old=json.loads(path.read_text()); rows=old[key] if key else old; by_id={v['id']:v for v in updates}; rows[:]=[by_id.get(v['id'],v) for v in rows]; path.write_text(json.dumps(old,indent=2)+'\n')
    merge(OUT/'manifest.json',entries);merge(OUT/'native-validation.json',validation,'results')
else:
    assert len(entries)==45, len(entries)
    (OUT/'manifest.json').write_text(json.dumps(entries,indent=2)+'\n')
    (OUT/'native-validation.json').write_text(json.dumps({'openusdVersion':list(Usd.GetVersion()),'loadPolicy':'LoadAll','results':validation},indent=2)+'\n')
print('Generated and validated',len(entries),'fixtures')
