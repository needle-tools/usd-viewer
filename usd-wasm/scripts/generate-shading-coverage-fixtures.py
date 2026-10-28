#!/usr/bin/env python3
"""Generate 45 deterministic, self-contained UsdShade/MaterialX coverage scenes.

Requires native OpenUSD Python with the standard MaterialX Sdr library. MaterialX
cases intentionally have no universal surface fallback. Validation checks Sdr
ports, every connection target, bindings, primvar cardinality and composition.
Run with --validate-only to inspect the committed fixtures without rewriting.
"""
from pathlib import Path
import argparse, json, math, struct, zlib
from pxr import Gf, Sdf, Sdr, Usd, UsdGeom, UsdLux, UsdShade, UsdUtils, Vt

ROOT = Path(__file__).resolve().parents[1] / 'tests/fixtures'
OUT = ROOT / 'coverage/shading'
REG = Sdr.Registry()
T = Sdf.ValueTypeNames
CASES = []

def register(name, label, family, feature, shape='sphere', aspirational=False):
    group = 'MaterialX' if name.startswith(('mx_', 'geomprop_')) else 'UsdShade'
    CASES.append(dict(id='shading-' + name, name=name, label=label, group=group,
                      family=family, features=feature, shape=shape, aspirational=aspirational))

for row in [
 ('mx_noise_marble','Noise marble','noise',['MaterialX','noise3d','position','multiply','mix'], 'vase'),
 ('mx_cell_terrazzo','Cell-noise terrazzo','cell',['MaterialX','cellnoise3d','mix'], 'torus'),
 ('mx_worley_ceramic','Worley ceramic','worley',['MaterialX','worleynoise3d','range','mix'], 'vase'),
 ('mx_fractal_rock','Fractal mineral','fractal',['MaterialX','fractal3d','bump'], 'lobed'),
 ('mx_checker_weave','Checker weave','checker',['MaterialX','checkerboard','texcoord'], 'torus'),
 ('mx_four_corner_enamel','Four-corner enamel','ramp4',['MaterialX','ramp4','texcoord'], 'vase'),
 ('mx_hsv_glaze','HSV glaze','hsv',['MaterialX','rgbtohsv','hsvtorgb','multiply'], 'sphere'),
 ('mx_position_stripes','Object-space stripes','stripes',['MaterialX','position','extract','sin','mix'], 'vase'),
 ('mx_triplanar_stone','Triplanar stone','triplanar',['MaterialX','triplanarprojection','image'], 'lobed'),
 ('mx_bump_hammered','Hammered bump','bump',['MaterialX','noise3d','bump','normal'], 'sphere'),
 ('mx_tangent_normal','Tangent normal map','normal',['MaterialX','image','normalmap','tangent'], 'torus'),
 ('mx_layered_clearcoat','Layered clearcoat','coat',['MaterialX','coat','coat_normal','bump'], 'vase'),
 ('mx_absorbing_glass','Absorbing glass','glass',['MaterialX','transmission','transmission_depth','specular_IOR'], 'torus'),
 ('mx_thin_film','Thin-film interference','thinfilm',['MaterialX','thin_film_thickness','thin_film_IOR','noise3d'], 'sphere'),
 ('mx_velvet_sheen','Velvet sheen','sheen',['MaterialX','sheen','sheen_roughness'], 'lobed'),
 ('mx_brushed_anisotropy','Brushed anisotropy','anisotropy',['MaterialX','specular_anisotropy','tangent','specular_rotation'], 'torus'),
 ('mx_blackbody_emission','Blackbody emission','emission',['MaterialX','blackbody','emission_color'], 'lobed'),
 ('mx_wax_subsurface','Wax subsurface','subsurface',['MaterialX','subsurface','subsurface_radius'], 'vase'),
 ('mx_cutout_lattice','Opacity lattice','opacity',['MaterialX','checkerboard','opacity'], 'sphere'),
 ('mx_scalar_displacement','Scalar displacement','displacement',['MaterialX','displacement','fractal3d'], 'sphere'),
 ('mx_nested_nodegraph','Nested nodegraph','nested',['MaterialX','UsdShadeNodeGraph','interface','output forwarding'], 'vase'),
]: register(*row, aspirational=row[2] in {'glass','thinfilm','subsurface','displacement'})
for row in [
 ('geomprop_float_constant','Constant float property','constant','float',False),
 ('geomprop_float_uniform','Uniform float property','uniform','float',False),
 ('geomprop_float_vertex','Vertex float property','vertex','float',False),
 ('geomprop_float_varying','Varying float property','varying','float',False),
 ('geomprop_vector_vertex','Vertex vector property','vertex','vector3',False),
 ('geomprop_color_facevarying','Face-varying color property','faceVarying','color3',False),
 ('geomprop_color_indexed','Indexed color property','faceVarying','color3',True),
 ('geomprop_vector_indexed','Indexed vector property','vertex','vector3',True),
]:
    name,label,interp,kind,indexed=row
    register(name,label,'geomprop',['MaterialX','geompropvalue',kind,interp]+(['indexed primvars'] if indexed else []),'torus')
    CASES[-1].update(interpolation=interp, kind=kind,indexed=indexed)
