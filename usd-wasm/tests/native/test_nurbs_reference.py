"""Run with the local native OpenUSD Python environment."""
import math
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from nurbs_reference import basis, surface


class RationalReferenceTests(unittest.TestCase):
    def test_cubic_surface(self):
        points = [(u-1.5, .375 if 0<u<3 and 0<v<3 else 0, v-1.5) for v in range(4) for u in range(4)]
        knots = [0,0,0,0,1,1,1,1]
        point, normal = surface(points, [], 4, basis(knots,4,4,.5), basis(knots,4,4,.5))
        self.assertAlmostEqual(point[1], .2109375)
        self.assertEqual(tuple(normal), (0,-1,0))

    def test_rational_quarter_cylinder(self):
        points = [(x,y,z) for z in [0,2] for x,y in [(1,0),(1,1),(0,1)]]
        weights = [1,math.sqrt(.5),1]*2
        for u in [0,.1,.25,.5,.75,.9,1]:
            point, normal = surface(points, weights, 3, basis([0,0,0,1,1,1],3,3,u), basis([0,0,1,1],2,2,.25))
            self.assertAlmostEqual(point[0]**2+point[1]**2, 1)
            self.assertAlmostEqual(point[2], .5)
            for i in [0,1]: self.assertAlmostEqual(normal[i], point[i])
            self.assertAlmostEqual(normal[2], 0)

if __name__ == '__main__': unittest.main()
