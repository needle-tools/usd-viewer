"""Blender integration test: actual rendered viewport, native picking and SSGI.

Run in a separate GUI process with --factory-startup; closes only that process.
The API selection operator exercises Blender's own viewport selection path.
"""
import json
import os
import runpy
import time
import traceback
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from bpy_extras.view3d_utils import location_3d_to_region_2d

root=Path(__file__).resolve().parents[1]
bpy.context.preferences.view.show_splash=False
runpy.run_path(str(root/'tests/blender-parity.py'))
output=root/'.build/blender/viewport';output.mkdir(parents=True,exist_ok=True)
window=bpy.context.window
area=next(area for area in window.screen.areas if area.type=='VIEW_3D')
region=next(region for region in area.regions if region.type=='WINDOW')
space=area.spaces.active
space.overlay.show_outline_selected=True
started=time.monotonic();phase=0;phase_started=started;draws=0
latest=None;beauty=None;selected_beauty=None;selected=[]
last_samples={}
camera_ready=False

def capture():
    global draws
    if bpy.context.area!=area:return
    draws+=1

handler=bpy.types.SpaceView3D.draw_handler_add(capture,(),'WINDOW','POST_PIXEL')

def screenshot(name):
    path=output/(name+'.png')
    with bpy.context.temp_override(window=window,area=area,region=region):
        bpy.ops.screen.screenshot(filepath=str(path))
    image=bpy.data.images.load(str(path),check_existing=False)
    pixels=np.array(image.pixels,dtype=np.float32).reshape(image.size[1],image.size[0],4)
    bpy.data.images.remove(image)
    return pixels

def project(point,pixels):
    value=location_3d_to_region_2d(region,space.region_3d,point)
    assert value is not None
    # Region/project coordinates are framebuffer pixels on Retina, while
    # Window.width/height are logical points. Do not apply the scale twice.
    return (round(value.x+region.x),round(value.y+region.y))

def finish(report):
    bpy.types.SpaceView3D.draw_handler_remove(handler,'WINDOW')
    (output/'smoke.json').write_text(json.dumps(report,indent=2)+'\n')
    print('NEEDLE_BLENDER_VIEWPORT',json.dumps(report),flush=True)
    if os.environ.get('NEEDLE_TEST_KEEP_OPEN')!='1':bpy.ops.wm.quit_blender()

def tick():
    global phase,phase_started,draws,beauty,selected_beauty,latest,last_samples,camera_ready
    try:
        now=time.monotonic()
        assert now-started<120,'Rendered viewport timed out'
        area.tag_redraw()
        if phase==0 and not camera_ready:
            space.camera=bpy.context.scene.camera
            space.region_3d.view_perspective='CAMERA'
            space.region_3d.view_camera_zoom=0
            space.region_3d.view_camera_offset=(0,0)
            camera_ready=True;phase_started=now;draws=0
            return .1
        if draws<5 or now-phase_started<2:return .1
        assert space.shading.type=='RENDERED'
        assert bpy.context.scene.render.engine=='NEEDLE_HYDRA'
        if phase==0:
            latest=screenshot('beauty')
            rgb=latest[:,:,:3]
            valid=True
            for name,channel in [('Red',0),('Green',1),('LeftInstance',2)]:
                obj=bpy.data.objects[name];x,y=project(obj.matrix_world.translation,latest)
                x+=10;y+=10 # avoid Blender's active-object origin marker
                color=rgb[y,x]
                last_samples[name]={'point':[x,y],'color':color.tolist()}
                valid&=color[channel]>=.03 and color[channel]>=max(np.delete(color,channel))*1.5
            if not valid:return .1
            beauty=latest.copy()
            with bpy.context.temp_override(window=window,area=area,region=region):
                for name in ['Red','RightInstance','Green']:
                    obj=bpy.data.objects[name]
                    point=location_3d_to_region_2d(region,space.region_3d,obj.matrix_world.translation)
                    assert point is not None,('Object not in viewport',name)
                    bpy.ops.view3d.select(location=(round(point.x),round(point.y)),deselect_all=True)
                    assert bpy.context.view_layer.objects.active==obj,('Wrong viewport pick',name,bpy.context.view_layer.objects.active)
                    selected.append(name)
            phase=1;phase_started=now;draws=0
        elif phase==1:
            latest=screenshot('selected')
            rgb=latest[:,:,:3];before=beauty[:,:,:3]
            orange=(rgb[:,:,0]>.5)&(rgb[:,:,1]>.2)&(rgb[:,:,2]<.2)&(rgb[:,:,0]>rgb[:,:,1]*1.3)
            changed=np.max(np.abs(rgb-before),axis=2)>.15
            obj=bpy.data.objects['Green']
            bounds=np.array([project(obj.matrix_world@Vector(corner),latest) for corner in obj.bound_box])
            lo=np.maximum(bounds.min(axis=0)-10,0);hi=np.minimum(bounds.max(axis=0)+10,[rgb.shape[1],rgb.shape[0]])
            yy,xx=np.ogrid[:rgb.shape[0],:rgb.shape[1]]
            center=bounds.mean(axis=0);radius=max(10,min(hi-lo)*.2)
            outside_origin=(xx-center[0])**2+(yy-center[1])**2>radius**2
            outline=int(np.count_nonzero((orange&changed&outside_origin)[lo[1]:hi[1],lo[0]:hi[0]]))
            assert outline>20,('No native Blender selection outline',outline)
            selected_beauty=latest.copy()
            bpy.context.scene.needle_hydra.ssgi=False
            phase=2;phase_started=now;draws=0
        else:
            latest=screenshot('basic')
            # Compare the same selection and only the rendered region; sidebar,
            # status text and selection changes must not stand in for GI.
            y,x=region.y,region.x;h,w=region.height,region.width
            room_bounds=np.array([project(obj.matrix_world@Vector(corner),latest)
                                  for obj in [bpy.data.objects['Floor'],bpy.data.objects['Wall']]
                                  for corner in obj.bound_box])
            lo=np.maximum(room_bounds.min(axis=0),[x,y]);hi=np.minimum(room_bounds.max(axis=0),[x+w,y+h])
            crop=np.s_[lo[1]:hi[1],lo[0]:hi[0],:3]
            effect=float(np.mean(np.abs(latest[crop]-selected_beauty[crop])))
            assert effect>.003,('SSGI was missing from the rendered viewport',effect)
            finish({'host':bpy.app.version_string,'renderer':'NEEDLE_HYDRA','renderedViewport':True,
                    'selected':selected,'selectionOutline':True,'ssgiMeanEffect':effect,
                    'windowPixels':[int(latest.shape[1]),int(latest.shape[0])],
                    'viewport':[region.width,region.height]})
            return None
    except Exception:
        finish({'error':traceback.format_exc(),'samples':last_samples,
                'window':[window.width,window.height],'region':[region.x,region.y,region.width,region.height]})
        return None
    return .1

bpy.app.timers.register(tick,first_interval=.1)
