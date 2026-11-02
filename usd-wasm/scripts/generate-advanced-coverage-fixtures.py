#!/usr/bin/env python3
"""Create advanced schema fixtures with OpenUSD Python bindings."""
from pathlib import Path
import sys, os
import json, math, shutil, wave, struct
from pxr import Usd, UsdGeom, UsdSkel, UsdPhysics, UsdVol, UsdMedia, UsdRender, Sdf, Gf, Vt
import skel_faces

BASE=Path(__file__).resolve().parents[1]/'tests/fixtures'; OUT=BASE/'coverage/advanced'; OUT.mkdir(parents=True,exist_ok=True)
entries=[]; results=[]
SELECT=set(sys.argv[1:])
def wanted(name): return not SELECT or name in SELECT
def setup(name):
    path=OUT/(name+'.usda'); stage=Usd.Stage.CreateNew(str(path)); stage.SetStartTimeCode(1); stage.SetEndTimeCode(48); stage.SetFramesPerSecond(24)
    UsdGeom.SetStageUpAxis(stage,'Y'); UsdGeom.SetStageMetersPerUnit(stage,1)
    world=UsdGeom.Xform.Define(stage,'/World'); stage.SetDefaultPrim(world.GetPrim())
    return stage,path

def box(s,p,position=(0,0,0),color=(.25,.65,.8),scale=(1,1,1)):
    g=UsdGeom.Cube.Define(s,p); g.CreateSizeAttr(1); g.AddTranslateOp().Set(Gf.Vec3d(*position)); g.AddScaleOp().Set(Gf.Vec3f(*scale)); g.CreateDisplayColorAttr([Gf.Vec3f(*color)]); return g

def finish(name,label,group,stage,path,features,checks,files=(),expected='Authored schema data; feature rendering depends on the viewer'):
    # Static stages do not declare a playback range; spatial audio keeps one for its clip.
    if name!='spatial-audio' and not any(a.ValueMightBeTimeVarying() for prim in stage.TraverseAll() for a in prim.GetAttributes()):
        stage.GetRootLayer().ClearStartTimeCode(); stage.GetRootLayer().ClearEndTimeCode()
    stage.GetRootLayer().Save()
    if name.startswith('physics-'): path.write_text(path.read_text().rstrip()+'\n')
    reopened=Usd.Stage.Open(str(path),load=Usd.Stage.LoadAll)
    assert reopened, name
    check_results=[]
    for description,fn in checks:
        try: passed=bool(fn(reopened))
        except Exception as e: raise RuntimeError(name+': '+description) from e
        if not passed: raise RuntimeError(name+': '+description)
        check_results.append({'assertion':description,'passed':True})
    errors=[str(x) for x in reopened.GetCompositionErrors()]; assert not errors,(name,errors)
    paths=[str(path.relative_to(BASE))]+[str(p.relative_to(BASE)) for p in files]
    entries.append(dict(id='advanced-'+name,label=label,group=group,root=paths[0],files=paths,features=features,expected={'native':'Opens and preserves checked data in OpenUSD 26.05; rendering is feature dependent','needle':expected},assertions=[c[0] for c in checks]))
    results.append({'id':'advanced-'+name,'root':paths[0],'opens':True,'compositionErrors':errors,'assertions':check_results})

def A(path,name): return lambda s:s.GetPrimAtPath(path).GetAttribute(name).HasAuthoredValueOpinion()
def V(path,name,value): return lambda s:s.GetPrimAtPath(path).GetAttribute(name).Get()==value

def skel_case(name,label,mode):
    if not wanted(name): return
    if mode not in skel_faces.MODES:
        from skeletal_props import create_prop
        s,p=setup(name)
        create_prop(s,p,name,label,mode,finish,box)
        return
    # Expressive face rigs with localized smile/wink/surprise targets, looping over frames 1-97.
    s,p=setup(name); checks=skel_faces.build(s,mode)
    finish(name,label,'Skeletal animation',s,p,['UsdSkel',mode],checks,expected='Compare deformed points with native UsdSkel.BakeSkinning; static mesh visibility alone does not establish playback correctness')
for x in [('skel-rest','Skeleton rest transforms','rest'),('skel-bind','Skeleton bind transforms','bind'),('skel-joint-names','Skeleton joint names','names'),('skel-weighted','Two joint influences','multi'),('skel-dual-quaternion','Dual quaternion skinning','dual'),('skel-translation','Animated joint translation','translate'),('skel-rotation','Animated joint rotation','rotation'),('blendshape','Blend shape','blend'),('blendshape-sparse','Sparse blend shape','sparse'),('blendshape-inbetween','Blend shape inbetween','inbetween')]: skel_case(*x)

