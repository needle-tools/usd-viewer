"""Blender registration for the native Needle Three.js Hydra experiment."""
from pathlib import Path
import bpy
from pxr import Plug

bl_info = {
    'name': 'Needle Three.js Hydra',
    'author': 'Needle',
    'version': (0, 1, 0),
    'blender': (5, 1, 0),
    'location': 'Render Engine',
    'description': 'Experimental Three.js WebGPU Hydra renderer',
    'category': 'Render',
}

class NeedleHydraRenderEngine(bpy.types.HydraRenderEngine):
    bl_idname = 'NEEDLE_HYDRA'
    bl_label = 'Needle Three.js WebGPU'
    bl_delegate_id = 'HdNeedleRendererPlugin'
    bl_use_gpu_context = True
    bl_use_materialx = True
    bl_use_preview = False

    def get_render_settings(self, engine_type):
        settings = bpy.context.scene.needle_hydra
        # Blender supplies the scene world or the viewport's selected studio HDRI.
        # Do not inject the viewer's fallback when both world and lights are absent.
        result = {'needle:ssgi': settings.ssgi, 'needle:samples': settings.samples,
                  'needle:environment': False, 'needle:toneMapping': 'none'}
        if engine_type != 'VIEWPORT':
            result.update({'aovToken:Combined': 'color', 'aovToken:Depth': 'depth'})
        return result

    def update_render_passes(self, scene, render_layer):
        if render_layer.use_pass_combined:
            self.register_pass(scene, render_layer, 'Combined', 4, 'RGBA', 'COLOR')
        if render_layer.use_pass_z:
            self.register_pass(scene, render_layer, 'Depth', 1, 'Z', 'VALUE')

def update_settings(self, context):
    # Hydra settings are read during the engine update, not each redraw.
    # Invalidate the scene when changed from the panel or Python API.
    scene = self.id_data
    if scene:
        scene.update_tag()
    if context and context.screen:
        for area in context.screen.areas:
            if area.type == 'VIEW_3D':
                area.tag_redraw()

class NeedleHydraSettings(bpy.types.PropertyGroup):
    ssgi: bpy.props.BoolProperty(name='Screen-space GI', default=True,
                                update=update_settings,
                                description='Use the browser Beauty pipeline with SSGI and temporal antialiasing')
    samples: bpy.props.IntProperty(name='Temporal Samples', default=128, min=1, max=1024,
                                  update=update_settings)

class NeedleHydraPanel(bpy.types.Panel):
    bl_label = 'Needle Three.js'
    bl_idname = 'RENDER_PT_needle_hydra'
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = 'render'

    @classmethod
    def poll(cls, context):
        return context.scene.render.engine == 'NEEDLE_HYDRA'

    def draw(self, context):
        settings = context.scene.needle_hydra
        self.layout.prop(settings, 'ssgi')
        row = self.layout.row(); row.active = settings.ssgi
        row.prop(settings, 'samples')

class NeedleViewportLightingPanel(bpy.types.Panel):
    bl_idname = 'NEEDLE_VIEW3D_PT_shading_lighting'
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'HEADER'
    bl_label = 'Lighting'
    bl_parent_id = 'VIEW3D_PT_shading'

    @classmethod
    def poll(cls, context):
        return (context.engine == 'NEEDLE_HYDRA' and
                context.space_data.shading.type == 'RENDERED')

    def draw(self, context):
        # Blender's HydraSceneDelegate consumes these per-viewport properties
        # and supplies scene lights / the selected world as ordinary Hydra data.
        shading = context.space_data.shading
        col = self.layout.column()
        col.prop(shading, 'use_scene_lights_render')
        col.prop(shading, 'use_scene_world_render')
        if not shading.use_scene_world_render:
            split = self.layout.split(factor=.9)
            sub = split.column().row()
            sub.scale_y = .6
            sub.template_icon_view(shading, 'studio_light', scale_popup=3)
            split.column().operator('screen.userpref_show', emboss=False, text='',
                                    icon='PREFERENCES').section = 'LIGHTS'
            col = self.layout.column()
            col.prop(shading, 'studiolight_rotate_z', text='Rotation')
            col.prop(shading, 'studiolight_intensity')

classes = (NeedleHydraSettings, NeedleHydraRenderEngine, NeedleHydraPanel,
           NeedleViewportLightingPanel)

def register():
    root = Path(__file__).resolve().parents[3]
    resources = root / '.build/blender/plugin/resources'
    Plug.Registry().RegisterPlugins(str(resources))
    if not Plug.Registry().GetPluginWithName('hdNeedle'):
        raise RuntimeError('Build the plugin against this Blender version before registering it')
    for cls in classes:
        if not cls.is_registered:
            bpy.utils.register_class(cls)
    bpy.types.Scene.needle_hydra = bpy.props.PointerProperty(type=NeedleHydraSettings)

def unregister():
    if hasattr(bpy.types.Scene, 'needle_hydra'):
        del bpy.types.Scene.needle_hydra
    for cls in reversed(classes):
        if cls.is_registered:
            bpy.utils.unregister_class(cls)
