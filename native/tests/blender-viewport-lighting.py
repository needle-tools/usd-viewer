"""Check rendered-viewport lighting controls through Blender's actual Hydra adapter.

Run in a fresh GUI session with --factory-startup. Set NEEDLE_TEST_KEEP_OPEN=1
for manual inspection of the shading popover after the test.
"""
import json
import os
import runpy
import time
import traceback
from pathlib import Path
import bpy
import numpy as np
from bpy_extras.view3d_utils import location_3d_to_region_2d

root=Path(__file__).resolve().parents[1]
bpy.context.preferences.view.show_splash=False
runpy.run_path(str(root/'tests/blender-parity.py'))
scene=bpy.context.scene
scene.needle_hydra.ssgi=False
# Compare the background itself, without the camera's outside-frame dimming.
scene.camera.data.show_passepartout=False
world=bpy.data.worlds.new('Viewport lighting regression')
world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.12,.2,.45,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
scene.world=world
light=bpy.data.lights.new('Viewport sun','SUN');light.energy=2
sun=bpy.data.objects.new('Viewport sun',light);scene.collection.objects.link(sun)
sun.rotation_euler=(.4,.5,.6)
window=bpy.context.window
area=next(a for a in window.screen.areas if a.type=='VIEW_3D')
region=next(r for r in area.regions if r.type=='WINDOW')
space=area.spaces.active
space.overlay.show_overlays=False
space.camera=scene.camera;space.region_3d.view_perspective='CAMERA'
space.region_3d.view_camera_zoom=0;space.region_3d.view_camera_offset=(0,0)
shading=space.shading
shading.use_scene_world_render=True;shading.use_scene_lights_render=False
hdris=[sl.name for sl in bpy.context.preferences.studio_lights if sl.type=='WORLD']
assert len(hdris)>=2,hdris
output=root/'.build/blender/viewport-lighting';output.mkdir(parents=True,exist_ok=True)
captures={};phase=0;changed=time.monotonic();started=changed;draws=0

def capture_draw():
    global draws
    draws+=1
handler=bpy.types.SpaceView3D.draw_handler_add(capture_draw,(),'WINDOW','POST_PIXEL')

def capture(name):
    path=output/(name+'.png')
    with bpy.context.temp_override(window=window,area=area,region=region):
        bpy.ops.screen.screenshot(filepath=str(path))
    image=bpy.data.images.load(str(path),check_existing=False)
    pixels=np.array(image.pixels,dtype=np.float32).reshape(image.size[1],image.size[0],4)
    bpy.data.images.remove(image)
    y,x=region.y,region.x;h,w=region.height,region.width
    subject=location_3d_to_region_2d(region,space.region_3d,bpy.data.objects['Red'].matrix_world.translation)
    sx,sy=round(x+subject.x),round(y+subject.y)
    return {'all':pixels[y+int(h*.2):y+int(h*.8),x+int(w*.3):x+int(w*.7),:3].copy(),
            'background':pixels[y+int(h*.8):y+int(h*.9),x+int(w*.35):x+int(w*.65),:3].copy(),
            'subject':pixels[sy-6:sy+6,sx-6:sx+6,:3].copy()}

def change_world(value):shading.use_scene_world_render=value

def studio():
    shading.use_scene_lights_render=False
    shading.use_scene_world_render=False
    shading.studio_light=hdris[0]
    shading.studiolight_rotate_z=0
    shading.studiolight_intensity=1
    shading.studiolight_background_alpha=1
    shading.studiolight_background_blur=0

def beauty():
    studio()
    scene.needle_hydra.ssgi=True
    # Resolve enough stochastic GI samples to compare the unchanged subject
    # independently of the large, deterministic background changes.
    scene.needle_hydra.samples=64

def bright():
    scene.needle_hydra.ssgi=False
    studio()
    shading.studiolight_intensity=3