# Native default time shows the bind pose; choose an actual performance frame.
for entry in entries:
    if entry['group'] == 'Skeletal animation': entry['thumbnailFrame'] = skel_faces.THUMBNAIL_FRAMES.get(entry['id'], 13)

# 26.05 retains typed schema and attributes even though it lacks the 26.11 schema class.
def splat_case(name,label,mode):
    if not wanted(name): return
    s,p=setup(name); prim=s.DefinePrim('/World/Splats','ParticleField3DGaussianSplat'); n=18
    positions=[Gf.Vec3f(math.cos(i*math.tau/n)*1.2, math.sin(i*math.tau/n)*1.2, .2*math.sin(i*3)) for i in range(n)]
    def put(key,typ,value): prim.CreateAttribute(key,typ).Set(value)
    put('positions',Sdf.ValueTypeNames.Point3fArray,positions)
    put('scales',Sdf.ValueTypeNames.Float3Array,[Gf.Vec3f(.22,.1 if mode=='anisotropic' else .22,.12) for _ in positions])
    put('orientations',Sdf.ValueTypeNames.QuatfArray,[Gf.Quatf(Gf.Rotation(Gf.Vec3d(0,0,1),i*20).GetQuat()) for i in range(n)])
    put('opacities',Sdf.ValueTypeNames.FloatArray,[.2+.7*i/(n-1) if mode=='opacity' else .8 for i in range(n)])
    degree=1 if mode=='harmonics' else 0; put('radiance:sphericalHarmonicsDegree',Sdf.ValueTypeNames.Int,degree)
    coeff=[]
    for i in range(n):
        if degree:
            # Neutral DC plus strong first-order RGB bands. SH uses the
            # camera-to-particle direction: +Z views are warm, -Z views cool.
            coeff.extend([Gf.Vec3f(0,-.35,0), Gf.Vec3f(.15,-.35,.15),
                          Gf.Vec3f(-.85,0,.85), Gf.Vec3f(.3,.1,-.3)])
        else: coeff.append(Gf.Vec3f(.8*math.cos(i*math.tau/n),.8*math.sin(i*math.tau/n),.1))
    put('radiance:sphericalHarmonicsCoefficients',Sdf.ValueTypeNames.Float3Array,coeff)
    checks=[('Particle field schema type preserved',lambda st:st.GetPrimAtPath('/World/Splats').GetTypeName()=='ParticleField3DGaussianSplat'),('18 particles and matching scales',lambda st:len(st.GetPrimAtPath('/World/Splats').GetAttribute('positions').Get())==18 and len(st.GetPrimAtPath('/World/Splats').GetAttribute('scales').Get())==18),('Spherical harmonic degree',V('/World/Splats','radiance:sphericalHarmonicsDegree',degree))]
    if degree: checks.append(('Four RGB coefficients per particle with opposing red-blue Z band',lambda st:len(st.GetPrimAtPath('/World/Splats').GetAttribute('radiance:sphericalHarmonicsCoefficients').Get())==72 and st.GetPrimAtPath('/World/Splats').GetAttribute('radiance:sphericalHarmonicsCoefficients').Get()[2][0]<-.8 and st.GetPrimAtPath('/World/Splats').GetAttribute('radiance:sphericalHarmonicsCoefficients').Get()[2][2]>.8))
    finish(name,label,'Gaussian splats',s,p,['ParticleField3DGaussianSplat',mode],checks,expected='Requires a particle-field capable renderer such as Spark; OpenUSD 26.05 Storm does not render splats')
for x in [('splat-ring','Gaussian particle ring','ring'),('splat-anisotropic','Anisotropic Gaussian particles','anisotropic'),('splat-opacity','Gaussian opacity gradient','opacity'),('splat-harmonics','Directional spherical harmonics','harmonics')]: splat_case(*x)

