"""Observe progressive pixels and convergence through a host's real Hydra engine."""
import argparse
import json
import os
from pathlib import Path
import time
import numpy as np
from pxr import Gf, Plug, Usd, UsdGeom, UsdImagingGL
from PySide6.QtWidgets import QApplication
from PySide6.QtGui import QOffscreenSurface, QOpenGLContext, QImage
from PySide6.QtOpenGL import QOpenGLFramebufferObject
from PySide6.QtCore import QSize

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--scene', type=Path, default=root / 'tests/fixtures/parity.usda')
parser.add_argument('--samples', type=int, help='Override the host default temporal budget')
args = parser.parse_args()
host = os.environ.get('NEEDLE_TEST_HOST', 'usdview')
output = root / '.build' / host / ('temporal-' + args.scene.stem)
output.mkdir(parents=True, exist_ok=True)
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
    camera.transform = Gf.Matrix4d().SetLookAt(Gf.Vec3d(0,.5,8), Gf.Vec3d(0,.5,0), Gf.Vec3d(0,1,0)).GetInverse()
    camera.clippingRange = Gf.Range1f(.1,100)
renderer = UsdImagingGL.Engine()
assert renderer.SetRendererPlugin('HdNeedleRendererPlugin')
renderer.SetRendererSetting('needle:ssgi', True)
if args.samples is not None:
    renderer.SetRendererSetting('needle:samples', args.samples)
samples = renderer.GetRendererSetting('needle:samples')
assert samples == (args.samples if args.samples is not None else 128), samples
renderer.SetRendererSetting('needle:toneMapping', 'none')
renderer.SetRendererAov('color')
renderer.SetRenderViewport(Gf.Vec4d(0,0,size,size))
renderer.SetRenderBufferSize(Gf.Vec2i(size,size))
renderer.SetCameraState(camera.frustum.ComputeViewMatrix(),camera.frustum.ComputeProjectionMatrix())
params = UsdImagingGL.RenderParams()
params.frame = Usd.TimeCode(25)
params.complexity = 1.3
params.enableSceneMaterials = True
params.enableSceneLights = True
captures = []
last_sample = 0
deadline = time.monotonic()+90
while True:
    renderer.Render(stage.GetPseudoRoot(),params)
    stats = renderer.GetRenderStats()
    assert not stats.get('huskErrorStatus'),stats
    sample = stats.get('needle:samples',0)
    if sample > last_sample and (not captures or sample-last_sample>=8 or renderer.IsConverged()):
        # Stats can receive a new surface after the preceding draw. Present it
        # before capturing so pixel comparisons match the reported progress.
        renderer.Render(stage.GetPseudoRoot(),params)
        image = fbo.toImage().convertToFormat(QImage.Format_RGBA8888)
        image.save(str(output / f'sample-{sample}.png'))
        # Read only the test framebuffer; normal color handoff can remain GPU-only.
        pixels = np.frombuffer(image.constBits(), np.uint8).reshape(size,image.bytesPerLine())
        pixels = pixels[:,:size*4].reshape(size,size,4)[:,:,:3].copy()/255
        np.save(output / f'sample-{sample}.npy',pixels)
        captures.append({'sample':sample,'mean':float(pixels.mean())})
        last_sample = sample
    if renderer.IsConverged():break
    assert time.monotonic()<deadline,stats
assert last_sample>=samples,stats
assert len(captures)>=3,('No visible progressive updates',captures)
assert captures[0]['mean']>.05,('First Beauty frame is blank',captures[0])
first = np.load(output / f"sample-{captures[0]['sample']}.npy")
last = np.load(output / f"sample-{captures[-1]['sample']}.npy")
assert np.abs(last-first).mean()>.001, 'Progress counters advanced without pixel accumulation'
report = {'host':host,'scene':str(args.scene),'captures':captures,'stats':stats}
(output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
print('NEEDLE_TEMPORAL',json.dumps(report),flush=True)
