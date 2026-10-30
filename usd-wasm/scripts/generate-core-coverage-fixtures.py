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

# Looping animations span 1-97 (four seconds); the viewer wraps end back to
# start, so every continuous loop authors identical values at both ends.
LOOP_START, LOOP_END = 1, 97
def loop_phase(t, start=LOOP_START, end=LOOP_END): return ((t-start)%(end-start))/(end-start)
def loop_frames(step, start=LOOP_START, end=LOOP_END): return list(range(start, end+1, step))
def hsv(h, s=.78, v=.95):
    import colorsys
    return Gf.Vec3f(*colorsys.hsv_to_rgb(h%1, s, v))

def setup(name, end=48):
    path=OUT/(name+'.usda')
    stage=Usd.Stage.CreateNew(str(path)); stage.SetStartTimeCode(1); stage.SetEndTimeCode(end)
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

def bar(stage, path, position, scale, color, rotate=None):
    """A box rotated after scaling, so it stays rectangular."""
    g=UsdGeom.Cube.Define(stage,path); g.CreateSizeAttr(1); g.CreateDisplayColorAttr([Gf.Vec3f(*color)])
    g.AddTranslateOp().Set(Gf.Vec3d(*position))
    if rotate: {'X':g.AddRotateXOp,'Y':g.AddRotateYOp,'Z':g.AddRotateZOp}[rotate[0]]().Set(rotate[1])
    g.AddScaleOp().Set(Gf.Vec3f(*scale))
    return g

def ornament(stage, prefix, style='tower'):
    """A compact architectural silhouette with recognizable separate parts."""
    scaled_cube(stage, prefix+'/Foot', (0,-.62,0), (1.45,.18,1.2), (.11,.19,.25))
    scaled_cube(stage, prefix+'/Cornice', (0,.58,0), (1.3,.16,1.15), (.95,.67,.24))
    for i, x in enumerate((-.43,.43)):
        scaled_cube(stage, prefix+'/Window'+str(i), (x,.08,.51), (.19,.35,.05), (.95,.82,.48))
    if style == 'garden':
        cap=UsdGeom.Sphere.Define(stage,prefix+'/Crown'); cap.CreateRadiusAttr(.52); cap.AddTranslateOp().Set(Gf.Vec3d(0,1.1,0)); cap.CreateDisplayColorAttr([Gf.Vec3f(.26,.65,.35)])
    elif style != 'lantern':
        # Cones default to the Z axis; the roof stands on the cornice along Y.
        cap=UsdGeom.Cone.Define(stage,prefix+'/Roof'); cap.CreateRadiusAttr(.8); cap.CreateHeightAttr(.75); cap.CreateAxisAttr('Y'); cap.AddTranslateOp().Set(Gf.Vec3d(0,1.03,0)); cap.CreateDisplayColorAttr([Gf.Vec3f(.8,.27,.18)])
    if style != 'lantern': scaled_cube(stage,prefix+'/Spire',(0,1.52,0),(.09,.45,.09),(.95,.76,.3))
    if style=='windmill':
        # Crossed sails pivot on the hub, clear of the windows and roof.
        sails=UsdGeom.Xform.Define(stage,prefix+'/Sails'); sails.AddTranslateOp().Set(Gf.Vec3d(0,.25,.95))
        for i,angle in enumerate((45,-45)):
            bar(stage,prefix+'/Sails/Sail'+str(i),(0,0,0),(1.7,.17,.08),(.94,.77,.42),('Z',angle))
        hub=UsdGeom.Sphere.Define(stage,prefix+'/Sails/Hub'); hub.CreateRadiusAttr(.16); hub.AddTranslateOp().Set(Gf.Vec3d(0,0,.04)); hub.CreateDisplayColorAttr([Gf.Vec3f(.19,.29,.34)])
        scaled_cube(stage,prefix+'/Axle',(0,.25,.74),(.1,.1,.44),(.19,.29,.34))
    elif style=='beacon':
        UsdGeom.Xform.Define(stage,prefix+'/Beacon')
        for i in range(3):
            bar(stage,prefix+'/Beacon/Arm'+str(i),(0,1.48+i*.12,0),(1.7-i*.35,.06,.08),(.95,.55,.22),('Y',i*55))
    elif style=='gate':
        for i,x in enumerate((-.95,.95)):
            scaled_cube(stage,prefix+'/GatePier'+str(i),(x,.04,.95),(.22,1.4,.3),(.45,.28,.20))
        scaled_cube(stage,prefix+'/GateLintel',(0,.69,.95),(2.1,.18,.35),(.9,.51,.24))
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