# Physics is schema authoring, not a baked simulation.
def physics_case(name,label,mode):
    if not wanted(name): return
    s,p=setup(name); floor=box(s,'/World/Floor',(0,-.7,0),(.19,.27,.33),(4,.2,2)); UsdPhysics.CollisionAPI.Apply(floor.GetPrim())
    one=box(s,'/World/BodyA',(-.8,0,0),(.85,.38,.18)); two=UsdGeom.Xform.Define(s,'/World/BodyB');two.AddTranslateOp().Set(Gf.Vec3d(.8,.3,0));two_visual=box(s,'/World/BodyB/Visual',(0,0,0),(.2,.65,.8))
    # The actors remain the authored rigid/collision bodies; surrounding
    # construction makes the intended physical relationship legible in a still.
    def shape(actor,pos,scale):
        actor.GetPrim().GetAttribute('xformOp:translate').Set(Gf.Vec3d(*pos)); (two_visual if actor==two else actor).GetPrim().GetAttribute('xformOp:scale').Set(Gf.Vec3f(*scale))
    if mode=='mass':
        shape(one,(-1.2,.32,0),(1.15,1.15,1.15)); shape(two,(1.2,.7,0),(.65,.65,.65))
        box(s,'/World/Beam',(0,-.17,0),(.86,.68,.35),(3.4,.13,.3)); box(s,'/World/Fulcrum',(0,-.36,0),(.35,.46,.5),(.3,.55,.6))
        for i,x in enumerate((-.45,.45)):box(s,'/World/WeightMark'+str(i),(-1.2+x,.32,.58),(.98,.73,.28),(.12,.7,.04))
    elif mode=='scene':
        shape(one,(-1.35,.08,0),(.5,.5,.5));shape(two,(-1.35,1.55,0),(.5,.5,.5))
        for i,y in enumerate((-.2,.35,.9,1.45,2)):
            box(s,'/World/Rung'+str(i),(1.1,y,0),(.95,.72,.31),(1.2,.09,.2))
        for i,x in enumerate((.55,1.65)):box(s,'/World/Side'+str(i),(x,.9,0),(.35,.55,.65),(.12,2.4,.16))
        ball=UsdGeom.Sphere.Define(s,'/World/GravityBall');ball.CreateRadiusAttr(.38);ball.AddTranslateOp().Set(Gf.Vec3d(-.1,1.8,0));ball.CreateDisplayColorAttr([Gf.Vec3f(.93,.38,.18)]);UsdPhysics.RigidBodyAPI.Apply(ball.GetPrim());UsdPhysics.CollisionAPI.Apply(ball.GetPrim())
    elif mode=='fixed':
        shape(one,(-1,.1,0),(.45,1.65,.55));shape(two,(1,.1,0),(.45,1.65,.55));box(s,'/World/BodyB/ArchBeam',(-1,.87,0),(.96,.67,.24),(2.45,.28,.65))
        for i,x in enumerate((-.65,.65)):box(s,'/World/BodyB/Bolt'+str(i),(x-1,.88,.36),(.18,.25,.31),(.15,.15,.07))
    elif mode=='revolute':
        shape(one,(-1.2,.3,0),(.25,1.9,.4));shape(two,(-.15,.3,0),(1.65,1.75,.22))
        for i,y in enumerate((-.45,.85)):box(s,'/World/Hinge'+str(i),(-1.05,y,.2),(.95,.7,.28),(.25,.22,.25))
        knob=UsdGeom.Sphere.Define(s,'/World/BodyB/Knob');knob.CreateRadiusAttr(.12);knob.AddTranslateOp().Set(Gf.Vec3d(.6,-.1,.18));knob.CreateDisplayColorAttr([Gf.Vec3f(.98,.8,.3)])
        box(s,'/World/BodyB/DoorInset',(0,0,.125),(.12,.36,.42),(1.2,1.25,.04))
    elif mode=='prismatic':
        shape(one,(-1.1,.1,0),(.3,.6,.5));shape(two,(.4,.25,0),(1,.65,.7))
        for i,z in enumerate((-.4,.4)):box(s,'/World/Rail'+str(i),(0,-.12,z),(.85,.72,.37),(3.4,.12,.12))
        for i,x in enumerate((-.9,0,.9)):box(s,'/World/Tick'+str(i),(x,-.03,.49),(.8,.86,.79),(.08,.05,.15))
    elif mode=='group':
        shape(one,(-1.05,.25,0),(.65,.65,.65));shape(two,(1.05,.25,0),(.65,.65,.65))
        for i,x in enumerate((-1.05,0,1.05)):
            box(s,'/World/RackPost'+str(i),(x,.95,-.42),(.78,.66,.35),(.12,1.8,.12))
            box(s,'/World/Cell'+str(i),(x,-.1,.03),(.36,.47,.55),(.85,.08,.85))
        box(s,'/World/RackTop',(0,1.85,-.42),(.78,.66,.35),(2.4,.12,.12))
    for obj in (one,two): UsdPhysics.RigidBodyAPI.Apply(obj.GetPrim())
    UsdPhysics.CollisionAPI.Apply(one.GetPrim());UsdPhysics.CollisionAPI.Apply(two_visual.GetPrim())
    checks=[('Rigid body and collision APIs authored',lambda st:st.GetPrimAtPath('/World/BodyA').HasAPI(UsdPhysics.RigidBodyAPI) and st.GetPrimAtPath('/World/BodyA').HasAPI(UsdPhysics.CollisionAPI))]
    checks.append(('Body B owns a collision child',lambda st:st.GetPrimAtPath('/World/BodyB').HasAPI(UsdPhysics.RigidBodyAPI) and st.GetPrimAtPath('/World/BodyB/Visual').HasAPI(UsdPhysics.CollisionAPI)))
    if mode=='mass':
        mass=UsdPhysics.MassAPI.Apply(one.GetPrim()); mass.CreateMassAttr(3); mass.CreateCenterOfMassAttr((.1,0,0)); checks.append(('Mass is three units',V('/World/BodyA','physics:mass',3)))
    elif mode=='scene':
        sc=UsdPhysics.Scene.Define(s,'/World/PhysicsScene'); sc.CreateGravityDirectionAttr((0,-1,0)); sc.CreateGravityMagnitudeAttr(9.81); checks.append(('Gravity magnitude authored',A('/World/PhysicsScene','physics:gravityMagnitude')))
    elif mode in ('fixed','revolute','prismatic'):
        cls={'fixed':UsdPhysics.FixedJoint,'revolute':UsdPhysics.RevoluteJoint,'prismatic':UsdPhysics.PrismaticJoint}[mode]; j=cls.Define(s,'/World/Joint'); j.CreateBody0Rel().SetTargets([one.GetPath()]); j.CreateBody1Rel().SetTargets([two.GetPath()]);
        if mode!='fixed': j.CreateAxisAttr('Y' if mode=='revolute' else 'X'); j.CreateLowerLimitAttr(-30 if mode=='revolute' else -.5); j.CreateUpperLimitAttr(30 if mode=='revolute' else .5)
        UsdPhysics.RigidBodyAPI(one.GetPrim()).CreateKinematicEnabledAttr(True)
        anchor={'fixed':(0,.97,0),'revolute':(-1.05,.3,0),'prismatic':(0,.25,0)}[mode]
        cache=UsdGeom.XformCache(); world=Gf.Vec3d(*anchor)
        j.CreateLocalPos0Attr(Gf.Vec3f(cache.GetLocalToWorldTransform(one.GetPrim()).GetInverse().Transform(world)))
        j.CreateLocalPos1Attr(Gf.Vec3f(cache.GetLocalToWorldTransform(two.GetPrim()).GetInverse().Transform(world)))
        if mode=='revolute': UsdPhysics.RigidBodyAPI(two.GetPrim()).CreateAngularVelocityAttr((0,35,0))
        if mode=='prismatic': UsdPhysics.RigidBodyAPI(two.GetPrim()).CreateVelocityAttr((1,0,0))
        checks.append(('Joint connects both bodies',lambda st:bool(st.GetPrimAtPath('/World/Joint').GetRelationship('physics:body0').GetTargets()) and bool(st.GetPrimAtPath('/World/Joint').GetRelationship('physics:body1').GetTargets())))
        def aligned(st):
            cache=UsdGeom.XformCache(); joint=UsdPhysics.Joint(st.GetPrimAtPath('/World/Joint'));p0=cache.GetLocalToWorldTransform(st.GetPrimAtPath('/World/BodyA')).Transform(Gf.Vec3d(joint.GetLocalPos0Attr().Get()));p1=cache.GetLocalToWorldTransform(st.GetPrimAtPath('/World/BodyB')).Transform(Gf.Vec3d(joint.GetLocalPos1Attr().Get()));return (p0-p1).GetLength()<1e-5
        checks.append(('Joint local anchors agree in world space',aligned))
        checks.append(('Joint support is kinematic',V('/World/BodyA','physics:kinematicEnabled',True)))
    elif mode=='group':
        group=UsdPhysics.CollisionGroup.Define(s,'/World/Group'); group.GetCollidersCollectionAPI().CreateIncludesRel().SetTargets([one.GetPath()]); checks.append(('Collision group includes body',lambda st:bool(UsdPhysics.CollisionGroup(st.GetPrimAtPath('/World/Group')).GetCollidersCollectionAPI().GetIncludesRel().GetTargets())))
    finish(name,label,'Physics',s,p,['UsdPhysics',mode],checks,expected='Physics schema is authored; no simulation result or motion is claimed')
