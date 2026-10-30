"""Render fixture material probes using an installed NVIDIA MDL SDK.

On macOS use the already signed df_native-local-jit copy. This script does not
change signatures or system settings. These are material spheres, not USD scenes.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--sdk',type=Path,required=True)
parser.add_argument('--bundle',type=Path,required=True)
parser.add_argument('--out',type=Path,required=True)
parser.add_argument('--samples',type=int,default=128)
args=parser.parse_args()
sdk=args.sdk.resolve();bundle=args.bundle.resolve();out=args.out.resolve();out.mkdir(parents=True,exist_ok=True)
exe=sdk/'examples/mdl_sdk/df_native'/('df_native.exe' if sys.platform=='win32' else 'df_native-local-jit' if sys.platform=='darwin' else 'df_native')
if not exe.is_file():raise SystemExit(f'Missing {exe}; see docs/mdl-reference-rendering.md for SDK setup.')
results=[]
for scene in json.loads((bundle/'scenes.json').read_text())['scenes']:
    name=scene['name'];image=out/(name+'.png')
    command=[str(exe),'--no_window','--nocc','--single_threaded','--res','256','256','--spp',str(args.samples),'-p',str(bundle),'-o',str(image),'::fixture_reference::'+name.replace('-','_')]
    result=subprocess.run(command,cwd=sdk,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=180)
    text=result.stdout.decode(errors='replace');(out/(name+'.log')).write_text(text)
    errors=[line for line in text.splitlines() if re.search(r'\berror\s*:',line,re.I)]
    record={'name':name,'exitCode':result.returncode,'errors':errors,'command':command,
            'imageSha256':hashlib.sha256(image.read_bytes()).hexdigest() if image.exists() else None}
    results.append(record);(out/'results.json').write_text(json.dumps(results,indent=2)+'\n')
    if result.returncode or errors or not image.exists():raise SystemExit(f'{name} failed; see {out/(name+".log")}')
    print(f'Rendered {name}',flush=True)