def time_varying(stage): return any(a.ValueMightBeTimeVarying() for p in stage.TraverseAll() for a in p.GetAttributes())

def finish(name,label,group,stage,path,features,checks,files=None,needle='Geometry and authored data; individual feature support is viewer dependent'):
    # Static stages do not declare a playback range.
    if not time_varying(stage): stage.GetRootLayer().ClearStartTimeCode(); stage.GetRootLayer().ClearEndTimeCode()
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
def loops(path,name,minimum=2,start=LOOP_START,end=LOOP_END):
    """Samples span the stage interval, both ends agree and the middle differs."""
    def check(s):
        a=s.GetPrimAtPath(path).GetAttribute(name); ts=a.GetTimeSamples()
        return len(ts)>=minimum and ts[0]==start and ts[-1]==end and a.Get(start)==a.Get(end) and a.Get(start+(end-start)//4)!=a.Get(start) and s.GetStartTimeCode()==start and s.GetEndTimeCode()==end
    return check
def make(name,label,group,feature,build,checks,needle='Geometry and authored data; individual feature support is viewer dependent',end=48):
    if not wanted(name): return
    s,p=setup(name,end); build(s); finish(name,label,group,s,p,[feature],checks,needle=needle)

# Independent composition layers are kept next to their roots, with resolvable relative paths.
def composition(name,label,kind):
    if not wanted(name): return
    s,p=setup(name, LOOP_END if kind in ('offset','clip') else 48); companion=OUT/(name+'-asset.usda')
    a=Usd.Stage.CreateNew(str(companion)); UsdGeom.SetStageUpAxis(a, UsdGeom.Tokens.y); UsdGeom.SetStageMetersPerUnit(a, 1); r=UsdGeom.Xform.Define(a,'/Asset'); a.SetDefaultPrim(r.GetPrim()); cube(a,'/Asset/Body',(0,0,0),(0.2,0.65,0.85)); ornament(a,'/Asset', {'payload':'garden','instance':'garden','offset':'windmill','sublayer':'gate','listop':'beacon','over':'lantern'}.get(kind,'tower')); a.GetRootLayer().Save()
    prim=s.DefinePrim('/World/Model','Xform'); ref='./'+companion.name
    composition_ground(s, kind in ('instance','internal-reference','offset','sublayer'))
    if kind=='reference': prim.GetReferences().AddReference(ref,'/Asset')
    elif kind=='payload': prim.GetPayloads().AddPayload(ref,'/Asset')
    elif kind=='offset':
        # The asset turns twice over 1-97. Referenced with scale 2 (and offset -1
        # so asset frame 1 still lands on stage frame 1) the right windmill turns
        # once in the same interval, beside an unmodified reference.
        spin=UsdGeom.Xformable(a.GetPrimAtPath('/Asset/Sails')).AddRotateZOp()
        for t,angle in ((1,0),(49,-360),(97,-720)): spin.Set(angle,t)
        a.GetRootLayer().Save()
        plain=s.DefinePrim('/World/Reference','Xform'); plain.GetReferences().AddReference(ref,'/Asset'); UsdGeom.Xformable(plain).AddTranslateOp().Set(Gf.Vec3d(-1.75,0,0))
        prim.GetReferences().AddReference(Sdf.Reference(ref,Sdf.Path('/Asset'),Sdf.LayerOffset(-1,2))); UsdGeom.Xformable(prim).AddTranslateOp().Set(Gf.Vec3d(1.75,0,0))
    elif kind=='sublayer':
        # The layer is imported as a sublayer with an offset and contributes its own /Asset.
        s.GetRootLayer().subLayerPaths.append(ref); s.GetRootLayer().subLayerOffsets[0]=Sdf.LayerOffset(3,1)
        # A stronger root opinion moves the sublayer's asset beside a local tower.
        UsdGeom.Xformable(s.OverridePrim('/Asset')).AddTranslateOp().Set(Gf.Vec3d(-1.1,0,0))
        UsdGeom.Xform.Define(s,'/World/Local').AddTranslateOp().Set(Gf.Vec3d(1.1,0,0)); cube(s,'/World/Local/Body',(0,0,0),(0.9,0.4,0.2)); ornament(s,'/World/Local','tower')
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
        # The clip holds one beacon turn over clip frames 1-49; the repeated
        # stage time 49 jumps back to clip frame 1, so it plays twice.
        spin=UsdGeom.Xform.Define(a,'/Asset/Beacon').AddRotateYOp(); spin.Set(0,1); spin.Set(360,49); a.GetRootLayer().Save()
        local=UsdGeom.Cube.Define(s,'/World/Model/Body'); local.CreateSizeAttr(1); local.CreateDisplayColorAttr([Gf.Vec3f(.2,.65,.85)]); ornament(s,'/World/Model','beacon'); UsdGeom.Xformable(s.GetPrimAtPath('/World/Model/Beacon')).AddRotateYOp()
        clips=Usd.ClipsAPI(prim); clips.SetClipAssetPaths([Sdf.AssetPath(ref)]); clips.SetClipPrimPath('/Asset'); clips.SetClipActive([(1,0)]); clips.SetClipTimes([(1,1),(49,49),(49,1),(97,49)])
    elif kind=='over':
        prim.GetReferences().AddReference(ref,'/Asset'); UsdGeom.Cube(s.GetPrimAtPath('/World/Model/Body')).CreateDisplayColorAttr([Gf.Vec3f(.9,.45,.1)])
    checks=[]
    if kind=='sublayer': checks=[('Sublayer contributes /Asset/Body',exists('/Asset/Body'))]
    elif kind=='instance': checks=[('Three instanceable prims share a prototype',lambda st: all(st.GetPrimAtPath('/World/Instance'+str(i)).IsInstance() for i in range(3)))]
    elif kind=='clip':
        def clip_loop(st):
            spin=st.GetPrimAtPath('/World/Model/Beacon').GetAttribute('xformOp:rotateY')
            return spin.Get(1)==0 and spin.Get(25)==180 and spin.Get(49)==0 and spin.Get(73)==180 and spin.Get(97)==360 and st.GetEndTimeCode()==97
        checks=[('Clip times replay the one-turn clip twice across 1-97',clip_loop)]
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
    if kind=='offset':
        checks.append(('Reference layer offset maps asset samples 1, 49, 97 to stage 1, 97, 193',lambda st: st.GetPrimAtPath('/World/Model/Sails').GetAttribute('xformOp:rotateZ').GetTimeSamples()==[1.,97.,193.]))
        checks.append(('Unoffset reference turns twice while the scaled one turns once',lambda st: st.GetPrimAtPath('/World/Reference/Sails').GetAttribute('xformOp:rotateZ').GetTimeSamples()==[1.,49.,97.] and st.GetPrimAtPath('/World/Reference/Sails').GetAttribute('xformOp:rotateZ').Get(97)==-720 and st.GetPrimAtPath('/World/Model/Sails').GetAttribute('xformOp:rotateZ').Get(97)==-360))
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
            scaled_cube(s,'/World/Pedestal',(0,-1.12,0),(3.1,.24,3.1),(.18,.28,.35))
            for i,x in enumerate((-1.15,1.15)):scaled_cube(s,'/World/Marker'+str(i),(x,-.95,-1.15),(.18,.1,.18),(.95,.62,.2))
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
# Every implicit gprim with explicit dimensions, seated on an analytic ground plane.
SHAPES=[
    # name, schema, (x,z), attributes, colour, yaw
    ('Cube',UsdGeom.Cube,(-2.2,-.85),{'size':.9},(.93,.42,.24),25),
    ('Sphere',UsdGeom.Sphere,(-.7,-.85),{'radius':.55},(.22,.62,.86),0),
    ('Cylinder',UsdGeom.Cylinder,(.7,-.85),{'radius':.4,'height':1.3,'axis':'Y'},(.25,.72,.52),0),
    ('Cone',UsdGeom.Cone,(2.1,-.85),{'radius':.5,'height':1.4,'axis':'Y'},(.96,.72,.22),0),
    ('Capsule',UsdGeom.Capsule,(-1.35,.85),{'radius':.28,'height':.9,'axis':'X'},(.78,.38,.78),0),
    ('TaperedCylinder',UsdGeom.Cylinder_1,(.25,.85),{'radiusBottom':.45,'radiusTop':.2,'height':.9,'axis':'Y'},(.36,.48,.92),0),
    ('TaperedCapsule',UsdGeom.Capsule_1,(1.65,.85),{'radiusBottom':.32,'radiusTop':.18,'height':.7,'axis':'Y'},(.92,.38,.5),0),
]
def shapes(s):
    ground=UsdGeom.Plane.Define(s,'/World/Ground'); ground.CreateWidthAttr(6); ground.CreateLengthAttr(3.6); ground.CreateAxisAttr('Y'); ground.CreateDoubleSidedAttr(True); ground.CreateDisplayColorAttr([Gf.Vec3f(.16,.21,.25)])
    for name,cls,(x,z),attrs,color,yaw in SHAPES:
        g=cls.Define(s,'/World/'+name)
        for key,value in attrs.items(): g.GetPrim().GetAttribute(key).Set(value)
        g.CreateDisplayColorAttr([Gf.Vec3f(*color)])
        g.CreateExtentAttr(UsdGeom.Boundable.ComputeExtentFromPlugins(g,Usd.TimeCode.Default()))
        lift=-g.GetExtentAttr().Get()[0][1]
        g.AddTranslateOp().Set(Gf.Vec3d(x,lift,z))
        if yaw: g.AddRotateYOp().Set(yaw)
def seated_apart(s):
    cache=UsdGeom.BBoxCache(Usd.TimeCode.Default(),['default']); boxes=[cache.ComputeWorldBound(s.GetPrimAtPath('/World/'+row[0])).ComputeAlignedRange() for row in SHAPES]
    if any(abs(b.GetMin()[1])>1e-5 for b in boxes): return False
    ground=cache.ComputeWorldBound(s.GetPrimAtPath('/World/Ground')).ComputeAlignedRange()
    if any(b.GetMin()[0]<ground.GetMin()[0] or b.GetMax()[0]>ground.GetMax()[0] or b.GetMin()[2]<ground.GetMin()[2] or b.GetMax()[2]>ground.GetMax()[2] for b in boxes): return False
    return all(any(b.GetMin()[i]-a.GetMax()[i]>=.3 or a.GetMin()[i]-b.GetMax()[i]>=.3 for i in (0,2)) for n,a in enumerate(boxes) for b in boxes[n+1:])
geom('analytic-primitives','Analytic primitives',shapes,('Sphere and cylinder exist',lambda s: s.GetPrimAtPath('/World/Sphere').IsA(UsdGeom.Sphere) and s.GetPrimAtPath('/World/Cylinder').IsA(UsdGeom.Cylinder)))
if wanted('analytic-primitives'):
    for description,fn in [('All seven implicit solids author their dimensions and axes',lambda s: all(all(s.GetPrimAtPath('/World/'+row[0]).GetAttribute(k).HasAuthoredValue() for k in row[3]) for row in SHAPES) and s.GetPrimAtPath('/World/Ground').IsA(UsdGeom.Plane)),
                           ('Every solid rests on the ground plane at least 0.3 from its neighbours',seated_apart)]:
        stage=Usd.Stage.Open(str(OUT/'analytic-primitives.usda'))
        if not fn(stage): raise RuntimeError('analytic-primitives: '+description)
        entries[-1]['assertions'].append(description); validation[-1]['assertions'].append({'assertion':description,'passed':True})
def curves(s):
    c=UsdGeom.BasisCurves.Define(s,'/World/Curves'); c.CreateTypeAttr('cubic'); c.CreateBasisAttr('bezier'); c.CreateWrapAttr('nonperiodic'); c.CreateCurveVertexCountsAttr([4,4]); c.CreatePointsAttr([(-2,0,0),(-1,2,0),(0,2,0),(1,0,0),(-2,-1,0),(-1,1,0),(0,1,0),(1,-1,0)]); c.CreateWidthsAttr([.12]); c.SetWidthsInterpolation('constant')
    c.CreateDisplayColorAttr([Gf.Vec3f(.96,.62,.24),Gf.Vec3f(.25,.7,.9)]); c.GetDisplayColorPrimvar().SetInterpolation('uniform')
geom('bezier-curves','Bezier curves',curves,('Cubic Bezier basis',attr('/World/Curves','basis','bezier')))
def points(s):
    p=UsdGeom.Points.Define(s,'/World/Points'); p.CreatePointsAttr([(-1,0,0),(0,1,0),(1,0,0),(0,-1,0)]); p.CreateWidthsAttr([.35,.5,.35,.5]); p.SetWidthsInterpolation('vertex')
    p.CreateDisplayColorAttr([Gf.Vec3f(.95,.45,.25),Gf.Vec3f(.98,.8,.3),Gf.Vec3f(.3,.75,.6),Gf.Vec3f(.35,.55,.95)]); p.GetDisplayColorPrimvar().SetInterpolation('vertex')
geom('points-widths','Points with widths',points,('Four point widths',lambda s: len(UsdGeom.Points(s.GetPrimAtPath('/World/Points')).GetWidthsAttr().Get())==4))
def orientation(s):
    for i,token in enumerate(['leftHanded','rightHanded']):
        m=mesh(s,'/World/'+token,[(-.6,0,0),(.6,0,0),(0,1,0)],[3],[0,1,2]); m.CreateOrientationAttr(token); m.AddTranslateOp().Set(Gf.Vec3d((i-.5)*2,0,0)); m.CreateDoubleSidedAttr(True)
geom('mesh-orientation','Mesh orientation',orientation,('Left-handed orientation',attr('/World/leftHanded','orientation','leftHanded')))
def indexed_topology(s):
    m=mesh(s,'/World/Mesh',[(-1,0,-1),(0,1,0),(1,0,-1),(1,0,1),(-1,0,1)],[3,3,3,3],[0,1,2,2,1,3,3,1,4,4,1,0])
    # One colour per face shows four faces meeting at the single shared apex.
    m.GetDisplayColorAttr().Set([Gf.Vec3f(.93,.45,.24),Gf.Vec3f(.97,.75,.3),Gf.Vec3f(.25,.68,.62),Gf.Vec3f(.33,.5,.9)]); m.GetDisplayColorPrimvar().SetInterpolation('uniform')
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

# Animation cases loop seamlessly over 1-97; visibility blinks over 1-49.
def animation(name,label,build,checks,end=LOOP_END): make(name,label,'Animation',name,build,checks,'Time-sampled scene data; playback support varies by attribute',end)
def ground(s,width,depth,color=(.15,.24,.29)):
    # The top face is y=0, so parts are placed by their resting height.
    scaled_cube(s,'/World/Base',(0,-.1,0),(width,.2,depth),color)
def v3(x,y,z): return Gf.Vec3d(round(x,6),round(y,6),round(z,6))

def anim_transform(s):
    ground(s,4.8,3.2); UsdGeom.Xform.Define(s,'/World/Track')
    # Studs trace the figure-eight that the courier follows.
    for i in range(16):
        u=i/16*math.tau; scaled_cube(s,'/World/Track/Stud'+str(i),(1.5*math.sin(u),.02,.75*math.sin(2*u)),(.12,.04,.12),(.7,.62,.4))
    c=UsdGeom.Xform.Define(s,'/World/Animated'); op=c.AddTranslateOp()
    for t in loop_frames(2):
        a=math.tau*loop_phase(t); op.Set(v3(1.5*math.sin(a),.78+.1*math.sin(2*a),.75*math.sin(2*a)),t)
    cube(s,'/World/Animated/Body',(0,0,0),(.95,.55,.19),.6)
    scaled_cube(s,'/World/Animated/Cap',(0,.35,0),(.75,.1,.75),(.22,.35,.4)); scaled_cube(s,'/World/Animated/Bottom',(0,-.35,0),(.75,.1,.75),(.22,.35,.4))
    lamp=UsdGeom.Sphere.Define(s,'/World/Animated/Lamp'); lamp.CreateRadiusAttr(.1); lamp.AddTranslateOp().Set(Gf.Vec3d(0,.5,0)); lamp.CreateDisplayColorAttr([Gf.Vec3f(.98,.85,.4)])
animation('animated-translation','Animated translation',anim_transform,[('Translation loops over 1-97 with matching endpoints',loops('/World/Animated','xformOp:translate',24))])

def spinner(s,path,position,turns):
    x=UsdGeom.Xform.Define(s,path); x.AddTranslateOp().Set(Gf.Vec3d(*position)); op=x.AddRotateYOp(); op.Set(0,LOOP_START); op.Set(360*turns,LOOP_END); return x
def ball(s,path,position,radius,color):
    g=UsdGeom.Sphere.Define(s,path); g.CreateRadiusAttr(radius); g.AddTranslateOp().Set(Gf.Vec3d(*position)); g.CreateDisplayColorAttr([Gf.Vec3f(*color)]); return g
def anim_rotation(s):
    # An orrery: every spin is a whole number of turns, so the loop is seamless.
    plinth=UsdGeom.Cylinder.Define(s,'/World/Plinth'); plinth.CreateRadiusAttr(2.1); plinth.CreateHeightAttr(.16); plinth.CreateAxisAttr('Y'); plinth.AddTranslateOp().Set(Gf.Vec3d(0,.08,0)); plinth.CreateDisplayColorAttr([Gf.Vec3f(.15,.24,.29)])
    column=UsdGeom.Cylinder.Define(s,'/World/Column'); column.CreateRadiusAttr(.1); column.CreateHeightAttr(1.19); column.CreateAxisAttr('Y'); column.AddTranslateOp().Set(Gf.Vec3d(0,.755,0)); column.CreateDisplayColorAttr([Gf.Vec3f(.38,.47,.48)])
    ball(s,'/World/Sun',(0,1.35,0),.4,(.98,.66,.2))
    spinner(s,'/World/Animated',(0,1.35,0),1)
    scaled_cube(s,'/World/Animated/Arm',(1.05,0,0),(1.3,.05,.05),(.7,.62,.4))
    planet=UsdGeom.Xform.Define(s,'/World/Animated/Planet'); planet.AddTranslateOp().Set(Gf.Vec3d(1.75,0,0))
    ball(s,'/World/Animated/Planet/Body',(0,0,0),.26,(.22,.62,.7))
    ring=UsdGeom.Cylinder.Define(s,'/World/Animated/Planet/Ring'); ring.CreateRadiusAttr(.46); ring.CreateHeightAttr(.02); ring.CreateAxisAttr('Y'); ring.AddRotateXOp().Set(26); ring.CreateDisplayColorAttr([Gf.Vec3f(.9,.8,.55)])
    spinner(s,'/World/Animated/Planet/MoonOrbit',(0,0,0),3); ball(s,'/World/Animated/Planet/MoonOrbit/Moon',(.62,0,0),.1,(.86,.88,.9))
    spinner(s,'/World/Inner',(0,1.05,0),2)
    scaled_cube(s,'/World/Inner/Arm',(.48,0,0),(.62,.045,.045),(.7,.62,.4)); ball(s,'/World/Inner/Planet',(.88,0,0),.19,(.86,.36,.3))
def whole_turns(st):
    turns={'/World/Animated':360,'/World/Inner':720,'/World/Animated/Planet/MoonOrbit':1080}
    return all(st.GetPrimAtPath(p).GetAttribute('xformOp:rotateY').Get(1)==0 and st.GetPrimAtPath(p).GetAttribute('xformOp:rotateY').Get(97)==v for p,v in turns.items()) and st.GetEndTimeCode()==97
animation('animated-rotation','Animated rotation',anim_rotation,[('Rotation has two samples',lambda s: len(s.GetPrimAtPath('/World/Animated').GetAttribute('xformOp:rotateY').GetTimeSamples())==2),('Nested spins complete whole turns over 1-97',whole_turns)])

def anim_scale(s):
    ground(s,4.8,2.8)
    # The bellows squeeze about their base; height and depth keep the volume.
    c=UsdGeom.Xform.Define(s,'/World/Animated'); c.AddTranslateOp().Set(Gf.Vec3d(0,0,.55)); op=c.AddScaleOp()
    for t in loop_frames(2):
        sx=1+.35*(1-math.cos(2*math.tau*loop_phase(t))); k=1/math.sqrt(sx); op.Set(Gf.Vec3f(round(sx,6),round(k,6),round(k,6)),t)
    cube(s,'/World/Animated/Body',(0,.65,0),(.24,.64,.65))
    for i,x in enumerate((-.4,-.2,0,.2,.4)):
        scaled_cube(s,'/World/Animated/Fold'+str(i),(x,.65,.54),(.06,1.1,.08),(.98,.68,.26))
    for i,x in enumerate((-.65,.65)):scaled_cube(s,'/World/Animated/End'+str(i),(x,.65,0),(.18,1.3,.75),(.18,.3,.36))
    UsdGeom.Xform.Define(s,'/World/Equalizer')
    for i in range(7):
        bar_=UsdGeom.Xform.Define(s,'/World/Equalizer/Bar'+str(i)); bar_.AddTranslateOp().Set(Gf.Vec3d((i-3)*.6,0,-.75)); op=bar_.AddScaleOp()
        cycles=(1,2,3,2,1,3,2)[i]
        for t in loop_frames(2):
            h=.25+1.1*(.5-.5*math.cos(math.tau*(cycles*loop_phase(t)+i/7))); op.Set(Gf.Vec3f(1,round(h,6),1),t)
        scaled_cube(s,'/World/Equalizer/Bar'+str(i)+'/Level',(0,.5,0),(.38,1,.38),tuple(hsv(.5+.07*i,.65,.92)))
animation('animated-scale','Animated scale',anim_scale,[('Scale loops over 1-97 with matching endpoints',loops('/World/Animated','xformOp:scale',24)),
    ('Seven equalizer bars scale in whole cycles',lambda st: all(loops('/World/Equalizer/Bar'+str(i),'xformOp:scale',24)(st) for i in range(7)))])

FLAG_U,FLAG_V=16,8
def flag_points(phase):
    points=[]
    for j in range(FLAG_V+1):
        v=j/FLAG_V
        for i in range(FLAG_U+1):
            u=i/FLAG_U; a=u**1.15; wave=math.tau*(1.4*u-2*phase)
            # A travelling wave grows from the pole; the cloth shortens as it billows.
            z=.2*a*math.sin(wave)+.05*a*math.sin(math.tau*(.9*v+.6*u-3*phase))
            x=-1.25+2.3*u-.06*a*(1-math.cos(wave)); y=1.15+1.3*v-.08*u*u
            points.append(Gf.Vec3f(round(x,5),round(y,5),round(z,5)))
    return points
def anim_points(s):
    ground(s,3.4,1.6)
    pole=UsdGeom.Cylinder.Define(s,'/World/Pole'); pole.CreateRadiusAttr(.05); pole.CreateHeightAttr(2.6); pole.CreateAxisAttr('Y'); pole.AddTranslateOp().Set(Gf.Vec3d(-1.3,1.3,0)); pole.CreateDisplayColorAttr([Gf.Vec3f(.92,.68,.3)])
    ball(s,'/World/Finial',(-1.3,2.68,0),.09,(.95,.76,.3))
    indices=[]
    colors=[]
    for j in range(FLAG_V):
        for i in range(FLAG_U):
            a=j*(FLAG_U+1)+i; indices+=[a,a+1,a+FLAG_U+2,a+FLAG_U+1]
            u,v=(i+.5)/FLAG_U,(j+.5)/FLAG_V
            colors.append(Gf.Vec3f(.1,.17,.35) if u<.25 else Gf.Vec3f(*((.12,.6,.62) if v<1/3 else (.95,.9,.78) if v<2/3 else (.95,.45,.18))))
    m=mesh(s,'/World/Mesh',flag_points(0),[4]*(FLAG_U*FLAG_V),indices); m.CreateDoubleSidedAttr(True)
    m.GetDisplayColorAttr().Set(colors); m.GetDisplayColorPrimvar().SetInterpolation('uniform')
    points=m.GetPointsAttr(); extent=m.CreateExtentAttr(UsdGeom.PointBased.ComputeExtent(flag_points(0)))
    for t in loop_frames(2):
        p=flag_points(loop_phase(t)); points.Set(Vt.Vec3fArray(p),t); extent.Set(UsdGeom.PointBased.ComputeExtent(p),t)
def fixed_topology(st):
    pts=st.GetPrimAtPath('/World/Mesh').GetAttribute('points'); ext=st.GetPrimAtPath('/World/Mesh').GetAttribute('extent')
    return len({len(pts.Get(t)) for t in pts.GetTimeSamples()})==1 and ext.GetTimeSamples()==pts.GetTimeSamples()
animation('animated-points','Animated mesh points',anim_points,[('Mesh points loop over 1-97 with matching endpoints',loops('/World/Mesh','points',24)),('Topology is fixed and extent is sampled with the points',fixed_topology)])

VISIBILITY_END=49
def lit(i,frame): return ((frame-1)-6*i)%48<12
def anim_visibility(s):
    ground(s,4,4)
    scaled_cube(s,'/World/Marker',(0,.75,0),(.45,1.5,.45),(.3,.42,.46))
    c=UsdGeom.Xform.Define(s,'/World/Animated');c.AddTranslateOp().Set(Gf.Vec3d(0,1.75,0));cube(s,'/World/Animated/Beacon',(0,0,0),(.95,.55,.12),.5)
    a=c.CreateVisibilityAttr();a.Set('inherited',1);a.Set('invisible',24);a.Set('inherited',VISIBILITY_END)
    for i,x in enumerate((-.4,.4)):scaled_cube(s,'/World/Animated/Ray'+str(i),(x,0,0),(.3,.08,.08),(.98,.78,.27))
    # Eight lamps chase around the tower: each switch is a visibility sample.
    UsdGeom.Xform.Define(s,'/World/Lamps')
    for i in range(8):
        angle=-i/8*math.tau; x,z=1.45*math.cos(angle),1.45*math.sin(angle); lamp='/World/Lamps/Lamp'+str(i)
        UsdGeom.Xform.Define(s,lamp).AddTranslateOp().Set(Gf.Vec3d(x,0,z))
        scaled_cube(s,lamp+'/Post',(0,.2,0),(.12,.4,.12),(.18,.3,.36))
        off=ball(s,lamp+'/Off',(0,.55,0),.15,(.22,.26,.3)); on=ball(s,lamp+'/On',(0,.55,0),.15,tuple(hsv(i/8,.7,1)))
        for f in range(1,VISIBILITY_END+1):
            if f==1 or lit(i,f)!=lit(i,f-1):
                on.CreateVisibilityAttr().Set('inherited' if lit(i,f) else 'invisible',f); off.CreateVisibilityAttr().Set('invisible' if lit(i,f) else 'inherited',f)
def chase(st):
    on=[UsdGeom.Imageable(st.GetPrimAtPath('/World/Lamps/Lamp%d/On'%i)) for i in range(8)]; off=[UsdGeom.Imageable(st.GetPrimAtPath('/World/Lamps/Lamp%d/Off'%i)) for i in range(8)]
    return all(sum(x.ComputeVisibility(f)!='invisible' for x in on)==2 and all((x.ComputeVisibility(f)=='invisible')!=(y.ComputeVisibility(f)=='invisible') for x,y in zip(on,off)) for f in range(1,VISIBILITY_END+1)) and [x.ComputeVisibility(1) for x in on]==[x.ComputeVisibility(VISIBILITY_END) for x in on]
animation('animated-visibility','Animated visibility',anim_visibility,[('Visibility changes at frame 24',lambda s: s.GetPrimAtPath('/World/Animated').GetAttribute('visibility').Get(24)=='invisible'),
    ('Beacon blink returns to its first state at frame 49',lambda s: s.GetPrimAtPath('/World/Animated').GetAttribute('visibility').Get(49)=='inherited' and s.GetEndTimeCode()==VISIBILITY_END),
    ('Eight-lamp chase keeps two lamps lit on every frame',chase)],end=VISIBILITY_END)

def anim_color(s):
    ground(s,4.2,4.2)
    scaled_cube(s,'/World/Stand',(0,.25,0),(1.1,.5,1.0),(.3,.36,.43))
    c=cube(s,'/World/Animated',(0,.95,0),(.9,.2,.1),.9);a=c.GetDisplayColorAttr()
    for t in loop_frames(4): a.Set([hsv(loop_phase(t))],t)
    for i,(x,z) in enumerate(((-.49,-.49),(.49,-.49),(.49,.49),(-.49,.49))):scaled_cube(s,'/World/Frame'+str(i),(x,.95,z),(.08,.9,.08),(.95,.7,.25))
    scaled_cube(s,'/World/Top',(0,1.45,0),(1.1,.1,1.1),(.2,.33,.4))
    # The tile ring carries the same cycle with a phase per tile, so it rotates.
    UsdGeom.Xform.Define(s,'/World/Tiles')
    for i in range(12):
        angle=i/12*math.tau; tile=bar(s,'/World/Tiles/Tile'+str(i),(1.55*math.cos(angle),.03,1.55*math.sin(angle)),(.42,.06,.42),(1,1,1),('Y',-math.degrees(angle)))
        colors=tile.GetDisplayColorAttr()
        for t in loop_frames(4): colors.Set([hsv(loop_phase(t)+i/12)],t)
animation('animated-color','Animated display color',anim_color,[('Display color loops over 1-97 with matching endpoints',loops('/World/Animated','primvars:displayColor',24)),
    ('Twelve floor tiles cycle hue with staggered phase',lambda st: all(loops('/World/Tiles/Tile'+str(i),'primvars:displayColor',24)(st) for i in range(12)) and st.GetPrimAtPath('/World/Tiles/Tile0').GetAttribute('primvars:displayColor').Get(1)!=st.GetPrimAtPath('/World/Tiles/Tile1').GetAttribute('primvars:displayColor').Get(1))])

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
    scaled_cube(s,'/World/CameraBase',(0,-.6,0),(5,.2,4),(.15,.24,.3))
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