for x in [('physics-mass','Rigid bodies and mass','mass'),('physics-scene','Gravity scene','scene'),('physics-fixed-joint','Fixed joint','fixed'),('physics-revolute-joint','Revolute joint','revolute'),('physics-prismatic-joint','Prismatic joint','prismatic'),('physics-collision-group','Collision group','group')]: physics_case(*x)

def physics_motion_case(name,label,mode):
    if not wanted(name): return
    s,p=setup(name);floor=box(s,'/World/Floor',(0,-.7,0),(.19,.27,.33),(6,.2,2));UsdPhysics.CollisionAPI.Apply(floor.GetPrim())
    scene=UsdPhysics.Scene.Define(s,'/World/PhysicsScene');scene.CreateGravityDirectionAttr((0,-1,0));scene.CreateGravityMagnitudeAttr(9.81)
    if mode=='dominoes':
        for i in range(9):
            tile=box(s,'/World/Tile'+str(i),(-1.9+i*.46,-.08,0),(.8-i*.055,.3+i*.04,.22+i*.035),(.15,1.04,.48));rigid=UsdPhysics.RigidBodyAPI.Apply(tile.GetPrim());UsdPhysics.CollisionAPI.Apply(tile.GetPrim())
            if i==0:
                # Start beyond the balance point so gravity reliably begins the chain.
                rotate=tile.AddRotateZOp();rotate.Set(-22);tile.SetXformOpOrder([tile.GetOrderedXformOps()[0],rotate,tile.GetOrderedXformOps()[1]])
                rigid.CreateAngularVelocityAttr((0,0,-65))
        checks=[('Nine rigid collision tiles',lambda st:all(st.GetPrimAtPath('/World/Tile'+str(i)).HasAPI(UsdPhysics.RigidBodyAPI) and st.GetPrimAtPath('/World/Tile'+str(i)).HasAPI(UsdPhysics.CollisionAPI) for i in range(9))),('First tile has angular velocity',A('/World/Tile0','physics:angularVelocity'))]
    else:
        stand=box(s,'/World/Stand',(0,.65,-.45),(.38,.46,.5),(.18,2.5,.18));UsdPhysics.CollisionAPI.Apply(stand.GetPrim());box(s,'/World/StandArm',(0,2,-.22),(.38,.46,.5),(.18,.18,.56))
        post=box(s,'/World/Post',(0,2,0),(.85,.52,.22),(.35,.35,.4));UsdPhysics.RigidBodyAPI.Apply(post.GetPrim()).CreateKinematicEnabledAttr(True);UsdPhysics.CollisionAPI.Apply(post.GetPrim())
        body=UsdGeom.Xform.Define(s,'/World/Pendulum');body.AddTranslateOp().Set(Gf.Vec3d(.55,1.15,0));body.AddRotateZOp().Set(32);UsdPhysics.RigidBodyAPI.Apply(body.GetPrim())
        rod=box(s,'/World/Pendulum/Rod',(0,0,0),(.28,.58,.72),(.15,1.7,.16));UsdPhysics.CollisionAPI.Apply(rod.GetPrim())
        bob=UsdGeom.Sphere.Define(s,'/World/Pendulum/Bob');bob.CreateRadiusAttr(.34);bob.AddTranslateOp().Set(Gf.Vec3d(0,-.82,0));bob.CreateDisplayColorAttr([Gf.Vec3f(.92,.38,.16)]);UsdPhysics.CollisionAPI.Apply(bob.GetPrim())
        joint=UsdPhysics.RevoluteJoint.Define(s,'/World/Hinge');joint.CreateBody0Rel().SetTargets([post.GetPath()]);joint.CreateBody1Rel().SetTargets([body.GetPath()]);joint.CreateAxisAttr('Z')
        cache=UsdGeom.XformCache();anchor=Gf.Vec3d(0,2,0);joint.CreateLocalPos0Attr(Gf.Vec3f(cache.GetLocalToWorldTransform(post.GetPrim()).GetInverse().Transform(anchor)));joint.CreateLocalPos1Attr(Gf.Vec3f(cache.GetLocalToWorldTransform(body.GetPrim()).GetInverse().Transform(anchor)))
        def hinge_aligned(st):
            cache=UsdGeom.XformCache();j=UsdPhysics.Joint(st.GetPrimAtPath('/World/Hinge'));a=cache.GetLocalToWorldTransform(st.GetPrimAtPath('/World/Post')).Transform(Gf.Vec3d(j.GetLocalPos0Attr().Get()));b=cache.GetLocalToWorldTransform(st.GetPrimAtPath('/World/Pendulum')).Transform(Gf.Vec3d(j.GetLocalPos1Attr().Get()));return (a-b).GetLength()<1e-5
        checks=[('Pendulum has dynamic rigid body and bob collider',lambda st:st.GetPrimAtPath('/World/Pendulum').HasAPI(UsdPhysics.RigidBodyAPI) and st.GetPrimAtPath('/World/Pendulum/Bob').HasAPI(UsdPhysics.CollisionAPI)),('Pendulum hinge is revolute about Z',V('/World/Hinge','physics:axis','Z')),('Pendulum joint anchors agree in world space',hinge_aligned)]
    finish(name,label,'Physics',s,p,['UsdPhysics','rigid bodies','collision','gravity',mode],checks,expected='Authored dynamics and initial state; simulation requires a compatible physics backend.')
