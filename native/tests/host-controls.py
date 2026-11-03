"""Exercise usdview's live Hydra controls, rather than renderer-only settings."""
import json, os, time
from pathlib import Path
import numpy as np
from pxr import Gf, Plug, Usd, UsdImagingGL
from PySide6.QtWidgets import QApplication
from PySide6.QtGui import QOffscreenSurface,QOpenGLContext
from PySide6.QtOpenGL import QOpenGLFramebufferObject
from PySide6.QtCore import QSize
root=Path(__file__).resolve().parents[1]
host=os.environ.get('NEEDLE_TEST_HOST','usdview')
output=root/'.build'/host/'host-controls';output.mkdir(parents=True,exist_ok=True)
os.environ['NEEDLE_HYDRA_CAPTURE']=str(output/'aov')
Plug.Registry().RegisterPlugins(str(root/'.build'/host/'plugin/resources'))
app=QApplication.instance() or QApplication([])
surface=QOffscreenSurface();surface.create()
context=QOpenGLContext();context.create();assert context.makeCurrent(surface)
fbo=QOpenGLFramebufferObject(QSize(192,192));fbo.bind()
stage=Usd.Stage.Open(str(root/'tests/fixtures/host-controls.usda'))
engine=UsdImagingGL.Engine();assert engine.SetRendererPlugin('HdNeedleRendererPlugin')
engine.SetRendererSetting('needle:ssgi',False)
engine.SetRendererSetting('needle:toneMapping','none')
engine.SetRendererAov('color');engine.SetRenderViewport(Gf.Vec4d(0,0,192,192));engine.SetRenderBufferSize(Gf.Vec2i(192,192))
camera=Gf.Camera();camera.SetPerspectiveFromAspectRatioAndFieldOfView(1,42,Gf.Camera.FOVVertical)
camera.clippingRange=Gf.Range1f(.1,100)
camera.transform=Gf.Matrix4d().SetLookAt(Gf.Vec3d(3,2,6),Gf.Vec3d(0),Gf.Vec3d(0,1,0)).GetInverse()
engine.SetCameraState(camera.frustum.ComputeViewMatrix(),camera.frustum.ComputeProjectionMatrix())
params=UsdImagingGL.RenderParams();params.enableSceneMaterials=True;params.enableSceneLights=True
params.complexity=1.0

def render(name):
    path=output/'aov-color.bin';previous=path.stat().st_mtime_ns if path.exists() else 0
    deadline=time.monotonic()+60
    while True:
        engine.Render(stage.GetPseudoRoot(),params)
        assert not engine.GetRenderStats().get('huskErrorStatus'),engine.GetRenderStats()
        if engine.IsConverged() and path.exists() and path.stat().st_mtime_ns>previous:break
        assert time.monotonic()<deadline,engine.GetRenderStats()
    color=np.fromfile(path,dtype=np.float16).reshape(192,192,4).astype(float)
    assert np.isfinite(color).all(),name
    ids=np.fromfile(output/'aov-primId.bin',dtype=np.int32).reshape(192,192)
    fbo.toImage().save(str(output/(name+'.png')))
    return color,ids

engine.SetRendererSetting('domeLightCameraVisibility',False)
base,base_ids=render('low-material-on-dome-off')
params.enableSceneMaterials=False
off,off_ids=render('low-material-off')
mask=base_ids>=0
assert np.array_equal(base_ids,off_ids),'Material toggle changed pick geometry'
a,b=base[mask,:3].mean(axis=0),off[mask,:3].mean(axis=0)
assert a[0]>a[2]*2 and b[2]>b[0]*2,('Authored material/displayColor toggle failed',a,b)
params.enableSceneMaterials=True
restored,_=render('low-material-restored')
assert np.mean(np.abs(restored-base))<.002,'Material reenable did not restore shader'
engine.SetRendererSetting('domeLightCameraVisibility',True)
dome,dome_ids=render('dome-on')
background=base_ids<0
assert np.max(np.abs(base[background,:3]))<.001,'Hidden dome leaked into background'
assert np.mean(dome[background,:3])>.05,'Dome texture is absent from background'
assert np.mean(np.abs(dome[mask,:3]-base[mask,:3]))<.002,'Camera visibility changed dome illumination'
engine.SetRendererSetting('domeLightCameraVisibility',False)
hidden,_=render('dome-hidden-again')
assert np.mean(np.abs(hidden-base))<.002,'Dome hide did not restore background'
params.complexity=1.2
high,high_ids=render('high-complexity')
elements=np.fromfile(output/'aov-elementId.bin',dtype=np.int32).reshape(192,192)
assert ((elements[high_ids>=0]>=0)&(elements[high_ids>=0]<6)).all(),'Refinement lost coarse face IDs'
geometry_change=int(np.count_nonzero((high_ids>=0)!=(base_ids>=0)))
assert geometry_change>150,('Complexity did not refine silhouette',geometry_change)
params.complexity=1.0
low,_=render('low-restored')
assert np.mean(np.abs(low-base))<.002,'Complexity did not return to control cage'
report={'host':host,'materialOn':a.tolist(),'materialOff':b.tolist(),'domeBackgroundMean':float(dome[background,:3].mean()),'refinementChangedSilhouettePixels':geometry_change,'restored':True,'stats':engine.GetRenderStats()}
(output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
print('NEEDLE_HOST_CONTROLS',json.dumps(report),flush=True)
