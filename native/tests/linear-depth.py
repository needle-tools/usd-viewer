"""Verify the GPU linear-depth AOV against known fixture planes.

Run with the Houdini USD/Python/plugin environment used by native-smoke.py.
Framebuffer reads are explicitly enabled for this numeric diagnostic.
"""
import json
import os
import time
from pathlib import Path

import numpy as np
from pxr import Gf, Plug, Usd, UsdImagingGL
from PySide6.QtWidgets import QApplication
from PySide6.QtGui import QOffscreenSurface, QOpenGLContext
from PySide6.QtOpenGL import QOpenGLFramebufferObject
from PySide6.QtCore import QSize

root = Path(__file__).resolve().parents[1]
host = os.environ.get('NEEDLE_TEST_HOST', 'houdini')
Plug.Registry().RegisterPlugins(str(root / '.build' / host / 'plugin/resources'))
app = QApplication.instance() or QApplication([])
surface = QOffscreenSurface(); surface.create()
context = QOpenGLContext(); context.create(); assert context.makeCurrent(surface)
fbo = QOpenGLFramebufferObject(QSize(128, 128)); fbo.bind()
stage = Usd.Stage.Open(str(root / 'tests/fixtures/parity.usda'))
reports = {}

for mode in ['perspective', 'orthographic']:
    output = root / '.build' / host / ('linear-depth-' + mode)
    output.mkdir(parents=True, exist_ok=True)
    os.environ['NEEDLE_HYDRA_CAPTURE'] = str(output / 'aov')
    os.environ['NEEDLE_HYDRA_VALIDATE_CODEC'] = '1'
    engine = UsdImagingGL.Engine()
    assert engine.SetRendererPlugin('HdNeedleRendererPlugin')
    engine.SetRendererSetting('needle:linearDepth', True)
    engine.SetRendererSetting('needle:ssgi', False)
    engine.SetRendererSetting('needle:toneMapping', 'none')
    assert engine.SetRendererAov('color')
    engine.SetRenderViewport(Gf.Vec4d(0, 0, 128, 128))
    engine.SetRenderBufferSize(Gf.Vec2i(128, 128))
    camera = Gf.Camera()
    if mode == 'perspective':
        camera.SetPerspectiveFromAspectRatioAndFieldOfView(1, 42, Gf.Camera.FOVVertical)
    else:
        camera.SetOrthographicFromAspectRatioAndSize(1, 6, Gf.Camera.FOVVertical)
    # Reproduce Solaris' wide automatic clip range, which is sensitive to
    # cancellation when linearizing an OpenGL depth value near one.
    camera.clippingRange = Gf.Range1f(.00801661, 80166.1)
    camera.transform = Gf.Matrix4d().SetLookAt(
        Gf.Vec3d(0, .5, 8), Gf.Vec3d(0, .5, 0), Gf.Vec3d(0, 1, 0)).GetInverse()
    view = camera.frustum.ComputeViewMatrix()
    projection = camera.frustum.ComputeProjectionMatrix()
    engine.SetCameraState(view, projection)
    params = UsdImagingGL.RenderParams()
    params.frame = Usd.TimeCode.Default()
    params.enableSceneMaterials = True
    params.showProxy = True; params.showRender = True
    deadline = time.monotonic() + 60
    depth_path = output / 'aov-depth.bin'
    previous = depth_path.stat().st_mtime_ns if depth_path.exists() else 0
    while True:
        engine.Render(stage.GetPseudoRoot(), params)
        stats = engine.GetRenderStats()
        assert not stats.get('huskErrorStatus'), stats
        if engine.IsConverged() and depth_path.exists() and depth_path.stat().st_mtime_ns > previous:
            break
        assert time.monotonic() < deadline, stats
    assert stats['needle:linearDepth'] is True, stats
    assert stats['needle:surfaceCodecTests'] > 0 and stats['needle:surfaceCodecErrors'] == 0, stats
    depth = np.fromfile(depth_path, dtype=np.float32).reshape(128, 128)
    ids = np.fromfile(output / 'aov-primId.bin', dtype=np.int32).reshape(128, 128)
    assert np.isfinite(depth).all() and (depth >= 0).all()
    samples = {}
    for name, point, expected in [
        ('Red', (-1, -.35, .65), 7.35),
        ('LeftInstance', (-.65, 1.25, .25), 7.75),
        ('RightInstance', (.65, 1.25, .25), 7.75),
        ('Wall', (2.25, 2, -1.5), 9.5),
    ]:
        ndc = (view * projection).Transform(Gf.Vec3d(*point))
        x, y = [int((ndc[i] + 1) * 64) for i in range(2)]
        assert ids[y, x] >= 0, (mode, name, x, y)
        actual = float(depth[y, x])
        assert abs(actual - expected) < .003, (mode, name, actual, expected)
        samples[name] = {'actual': actual, 'expected': expected}
    background = ids < 0
    assert background.any() and np.max(np.abs(depth[background])) == 0
    reports[mode] = {'samples': samples, 'stats': stats}
    del engine

path = root / '.build' / host / 'linear-depth.json'
path.write_text(json.dumps(reports, indent=2) + '\n')
print('NEEDLE_LINEAR_DEPTH_GPU', json.dumps(reports), flush=True)