for x in [('physics-dominoes','Domino chain','dominoes'),('physics-pendulum','Pendulum','pendulum')]: physics_motion_case(*x)

# VDB data from the OpenUSD test suite; copied locally for standalone resolution.
source_root=os.environ.get('OPENUSD_SOURCE')
source=Path(source_root)/'pxr/usdImaging/usdImagingGL/testenv/testUsdImagingGLVdbVolume' if source_root else None
for fn in ('densityAndHeat.vdb','smoke_000001.vdb','smoke_000002.vdb'):
    target=OUT/fn
    if not target.exists():
        if source is None: raise FileNotFoundError(f'{target} is missing; set OPENUSD_SOURCE to an OpenUSD source checkout')
        shutil.copyfile(source/fn,target)
def volume_case(name,label,mode):
    if not wanted(name): return
    s,p=setup(name); vol=UsdVol.Volume.Define(s,'/World/Volume'); files=[]
    bounds=json.loads((OUT/'vdb-bounds.json').read_text())['smoke_000002.vdb' if mode=='sequence' else 'densityAndHeat.vdb']
    vol.CreateExtentAttr([tuple(bounds['min']),tuple(bounds['max'])])
    fields=['density','heat'] if mode=='two-fields' else ['density']
    for f in fields:
        field=UsdVol.OpenVDBAsset.Define(s,'/World/'+f.title()); field.CreateFieldNameAttr(f)
        filename='smoke_000002.vdb' if mode=='sequence' else 'densityAndHeat.vdb'; field.CreateFilePathAttr(Sdf.AssetPath('./'+filename)); files.append(OUT/filename)
        if mode=='sequence':
            field.GetFilePathAttr().Set(Sdf.AssetPath('./smoke_000002.vdb'),1)
            field.GetFilePathAttr().Set(Sdf.AssetPath('./smoke_000001.vdb'),24)
            field.GetFilePathAttr().Set(Sdf.AssetPath('./smoke_000002.vdb'),48)
            files.append(OUT/'smoke_000001.vdb')
        vol.CreateFieldRelationship(f,field.GetPath())
    if mode=='transform': vol.AddTranslateOp().Set(Gf.Vec3d(1,0,0)); vol.AddScaleOp().Set(Gf.Vec3f(.5,1,.5))
    checks=[('Density field relationship resolves',lambda st:bool(UsdVol.Volume(st.GetPrimAtPath('/World/Volume')).GetFieldPath('density'))),('VDB file resolves on disk',lambda st:bool(st.GetPrimAtPath('/World/Density').GetAttribute('filePath').Get().resolvedPath))]
    if mode=='two-fields': checks.append(('Heat field relationship resolves',lambda st:bool(UsdVol.Volume(st.GetPrimAtPath('/World/Volume')).GetFieldPath('heat'))))
    if mode=='sequence': checks.append(('Nonempty, empty, nonempty field sequence',lambda st:st.GetPrimAtPath('/World/Density').GetAttribute('filePath').GetTimeSamples()==[1.,24.,48.]))
    if mode=='transform': checks.append(('Volume has two ordered transforms',lambda st:len(UsdGeom.Xformable(st.GetPrimAtPath('/World/Volume')).GetOrderedXformOps())==2))
    finish(name,label,'Volume',s,p,['UsdVol',mode],checks,sorted(set(files)),expected='OpenVDB field dependencies resolve; volume rendering requires a supported delegate and material')
    entries[-1]['renderer']='bounded-volume'
