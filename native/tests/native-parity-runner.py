"""Capture each installed USD ABI and compare its linear AOVs to the browser.

Run browser-parity-runner.mjs first. Framebuffer readback is explicitly enabled
for these numeric comparisons; native-smoke.py can separately forbid color Map.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import numpy as np

root=Path(__file__).resolve().parents[1]
houdini=Path('/Applications/Houdini/Current/Frameworks')
hosts={
    'usdview':('/Library/Frameworks/Python.framework/Versions/3.10/bin/python3',{
        'PYTHONPATH':str(Path.home()/'OpenUSD-26.05-native/lib/python')}),
    'houdini':(str(houdini/'Python.framework/Versions/3.13/bin/python3'),{
        'PYTHONPATH':str(houdini/'Python.framework/Versions/3.13/lib/python3.13/site-packages-forced'),
        'QT_PLUGIN_PATH':str(houdini/'Houdini.framework/Versions/Current/Libraries/Qt_plugins')}),
}
fixtures=['parity','parity-lit','parity-textured']
reports={}
for host,(python,paths) in hosts.items():
    for fixture in fixtures:
        for ssgi in [True,False]:
            variant=fixture+('' if ssgi else '-basic')
            output=root/'.build'/host/variant
            output.mkdir(parents=True,exist_ok=True)
            env={key:value for key,value in os.environ.items()
                 if not key.startswith(('NEEDLE_','DYLD_'))}
            env.update(paths,NEEDLE_TEST_HOST=host,NEEDLE_TEST_FIXTURE=fixture,
                       NEEDLE_TEST_SSGI='1' if ssgi else '0',
                       NEEDLE_TEST_SAMPLES='32', # Match browser-parity.mjs, independently of host defaults.
                       PXR_PLUGINPATH_NAME=str(root/'.build'/host/'plugin/resources'),
                       NEEDLE_HYDRA_CAPTURE=str(output/'aov'),NEEDLE_HYDRA_VALIDATE_CODEC='1')
            if '--compare-only' not in sys.argv:
                with (output/'test.log').open('w') as log:
                    subprocess.run([python,str(root/'tests/native-smoke.py')],env=env,
                                   stdout=log,stderr=subprocess.STDOUT,check=True,timeout=120)
            browser=np.fromfile(root/'.build/browser'/variant/'aov-color.bin',dtype=np.float16).reshape(256,256,4)[:,:,:3].astype(float)
            native=np.fromfile(output/'aov-color.bin',dtype=np.float16).reshape(256,256,4)[::-1,:,:3].astype(float)
            assert np.isfinite(native).all(),(host,variant,'non-finite AOV')
            error=np.abs(native-browser)
            result={'meanAbsoluteError':float(error.mean()),
                    'p95AbsoluteError':float(np.percentile(error,95)),
                    'maximumAbsoluteError':float(error.max())}
            reports[host+'/'+variant]=result
            print(host,variant,json.dumps(result),flush=True)
            assert result['meanAbsoluteError']<(.015 if ssgi else .003),(host,variant,result)
            assert result['p95AbsoluteError']<(.06 if ssgi else .01),(host,variant,result)
            stats=json.loads((output/'smoke.json').read_text())['stats']
            assert stats['needle:surfaceCodecTests']>0,stats
            assert stats['needle:surfaceCodecErrors']==0,stats
    beauty=np.fromfile(root/'.build'/host/'parity/aov-color.bin',dtype=np.float16).reshape(256,256,4)[::-1,:,:3].astype(float)
    basic=np.fromfile(root/'.build'/host/'parity-basic/aov-color.bin',dtype=np.float16).reshape(256,256,4)[::-1,:,:3].astype(float)
    effect=beauty-basic
    # Visible corner occlusion and red indirect light beside the red cube.
    # Fixed pixels correspond to the same camera in both capture harnesses.
    gi={'meanAbsoluteEffect':float(np.abs(effect).mean()),
        'cornerOcclusion':float(effect[178:185,30:55].mean()),
        'redBounce':float((effect[160:175,110:120,0]-effect[160:175,110:120,1]).mean())}
    reports[host+'/ssgi']=gi
    assert gi['meanAbsoluteEffect']>.01,(host,gi)
    assert gi['cornerOcclusion']<-.03,(host,gi)
    assert gi['redBounce']>.005,(host,gi)

path=root/'.build/parity-comparison.json'
path.write_text(json.dumps(reports,indent=2)+'\n')
print('Native/browser parity passed:',path,flush=True)
