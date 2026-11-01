#!/usr/bin/env python3
"""Cache missing 512 px texture previews for explicitly named SimReady packages.

Requires Pillow. Originals stay under ignored .cache/; generated app images carry
source URLs, hashes and NVIDIA's CC BY 4.0 attribution in their adjacent index.
Run prepare:simready-manifest afterwards to update the resource shards.
"""
import hashlib, io, json, pathlib, sys, urllib.request
from PIL import Image

root=pathlib.Path(__file__).resolve().parents[1]
manifest=json.loads((root/'public/data/nvidia-simready.json').read_text())
revision=manifest['revision']
base=f'https://huggingface.co/datasets/nvidia/simready-assets/resolve/{revision}/'
output=root/'public/data/simready-textures';output.mkdir(exist_ok=True)
index_path=output/'index.json'
index=json.loads(index_path.read_text()) if index_path.exists() else {'revision':revision,'author':'NVIDIA','license':'CC-BY-4.0','images':[]}
if index['revision']!=revision:raise ValueError('Preview revision differs from the catalog; regenerate its index explicitly.')
records={entry['source']:entry for entry in index['images']}
if not sys.argv[1:]:raise SystemExit('Usage: python3 scripts/generate-simready-texture-previews.py package [package ...]')
entries=[]
for page in sorted((root/'.cache/simready-index'/revision).glob('*.json')):entries.extend(json.loads(page.read_text())['entries'])
files={entry['path']:entry for entry in entries if entry['type']=='file'}
for package in sys.argv[1:]:
    if not any(asset['package']==package for asset in manifest['assets']):raise ValueError('Unknown SimReady package: '+package)
    prefix=package+'/simready_usd/Textures/'
    for path,entry in files.items():
        if not path.startswith(prefix) or '/.thumbs/' in path:continue
        preview=prefix+'.thumbs/512x512/'+pathlib.PurePosixPath(path).name+'.png'
        if preview in files:continue
        url=base+path
        if url in records and (root/'public'/records[url]['file'].lstrip('/')).exists():continue
        cache=root/'.cache/simready-texture-originals'/path;cache.parent.mkdir(parents=True,exist_ok=True)
        if not cache.exists():
            print('Downloading',path,entry['size'],flush=True)
            urllib.request.urlretrieve(url,cache)
        original=cache.read_bytes()
        if len(original)!=entry['size']:raise ValueError('Source size differs: '+path)
        with Image.open(io.BytesIO(original)) as source:
            size=source.size
            image=source.convert('RGBA');image.thumbnail((512,512),Image.Resampling.LANCZOS)
            relative=pathlib.PurePosixPath('data/simready-textures')/package/'Textures'/pathlib.PurePosixPath(path).name
            destination=root/'public'/relative;destination.parent.mkdir(parents=True,exist_ok=True)
            image.save(destination,optimize=True)
        records[url]={'package':package,'texture':path[len(package+'/simready_usd/'):],'source':url,'sourceSha256':hashlib.sha256(original).hexdigest(),'sourceSize':list(size),'file':str(relative),'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()}
        print('Prepared',relative,destination.stat().st_size,flush=True)
index['images']=sorted(records.values(),key=lambda entry:entry['source'])
index_path.write_text(json.dumps(index,indent=2)+'\n')
