"""Execute in Houdini's Python Shell; preserves the existing scene."""
from pathlib import Path
import hou
from pxr import Plug

root = Path(__file__).resolve().parents[1]
Plug.Registry().RegisterPlugins(str(root / '.build/houdini/plugin/resources'))
assert Plug.Registry().GetPluginWithName('hdNeedle').Load()
stage = hou.node('/stage')
node = stage.node('needle_hydra_smoke')
if node is None:
    node = stage.createNode('sublayer', 'needle_hydra_smoke')
node.parm('filepath1').set(str(root / 'tests/fixtures/parity.usda'))
node.setDisplayFlag(True)
node.setCurrent(True, clear_all_selected=True)
viewer = hou.ui.paneTabOfType(hou.paneTabType.SceneViewer)
viewer.setPwd(stage)
viewer.setHydraRenderer('Needle Three.js WebGPU')
viewer.curViewport().frameAll()
print('NEEDLE_HOUDINI_RENDERER', viewer.currentHydraRenderer())
