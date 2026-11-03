"""Compare direct jumps and forward/backward playback through a real Hydra engine."""
import argparse
import gc
import json
import os
from pathlib import Path
import time
import numpy as np
from pxr import Gf, Plug, Usd, UsdGeom, UsdImagingGL
from PySide6.QtWidgets import QApplication
from PySide6.QtGui import QOffscreenSurface, QOpenGLContext
from PySide6.QtOpenGL import QOpenGLFramebufferObject
from PySide6.QtCore import QSize

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--scene', type=Path, default=root / 'tests/fixtures/animated-subdivision.usda')
parser.add_argument('--record', action='store_true', help='Report discrepancies without stopping at the first failure')
parser.add_argument('--ssgi', action='store_true', help='Also verify the progressive Beauty pipeline')
args = parser.parse_args()
host = os.environ.get('NEEDLE_TEST_HOST', 'usdview')
output = root / '.build' / host / ('animation-' + args.scene.stem + ('-beauty' if args.ssgi else ''))
output.mkdir(parents=True, exist_ok=True)
os.environ['NEEDLE_HYDRA_CAPTURE'] = str(output / 'aov')
Plug.Registry().RegisterPlugins(str(root / '.build' / host / 'plugin/resources'))
app = QApplication.instance() or QApplication([])
surface = QOffscreenSurface(); surface.create()
context = QOpenGLContext(); context.create(); assert context.makeCurrent(surface)
size = 256
fbo = QOpenGLFramebufferObject(QSize(size, size)); fbo.bind()
stage = Usd.Stage.Open(str(args.scene))
cameras = [UsdGeom.Camera(p) for p in stage.Traverse() if p.IsA(UsdGeom.Camera)]
camera = cameras[0].GetCamera(25) if cameras else Gf.Camera()
if not cameras:
    camera.SetPerspectiveFromAspectRatioAndFieldOfView(1, 42, Gf.Camera.FOVVertical)
    camera.transform = Gf.Matrix4d().SetLookAt(Gf.Vec3d(4, 3, 10), Gf.Vec3d(0), Gf.Vec3d(0, 1, 0)).GetInverse()
    camera.clippingRange = Gf.Range1f(.1, 100)
params = UsdImagingGL.RenderParams()
params.complexity = 1.3
params.enableSceneMaterials = True
params.enableSceneLights = True


def engine():
    result = UsdImagingGL.Engine()
    assert result.SetRendererPlugin('HdNeedleRendererPlugin')
    result.SetRendererSetting('needle:ssgi', args.ssgi)
    result.SetRendererSetting('needle:toneMapping', 'none')
    result.SetRendererSetting('domeLightCameraVisibility', False)
    result.SetRendererAov('color')
    result.SetRenderViewport(Gf.Vec4d(0, 0, size, size))
    result.SetRenderBufferSize(Gf.Vec2i(size, size))
    result.SetCameraState(camera.frustum.ComputeViewMatrix(), camera.frustum.ComputeProjectionMatrix())
    return result


def render(renderer, frame, label):
    params.frame = Usd.TimeCode(frame)
    path = output / 'aov-color.bin'
    previous = path.stat().st_mtime_ns if path.exists() else 0
    deadline = time.monotonic() + 90
    while True:
        renderer.Render(stage.GetPseudoRoot(), params)
        stats = renderer.GetRenderStats()
        assert not stats.get('huskErrorStatus'), stats
        if renderer.IsConverged() and path.exists() and path.stat().st_mtime_ns > previous:
            break
        assert time.monotonic() < deadline, stats
    color = np.fromfile(path, dtype=np.float16).reshape(size, size, 4).astype(float)
    assert np.isfinite(color).all(), label
    ids = np.fromfile(output / 'aov-primId.bin', dtype=np.int32).reshape(size, size)
    fbo.toImage().save(str(output / (label + '.png')))
    return color, ids >= 0


targets = [24, 25, 49, 50, 74, 75, 100]
references = {}
for frame in targets:
    renderer = engine()
    references[frame] = render(renderer, frame, 'direct-' + str(frame))
    del renderer
    gc.collect()
effects = {name: float(np.abs(references[a][0] - references[b][0]).mean())
           for name, a, b in [('holes', 25, 24), ('creases', 50, 49), ('corners', 75, 74)]}
if args.scene.resolve() == (root / 'tests/fixtures/animated-subdivision.usda').resolve():
    assert min(effects.values()) > .005, ('Expected visible subdivision animation', effects)
renderer = engine()
sequence = [1, 24, 25, 26, 25, 24, 25, 99, 100, 101, 100, 49, 50, 51, 50, 74, 75, 76, 75]
results = []
for index, frame in enumerate(sequence):
    color, mask = render(renderer, frame, f'playback-{index}-{frame}')
    if frame not in references:
        continue
    expected, expected_mask = references[frame]
    error = float(np.abs(color - expected).mean())
    mismatch = int(np.count_nonzero(mask != expected_mask))
    result = {'frame': frame, 'previous': sequence[index-1] if index else None,
              'meanAbsoluteError': error, 'silhouetteMismatchPixels': mismatch}
    results.append(result)
    print('NEEDLE_ANIMATION', json.dumps(result), flush=True)
    if not args.record:
        assert error < (.01 if args.ssgi else .001) and mismatch == 0, result
report = {'scene': str(args.scene), 'host': host, 'ssgi': args.ssgi, 'animationEffects': effects, 'results': results}
(output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
assert args.record or all(r['meanAbsoluteError'] < (.01 if args.ssgi else .001) and not r['silhouetteMismatchPixels'] for r in results)