for x in [('volume-density','OpenVDB density field','density'),('volume-density-heat','OpenVDB density and heat','two-fields'),('volume-sequence','Time sampled VDB field','sequence'),('volume-transformed','Transformed VDB volume','transform')]: volume_case(*x)

def curve_case(name,label,mode):
    if not wanted(name): return
    s,p=setup(name)
    if mode=='nurbs':
        c=UsdGeom.NurbsCurves.Define(s,'/World/Curve'); c.CreateCurveVertexCountsAttr([4]); c.CreateOrderAttr([4]); c.CreateKnotsAttr([0,0,0,0,1,1,1,1]); c.CreateRangesAttr([(0,1)]); c.CreatePointsAttr([(-2,0,0),(-1,2,0),(1,-2,0),(2,0,0)]); c.CreateWidthsAttr([.12]); c.SetWidthsInterpolation('constant'); check=('NURBS order is four',lambda st:list(st.GetPrimAtPath('/World/Curve').GetAttribute('order').Get())==[4])
    elif mode=='patch':
        c=UsdGeom.NurbsPatch.Define(s,'/World/Patch'); c.CreateDoubleSidedAttr(True); c.CreateUVertexCountAttr(4); c.CreateVVertexCountAttr(4); c.CreateUOrderAttr(4); c.CreateVOrderAttr(4); c.CreateUKnotsAttr([0,0,0,0,1,1,1,1]); c.CreateVKnotsAttr([0,0,0,0,1,1,1,1]); c.CreateURangeAttr((0,1)); c.CreateVRangeAttr((0,1)); c.CreatePointsAttr([(x-1.5,.5*math.sin(x*math.pi/3)*math.sin(y*math.pi/3),y-1.5) for y in range(4) for x in range(4)]); check=('NURBS patch has sixteen points',lambda st:len(st.GetPrimAtPath('/World/Patch').GetAttribute('points').Get())==16)
    elif mode=='periodic':
        c=UsdGeom.BasisCurves.Define(s,'/World/Curve'); c.CreateTypeAttr('cubic'); c.CreateBasisAttr('bspline'); c.CreateWrapAttr('periodic'); c.CreateCurveVertexCountsAttr([8]); c.CreatePointsAttr([(math.cos(i*math.tau/8)*1.5,math.sin(i*math.tau/8)*1.5,0) for i in range(8)]); c.CreateWidthsAttr([.15]); c.SetWidthsInterpolation('constant'); check=('Periodic B-spline curve',V('/World/Curve','wrap','periodic'))
    else:
        c=UsdGeom.Points.Define(s,'/World/Points'); c.CreatePointsAttr([(math.cos(i*math.tau/12),math.sin(i*math.tau/12),0) for i in range(12)]); c.CreateWidthsAttr([.15+i*.02 for i in range(12)]); c.SetWidthsInterpolation('vertex'); c.CreateVelocitiesAttr([(0,.1*i,0) for i in range(12)]); check=('Per point velocities',lambda st:len(st.GetPrimAtPath('/World/Points').GetAttribute('velocities').Get())==12)
    c.CreateDisplayColorAttr([Gf.Vec3f(.9,.45,.2)])
    finish(name,label,'Curves and points',s,p,[mode], [check],expected='Curve and point schema data is authored; support varies by viewer')
    if mode in ('nurbs','periodic'): entries[-1].update(complexity='high', thumbnailComplexity='high')
