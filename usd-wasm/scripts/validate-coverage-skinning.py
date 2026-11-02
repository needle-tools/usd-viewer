#!/usr/bin/env python3
"""Compare small browser rig position samples to native UsdSkel.BakeSkinning.

Run the browser selection first with --output .cache/coverage-validation/skinning-browser-results.json.
Native: python3 scripts/validate-coverage-skinning.py
"""
from pathlib import Path
import json, math
from pxr import Gf, Sdf, Usd, UsdSkel

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'.cache/coverage-validation/skinning-browser-results.json'
OUTPUT=ROOT/'.cache/coverage-validation/skinning-comparison.json'
TOLERANCE=1e-5
TIMES=(1,24,48)
IDS=['advanced-'+n for n in ('skel-rest','skel-bind','skel-joint-names','skel-weighted','skel-dual-quaternion','skel-translation','skel-rotation','blendshape','blendshape-sparse','blendshape-inbetween')]
report=json.loads(SOURCE.read_text()); by_id={r['id']:r for r in report['results']}
if set(IDS)!=set(by_id): raise ValueError('Browser report must contain exactly the ten rig cases')
results=[]
for fixture_id in IDS:
    browser=by_id[fixture_id]; source=Sdf.Layer.FindOrOpen(str(ROOT/'tests/fixtures'/browser['root']))
    if not source: raise RuntimeError('Cannot open '+fixture_id)
    comparisons=[]
    for sample in browser.get('samples',[]):
        time=sample['time']; layer=Sdf.Layer.CreateAnonymous('.usda'); layer.TransferContent(source); stage=Usd.Stage.Open(layer)
        # BakeSkinning only writes at authored sample times. Insert the evaluated
        # intermediate values on this disposable layer before baking that frame.
        for prim in stage.Traverse():
            for attribute in prim.GetAttributes():
                if attribute.GetTimeSamples():
                    value=attribute.Get(time)
                    if value is not None: attribute.Set(value,time)
        if not UsdSkel.BakeSkinning(stage.Traverse(),Gf.Interval(time,time)): raise RuntimeError(f'{fixture_id}: bake failed at {time}')
        native=[list(point) for point in stage.GetPrimAtPath('/World/Rig/Surface').GetAttribute('points').Get(time)]
        objects=[o for o in sample['scene']['objects'] if o['name']=='Surface' and o['positions'] is not None]
        if len(objects)!=1: raise RuntimeError(f'{fixture_id}: expected one captured Surface')
        flat=objects[0]['positions']; actual=[flat[i:i+3] for i in range(0,len(flat),3)]
        # Hydra expands indexed USD topology to per-triangle corners. Match
        # each expanded corner to its nearest native point, and require every
        # native point to appear; this tests positions, not topology ordering.
        def distances(a,b): return [math.dist(p,q) for p in a for q in b]
        a_to_n=[min(math.dist(p,q) for q in native) for p in actual]
        n_to_a=[min(math.dist(p,q) for q in actual) for p in native]
        error=max(a_to_n+n_to_a); comparisons.append({'time':time,'pass':error<=TOLERANCE,'maxError':error,'nativePoints':native,'browserTriangleCorners':actual,'nativePointCount':len(native),'browserCornerCount':len(actual)})
    if [s['time'] for s in comparisons]!=list(TIMES): raise RuntimeError(f'{fixture_id}: missing frames')
    results.append({'id':fixture_id,'pass':all(s['pass'] for s in comparisons),'samples':comparisons})
OUTPUT.write_text(json.dumps({'scope':'Native UsdSkel.BakeSkinning on an anonymous copy compared to browser mesh point positions; nearest-point comparison accounts for triangle expansion and does not validate topology ordering. Intermediate frame values are sampled before bake.','nativeOpenUSDVersion':list(Usd.GetVersion()),'tolerance':TOLERANCE,'results':results},indent=2)+'\n')
for r in results: print(r['id'], 'PASS' if r['pass'] else 'MISMATCH', 'max error',max(s['maxError'] for s in r['samples']))
if not all(r['pass'] for r in results): raise SystemExit(1)