for name,label,family,features,shape in [
 ('preview_uv_transform','UV transform','uv',['UsdPreviewSurface','UsdTransform2d','rotation','scale','translation'],'vase'),
 ('preview_sampler_wrap','Sampler address modes','wrap',['UsdUVTexture','repeat','mirror','clamp'],'sphere'),
 ('preview_channel_packing','Packed material channels','channels',['UsdUVTexture','r/g/b outputs','metallic','roughness','occlusion'],'torus'),
 ('preview_opacity_threshold','Opacity threshold','cutout',['UsdPreviewSurface','opacity','opacityThreshold','alpha channel'],'sphere'),
 ('preview_normal_texture','Preview normal texture','previewnormal',['UsdUVTexture','scale','bias','normal','raw color space'],'torus'),
 ('shade_material_interface','Material input interface','interface',['UsdShadeMaterial','interface inputs','input forwarding'],'vase'),
 ('shade_nodegraph_interface','Nodegraph input interface','nodeinterface',['UsdShadeNodeGraph','input forwarding','output forwarding'],'torus'),
 ('shade_nested_forwarding','Nested output forwarding','forward',['UsdShadeNodeGraph','nested graphs','output forwarding'],'lobed'),
 ('shade_render_contexts','Render-context precedence','contexts',['UsdShadeMaterial','universal surface','mtlx surface','render context'],'sphere'),
 ('shade_face_subsets','Face material subsets','subsets',['UsdGeomSubset','materialBind','partition'],'torus'),
 ('shade_collection_binding','Collection material binding','collection',['CollectionAPI','collection binding','membership'],'lobed'),
 ('shade_strong_binding','Ancestor binding strength','strong',['MaterialBindingAPI','strongerThanDescendants','inherited binding'],'vase'),
 ('shade_material_purposes','Preview and full purposes','purposes',['MaterialBindingAPI','preview purpose','full purpose'],'sphere'),
 ('shade_material_specializes','Specialized material','specializes',['UsdShadeMaterial','base material','specializes'],'vase'),
 ('shade_primvar_fallback','Missing primvar fallback','fallback',['UsdPrimvarReader_float3','fallback'],'torus'),
 ('shade_specular_workflow','Specular workflow','specular',['UsdPreviewSurface','useSpecularWorkflow','specularColor','clearcoat'],'sphere'),
]: register(name,label,family,features,shape)
assert len(CASES)==45


def png(path, pixels, n=64):
    def chunk(tag,data): return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
    raw=b''.join(b'\0'+bytes(pixels[y*n*4:(y+1)*n*4]) for y in range(n))
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',n,n,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))


