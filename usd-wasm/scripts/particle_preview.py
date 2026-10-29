"""Native Storm card geometry for particle fields on USD versions before 26.11.

These are opaque 2-sigma covariance ellipsoids with the authored degree-zero
radiance, not reference renders of Gaussian density or directional harmonics.
The stronger capture layer leaves the executable example and its source intact.
"""
from pxr import Gf, Usd, UsdGeom


def particle_preview(stage, output):
    particles = [prim for prim in stage.Traverse()
                 if prim.GetTypeName() == 'ParticleField3DGaussianSplat']
    if not particles or Usd.GetVersion() >= (0, 26, 11):
        return stage, []
    preview = Usd.Stage.CreateNew(str(output))
    preview.GetRootLayer().subLayerPaths = [stage.GetRootLayer().identifier]
    records = []
    for prim in particles:
        def values(name):
            return prim.GetAttribute(name).Get() or []
        positions = values('positions')
        scales = values('scales')
        orientations = values('orientations')
        opacity = values('opacities')
        coefficients = values('radiance:sphericalHarmonicsCoefficients')
        stride = len(coefficients) // max(1, len(positions))
        # Preserve the field's inherited transforms and purpose, but replace
        # its unsupported schema only in this native capture overlay.
        preview.OverridePrim(prim.GetPath()).SetTypeName('Xform')
        for index, position in enumerate(positions):
            if opacity and opacity[index] <= 0:
                continue
            sphere = UsdGeom.Sphere.Define(preview, prim.GetPath().AppendChild(f'Gaussian{index}'))
            sphere.CreateRadiusAttr(2.0)
            sphere.AddTranslateOp().Set(Gf.Vec3d(position))
            if orientations:
                sphere.AddOrientOp(UsdGeom.XformOp.PrecisionFloat).Set(Gf.Quatf(orientations[index]))
            if scales:
                sphere.AddScaleOp().Set(Gf.Vec3f(scales[index]))
            rgb = [max(0, min(1, .5 + .28209479177387814 * value))
                   for value in coefficients[index * stride]] if stride else [.5, .5, .5]
            sphere.CreateDisplayColorAttr([Gf.Vec3f(*rgb)])
        records.append({'path': str(prim.GetPath()), 'count': len(positions),
                        'representation': 'opaque 2-sigma covariance ellipsoids; degree-zero radiance'})
    preview.GetRootLayer().Save()
    return preview, records
