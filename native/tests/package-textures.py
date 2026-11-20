"""Render resolver-owned USDZ textures through native Hydra, including MaterialX.

Generate small packages instead of depending on a downloaded asset. Two packages
deliberately use the same member names with different image contents. Compare
their PreviewSurface/MaterialX pixels to ordinary loose-file references, and
exercise a packaged HDR dome through the same asset bridge.
"""
import gc
import json
import os
from pathlib import Path
import shutil
import time

import numpy as np
from OpenGL import GL
from pxr import Gf, Plug, Sdf, Usd, UsdGeom, UsdImagingGL, UsdLux, UsdShade, UsdUtils
from PySide6.QtCore import QSize
from PySide6.QtGui import QColor, QImage, QOffscreenSurface, QOpenGLContext
from PySide6.QtOpenGL import QOpenGLFramebufferObject
from PySide6.QtWidgets import QApplication

root = Path(__file__).resolve().parents[1]
host = os.environ.get('NEEDLE_TEST_HOST', 'usdview')
output = root / '.build' / host / 'package-textures'
output.mkdir(parents=True, exist_ok=True)
Plug.Registry().RegisterPlugins(str(root / '.build' / host / 'plugin/resources'))
app = QApplication.instance() or QApplication([])
surface = QOffscreenSurface(); surface.create()
context = QOpenGLContext(); context.create(); assert context.makeCurrent(surface)
width, height = 512, 320
fbo = QOpenGLFramebufferObject(QSize(width, height)); fbo.bind()
palettes = [
    [(1, 0, 0), (0, 1, 0), (0, 0, 1), (1, 1, 0)],
    [(0, 1, 1), (1, 0, 1), (1, 1, 1), (0, 0, 0)],
]


def shader(stage, path, identifier):
    node = UsdShade.Shader.Define(stage, path)
    node.CreateIdAttr(identifier)
    return node


