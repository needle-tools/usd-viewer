"""Check both texture seams of the authored lighting/MDL torus meshes."""
from pathlib import Path
import unittest
from pxr import Usd, UsdGeom

FIXTURES = Path(__file__).resolve().parents[1] / 'fixtures/coverage/lighting-mdl'


class TorusUVTests(unittest.TestCase):
    def test_closing_faces_do_not_interpolate_across_the_texture(self):
        checked = 0
        for file in sorted(FIXTURES.glob('*.usda')):
            stage = Usd.Stage.Open(str(file))
            for prim in stage.Traverse():
                if not prim.IsA(UsdGeom.Mesh):
                    continue
                mesh = UsdGeom.Mesh(prim)
                if len(mesh.GetPointsAttr().Get()) != 96 * 32 or len(mesh.GetFaceVertexCountsAttr().Get()) != 96 * 32:
                    continue
                with self.subTest(file=file.name, prim=str(prim.GetPath())):
                    uv = UsdGeom.PrimvarsAPI(mesh).GetPrimvar('st')
                    self.assertEqual(uv.GetInterpolation(), 'faceVarying')
                    values = uv.ComputeFlattened()
                    self.assertEqual(len(values), len(mesh.GetFaceVertexIndicesAttr().Get()))
                    for offset in range(0, len(values), 4):
                        face = values[offset:offset+4]
                        self.assertAlmostEqual(max(p[0] for p in face) - min(p[0] for p in face), 1/96, places=6)
                        self.assertAlmostEqual(max(p[1] for p in face) - min(p[1] for p in face), 1/32, places=6)
                    self.assertAlmostEqual(max(p[0] for p in values), 1)
                    self.assertAlmostEqual(max(p[1] for p in values), 1)
                    # Keep shared geometric vertices and smooth analytic normals.
                    self.assertEqual(mesh.GetNormalsInterpolation(), 'vertex')
                    self.assertEqual(len(mesh.GetNormalsAttr().Get()), 96 * 32)
                checked += 1
        self.assertGreater(checked, 10)


if __name__ == '__main__':
    unittest.main()