def textures():
    folder=OUT/'textures'; folder.mkdir(exist_ok=True)
    for name in ['mosaic','normal','channels']:
        pix=[]
        for y in range(64):
            for x in range(64):
                tile=(x//8+y//8)%2
                if name=='normal':
                    nx=.42*math.sin(x/64*math.tau*6); ny=.42*math.cos(y/64*math.tau*6)
                    pix += [round((nx+1)*127.5),round((ny+1)*127.5),round((math.sqrt(1-nx*nx-ny*ny)+1)*127.5),255]
                elif name=='channels': pix += [x*4,32+y*3,255 if tile else 80,255 if tile else 0]
                else:
                    palette=[(20,165,176),(245,170,55),(228,70,75),(37,52,100)]
                    c=palette[(x//16+2*(y//16))%4]
                    mortar=x%16<2 or y%16<2
                    pix += [int(v*(.22 if mortar else .8+.2*math.sin(x*y+.1))) for v in c]+[255]
        png(folder/(name+'.png'),pix)


def node(stage,path,identifier,**inputs):
    definition=REG.GetShaderNodeByIdentifier(identifier)
    if not definition: raise ValueError('Unknown Sdr identifier '+identifier)
    sh=UsdShade.Shader.Define(stage,path); sh.CreateIdAttr(identifier)
    for key,value in inputs.items(): setin(sh,key,value)
    for key in definition.GetShaderOutputNames():
        sh.CreateOutput(key,definition.GetShaderOutput(key).GetTypeAsSdfType().GetSdfType())
    return sh


def setin(sh,key,value):
    definition=REG.GetShaderNodeByIdentifier(sh.GetIdAttr().Get())
    prop=definition.GetShaderInput(key)
    if prop is None: raise ValueError(f'{sh.GetIdAttr().Get()} has no input {key}')
    ty=prop.GetTypeAsSdfType().GetSdfType()
    inp=sh.CreateInput(key,ty)
    if isinstance(value,UsdShade.Output) or isinstance(value,UsdShade.Input): inp.ConnectToSource(value)
    elif isinstance(value,UsdShade.Shader): inp.ConnectToSource(value.GetOutput('out'))
    else: inp.Set(value)
    return inp


def bind(prim,mat,purpose=''):
    UsdShade.MaterialBindingAPI.Apply(prim).Bind(mat,materialPurpose=purpose)


def preview(stage,path,color=(.06,.48,.56),roughness=.24,**inputs):
    mat=UsdShade.Material.Define(stage,path)
    sh=node(stage,path+'/Surface','UsdPreviewSurface',diffuseColor=color,roughness=roughness,**inputs)
    mat.CreateSurfaceOutput().ConnectToSource(sh.GetOutput('surface'))
    return mat,sh


def mxmaterial(stage,path):
    mat=UsdShade.Material.Define(stage,path)
    sh=node(stage,path+'/Surface','ND_standard_surface_surfaceshader',base_color=(.03,.4,.48),specular_roughness=.26)
    mat.CreateSurfaceOutput('mtlx').ConnectToSource(sh.GetOutput('out'))
    return mat,sh


def mesh(stage,path,shape,offset=(0,0,1.35),scale=1):
    m=UsdGeom.Mesh.Define(stage,path); points=[]; uv=[]; normals=[]; counts=[]; indices=[]
    nu,nv=40,20
    for j in range(nv+1):
        v=j/nv; phi=v*math.pi
        for i in range(nu+1):
            u=i/nu; theta=u*math.tau
            if shape=='torus':
                a=v*math.tau; rad=.82+.29*math.cos(a)
                p=(rad*math.cos(theta),.29*math.sin(a),rad*math.sin(theta))
                n=(math.cos(a)*math.cos(theta),math.sin(a),math.cos(a)*math.sin(theta))
            elif shape=='vase':
                z=(v-.5)*2; r=.55+.27*math.sin(v*math.pi*1.6)**2-.16*v+.10*math.cos(v*math.tau*2)
                p=(r*math.cos(theta),r*math.sin(theta),z)
                n=(math.cos(theta),math.sin(theta),.1)
            else:
                r=1 if shape=='sphere' else 1+.14*math.cos(theta*7)*math.sin(phi)**3+.05*math.cos(phi*8)
                p=(r*math.sin(phi)*math.cos(theta),r*math.sin(phi)*math.sin(theta),r*math.cos(phi))
                n=(math.sin(phi)*math.cos(theta),math.sin(phi)*math.sin(theta),math.cos(phi))
            points.append(tuple(scale*p[k]+offset[k] for k in range(3))); uv.append((u,v)); normals.append(n)
    for j in range(nv):
        for i in range(nu):
            a=j*(nu+1)+i
            indices.extend([a,a+1,a+nu+2,a+nu+1]); counts.append(4)
    # Sphere and torus parameterizations wind inward before reversing.
    if shape!='vase': indices=[x for k in range(0,len(indices),4) for x in reversed(indices[k:k+4])]
    m.CreatePointsAttr(points); m.CreateFaceVertexCountsAttr(counts); m.CreateFaceVertexIndicesAttr(indices)
    m.CreateSubdivisionSchemeAttr('none'); m.CreateDoubleSidedAttr(True)
    m.CreateNormalsAttr(normals); m.SetNormalsInterpolation('vertex')
    pv=UsdGeom.PrimvarsAPI(m)
    pv.CreatePrimvar('st',T.TexCoord2fArray,'vertex').Set(uv)
    pv.CreatePrimvar('tangents',T.Vector3fArray,'vertex').Set([(-math.sin(i/nu*math.tau),0,math.cos(i/nu*math.tau)) if shape=='torus' else (-math.sin(i/nu*math.tau),math.cos(i/nu*math.tau),0) for j in range(nv+1) for i in range(nu+1)])
    pv.CreatePrimvar('displayColor',T.Color3fArray,'constant').Set([(.06,.48,.56)])
    return m


def scene(case):
    path=OUT/(case['name']+'.usda')
    stage=Usd.Stage.CreateNew(str(path)) if not path.exists() else Usd.Stage.Open(str(path))
    stage.GetRootLayer().Clear()
    world=UsdGeom.Xform.Define(stage,'/World'); stage.SetDefaultPrim(world.GetPrim())
    UsdGeom.SetStageUpAxis(stage,UsdGeom.Tokens.z); UsdGeom.SetStageMetersPerUnit(stage,1)
    stage.SetMetadata('documentation',case['label']+'. Authored feature coverage: '+', '.join(case['features'])+'.')
    UsdGeom.Scope.Define(stage,'/World/Looks'); UsdGeom.Xform.Define(stage,'/World/Display')
    obj=mesh(stage,'/World/Display/Artifact',case['shape'])
    mat,sh=(mxmaterial if case['name'].startswith(('mx_','geomprop_')) else preview)(stage,'/World/Looks/Feature')
    bind(obj.GetPrim(),mat)
    ground=UsdGeom.Cylinder.Define(stage,'/World/Plinth'); ground.CreateRadiusAttr(1.3); ground.CreateHeightAttr(.2); ground.CreateAxisAttr('Z')
    UsdGeom.Xformable(ground).AddTranslateOp().Set((0,0,.12)); bind(ground.GetPrim(),preview(stage,'/World/Looks/Plinth',(.035,.045,.065),.32)[0])
    floor=UsdGeom.Cube.Define(stage,'/World/Floor'); floor.CreateSizeAttr(2)
    xf=UsdGeom.Xformable(floor); xf.AddTranslateOp().Set((0,0,-.06)); xf.AddScaleOp().Set((4,4,.04))
    bind(floor.GetPrim(),preview(stage,'/World/Looks/Floor',(.11,.14,.18),.65)[0])
    for name,pos,intensity,size in [('Key',(2,-3,5),12,3),('Rim',(-3,2,4),8,2)]:
        light=UsdLux.RectLight.Define(stage,'/World/'+name); light.CreateIntensityAttr(intensity); light.CreateWidthAttr(size); light.CreateHeightAttr(size)
        matrix=Gf.Matrix4d().SetLookAt(Gf.Vec3d(*pos),Gf.Vec3d(0,0,1),Gf.Vec3d(0,0,1)).GetInverse()
        UsdGeom.Xformable(light).AddTransformOp().Set(matrix)
    dome=UsdLux.DomeLight.Define(stage,'/World/Fill'); dome.CreateIntensityAttr(.32); dome.CreateColorAttr((.65,.78,1))
    cam=UsdGeom.Camera.Define(stage,'/World/Camera'); cam.CreateFocalLengthAttr(50)
    cam.CreateHorizontalApertureAttr(24); cam.CreateVerticalApertureAttr(24)
    UsdGeom.Xformable(cam).AddTransformOp().Set(Gf.Matrix4d().SetLookAt(Gf.Vec3d(3.6,-6,3.3),Gf.Vec3d(0,0,1.25),Gf.Vec3d(0,0,1)).GetInverse())
    return stage,obj,mat,sh


def build_mx(case,stage,obj,mat,sh):
    root=str(mat.GetPath()); family=case['family']; n=lambda name,id,**args: node(stage,root+'/'+name,id,**args)
    if family in {'noise','cell','worley','fractal','stripes','bump','coat','thinfilm','displacement'}:
        pos=n('ObjectPosition','ND_position_vector3',space='object')
        scaled=n('PatternScale','ND_multiply_vector3',in1=pos,in2=(5,5,5))
        noise=n('Noise','ND_'+{'cell':'cellnoise3d','worley':'worleynoise3d','fractal':'fractal3d','displacement':'fractal3d'}.get(family,'noise3d')+'_float',position=scaled)
        remap=n('Range','ND_range_float',**{'in':noise,'inlow':-.4,'inhigh':.7,'outlow':0.,'outhigh':1.,'doclamp':True})
        mix=n('Pigment','ND_mix_color3',bg=(.008,.04,.12),fg=(.8,.49,.11),mix=remap)
        setin(sh,'base_color',mix)
        if family=='stripes':
            extract=n('Axis','ND_extract_vector3',**{'in':scaled,'index':2})
            wave=n('Bands','ND_sin_float',**{'in':extract}); setin(mix,'mix',wave)
        if family in {'bump','fractal','coat'}:
            bump=n('HammeredNormal','ND_bump_vector3',height=noise,scale=.14 if family!='coat' else .05)
            setin(sh,'coat_normal' if family=='coat' else 'normal',bump)
        if family=='bump': setin(sh,'metalness',1.); setin(sh,'base_color',(.65,.29,.08))
        if family=='coat': setin(sh,'coat',1.); setin(sh,'coat_roughness',.08); setin(sh,'specular_roughness',.5)
        if family=='thinfilm':
            thickness=n('FilmThickness','ND_range_float',**{'in':noise,'inlow':-.5,'inhigh':.5,'outlow':100.,'outhigh':1400.})
            setin(sh,'thin_film_thickness',thickness); setin(sh,'thin_film_IOR',1.45); setin(sh,'metalness',.7)
        if family=='displacement':
            dis=n('Relief','ND_displacement_float',displacement=noise,scale=.12)
            mat.CreateDisplacementOutput('mtlx').ConnectToSource(dis.GetOutput('out'))
    elif family in {'checker','ramp4','hsv','opacity','nested'}:
        uv=n('UV','ND_texcoord_vector2',index=0)
        if family=='ramp4':
            pattern=n('FourCorners','ND_ramp4_color3',valuetl=(.03,.8,.7),valuetr=(.9,.5,.02),valuebl=(.1,.02,.4),valuebr=(.9,.02,.15),texcoord=uv)
        else:
            pattern=n('Weave','ND_checkerboard_color3',color1=(.04,.12,.32),color2=(.95,.55,.08),uvtiling=(12,6),texcoord=uv)
        setin(sh,'base_color',pattern)
        if family=='hsv':
            hsv=n('ToHSV','ND_rgbtohsv_color3',**{'in':pattern})
            adjust=n('Saturation','ND_multiply_color3',in1=hsv,in2=(1,.55,1))
            rgb=n('ToRGB','ND_hsvtorgb_color3',**{'in':adjust}); setin(sh,'base_color',rgb)
        if family=='opacity':
            setin(pattern,'color1',(0,0,0)); setin(pattern,'color2',(1,1,1)); setin(sh,'opacity',pattern); setin(sh,'base_color',(.03,.6,.5))
        if family=='nested':
            graph=UsdShade.NodeGraph.Define(stage,root+'/PigmentGraph')
            tint=graph.CreateInput('pigment',T.Color3f); tint.Set((.78,.1,.2))
            inner=UsdShade.NodeGraph.Define(stage,root+'/PigmentGraph/Inner')
            inner.CreateInput('pigment',T.Color3f).ConnectToSource(tint)
            constant=node(stage,str(inner.GetPath())+'/Pigment','ND_constant_color3',value=inner.GetInput('pigment'))
            inner.CreateOutput('color',T.Color3f).ConnectToSource(constant.GetOutput('out'))
            graph.CreateOutput('color',T.Color3f).ConnectToSource(inner.GetOutput('color'))
            setin(pattern,'color1',graph.GetOutput('color'))
    elif family=='triplanar':
        tr=n('Projection','ND_triplanarprojection_color3',filex=Sdf.AssetPath('textures/mosaic.png'),filey=Sdf.AssetPath('textures/mosaic.png'),filez=Sdf.AssetPath('textures/mosaic.png'),blend=.25)
        setin(sh,'base_color',tr)
    elif family=='normal':
        tex=n('NormalTexture','ND_image_vector3',file=Sdf.AssetPath('textures/normal.png'))
        normal=n('TangentNormal','ND_normalmap_float',**{'in':tex,'scale':.65})
        setin(sh,'normal',normal); setin(sh,'metalness',.75)
    elif family=='glass':
        for key,val in dict(base=0.,transmission=1.,transmission_color=(.1,.8,.65),transmission_depth=.8,specular_IOR=1.52,specular_roughness=.06).items():setin(sh,key,val)
    elif family=='sheen':
        for key,val in dict(base_color=(.12,.015,.05),sheen=1.,sheen_color=(.7,.2,.4),sheen_roughness=.3,specular_roughness=.6).items():setin(sh,key,val)
    elif family=='anisotropy':
        tangent=n('Tangent','ND_tangent_vector3',space='object',index=0)
        for key,val in dict(base_color=(.65,.3,.07),metalness=1.,specular_anisotropy=.85,specular_rotation=.125,tangent=tangent).items():setin(sh,key,val)
    elif family=='emission':
        black=n('Incandescence','ND_blackbody',temperature=2200.)
        setin(sh,'emission',.65);setin(sh,'emission_color',black);setin(sh,'base_color',(.015,.006,.002))
    elif family=='subsurface':
        for key,val in dict(base_color=(.85,.28,.1),subsurface=.8,subsurface_color=(1,.45,.13),subsurface_radius=(1,.3,.1),subsurface_scale=.18).items():setin(sh,key,val)
    elif family=='geomprop':
        kind=case['kind']; interp=case['interpolation']; indexed=case['indexed']
        count={'constant':1,'uniform':800,'vertex':861,'varying':861,'faceVarying':3200}[interp]
        ty={'float':T.FloatArray,'vector3':T.Vector3fArray,'color3':T.Color3fArray}[kind]
        palette=[(.02,.12,.4),(.02,.7,.6),(.95,.45,.03),(.5,.02,.15)]
        values=[(.65 if count==1 else i/(count-1)) if kind=='float' else palette[(i//10)%4] for i in range(count)]
        pv=UsdGeom.PrimvarsAPI(obj).CreatePrimvar('finish',ty,interp)
        if indexed: pv.Set(palette); pv.SetIndices([i%4 for i in range(count)])
        else: pv.Set(values)
        gp=n('FinishProperty','ND_geompropvalue_'+kind,geomprop='finish')
        if kind=='float':
            mix=n('FinishRamp','ND_mix_color3',bg=palette[0],fg=palette[2],mix=gp);setin(sh,'base_color',mix);setin(sh,'specular_roughness',gp)
        elif kind=='vector3':
            convert=n('VectorToColor','ND_convert_vector3_color3',**{'in':gp});setin(sh,'base_color',convert)
        else:setin(sh,'base_color',gp)


def build_preview(case,stage,obj,mat,sh):
    root=str(mat.GetPath()); f=case['family']; n=lambda name,id,**args:node(stage,root+'/'+name,id,**args)
    if f in {'uv','wrap','channels','cutout','previewnormal'}:
        uv=n('UV','UsdPrimvarReader_float2',varname='st')
        transform=n('Transform','UsdTransform2d',**{'in':uv.GetOutput('result'),'scale':(3,3),'rotation':30.,'translation':(.15,.1)})
        texture=n('Texture','UsdUVTexture',file=Sdf.AssetPath('textures/'+('normal' if f=='previewnormal' else 'channels' if f in {'channels','cutout'} else 'mosaic')+'.png'),st=transform.GetOutput('result'),wrapS='mirror' if f=='wrap' else 'repeat',wrapT='clamp' if f=='wrap' else 'repeat',sourceColorSpace='raw' if f in {'channels','previewnormal','cutout'} else 'sRGB')
        if f=='channels':
            for key,ch in [('metallic','r'),('roughness','g'),('occlusion','b')]:setin(sh,key,texture.GetOutput(ch))
            setin(sh,'diffuseColor',(.7,.3,.08))
        elif f=='cutout':setin(sh,'opacity',texture.GetOutput('a'));setin(sh,'opacityThreshold',.5)
        elif f=='previewnormal':
            setin(texture,'scale',(2,2,2,2));setin(texture,'bias',(-1,-1,-1,-1));setin(sh,'normal',texture.GetOutput('rgb'))
        else:setin(sh,'diffuseColor',texture.GetOutput('rgb'))
    elif f=='interface':
        inp=mat.CreateInput('pigment',T.Color3f);inp.Set((.8,.15,.04));setin(sh,'diffuseColor',inp)
        inp=mat.CreateInput('finish',T.Float);inp.Set(.16);setin(sh,'roughness',inp)
    elif f in {'nodeinterface','forward'}:
        graph=UsdShade.NodeGraph.Define(stage,root+'/Graph')
        tint=graph.CreateInput('pigment',T.Color3f);tint.Set((.75,.18,.06))
        dest=graph
        if f=='forward':
            dest=UsdShade.NodeGraph.Define(stage,root+'/Graph/Inner')
            dest.CreateInput('pigment',T.Color3f).ConnectToSource(tint)
        reader=node(stage,str(dest.GetPath())+'/Reader','UsdPrimvarReader_float3',varname='missing_tint',fallback=dest.GetInput('pigment'))
        dest.CreateOutput('pigment',T.Float3).ConnectToSource(reader.GetOutput('result'))
        if f=='forward':graph.CreateOutput('pigment',T.Float3).ConnectToSource(dest.GetOutput('pigment'))
        setin(sh,'diffuseColor',graph.GetOutput('pigment'))
    elif f=='contexts':
        mx=node(stage,root+'/MaterialXSurface','ND_standard_surface_surfaceshader',base_color=(.9,.2,.03),specular_roughness=.2)
        mat.CreateSurfaceOutput('mtlx').ConnectToSource(mx.GetOutput('out'))
        setin(sh,'diffuseColor',(.02,.15,.8))
    elif f=='subsets':
        api=UsdShade.MaterialBindingAPI(obj.GetPrim())
        for i,col in enumerate([(.01,.55,.55),(.9,.4,.03),(.5,.03,.2),(.05,.08,.2)]):
            sub=api.CreateMaterialBindSubset('Sector'+str(i),[j for j in range(800) if (j%40)//10==i])
            bind(sub.GetPrim(),preview(stage,root+'/Sector'+str(i),col,.2)[0])
        api.SetMaterialBindSubsetsFamilyType('partition')
    elif f=='collection':
        second=mesh(stage,'/World/Display/Companion','sphere',(1.55,0,.75),.48)
        collection=Usd.CollectionAPI.Apply(stage.GetPrimAtPath('/World/Display'),'Selected')
        collection.CreateIncludesRel().SetTargets([obj.GetPath()]);collection.CreateExpansionRuleAttr('expandPrims')
        UsdShade.MaterialBindingAPI(obj.GetPrim()).UnbindDirectBinding()
        UsdShade.MaterialBindingAPI.Apply(stage.GetPrimAtPath('/World/Display')).Bind(collection,mat,bindingName='SelectedFinish')
        bind(second.GetPrim(),preview(stage,root+'/Companion',(.85,.38,.04))[0])
    elif f=='strong':
        alt=preview(stage,root+'/Descendant',(.85,.05,.15))[0];bind(obj.GetPrim(),alt)
        api=UsdShade.MaterialBindingAPI.Apply(stage.GetPrimAtPath('/World/Display'));api.Bind(mat,bindingStrength=UsdShade.Tokens.strongerThanDescendants)
    elif f=='purposes':
        for purpose,col in [('preview',(.9,.3,.04)),('full',(.15,.035,.7))]:bind(obj.GetPrim(),preview(stage,root+'/'+purpose,col)[0],purpose)
    elif f=='specializes':
        base,base_sh=preview(stage,'/World/Looks/Base',(.05,.45,.65),.19,clearcoat=1.)
        stage.RemovePrim(root+'/Surface');mat.SetBaseMaterial(base)
        inherited=UsdShade.Shader(stage.GetPrimAtPath(root+'/Surface'));setin(inherited,'diffuseColor',(.85,.25,.05))
    elif f=='fallback':
        reader=n('MissingProperty','UsdPrimvarReader_float3',varname='absent_pigment',fallback=(.85,.3,.06));setin(sh,'diffuseColor',reader.GetOutput('result'))
    elif f=='specular':
        for key,val in dict(useSpecularWorkflow=1,specularColor=(.65,.38,.1),diffuseColor=(.025,.04,.06),clearcoat=1.,clearcoatRoughness=.12).items():setin(sh,key,val)


def validate(path):
    stage=Usd.Stage.Open(str(path)); assert stage and stage.GetDefaultPrim(),path
    errors=stage.GetCompositionErrors();assert not errors,(path,errors)
    ids=set();connections=[];primvars=[]
    for prim in stage.Traverse():
        if prim.IsA(UsdShade.Shader):
            sh=UsdShade.Shader(prim);identifier=sh.GetIdAttr().Get();assert REG.GetShaderNodeByIdentifier(identifier),identifier;ids.add(identifier)
        for attr in prim.GetAttributes():
            for target in attr.GetConnections():
                assert stage.GetAttributeAtPath(target),(attr.GetPath(),target)
                connections.append({'input':str(attr.GetPath()),'source':str(target)})
        if prim.IsA(UsdGeom.Mesh):
            m=UsdGeom.Mesh(prim);points=m.GetPointsAttr().Get();indices=m.GetFaceVertexIndicesAttr().Get();counts=m.GetFaceVertexCountsAttr().Get()
            assert sum(counts)==len(indices) and max(indices)<len(points)
            tangents=UsdGeom.PrimvarsAPI(prim).GetPrimvar('tangents').Get()
            normals=m.GetNormalsAttr().Get()
            if tangents and normals and len(tangents)==len(normals):
                assert max(abs(Gf.Dot(t,n)) for t,n in zip(tangents,normals))<1e-5, (prim.GetPath(),'nonorthogonal tangents')
            for pv in UsdGeom.PrimvarsAPI(prim).GetPrimvars():
                if not pv.HasAuthoredValue():continue
                interp=pv.GetInterpolation();val=pv.ComputeFlattened()
                expected={'constant':1,'uniform':len(counts),'vertex':len(points),'varying':len(points),'faceVarying':len(indices)}[interp]
                assert len(val)==expected,(pv.GetPath(),len(val),expected)
                if pv.GetPrimvarName()=='finish':primvars.append({'path':str(pv.GetAttr().GetPath()),'interpolation':interp,'indexed':pv.IsIndexed(),'elementCount':len(val)})
    feature=UsdShade.Material(stage.GetPrimAtPath('/World/Looks/Feature'))
    surface=feature.GetSurfaceOutput('mtlx') if path.stem.startswith(('mx_','geomprop_')) else feature.GetSurfaceOutput()
    assert surface.HasConnectedSource(),path
    bound=UsdShade.MaterialBindingAPI(stage.GetPrimAtPath('/World/Display/Artifact')).ComputeBoundMaterial()[0]
    assert bound,path
    resolved={purpose or 'allPurpose':str(UsdShade.MaterialBindingAPI(stage.GetPrimAtPath('/World/Display/Artifact')).ComputeBoundMaterial(purpose)[0].GetPath()) for purpose in ['', 'preview', 'full']}
    if path.stem=='shade_material_purposes':
        assert resolved['preview']=='/World/Looks/Feature/preview'
        assert resolved['full']=='/World/Looks/Feature/full'
    if path.stem in {'shade_collection_binding','shade_strong_binding'}:
        assert str(bound.GetPath())=='/World/Looks/Feature'
    if path.stem=='shade_face_subsets':
        valid,reason=UsdGeom.Subset.ValidateFamily(UsdGeom.Imageable(stage.GetPrimAtPath('/World/Display/Artifact')),'face','materialBind')
        assert valid,reason
        assert len(UsdShade.MaterialBindingAPI(stage.GetPrimAtPath('/World/Display/Artifact')).GetMaterialBindSubsets())==4
    if path.stem=='shade_material_specializes':
        assert feature.GetBaseMaterialPath()==Sdf.Path('/World/Looks/Base')
        inherited=UsdShade.Shader(stage.GetPrimAtPath('/World/Looks/Feature/Surface'))
        assert inherited.GetInput('clearcoat').Get()==1.
        assert inherited.GetInput('diffuseColor').Get()!=UsdShade.Shader(stage.GetPrimAtPath('/World/Looks/Base/Surface')).GetInput('diffuseColor').Get()
    if path.stem.startswith(('mx_','geomprop_')):
        assert not feature.GetSurfaceOutput().HasConnectedSource(), 'MaterialX fixture must not mask errors with a universal fallback'
    if path.stem=='shade_render_contexts':
        assert feature.ComputeSurfaceSource('mtlx')[0].GetPath()==Sdf.Path('/World/Looks/Feature/MaterialXSurface')
        assert feature.ComputeSurfaceSource('')[0].GetPath()==Sdf.Path('/World/Looks/Feature/Surface')
    return {'shaderIds':sorted(ids),'connections':connections,'primvars':primvars,'boundMaterial':str(bound.GetPath()),'bindingsByPurpose':resolved,'surfaceOutput':str(surface.GetAttr().GetPath())}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--validate-only',action='store_true');args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    if not args.validate_only:textures()
    manifest=[]
    validation=[]
    for case in CASES:
        if not args.validate_only:
            stage,obj,mat,sh=scene(case)
            (build_mx if case['name'].startswith(('mx_','geomprop_')) else build_preview)(case,stage,obj,mat,sh)
            stage.GetRootLayer().Save()
        path=OUT/(case['name']+'.usda');assertions=validate(path)
        files=[str(path.relative_to(ROOT))]
        for asset in ['mosaic','normal','channels']:
            if 'textures/'+asset+'.png' in path.read_text(): files.append('coverage/shading/textures/'+asset+'.png')
        ismx=case['name'].startswith(('mx_','geomprop_'))
        entry={k:case[k] for k in ['id','label','group','features']}
        entry.update(root=files[0],files=files,scenePrimitiveLightIntensityScale=1,expected={
          'native':'Native USD composition and Sdr node validation pass; Storm reference required for rendered appearance.',
          'needle':('Aspirational: '+', '.join(case['features'][1:])+'. Render support must be verified.' if case['aspirational'] else 'Feature verification required; '+('must select the MaterialX graph without a PreviewSurface fallback.' if ismx else 'must preserve authored UsdShade connections and resolved bindings.'))},assertions=assertions)
        manifest.append(entry)
        compliance=UsdUtils.ComplianceChecker(arkit=False,skipVariants=False,rootPackageOnly=False,skipARKitRootLayerCheck=True)
        compliance.CheckCompliance(str(path))
        errors=list(compliance.GetErrors());failed=list(compliance.GetFailedChecks())
        assert not errors and not failed,(path,errors,failed)
        validation.append({'id':entry['id'],'root':entry['root'],'opens':True,'compositionErrors':[],
            'assertions':[{'assertion':name,'passed':True} for name in [
                'All authored shader identifiers resolve in native Sdr',
                'All authored connection targets exist',
                'Mesh indices and primvar interpolation cardinalities are valid',
                'Artifact resolves a bound material and connected surface terminal',
                'Case-specific context, binding, partition and specialization checks pass']],
            'compliance':{'checker':'UsdUtils.ComplianceChecker','errors':errors,'failedChecks':failed},
            'evidence':assertions})
    if not args.validate_only:(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    (OUT/'native-validation.json').write_text(json.dumps({'openusdVersion':list(Usd.GetVersion()),'loadPolicy':'LoadAll','scope':'Authored and composed data; rendered appearance remains unverified by these checks.','results':validation},indent=2)+'\n')
    print(f'Validated {len(manifest)} shading roots, all shader identifiers, connection targets, bindings and primvar cardinalities.')

if __name__=='__main__':main()
