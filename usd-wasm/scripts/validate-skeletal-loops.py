#!/usr/bin/env python3
"""Check skeletal loops with native USD; optionally compare browser world points.

Use native OpenUSD Python bindings on PYTHONPATH. --browser-dir accepts the
skeletal-loops.spec.ts Playwright output directory. Neither check changes assets.
"""
import argparse
from collections import defaultdict
import itertools
import json
import math
from pathlib import Path
from pxr import Gf, Sdf, Usd, UsdGeom, UsdSkel

ROOT = Path(__file__).resolve().parents[1]
NAMES = ['skel-rest', 'skel-bind', 'skel-joint-names', 'skel-weighted',
         'skel-dual-quaternion', 'skel-translation', 'skel-rotation',
         'blendshape', 'blendshape-sparse', 'blendshape-inbetween']
TOLERANCE = 1e-5


def baked_points(source, time):
    layer = Sdf.Layer.CreateAnonymous('.usda')
    layer.TransferContent(source)
    stage = Usd.Stage.Open(layer)
    # BakeSkinning writes only authored samples. Insert evaluated values on our
    # disposable copy so arbitrary fractional/reference times bake correctly.
    for prim in stage.Traverse():
        for attr in prim.GetAttributes():
            if attr.GetNumTimeSamples():
                value = attr.Get(time)
                if value is not None:
                    attr.Set(value, time)
    if not UsdSkel.BakeSkinning(stage.Traverse(), Gf.Interval(time, time)):
        raise AssertionError(f'Native skinning failed at {time}')
    mesh = UsdGeom.Mesh.Get(stage, '/World/Rig/Surface')
    matrix = UsdGeom.XformCache(time).GetLocalToWorldTransform(mesh.GetPrim())
    return [tuple(matrix.Transform(Gf.Vec3d(point))) for point in mesh.GetPointsAttr().Get(time)]


def position_error(a, b):
    assert len(a) == len(b)
    return max(math.dist(p, q) for p, q in zip(a, b))


def nearest_errors(points, references):
    # Native indexed points become expanded triangle corners in the delegate.
    # A spatial grid makes the bidirectional comparison linear in mesh size.
    grid = defaultdict(list)
    for point in references:
        grid[tuple(math.floor(v / TOLERANCE) for v in point)].append(point)
    errors = []
    for point in points:
        cell = tuple(math.floor(v / TOLERANCE) for v in point)
        candidates = [ref for offset in itertools.product((-1, 0, 1), repeat=3)
                      for ref in grid.get(tuple(v + d for v, d in zip(cell, offset)), ())]
        errors.append(min((math.dist(point, ref) for ref in candidates), default=math.inf))
    return max(errors)


def validate(browser_dir=None):
    report = {'nativeVersion': list(Usd.GetVersion()), 'tolerance': TOLERANCE,
              'scope': 'Native baked loop poses and bidirectional world-point comparison; not pixel equivalence.',
              'fixtures': [], 'browserComparisons': []}
    sources, stages = {}, []
    for name in NAMES:
        stage = Usd.Stage.Open(str(ROOT / 'tests/fixtures/coverage/advanced' / (name + '.usda')))
        assert stage and not stage.GetCompositionErrors(), name
        source = stage.GetRootLayer()
        # SdfLayer's Python wrapper is weak; keep its owning stage alive while
        # reference poses are compared after the fixture-validation loop.
        stages.append(stage)
        original = source.ExportToString()
        sources['advanced-' + name] = source
        start, end = stage.GetStartTimeCode(), stage.GetEndTimeCode()
        assert end > start and stage.GetFramesPerSecond() == 24, name
        times = [start + t * (end - start) for t in (0, .125, .25, .375, .5, .625, .75, .875, 1)]
        poses = [baked_points(source, t) for t in times]
        assert all(math.isfinite(v) for pose in poses for point in pose for v in point), name
        seam = position_error(poses[0], poses[-1])
        motion = max(position_error(poses[0], pose) for pose in poses[1:-1])
        assert seam < TOLERANCE, (name, 'loop jumps', seam)
        assert motion > .03, (name, 'no meaningful skinning', motion)
        assert source.ExportToString() == original, 'Reference baking modified the authored fixture'
        binding = UsdSkel.BindingAPI(stage.GetPrimAtPath('/World/Rig/Surface'))
        indices, weights = binding.GetJointIndicesPrimvar(), binding.GetJointWeightsPrimvar()
        values, size = list(weights.Get()), weights.GetElementSize()
        assert size > 0 and len(values) == len(indices.Get()), name
        assert all(v >= 0 and math.isfinite(v) for v in values), name
        assert all(abs(sum(values[i:i + size]) - 1) < 1e-5 for i in range(0, len(values), size)), name
        skeleton = UsdSkel.Skeleton.Get(stage, binding.GetSkeletonRel().GetTargets()[0])
        assert all(0 <= index < len(skeleton.GetJointsAttr().Get()) for index in indices.Get()), name
        for target in binding.GetBlendShapeTargetsRel().GetTargets():
            shape = UsdSkel.BlendShape.Get(stage, target)
            offsets = list(shape.GetOffsetsAttr().Get())
            point_indices = shape.GetPointIndicesAttr().Get()
            assert offsets and any(offset.GetLength() > 0 for offset in offsets), (name, 'empty target')
            if point_indices:
                assert len(point_indices) == len(offsets) and len(point_indices) < len(poses[0]), name
                assert all(0 <= index < len(poses[0]) for index in point_indices), name
            else:
                assert len(offsets) == len(poses[0]), name
            assert len({tuple(offset) for offset in offsets}) > 1, (name, 'target only translates its points')
        report['fixtures'].append({'id': 'advanced-' + name, 'start': start, 'end': end,
                                   'samples': times, 'vertices': len(poses[0]),
                                   'endpointError': seam, 'maxMotion': motion, 'pass': True})
        print(name, 'PASS', 'loop error', seam, 'motion', round(motion, 4), flush=True)
    if browser_dir:
        captures = list(Path(browser_dir).rglob('positions.json'))
        assert captures, 'No browser positions.json reports'
        for path in captures:
            data = json.loads(path.read_text())
            assert {r['id'] for r in data['results']} == set(sources), path
            for fixture in data['results']:
                source = sources[fixture['id']]
                for sample in fixture['samples']:
                    flat = sample['positions']
                    actual = list({tuple(flat[i:i + 3]) for i in range(0, len(flat), 3)})
                    native = baked_points(source, sample['time'])
                    error = max(nearest_errors(actual, native), nearest_errors(native, actual))
                    assert error <= TOLERANCE, (data['viewer'], fixture['id'], sample['time'], error)
                    report['browserComparisons'].append({'viewer': data['viewer'], 'id': fixture['id'],
                                                        'time': sample['time'], 'maxError': error, 'pass': True})
            print(data['viewer'], 'native comparisons PASS', len(data['results']), 'fixtures', flush=True)
    output = ROOT / '.cache/skeletal-loops/native-validation.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser-dir')
    validate(parser.parse_args().browser_dir)
