"""Run with Blender --background --factory-startup --python blender-smoke.py."""
import json
from pathlib import Path
import sys
import bpy

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'hosts/blender'))
import needle_hydra
needle_hydra.register()
from pxr import UsdImagingGL
assert 'HdNeedleRendererPlugin' in UsdImagingGL.Engine.GetRendererPlugins()
bpy.context.scene.render.engine = 'NEEDLE_HYDRA'
bpy.context.scene.render.resolution_x = 256
bpy.context.scene.render.resolution_y = 256
bpy.context.scene.render.resolution_percentage = 100
bpy.context.scene.view_settings.view_transform = 'Standard'
bpy.context.scene.view_layers[0].use_pass_z = True
material = bpy.data.materials.new('Needle smoke material')
material.use_nodes = True
material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (0.8,0.15,0.05,1)
bpy.data.objects['Cube'].data.materials.clear()
bpy.data.objects['Cube'].data.materials.append(material)
bpy.ops.render.render()
result = bpy.data.images.get('Render Result')
assert result is not None
output = root / '.build/blender/smoke.png'
result.save_render(str(output))
capture = bpy.data.images.load(str(output), check_existing=False)
pixels = list(capture.pixels)
red_pixels = sum(1 for r, g, b in zip(pixels[0::4], pixels[1::4], pixels[2::4])
                 if r > 0.02 and r > 2 * g and r > 2 * b)
assert red_pixels > 1000, f'Expected the authored red cube, found {red_pixels} red pixels'
bpy.data.images.remove(capture)
(root / '.build/blender/smoke.json').write_text(json.dumps({'host': bpy.app.version_string, 'renderer': bpy.context.scene.render.engine, 'output': str(output), 'redPixels': red_pixels}, indent=2))
print('NEEDLE_BLENDER_RENDER_COMPLETE', output)