def create_model(directory, palette):
    directory.mkdir(parents=True, exist_ok=True)
    image = QImage(64, 64, QImage.Format_RGB32)
    for y in range(64):
        for x in range(64):
            image.setPixelColor(x, y, QColor.fromRgbF(*palette[(y // 32) * 2 + x // 32]))
    assert image.save(str(directory / 'texture.png'))
    stage = Usd.Stage.CreateNew(str(directory / 'model.usda'))
    model = UsdGeom.Xform.Define(stage, '/Model'); stage.SetDefaultPrim(model.GetPrim())
    for name, y in [('Preview', .6), ('MaterialX', -.6)]:
        mesh = UsdGeom.Mesh.Define(stage, '/Model/' + name)
        mesh.CreatePointsAttr([(-.8, y-.45, 0), (.8, y-.45, 0), (.8, y+.45, 0), (-.8, y+.45, 0)])
        mesh.CreateFaceVertexCountsAttr([4]); mesh.CreateFaceVertexIndicesAttr([0, 1, 2, 3])
        mesh.CreateSubdivisionSchemeAttr('none')
        UsdGeom.PrimvarsAPI(mesh).CreatePrimvar('st', Sdf.ValueTypeNames.TexCoord2fArray, 'faceVarying').Set([(0, 0), (1, 0), (1, 1), (0, 1)])
        path = '/Model/Looks/' + name
        material = UsdShade.Material.Define(stage, path)
        UsdShade.MaterialBindingAPI.Apply(mesh.GetPrim()).Bind(material)
        mtlx = name == 'MaterialX'
        uv = shader(stage, path+'/UV', 'ND_texcoord_vector2' if mtlx else 'UsdPrimvarReader_float2')
        uv.CreateInput('index' if mtlx else 'varname', Sdf.ValueTypeNames.Int if mtlx else Sdf.ValueTypeNames.String).Set(0 if mtlx else 'st')
        uv_out = uv.CreateOutput('out' if mtlx else 'result', Sdf.ValueTypeNames.Float2)
        tex = shader(stage, path+'/Texture', 'ND_image_color3' if mtlx else 'UsdUVTexture')
        tex.CreateInput('file', Sdf.ValueTypeNames.Asset).Set(Sdf.AssetPath('texture.png'))
        tex.CreateInput('texcoord' if mtlx else 'st', Sdf.ValueTypeNames.Float2).ConnectToSource(uv_out)
        tex_out = tex.CreateOutput('out' if mtlx else 'rgb', Sdf.ValueTypeNames.Color3f)
        surf = shader(stage, path+'/Surface', 'ND_standard_surface_surfaceshader' if mtlx else 'UsdPreviewSurface')
        if mtlx:
            surf.CreateInput('base', Sdf.ValueTypeNames.Float).Set(0)
            surf.CreateInput('specular', Sdf.ValueTypeNames.Float).Set(0)
            surf.CreateInput('emission', Sdf.ValueTypeNames.Float).Set(1)
        else:
            surf.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(0))
            surf.CreateInput('roughness', Sdf.ValueTypeNames.Float).Set(1)
        surf.CreateInput('emission_color' if mtlx else 'emissiveColor', Sdf.ValueTypeNames.Color3f).ConnectToSource(tex_out)
        material.CreateSurfaceOutput('mtlx' if mtlx else '').ConnectToSource(surf.CreateOutput('out' if mtlx else 'surface', Sdf.ValueTypeNames.Token))
    stage.GetRootLayer().Save()
    # Close all stage-owning handles before USD's dependency localization.
    del stage, model, mesh, material, uv, uv_out, tex, tex_out, surf
    package = directory.with_suffix('.usdz')
    package.unlink(missing_ok=True)
    assert UsdUtils.CreateNewUsdzPackage(Sdf.AssetPath(str(directory / 'model.usda')), str(package))
    return package


packages = [create_model(output / name, palette) for name, palette in zip(['first package', 'second package'], palettes)]


def material_stage(packaged):
    stage = Usd.Stage.CreateInMemory()
    for i, package in enumerate(packages):
        xform = UsdGeom.Xform.Define(stage, '/Model' + str(i))
        xform.GetPrim().GetReferences().AddReference(str(package if packaged else package.with_suffix('') / 'model.usda'))
        xform.AddTranslateOp().Set(Gf.Vec3d(-1 if i == 0 else 1, 0, 0))
    return stage


def dome_stages():
    directory = output / 'dome'; directory.mkdir(exist_ok=True)
    shutil.copyfile(root.parent / 'public/environments/neutral.hdr', directory / 'environment.hdr')
    stage = Usd.Stage.CreateNew(str(directory / 'model.usda'))
    model = UsdGeom.Xform.Define(stage, '/Model'); stage.SetDefaultPrim(model.GetPrim())
    dome = UsdLux.DomeLight.Define(stage, '/Model/Dome')
    dome.CreateTextureFileAttr(Sdf.AssetPath('environment.hdr'))
    stage.GetRootLayer().Save()
    del stage, model, dome
    package = directory.with_suffix('.usdz'); package.unlink(missing_ok=True)
    assert UsdUtils.CreateNewUsdzPackage(Sdf.AssetPath(str(directory / 'model.usda')), str(package))
    return Usd.Stage.Open(str(directory / 'model.usda')), Usd.Stage.Open(str(package))


camera = Gf.Camera()
camera.SetOrthographicFromAspectRatioAndSize(width/height, 2.6, Gf.Camera.FOVVertical)
camera.clippingRange = Gf.Range1f(.1, 100)
camera.transform = Gf.Matrix4d().SetTranslate(Gf.Vec3d(0, 0, 6))
view, projection = camera.frustum.ComputeViewMatrix(), camera.frustum.ComputeProjectionMatrix()
params = UsdImagingGL.RenderParams()
params.enableLighting = True; params.enableSceneLights = True; params.enableSceneMaterials = True
params.colorCorrectionMode = 'disabled'; params.domeLightCameraVisibility = True


def capture(stage, label, dome=False, plugin='HdNeedleRendererPlugin'):
    engine = UsdImagingGL.Engine(); assert engine.SetRendererPlugin(plugin)
    if plugin == 'HdNeedleRendererPlugin':
        engine.SetRendererSetting('needle:ssgi', False)
        engine.SetRendererSetting('needle:environment', False)
        engine.SetRendererSetting('needle:toneMapping', 'none')
    engine.SetRendererSetting('domeLightCameraVisibility', dome)
    engine.SetRendererAov('color'); engine.SetRenderViewport(Gf.Vec4d(0, 0, width, height))
    engine.SetRenderBufferSize(Gf.Vec2i(width, height)); engine.SetCameraState(view, projection)
    deadline = time.monotonic() + 60
    while True:
        fbo.bind(); engine.Render(stage.GetPseudoRoot(), params)
        stats = engine.GetRenderStats()
        assert not stats.get('huskErrorStatus'), stats
        if engine.IsConverged(): break
        assert time.monotonic() < deadline, stats
    fbo.bind(); GL.glFinish()
    pixels = np.asarray(GL.glReadPixels(0, 0, width, height, GL.GL_RGBA, GL.GL_FLOAT)).reshape(height, width, 4).copy()
    assert np.isfinite(pixels).all(), (label, stats)
    if plugin == 'HdNeedleRendererPlugin':
        assert stats['needle:cpuReadbacks'] == 0, stats
    assert fbo.toImage().save(str(output / (label + '.png')))
    del engine; gc.collect()
    return pixels[:, :, :3]


loose = capture(material_stage(False), 'loose-materials')
packed = capture(material_stage(True), 'packed-materials')
storm = capture(material_stage(True), 'storm-materials', plugin='HdStormRendererPlugin')
results = {}
for i, palette in enumerate(palettes):
    for name, y in [('Preview', .6), ('MaterialX', -.6)]:
        colors = []
        for dx, dy in [(-.4, -.225), (.4, -.225), (-.4, .225), (.4, .225)]:
            ndc = (view * projection).Transform(Gf.Vec3d((-1 if i == 0 else 1)+dx, y+dy, 0))
            x, py = int((ndc[0]+1)*width/2), int((ndc[1]+1)*height/2)
            colors.append(packed[py-2:py+3, x-2:x+3].mean(axis=(0, 1)))
            expected = storm[py-2:py+3, x-2:x+3].mean(axis=(0, 1))
            assert np.max(np.abs(colors[-1] - expected)) < .02, (i, name, dx, dy, colors[-1], expected)
        # Check actual expected texels, not merely equality of two gray renders.
        distances = np.abs(np.array(colors)[:, None, :] - np.array(palette)[None, :, :]).max(axis=2)
        assert np.max(np.min(distances, axis=0)) < .02, (i, name, colors)
        results[f'package{i}/{name}'] = [color.tolist() for color in colors]
error = np.abs(loose-packed)
results['materialsMeanAbsoluteError'] = float(error.mean())
assert error.max() < .005, results
loose_dome, packed_dome = dome_stages()
expected = capture(loose_dome, 'loose-dome', dome=True)
actual = capture(packed_dome, 'packed-dome', dome=True)
assert expected.mean() > .01 and actual.mean() > .01, 'Missing dome texture'
results['domeMeanAbsoluteError'] = float(np.abs(expected-actual).mean())
assert np.abs(expected-actual).max() < .005, results
(output / 'report.json').write_text(json.dumps(results, indent=2) + '\n')
print('NEEDLE_PACKAGE_TEXTURES', json.dumps(results), flush=True)
