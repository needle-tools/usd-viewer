"""Compare default usdview dome backgrounds to native Storm in linear color."""
import argparse
import gc
import json
import os
from pathlib import Path
import time
import numpy as np
from OpenGL import GL
from pxr import Gf, Glf, Plug, Usd, UsdImagingGL
from PySide6.QtWidgets import QApplication
from PySide6.QtGui import QOffscreenSurface, QOpenGLContext
from PySide6.QtOpenGL import QOpenGLFramebufferObject
from PySide6.QtCore import QSize

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--record', action='store_true')
args = parser.parse_args()
host = os.environ.get('NEEDLE_TEST_HOST', 'usdview')
output = root / '.build' / host / 'dome-presentation'
output.mkdir(parents=True, exist_ok=True)
Plug.Registry().RegisterPlugins(str(root / '.build' / host / 'plugin/resources'))
app = QApplication.instance() or QApplication([])
surface = QOffscreenSurface(); surface.create()
context = QOpenGLContext(); context.create(); assert context.makeCurrent(surface)
size = 256
fbo = QOpenGLFramebufferObject(QSize(size, size)); fbo.bind()
stage = Usd.Stage.CreateInMemory()
params = UsdImagingGL.RenderParams()
params.enableLighting = True
params.enableSceneLights = True
params.domeLightCameraVisibility = True
params.colorCorrectionMode = 'disabled'
camera = Gf.Camera()
camera.SetPerspectiveFromAspectRatioAndFieldOfView(1, 75, Gf.Camera.FOVVertical)
camera.clippingRange = Gf.Range1f(.1, 100)
cases = [('front', (0, 0, -1), Gf.Matrix4d(1)),
         ('right', (1, 0, 0), Gf.Matrix4d(1)),
         ('rotated', (0, 0, -1), Gf.Matrix4d().SetRotate(Gf.Rotation(Gf.Vec3d(0, 1, 0), 37))),
         ('z-up', (0, 0, -1), Gf.Matrix4d().SetRotate(Gf.Rotation(Gf.Vec3d(1, 0, 0), 90)))]
captures = {}
for plugin in ['HdStormRendererPlugin', 'HdNeedleRendererPlugin']:
    renderer = UsdImagingGL.Engine()
    assert renderer.SetRendererPlugin(plugin)
    if plugin == 'HdNeedleRendererPlugin':
        renderer.SetRendererSetting('needle:ssgi', False)
        renderer.SetRendererSetting('needle:toneMapping', 'none')
    renderer.SetRendererSetting('domeLightCameraVisibility', True)
    renderer.SetRendererAov('color')
    renderer.SetRenderViewport(Gf.Vec4d(0, 0, size, size))
    renderer.SetRenderBufferSize(Gf.Vec2i(size, size))
    for label, direction, transform in cases:
        light = Glf.SimpleLight(); light.isDomeLight = True; light.transform = transform
        renderer.SetLightingState([light], Glf.SimpleMaterial(), Gf.Vec4f(0))
        camera.transform = Gf.Matrix4d().SetLookAt(Gf.Vec3d(0), Gf.Vec3d(*direction), Gf.Vec3d(0, 1, 0)).GetInverse()
        renderer.SetCameraState(camera.frustum.ComputeViewMatrix(), camera.frustum.ComputeProjectionMatrix())
        deadline = time.monotonic() + 60
        while True:
            fbo.bind()
            renderer.Render(stage.GetPseudoRoot(), params)
            stats = renderer.GetRenderStats()
            assert not stats.get('huskErrorStatus'), stats
            if renderer.IsConverged(): break
            assert time.monotonic() < deadline, stats
        fbo.bind(); GL.glFinish()
        pixels = np.asarray(GL.glReadPixels(0, 0, size, size, GL.GL_RGBA, GL.GL_FLOAT)).reshape(size, size, 4).copy()
        assert np.isfinite(pixels).all(), (plugin, label, stats)
        captures[plugin, label] = pixels[:, :, :3]
        fbo.toImage().save(str(output / (plugin + '-' + label + '.png')))
    del renderer
    gc.collect()
results = {}
for label, _, _ in cases:
    expected, actual = [captures[plugin, label] for plugin in ['HdStormRendererPlugin', 'HdNeedleRendererPlugin']]
    assert expected.mean() > .01 and actual.mean() > .01, 'Missing dome background'
    # Clamp only diagnostic error metrics so a bright sun cannot dominate them.
    error = np.abs(np.clip(expected, 0, 1) - np.clip(actual, 0, 1))
    results[label] = {'meanAbsoluteError': float(error.mean()), 'p95AbsoluteError': float(np.percentile(error, 95))}
    print('NEEDLE_DOME', label, json.dumps(results[label]), flush=True)
(output / 'report.json').write_text(json.dumps(results, indent=2) + '\n')
assert args.record or all(r['meanAbsoluteError'] < .005 and r['p95AbsoluteError'] < .015 for r in results.values()), results
