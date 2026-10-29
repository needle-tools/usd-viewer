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

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('coverage_capture', ROOT / 'scripts/render-coverage-thumbnails.py')
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


def render(entry):
    entry = {**entry, 'thumbnailComplexity': 'high'}
    stage = Usd.Stage.Open(entry['root'])
    bounds = UsdGeom.BBoxCache(Usd.TimeCode.Default(), ['default', 'render', 'proxy']).ComputeWorldBound(stage.GetPseudoRoot()).ComputeAlignedRange()
    if bounds.IsEmpty():
        raise RuntimeError(f"{entry['example']}: scene has no native render bounds")
    for prim in stage.Traverse():
        for attribute in prim.GetAttributes():
            if str(attribute.GetTypeName()) == 'asset':
                value = attribute.Get()
                if value and value.path and not value.resolvedPath:
                    raise RuntimeError(f"{entry['example']}: unresolved native asset {attribute.GetPath()}: {value.path}")
    return capture.render((entry, SimpleNamespace(
        helper=str(Path.home() / 'git/usd-thumbnail-generator/generate_thumbnail.py'),
        usdrecord=str(Path.home() / 'OpenUSD-26.05-native/bin/usdrecord'),
        width=448, force=True)))


if __name__ == '__main__':
    entries = json.loads((ROOT / '.cache/api-example-captures/manifest.json').read_text())
    missing = [entry['example'] for entry in entries if not entry['hasGeometry'] or not entry['root']]
    if missing:
        raise SystemExit(f'Examples without preview geometry: {missing}')
    with concurrent.futures.ProcessPoolExecutor(max_workers=2) as pool:
        results = []
        for result in pool.map(render, entries):
            results.append(result)
            print(result['status'], result['id'], flush=True)
    source_fingerprints = {entry['id']: entry['sourceFingerprint'] for entry in entries}
    records = [{**{key: result[key] for key in ('id', 'status', 'renderer', 'camera', 'exitCode')},
                'sourceFingerprint': source_fingerprints[result['id']],
                'imageSha256': hashlib.sha256((ROOT / 'tests/fixtures/thumbnails' / (result['id'] + '.png')).read_bytes()).hexdigest()
                if result['status'] == 'rendered' else None} for result in results]
    fixture = ROOT / 'tests/fixtures/api'
    (fixture / 'native-captures.json').write_text(json.dumps({'results': records}, indent=2) + '\n')
    ids = [record['id'].removeprefix('api-') for record in records if record['status'] == 'rendered']
    (fixture / 'previews.js').write_text(
        '// Generated with native usdrecord --renderer Storm; see scripts/render-api-thumbnails.py.\n'
        + 'export const apiPreviewIds = new Set(' + json.dumps(ids, indent=2) + ');\n')
    print(f'{len(ids)}/{len(records)} native Storm previews rendered', flush=True)
    if len(ids) != len(records):
        raise SystemExit(1)