for x in [('nurbs-curve','NURBS curve','nurbs'),('nurbs-patch','NURBS patch','patch'),('periodic-bspline','Periodic B-spline','periodic'),('point-velocities','Points with velocities','points')]: curve_case(*x)

def scene_case(name,label,mode):
    if not wanted(name): return
    s,p=setup(name); box(s,'/World/Subject',(0,0,0),(.2,.7,.65),(1.5,1.5,1.5)); extras=[]
    box(s,'/World/DisplayBase',(0,-1.0,0),(.16,.23,.29),(4.6,.2,2.5))
    if mode=='drawmode':
        for i,x in enumerate((-1.8,1.8)):
            box(s,'/World/Column'+str(i),(x,-.1,0),(.93,.61,.25),(.32,1.6,.35))
            box(s,'/World/ColumnCap'+str(i),(x,.75,0),(.6,.36,.16),(.58,.12,.58))
    elif mode=='render':
        for i,x in enumerate((-1.5,1.5)):
            orb=UsdGeom.Sphere.Define(s,'/World/RenderOrb'+str(i));orb.CreateRadiusAttr(.44);orb.AddTranslateOp().Set(Gf.Vec3d(x,0,.2));orb.CreateDisplayColorAttr([Gf.Vec3f(.95,.45,.2) if i==0 else Gf.Vec3f(.42,.45,.9)])
        box(s,'/World/Backdrop',(0,.35,-1),(.35,.43,.65),(4.2,2.7,.12))
    elif mode=='audio':
        for i,x in enumerate((-1.55,1.55)):
            box(s,'/World/Speaker'+str(i),(x,0,0),(.15,.2,.25),(.7,1.55,.5))
            for j,y in enumerate((-.38,.35)):
                cone=UsdGeom.Sphere.Define(s,'/World/SpeakerCone'+str(i)+str(j));cone.CreateRadiusAttr(.24);cone.AddTranslateOp().Set(Gf.Vec3d(x,y,.27));cone.CreateDisplayColorAttr([Gf.Vec3f(.95,.59,.2)])
    else:
        for i,x in enumerate((-1.5,1.5)):
            orb=UsdGeom.Sphere.Define(s,'/World/FocusTarget'+str(i));orb.CreateRadiusAttr(.38);orb.AddTranslateOp().Set(Gf.Vec3d(x,.2,-i*.5));orb.CreateDisplayColorAttr([Gf.Vec3f(.9,.38,.22) if i==0 else Gf.Vec3f(.25,.5,.9)])
        box(s,'/World/Viewfinder',(0,1.05,0),(.92,.67,.24),(2.1,.1,.12))
    if mode=='drawmode':
        prim=s.GetPrimAtPath('/World/Subject'); Usd.ModelAPI(prim).SetKind('component'); api=UsdGeom.ModelAPI.Apply(prim); api.CreateModelDrawModeAttr('bounds'); api.CreateModelApplyDrawModeAttr(True); api.SetExtentsHint([Gf.Vec3f(-.75,-.75,-.75),Gf.Vec3f(.75,.75,.75)]); check=('Model draw mode is bounds',V('/World/Subject','model:drawMode','bounds'))
    elif mode=='render':
        cam=UsdGeom.Camera.Define(s,'/World/Camera'); cam.AddTranslateOp().Set(Gf.Vec3d(0,1,8)); settings=UsdRender.Settings.Define(s,'/World/Settings'); settings.CreateResolutionAttr(Gf.Vec2i(800,600)); settings.CreateCameraRel().SetTargets([cam.GetPath()]); product=UsdRender.Product.Define(s,'/World/Product'); product.CreateProductNameAttr('output.exr'); var=UsdRender.Var.Define(s,'/World/Color'); var.CreateDataTypeAttr('color3f'); var.CreateSourceNameAttr('Ci'); product.CreateOrderedVarsRel().SetTargets([var.GetPath()]); settings.CreateProductsRel().SetTargets([product.GetPath()]); check=('Render settings point to product and camera',lambda st:bool(UsdRender.Settings(st.GetPrimAtPath('/World/Settings')).GetProductsRel().GetTargets()) and bool(UsdRender.Settings(st.GetPrimAtPath('/World/Settings')).GetCameraRel().GetTargets()))
    elif mode=='audio':
        wav=OUT/'spatial-tone.wav'
        with wave.open(str(wav),'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000); w.writeframes(b''.join(struct.pack('<h',int(1800*math.sin(2*math.pi*440*i/8000))) for i in range(4000)))
        audio=UsdMedia.SpatialAudio.Define(s,'/World/Audio'); audio.CreateFilePathAttr(Sdf.AssetPath('./spatial-tone.wav')); audio.CreateGainAttr(.5); audio.CreateStartTimeAttr(Sdf.TimeCode(1)); audio.CreateEndTimeAttr(Sdf.TimeCode(12)); extras=[wav]; check=('Audio asset resolves',lambda st:bool(st.GetPrimAtPath('/World/Audio').GetAttribute('filePath').Get().resolvedPath))
    else:
        cam=UsdGeom.Camera.Define(s,'/World/Camera'); cam.CreateProjectionAttr('perspective'); cam.CreateFocalLengthAttr(50); cam.CreateFocusDistanceAttr(5); cam.CreateFStopAttr(2.8); cam.CreateShutterOpenAttr(-.25); cam.CreateShutterCloseAttr(.25); cam.AddTranslateOp().Set(Gf.Vec3d(0,1,8)); check=('Camera shutter interval',lambda st:st.GetPrimAtPath('/World/Camera').GetAttribute('shutter:open').Get()==-.25 and st.GetPrimAtPath('/World/Camera').GetAttribute('shutter:close').Get()==.25)
    finish(name,label,'Scene schemas',s,p,[mode],[check],extras,expected='Schema data is authored; draw modes, offline render settings, optics and audio require viewer-specific support')
for x in [('model-draw-mode','Model bounds draw mode','drawmode'),('render-settings','Render settings and products','render'),('spatial-audio','Spatial audio','audio'),('camera-optics','Camera optics and shutter','camera')]: scene_case(*x)
if SELECT:
    assert len(entries)==len(SELECT), (SELECT,len(entries))
    def merge(path,updates,key=None):
        old=json.loads(path.read_text()); rows=old[key] if key else old; by_id={v['id']:v for v in updates}; existing={v['id'] for v in rows}; rows[:]=[by_id.get(v['id'],v) for v in rows]+[v for v in updates if v['id'] not in existing]; path.write_text(json.dumps(old,indent=2)+'\n')
    merge(OUT/'manifest.json',entries);merge(OUT/'native-validation.json',results,'results')
else:
    assert len(entries)==34,len(entries)
    (OUT/'manifest.json').write_text(json.dumps(entries,indent=2)+'\n')
    (OUT/'native-validation.json').write_text(json.dumps({'openusdVersion':list(Usd.GetVersion()),'loadPolicy':'LoadAll','results':results},indent=2)+'\n')
print('Generated and validated',len(entries),'advanced fixtures')