steps=[
    ('scene-world',lambda:None),
    ('scene-lights',lambda:setattr(shading,'use_scene_lights_render',True)),
    ('studio',studio),
    ('studio-almost-opaque',lambda:setattr(shading,'studiolight_background_alpha',.999)),
    ('studio-half',lambda:setattr(shading,'studiolight_background_alpha',.5)),
    ('studio-hidden',lambda:setattr(shading,'studiolight_background_alpha',0)),
    ('studio-restored',studio),
    ('studio-blurred',lambda:setattr(shading,'studiolight_background_blur',.8)),
    ('studio-blurred-half',lambda:setattr(shading,'studiolight_background_alpha',.5)),
    ('beauty',beauty),
    ('beauty-hidden',lambda:setattr(shading,'studiolight_background_alpha',0)),
    ('beauty-blurred',lambda:(setattr(shading,'studiolight_background_alpha',1),
                              setattr(shading,'studiolight_background_blur',.8))),
    ('studio-bright',bright),
    ('studio-rotated',lambda:setattr(shading,'studiolight_rotate_z',1.5)),
    ('studio-other',lambda:setattr(shading,'studio_light',hdris[1])),
    ('scene-world-restored',lambda:change_world(True)),
]

def finish(report):
    bpy.types.SpaceView3D.draw_handler_remove(handler,'WINDOW')
    (output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print('NEEDLE_BLENDER_VIEWPORT_LIGHTING',json.dumps(report),flush=True)
    if os.environ.get('NEEDLE_TEST_KEEP_OPEN')!='1':bpy.ops.wm.quit_blender()

def tick():
    global phase,changed,draws
    try:
        assert time.monotonic()-started<160,'Viewport lighting regression timed out'
        area.tag_redraw()
        if draws<4 or time.monotonic()-changed<(5 if phase==0 else 3):return .1
        with bpy.context.temp_override(window=window,area=area,region=region):
            assert bpy.types.NEEDLE_VIEW3D_PT_shading_lighting.poll(bpy.context)
        name=steps[phase][0];captures[name]=capture(name)
        phase+=1
        if phase<len(steps):
            steps[phase][1]();changed=time.monotonic();draws=0;return .1
        def difference(a,b,part='all'):return float(np.abs(captures[a][part]-captures[b][part]).mean())
        effects={
            'sceneLights':difference('scene-world','scene-lights'),
            'sceneWorld':difference('scene-world','studio'),
            'studioIntensity':difference('studio','studio-bright'),
            'studioRotation':difference('studio-bright','studio-rotated'),
            'studioSelection':difference('studio-rotated','studio-other'),
            'worldRestore':difference('scene-world','scene-world-restored'),
            'backgroundOpacity':difference('studio','studio-hidden','background'),
            'backgroundBlur':difference('studio','studio-blurred','background'),
            'blurredOpacity':difference('studio-blurred','studio-blurred-half','background'),
            'opacityOrientation':difference('studio','studio-almost-opaque','background'),
            'studioRestore':difference('studio','studio-restored'),
            'opacityLighting':difference('studio','studio-hidden','subject'),
            'blurLighting':difference('studio','studio-blurred','subject'),
            'beautyOpacity':difference('beauty','beauty-hidden','background'),
            'beautyBlur':difference('beauty','beauty-blurred','background'),
            'beautyOpacityLighting':difference('beauty','beauty-hidden','subject'),
            'beautyBlurLighting':difference('beauty','beauty-blurred','subject'),
        }
        for key in ['sceneLights','sceneWorld','studioIntensity','studioRotation','studioSelection',
                    'backgroundOpacity','backgroundBlur','blurredOpacity','beautyOpacity','beautyBlur']:
            assert effects[key]>.005,(key,effects)
        for key in ['worldRestore','studioRestore','opacityOrientation','opacityLighting','blurLighting',
                    'beautyOpacityLighting','beautyBlurLighting']:
            assert effects[key]<.003,(key,effects)
        theme=np.array(bpy.context.preferences.themes[0].view_3d.space.gradients.gradient)
        effects['themeBackdrop']=float(np.abs(captures['studio-hidden']['background'].mean(axis=(0,1))-theme).mean())
        assert effects['themeBackdrop']<.015,effects
        # Viewport state must not leak into final-render settings.
        from needle_hydra import NeedleHydraRenderEngine
        final=NeedleHydraRenderEngine.get_render_settings(None,'FINAL')
        assert final['needle:backgroundOpacity']==1 and final['needle:backgroundBlur']==0,final
        finish({'host':bpy.app.version_string,'renderer':scene.render.engine,'hdris':hdris[:2],
                'effects':effects,'viewport':[region.width,region.height]})
        return None
    except Exception:
        finish({'error':traceback.format_exc()});return None
bpy.app.timers.register(tick,first_interval=.1)
