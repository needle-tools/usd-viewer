"""Verify native preview geometry independently of browser rendering."""
from pathlib import Path
import sys
import tempfile
import unittest
from pxr import Gf, Usd, UsdGeom
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from particle_preview import particle_preview


class ParticlePreviewTests(unittest.TestCase):
    @unittest.skipIf(Usd.GetVersion() >= (0, 26, 11), 'Native particle renderer needs no preview overlay')
    def test_covariance_shape_keeps_transform_color_and_hidden_particles(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            stage = Usd.Stage.CreateNew(str(root / 'source.usda'))
            world = UsdGeom.Xform.Define(stage, '/World')
            world.AddTranslateOp().Set(Gf.Vec3d(10, 0, 0))
            prim = stage.DefinePrim('/World/Field', 'ParticleField3DGaussianSplat')
            from pxr import Sdf
            for name, type_name, value in [
                ('positions', Sdf.ValueTypeNames.Point3fArray, [(1, 0, 0), (100, 0, 0)]),
                ('scales', Sdf.ValueTypeNames.Float3Array, [(2, 1, .5)] * 2),
                ('orientations', Sdf.ValueTypeNames.QuatfArray, [Gf.Quatf(1)] * 2),
                ('opacities', Sdf.ValueTypeNames.FloatArray, [1, 0]),
                ('radiance:sphericalHarmonicsCoefficients', Sdf.ValueTypeNames.Float3Array, [(1, 0, -1)] * 2),
            ]:
                prim.CreateAttribute(name, type_name).Set(value)
            stage.GetRootLayer().Save()
            source = stage.GetRootLayer().ExportToString()
            preview, records = particle_preview(stage, root / 'preview.usda')
            self.assertEqual(stage.GetRootLayer().ExportToString(), source)
            self.assertEqual(records[0]['count'], 2)
            sphere = UsdGeom.Sphere.Get(preview, '/World/Field/Gaussian0')
            self.assertTrue(sphere)
            self.assertFalse(preview.GetPrimAtPath('/World/Field/Gaussian1'))
            rgb = sphere.GetDisplayColorAttr().Get()[0]
            self.assertAlmostEqual(rgb[0], .78209479, places=6)
            self.assertAlmostEqual(rgb[2], .21790521, places=6)
            bounds = UsdGeom.BBoxCache(Usd.TimeCode.Default(), ['default']).ComputeWorldBound(sphere.GetPrim()).ComputeAlignedRange()
            self.assertEqual(tuple(bounds.GetMin()), (7, -2, -1))
            self.assertEqual(tuple(bounds.GetMax()), (15, 2, 1))


if __name__ == '__main__':
    unittest.main()
