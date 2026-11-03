"""Real Blender scene, MaterialX shading, SSGI effect and rendered-viewport setup.

Run in a fresh Blender session via --factory-startup. Background runs verify
both Beauty and Basic; GUI runs leave the scene in rendered mode for picking.
"""
import json
import math
from pathlib import Path
import sys
import bpy
from mathutils import Vector

root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'hosts/blender'))
import needle_hydra
needle_hydra.register()
scene=bpy.context.scene
for obj in list(scene.objects):bpy.data.objects.remove(obj,do_unlink=True)
# Use an explicit Blender world, just as a real scene does. The Blender add-on
# deliberately disables the web viewer's implicit fallback illumination.
world=bpy.data.worlds.new('Parity studio world')
world.use_nodes=True
environment=world.node_tree.nodes.new('ShaderNodeTexEnvironment')
environment.image=bpy.data.images.load(str(root.parent/'public/environments/neutral.hdr'),check_existing=True)
world.node_tree.links.new(environment.outputs['Color'],world.node_tree.nodes['Background'].inputs['Color'])
scene.world=world

def position(value):return (value[0],-value[2],value[1])
def material(name,color):
    result=bpy.data.materials.new(name)
    node=result.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value=(*color,1)
    node.inputs['Roughness'].default_value=.5
    return result
gray=material('Room',(.6,.6,.6));red=material('Red',(.8,.04,.02))
green=material('Green',(.03,.6,.08));blue=material('Blue',(.1,.3,.8))
def plane(name,points,indices):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata([position(p) for p in points],[],[indices]);mesh.update()
    obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj);obj.data.materials.append(gray)
plane('Floor',[(-3,-1,-2),(3,-1,-2),(3,-1,2),(-3,-1,2)],[0,3,2,1])
plane('Wall',[(-3,-1,-1.5),(3,-1,-1.5),(3,2.5,-1.5),(-3,2.5,-1.5)],[0,1,2,3])
def cube(name,location,size,surface):
    bpy.ops.mesh.primitive_cube_add(size=size,location=position(location))
    obj=bpy.context.object;obj.name=name;obj.data.materials.append(surface);return obj
cube('Red',(-1,-.35,0),1.3,red)
bpy.ops.mesh.primitive_uv_sphere_add(segments=10,ring_count=10,radius=.65,location=position((1,-.35,0)))
sphere=bpy.context.object;sphere.name='Green';sphere.data.materials.append(green)
for polygon in sphere.data.polygons:polygon.use_smooth=True
left=cube('LeftInstance',(-.65,1.25,0),.5,blue)
right=left.copy();right.data=left.data;right.name='RightInstance';right.location=position((.65,1.25,0));scene.collection.objects.link(right)
camera_data=bpy.data.cameras.new('Parity Camera');camera=bpy.data.objects.new('Parity Camera',camera_data);scene.collection.objects.link(camera)
camera.location=position((0,.5,8));camera.rotation_euler=(Vector(position((0,.5,0)))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.sensor_fit='VERTICAL';camera_data.angle=math.radians(42);camera_data.clip_start=.1;camera_data.clip_end=100
scene.camera=camera
scene.render.engine='NEEDLE_HYDRA'
scene.render.resolution_x=scene.render.resolution_y=256;scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard'
scene.needle_hydra.samples=32
output=root/'.build/blender/room';output.mkdir(parents=True,exist_ok=True)

if bpy.app.background:
    captures={}
    for ssgi in [True,False]:
        scene.needle_hydra.ssgi=ssgi
        bpy.ops.render.render()
        path=output/('beauty.png' if ssgi else 'basic.png')
        bpy.data.images['Render Result'].save_render(str(path))
        image=bpy.data.images.load(str(path),check_existing=False)
        captures[ssgi]=list(image.pixels);bpy.data.images.remove(image)
    beauty,basic=captures[True],captures[False]
    effect=sum(abs(a-b) for i,(a,b) in enumerate(zip(beauty,basic)) if i%4!=3)/(256*256*3)
    red_pixels=sum(1 for i in range(0,len(beauty),4) if beauty[i]>.05 and beauty[i]>beauty[i+1]*2 and beauty[i]>beauty[i+2]*2)
    assert effect>.005,('SSGI had no visible effect',effect)
    assert red_pixels>1000,('Authored MaterialX color missing',red_pixels)
    report={'host':bpy.app.version_string,'renderer':scene.render.engine,'ssgiMeanEffect':effect,'redPixels':red_pixels}
    (output/'smoke.json').write_text(json.dumps(report,indent=2)+'\n')
    print('NEEDLE_BLENDER_PARITY',json.dumps(report),flush=True)
else:
    scene.needle_hydra.ssgi=True
    bpy.ops.object.select_all(action='DESELECT')
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active
                space.region_3d.view_perspective='CAMERA'
                space.shading.type='RENDERED'
    print('NEEDLE_BLENDER_VIEWPORT_READY',flush=True)
