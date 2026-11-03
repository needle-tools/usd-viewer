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
        result = {'needle:ssgi': settings.ssgi, 'needle:samples': settings.samples,
                  'needle:environment': settings.environment, 'needle:toneMapping': 'none'}
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
    environment: bpy.props.BoolProperty(name='Fallback HDR Environment', default=True,
                                       update=update_settings,
                                       description='Use the viewer environment when the scene has no authored lights')

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
        self.layout.prop(settings, 'environment')

classes = (NeedleHydraSettings, NeedleHydraRenderEngine, NeedleHydraPanel)

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
