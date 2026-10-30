"""Render catalog cards with the local thumbnail helper and native usdrecord/Storm.

Run with a Python matching the native USD installation. Both tools can be
overridden on other machines; work layers and render logs stay in .cache.
"""
import argparse
import concurrent.futures
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import shutil
import sys
from types import SimpleNamespace

from pxr import Gf, Sdf, Usd, UsdGeom, UsdSkel
from nurbs_reference import evaluated_reference
from native_dome_reference import textured_dome_reference
from native_texture_reference import decoded_texture_reference

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / 'tests/fixtures'
SUITES = sorted(path.name for path in (FIXTURES / 'coverage').iterdir() if (path / 'manifest.json').is_file())


def render(task):
    entry, options = task
    work = ROOT / '.cache/coverage-thumbnails' / entry['id']
    work.mkdir(parents=True, exist_ok=True)
    os.chdir(work)
    output = FIXTURES / 'thumbnails' / (entry['id'] + '.png')
    if output.exists() and not options.force:
        return {'id': entry['id'], 'status': 'existing', 'renderer': 'Storm'}
    helper_path = Path(options.helper).expanduser()
    spec = importlib.util.spec_from_file_location('thumbnail_helper', helper_path)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    helper.args = SimpleNamespace(width=options.width, height=round(options.width * .75), dome_light=None, verbose=False)
    source = str(FIXTURES / entry['root'])
    stage = Usd.Stage.Open(source)
    particle_fields = [prim for prim in stage.Traverse() if prim.GetTypeName() == 'ParticleField3DGaussianSplat']
    particle_bounds = None
    capture = 'surface'
    frame = entry.get('thumbnailFrame')
    if frame is not None and any(prim.IsA(UsdSkel.Root) for prim in stage.Traverse()):
        # Native CPU skinning avoids Storm 26.05's GPU normal/blend-shape
        # artifacts. Flatten only this private reference layer, never the asset.
        source = str(work / 'baked-skinning.usda')
        stage.Flatten().Export(source)
        stage = Usd.Stage.Open(source)
        for prim in stage.Traverse():
            for attr in prim.GetAttributes():
                if attr.GetNumTimeSamples():
                    value = attr.Get(frame)
                    if value is not None: attr.Set(value, frame)
        if not UsdSkel.BakeSkinning(stage.Traverse(), Gf.Interval(frame, frame)):
            raise RuntimeError(f"{entry['id']}: native skinning failed at {frame}")
        stage.GetRootLayer().Save()
        capture = 'native UsdSkel.BakeSkinning; Storm'
    stage, nurbs_records = evaluated_reference(stage, work / 'evaluated-nurbs.usda')
    if nurbs_records:
        source = str(work / 'evaluated-nurbs.usda')
        capture = 'evaluated NURBS; native Storm rendering of rational mesh/curve proxy'
        (work / 'nurbs-evaluation.json').write_text(json.dumps(nurbs_records, indent=2) + '\n')
    if particle_fields and Usd.GetVersion() < (0, 26, 11):
        # The installed native renderer predates the particle-field schema.
        # Render its authored data bounds with native USD draw mode instead.
        points = [Gf.Vec3d(point) for prim in particle_fields for point in prim.GetAttribute('positions').Get()]
        ranges = Gf.Range3d()
        for point in points:
            ranges.UnionWith(point)
        ranges = Gf.Range3d(ranges.GetMin() - Gf.Vec3d(.3), ranges.GetMax() + Gf.Vec3d(.3))
        particle_bounds = ranges
        proxy = Usd.Stage.CreateNew(str(work / 'particle-bounds.usda'))
        proxy.GetRootLayer().subLayerPaths = [source]
        world = proxy.OverridePrim('/World')
        Usd.ModelAPI(world).SetKind('component')
        model = UsdGeom.ModelAPI.Apply(world)
        model.CreateModelDrawModeAttr().Set('bounds')
        model.CreateModelApplyDrawModeAttr().Set(True)
        model.SetExtentsHint([Gf.Vec3f(ranges.GetMin()), Gf.Vec3f(ranges.GetMax())])
        proxy.GetRootLayer().Save()
        stage, source = proxy, str(work / 'particle-bounds.usda')
        capture = 'bounds-only; native Storm 26.05 predates particle-field rendering'
    stage, decoded_textures = decoded_texture_reference(stage, work / 'decoded-textures.usda')
    if decoded_textures:
        source = stage.GetRootLayer().identifier
        capture += '; KTX2 decoded with Khronos ktx for native Storm'
    stage, textured_domes = textured_dome_reference(stage, work / 'textured-domes.usda')
    if textured_domes:
        source = stage.GetRootLayer().identifier
        capture += '; solid dome emitted via equivalent constant HDR texture'
    authored_camera = next((prim.GetPath() for prim in stage.Traverse() if prim.IsA(UsdGeom.Camera)), None)
    camera_path = str(authored_camera) if authored_camera else 'MainCamera'
    if UsdGeom.GetStageUpAxis(stage) == 'Z':
        stage = helper.generate_y_up_stage(stage, source)
        source = str(work / 'y_up.usda')
        camera_path = '/Root' + camera_path if authored_camera else 'MainCamera'
    helper.setup_camera(stage, source)
    if not authored_camera:
        bounds = particle_bounds if particle_bounds is not None else UsdGeom.BBoxCache(Usd.TimeCode.Default(), ['default', 'render', 'proxy']).ComputeWorldBound(stage.GetPseudoRoot()).ComputeAlignedRange()
        center = (bounds.GetMin() + bounds.GetMax()) * .5
        radius = max((bounds.GetMax() - bounds.GetMin()).GetLength() * .5, .01)
        camera_stage = Usd.Stage.Open('camera.usda')
        camera = UsdGeom.Camera.Get(camera_stage, '/ThumbnailGenerator/MainCamera')
        eye = center + Gf.Vec3d(1, .6, 1).GetNormalized() * radius * 3
        camera.GetFocalLengthAttr().Set(40)
        camera.GetHorizontalApertureAttr().Set(36)
        camera.GetVerticalApertureAttr().Set(27)
        camera.GetClippingRangeAttr().Set(Gf.Vec2f(radius / 1000, radius * 100))
        xform = UsdGeom.Xformable(camera)
        xform.ClearXformOpOrder()
        xform.AddTransformOp().Set(Gf.Matrix4d().SetLookAt(eye, center, Gf.Vec3d(0, 1, 0)).GetInverse())
        camera_stage.GetRootLayer().Save()
    output.parent.mkdir(exist_ok=True)
    command = [sys.executable, options.usdrecord, '--renderer', 'Storm', '--camera', camera_path,
               '--imageWidth', str(options.width), '--purposes', 'default,render,proxy', 'camera.usda', str(output)]
    if entry.get('thumbnailComplexity'):
        command[-2:-2] = ['--complexity', entry['thumbnailComplexity']]
    if entry.get('thumbnailFrame') is not None:
        command[-2:-2] = ['--frames', str(entry['thumbnailFrame'])]
        # usdrecord requires a frame placeholder even for one explicit frame.
        command[-1] = str(work / 'thumbnail.####.png')
    if entry.get('thumbnailCameraLight') is False:
        command.insert(-2, '--disableCameraLight')
    with (work / 'usdrecord.log').open('w') as log:
        result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=120)
    failure = None
    if result.returncode != 0 and any(prim.GetTypeName() == 'Volume' for prim in stage.Traverse()):
        # This native build has no VDB field plugin. usdview's native bounds
        # draw mode still gives the card an honest representation of extent.
        # Keep the original failed render log and explicitly record the scope.
        failure = (work / 'usdrecord.log').read_text()
        bounds_layer = Sdf.Layer.CreateNew(str(work / 'bounds.usda'))
        bounds_stage = Usd.Stage.Open(bounds_layer)
        world = bounds_stage.OverridePrim('/World')
        Usd.ModelAPI(world).SetKind('component')
        model = UsdGeom.ModelAPI.Apply(world)
        model.CreateModelDrawModeAttr().Set('bounds')
        model.CreateModelApplyDrawModeAttr().Set(True)
        bounds = UsdGeom.BBoxCache(Usd.TimeCode.Default(), ['default', 'render', 'proxy']).ComputeWorldBound(stage.GetPseudoRoot()).ComputeAlignedRange()
        model.SetExtentsHint([Gf.Vec3f(bounds.GetMin()), Gf.Vec3f(bounds.GetMax())])
        bounds_layer.Save()
        fallback_command = command[:-2] + ['--sessionLayer', str(work / 'bounds.usda')] + command[-2:]
        with (work / 'bounds-usdrecord.log').open('w') as log:
            result = subprocess.run(fallback_command, stdout=log, stderr=subprocess.STDOUT, timeout=120)
        capture = 'bounds-only; native build has no VDB field plugin'
    if result.returncode == 0 and entry.get('thumbnailFrame') is not None:
        shutil.copyfile(work / f"thumbnail.{int(entry['thumbnailFrame']):04d}.png", output)
    record = {'id': entry['id'], 'status': 'rendered' if result.returncode == 0 and output.exists() else 'failed',
            'renderer': 'Storm', 'camera': camera_path, 'exitCode': result.returncode, 'capture': capture,
            **({'timeCode': entry['thumbnailFrame']} if entry.get('thumbnailFrame') is not None else {}),
            **({'surfaceRenderFailure': failure} if failure else {})}
    (work / 'capture.json').write_text(json.dumps(record, indent=2) + '\n')
    return record


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--helper', default=str(Path.home() / 'git/usd-thumbnail-generator/generate_thumbnail.py'))
    parser.add_argument('--usdrecord', default=str(Path.home() / 'OpenUSD-26.05-native/bin/usdrecord'))
    parser.add_argument('--jobs', type=int, default=2)
    parser.add_argument('--width', type=int, default=448)
    parser.add_argument('--asset')
    parser.add_argument('--suite', choices=SUITES)
    parser.add_argument('--force', action='store_true')
    OPTIONS = parser.parse_args()
    entries = [entry for suite in ([OPTIONS.suite] if OPTIONS.suite else SUITES) for entry in
               json.loads((FIXTURES / 'coverage' / suite / 'manifest.json').read_text())
               if not OPTIONS.asset or entry['id'] == OPTIONS.asset]
    results = []
    # Processes isolate the helper's working directory and native USD/GL state.
    with concurrent.futures.ProcessPoolExecutor(max_workers=OPTIONS.jobs) as pool:
        for result in pool.map(render, [(entry, OPTIONS) for entry in entries]):
            results.append(result)
            print(result['status'], result['id'], flush=True)
    report = ROOT / '.cache/coverage-thumbnails/results.json'
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(results, indent=2) + '\n')
    # Keep a durable image index alongside the catalog, including captures from
    # other suite runs. Temporary working layers/logs stay outside the fixtures.
    index_path = FIXTURES / 'coverage/native-captures.json'
    previous = json.loads(index_path.read_text()) if index_path.exists() else {}
    records = {record['id']: record for record in previous.get('results', [])}
    for entry in [entry for suite in SUITES for entry in
                  json.loads((FIXTURES / 'coverage' / suite / 'manifest.json').read_text())]:
        image = FIXTURES / 'thumbnails' / (entry['id'] + '.png')
        if not image.exists():
            continue
        metadata = ROOT / '.cache/coverage-thumbnails' / entry['id'] / 'capture.json'
        record = json.loads(metadata.read_text()) if metadata.exists() else records.get(entry['id'],
            {'id': entry['id'], 'renderer': 'Storm', 'capture': 'surface'})
        for key in ['surfaceRenderFailure', 'status', 'exitCode']:
            record.pop(key, None)
        record.update(image='thumbnails/' + image.name, sha256=hashlib.sha256(image.read_bytes()).hexdigest())
        records[entry['id']] = record
    index_path.write_text(json.dumps({'openusdVersion': list(Usd.GetVersion()), 'renderer': 'Storm',
        'scope': 'Native captures; bounds-only entries do not establish rendering of the authored feature.',
        'results': list(records.values())}, indent=2) + '\n')
    if any(result['status'] == 'failed' for result in results):
        sys.exit(1)
