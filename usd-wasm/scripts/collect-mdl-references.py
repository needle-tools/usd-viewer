"""Validate RTX captures against current fixtures, then collect PNGs/metadata."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
from PIL import Image, ImageChops, ImageStat

ROOT=Path(__file__).resolve().parents[1]
fixtures=ROOT/'tests/fixtures/coverage/lighting-mdl'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--captures',type=Path,required=True)
parser.add_argument('--out',type=Path,default=fixtures/'references')
args=parser.parse_args();args.out.mkdir(parents=True,exist_ok=True)
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
records=[]
for entry in json.loads((fixtures/'manifest.json').read_text()):
    if entry['group']!='MDL':continue
    name=Path(entry['root']).stem;captures=[]
    for suffix in ('','-disabled'):
        render_name=name+suffix;folder=args.captures/render_name
        record=json.loads((folder/'capture.json').read_text())
        assert record['status']=='passed' and not record['shaderOrRuntimeFailures'],render_name
        assert record['display']['transform']=='Needle AgX',render_name
        for path in entry['files']:
            source=ROOT/'tests/fixtures'/path
            relative=source.relative_to(fixtures).as_posix()
            assert record['inputHashes'][relative]==digest(source),relative
        image=folder/'render.png';sha=digest(image)
        assert record['outputs']['render.png']==sha,render_name
        captures.append((render_name,image,record,sha))
    enabled,disabled=[Image.open(item[1]).convert('RGB') for item in captures]
    w,h=enabled.size
    roi=(int(w*.15),int(h*.15),int(w*.85),int(h*.85))
    difference=ImageChops.difference(enabled,disabled).crop(roi)
    mean=sum(ImageStat.Stat(difference).mean)/(3*255)
    r,g,b=difference.split();maximum=ImageChops.lighter(ImageChops.lighter(r,g),b)
    histogram=maximum.histogram();fraction=sum(histogram[16:])/sum(histogram)
    assert mean>(.012 if name=='mdl-normal-texture' else .006),(name,'weak material effect',mean)
    assert fraction>(.07 if name=='mdl-normal-texture' else .025),(name,'too few visibly affected pixels',fraction)
    for render_name,image,record,sha in captures:
        shutil.copyfile(image,args.out/(render_name+'.png'))
        # Full capture records stay with the raw logs in the local capture folder.
        records.append({'name':render_name,'image':render_name+'.png','sha256':sha})
    records[-2]['effectDifference']={'meanRGB':mean,'fractionAbove15':fraction,'control':name+'-disabled.png','roi':[.15,.15,.85,.85]}
    print(name, 'mean RGB change',round(mean,4),'visible fraction',round(fraction,3))
(args.out/'manifest.json').write_text(json.dumps({'renderer':'NVIDIA RTX / ovrtx','display':'Needle AgX / exposure 1 / sRGB','results':records},indent=2)+'\n')
print(f'Collected {len(records)} validated MDL scene references in {args.out}')
