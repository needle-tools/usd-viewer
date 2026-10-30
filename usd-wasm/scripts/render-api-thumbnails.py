"""Render exported executable-example stages with the native Storm helper.

Run node scripts/export-api-example-stages.mjs first. Requires the same Python
and native OpenUSD environment as render-coverage-thumbnails.py.
"""
import concurrent.futures
import importlib.util
import json
import hashlib
from pathlib import Path
from types import SimpleNamespace
from pxr import Usd, UsdGeom
from particle_preview import particle_preview

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('coverage_capture', ROOT / 'scripts/render-coverage-thumbnails.py')
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


def render(entry):
    entry = {**entry, 'thumbnailComplexity': 'high'}
    stage = Usd.Stage.Open(entry['root'])
    if stage.GetEndTimeCode() > stage.GetStartTimeCode() and any(attribute.GetNumTimeSamples() > 1 for prim in stage.Traverse() for attribute in prim.GetAttributes()):
        entry['thumbnailFrame'] = round(stage.GetStartTimeCode() + (stage.GetEndTimeCode() - stage.GetStartTimeCode()) * .25)
    stage, particle_records = particle_preview(stage, Path(entry['root']).parent / 'native-particle-preview.usda')
    if particle_records:
        entry['root'] = stage.GetRootLayer().identifier
    bounds = UsdGeom.BBoxCache(Usd.TimeCode.Default(), ['default', 'render', 'proxy']).ComputeWorldBound(stage.GetPseudoRoot()).ComputeAlignedRange()
    if bounds.IsEmpty():
        raise RuntimeError(f"{entry['example']}: scene has no native render bounds")
    for prim in stage.Traverse():
        for attribute in prim.GetAttributes():
            if str(attribute.GetTypeName()) == 'asset':
                value = attribute.Get()
                if value and value.path and not value.resolvedPath:
                    raise RuntimeError(f"{entry['example']}: unresolved native asset {attribute.GetPath()}: {value.path}")
    result = capture.render((entry, SimpleNamespace(
        helper=str(Path.home() / 'git/usd-thumbnail-generator/generate_thumbnail.py'),
        usdrecord=str(Path.home() / 'OpenUSD-26.05-native/bin/usdrecord'),
        width=448, force=True)))
    if particle_records:
        result['capture'] = 'native Storm covariance-ellipsoid preview; not Gaussian density rendering'
        result['particleFields'] = particle_records
    return result


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('captures', nargs='?', default=str(ROOT / '.cache/api-example-captures'))
    # A subset run (export-api-example-stages.mjs --only) merges its records
    # into the existing index instead of replacing every preview.
    parser.add_argument('--merge', action='store_true')
    options = parser.parse_args()
    entries = json.loads((Path(options.captures) / 'manifest.json').read_text())
    missing = [entry['example'] for entry in entries if not entry['hasGeometry'] or not entry['root']]
    if missing:
        raise SystemExit(f'Examples without preview geometry: {missing}')
    with concurrent.futures.ProcessPoolExecutor(max_workers=2) as pool:
        results = []
        for result in pool.map(render, entries):
            results.append(result)
            print(result['status'], result['id'], flush=True)
    source_fingerprints = {entry['id']: entry['sourceFingerprint'] for entry in entries}
    records = [{**{key: result[key] for key in ('id', 'status', 'renderer', 'camera', 'exitCode', 'capture')},
                'particleFields': result.get('particleFields', []),
                'sourceFingerprint': source_fingerprints[result['id']],
                'imageSha256': hashlib.sha256((ROOT / 'tests/fixtures/thumbnails' / (result['id'] + '.png')).read_bytes()).hexdigest()
                if result['status'] == 'rendered' else None} for result in results]
    fixture = ROOT / 'tests/fixtures/api'
    if options.merge:
        updated = {record['id']: record for record in records}
        previous = json.loads((fixture / 'native-captures.json').read_text())['results']
        records = [updated.pop(record['id'], record) for record in previous] + list(updated.values())
    (fixture / 'native-captures.json').write_text(json.dumps({'results': records}, indent=2) + '\n')
    ids = [record['id'].removeprefix('api-') for record in records if record['status'] == 'rendered']
    (fixture / 'previews.js').write_text(
        '// Generated with native usdrecord --renderer Storm; see scripts/render-api-thumbnails.py.\n'
        + 'export const apiPreviewIds = new Set(' + json.dumps(ids, indent=2) + ');\n')
    print(f'{len(ids)}/{len(records)} native Storm previews rendered', flush=True)
    if len(ids) != len(records):
        raise SystemExit(1)
