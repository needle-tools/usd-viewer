"""Exercise a host's actual UsdImagingGL engine, including Hydra ID-buffer picking."""
import json
import os
from pathlib import Path
import time
from pxr import Gf, Plug, Usd, UsdImagingGL

root=Path(__file__).resolve().parents[1]
host=os.environ.get('NEEDLE_TEST_HOST','usdview')
ssgi=os.environ.get('NEEDLE_TEST_SSGI','1')!='0'
fixture=os.environ.get('NEEDLE_TEST_FIXTURE','parity')
output=root/'.build'/host/(fixture if ssgi else fixture+'-basic')
output.mkdir(parents=True,exist_ok=True)
Plug.Registry().RegisterPlugins(str(root/'.build'/host/'plugin/resources'))

from PySide6.QtWidgets import QApplication
from PySide6.QtGui import QOffscreenSurface,QOpenGLContext,QSurfaceFormat
from PySide6.QtOpenGL import QOpenGLFramebufferObject
from PySide6.QtCore import QSize
app=QApplication.instance() or QApplication([])
surface=QOffscreenSurface();surface.create()
context=QOpenGLContext();context.create();assert context.makeCurrent(surface)
fbo=QOpenGLFramebufferObject(QSize(256,256));fbo.bind()

stage=Usd.Stage.Open(str(root/('tests/fixtures/'+fixture+'.usda')))
engine=UsdImagingGL.Engine()
assert engine.SetRendererPlugin('HdNeedleRendererPlugin')
engine.SetRendererSetting('needle:ssgi',ssgi)
engine.SetRendererSetting('needle:toneMapping','none')
assert engine.SetRendererAov('color')
engine.SetRenderViewport(Gf.Vec4d(0,0,256,256))
engine.SetRenderBufferSize(Gf.Vec2i(256,256))
camera=Gf.Camera()
camera.SetPerspectiveFromAspectRatioAndFieldOfView(1,42,Gf.Camera.FOVVertical)
camera.clippingRange=Gf.Range1f(.1,100)
camera.transform=Gf.Matrix4d().SetLookAt(Gf.Vec3d(0,.5,8),Gf.Vec3d(0,.5,0),Gf.Vec3d(0,1,0)).GetInverse()
frustum=camera.frustum
view=frustum.ComputeViewMatrix();projection=frustum.ComputeProjectionMatrix()
engine.SetCameraState(view,projection)
params=UsdImagingGL.RenderParams()
params.frame=Usd.TimeCode.Default()
params.enableLighting=True;params.enableSceneLights=True;params.enableSceneMaterials=True
params.showGuides=False;params.showProxy=True;params.showRender=True
params.clearColor=Gf.Vec4f(0)

deadline=time.monotonic()+60
while True:
    engine.Render(stage.GetPseudoRoot(),params)
    stats=engine.GetRenderStats()
    assert not stats.get('huskErrorStatus'),stats
    if engine.IsConverged():break
    assert time.monotonic()<deadline,stats

assert stats['needle:ssgiEnabled'] is ssgi,stats
assert stats['needle:samples']>=(32 if ssgi else 1),stats
baseline=fbo.toImage()
assert baseline.save(str(output/'viewport.png'))
hits={}
for name,point in [('Red',(-1,-.35,0)),('Green',(1,-.35,0)),
                   ('LeftInstance',(-.65,1.25,0)),('RightInstance',(.65,1.25,0))]:
    narrowed=frustum.ComputeNarrowedFrustum(Gf.Vec3d(*point),Gf.Vec2d(.01,.01))
    hit=engine.TestIntersection(view,narrowed.ComputeProjectionMatrix(),stage.GetPseudoRoot(),params)
    hits[name]={'path':str(hit[2]),'instance':hit[3],'topLevelPath':str(hit[4]),'topLevelInstance':hit[5],
                'point':list(hit[0])}
    assert name in str(hit[2]) or name in str(hit[4]),(name,hit)
    assert all(abs(float(x))<100 for x in hit[0]),hit
    if name=='Red':assert abs(hit[0][2]-.65)<.001,hit
    if 'Instance' in name:assert abs(hit[0][2]-.25)<.001,hit

params.highlight=True
engine.SetSelected(['/World/Red'])
deadline=time.monotonic()+60
while True:
    engine.Render(stage.GetPseudoRoot(),params)
    assert not engine.GetRenderStats().get('huskErrorStatus'),engine.GetRenderStats()
    if engine.IsConverged():break
    assert time.monotonic()<deadline,engine.GetRenderStats()
highlighted=fbo.toImage()
assert highlighted.save(str(output/'selection.png'))
selection_pixels=sum(1 for y in range(256) for x in range(256)
                     if highlighted.pixelColor(x,y).greenF()>baseline.pixelColor(x,y).greenF()+.1)
assert selection_pixels>500,('No Hydra selection highlight',selection_pixels,engine.GetRenderStats())

def pixel(image,point):
    ndc=(view*projection).Transform(Gf.Vec3d(*point))
    return image.pixelColor(int((ndc[0]+1)*128),int((1-ndc[1])*128))

engine.SetSelected(['/World/RightInstance'])
engine.Render(stage.GetPseudoRoot(),params)
instance_highlight=fbo.toImage()
assert instance_highlight.save(str(output/'selection-instance.png'))
for point in [(-1,-.35,.65),(-.65,1.25,.25)]:
    assert abs(pixel(instance_highlight,point).greenF()-pixel(baseline,point).greenF())<.01,('Old selection remained',point)
right=(.65,1.25,.25)
assert pixel(instance_highlight,right).greenF()>pixel(baseline,right).greenF()+.1,'Selected instance was not highlighted'

engine.ClearSelected()
engine.Render(stage.GetPseudoRoot(),params)
cleared=fbo.toImage()
for point in [(-1,-.35,.65),right]:
    assert abs(pixel(cleared,point).greenF()-pixel(baseline,point).greenF())<.01,('Cleared selection remained',point)

report={'host':host,'usdVersion':Usd.GetVersion(),'renderer':engine.GetCurrentRendererId(),
        'stats':engine.GetRenderStats(),'hits':hits,'selectionPixels':selection_pixels,
        'instanceHighlight':True,'clearedHighlight':True}
(output/'smoke.json').write_text(json.dumps(report,indent=2)+'\n')
print('NEEDLE_NATIVE_PARITY_SMOKE',json.dumps(report),flush=True)
