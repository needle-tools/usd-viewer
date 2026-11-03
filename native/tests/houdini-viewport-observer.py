"""Record real Solaris selections without synthesizing mouse input.

Execute in the isolated parity.hipnc test session's Python Shell, then use the
normal viewport selection tool. The observer is retired with that test session.
"""
import json
import os
import time
from pathlib import Path
import hou

root=Path(__file__).resolve().parents[1]
assert Path(hou.hipFile.name())==root/'.build/houdini/viewport-debug/parity.hipnc'
viewer=hou.ui.paneTabOfType(hou.paneTabType.SceneViewer)
output=root/'.build/houdini/viewport-debug/selection-observed.json'
records=[]
last=None

def observe():
    global last
    selected=tuple(viewer.currentSceneGraphSelection())
    if selected==last:return
    last=selected
    records.append({'time':time.time(),'paths':selected})
    output.write_text(json.dumps({'host':hou.applicationVersionString(),
        'retina':os.environ.get('HOUDINI_ENABLE_RETINA','default'),
        'viewport':viewer.curViewport().size(),'selections':records},indent=2)+'\n')

hou.ui.addEventLoopCallback(observe)
observe()
print('Solaris selection observer:',output)
