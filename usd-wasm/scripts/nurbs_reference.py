"""Evaluate authored NURBS for native Storm reference captures.

Storm's legacy NURBS adapters render control cages. This stronger layer replaces
only their geometry with independently evaluated rational surfaces/linear curves;
materials, transforms and scene lighting continue to compose from the source.
"""
from pxr import Gf, Sdf, Usd, UsdGeom, Vt


def basis(knots, count, order, parameter):
    """Cox-de Boor values and analytic first derivatives (U-fast control order)."""
    degree = order - 1
    # Evaluate the right endpoint from its left-hand polynomial span.
    span = count - 1 if parameter >= knots[count] else next(
        i for i in range(degree, count) if knots[i] <= parameter < knots[i + 1])
    previous = [float(i == span) for i in range(len(knots) - 1)]
    lower = previous
    for p in range(1, degree + 1):
        lower = previous
        previous = [((parameter - knots[i]) / (knots[i+p] - knots[i]) * lower[i]
                     if knots[i+p] != knots[i] else 0) +
                    ((knots[i+p+1] - parameter) / (knots[i+p+1] - knots[i+1]) * lower[i+1]
                     if knots[i+p+1] != knots[i+1] else 0)
                    for i in range(len(knots) - p - 1)]
    derivatives = [(degree / (knots[i+degree] - knots[i]) * lower[i]
                    if knots[i+degree] != knots[i] else 0) -
                   (degree / (knots[i+degree+1] - knots[i+1]) * lower[i+1]
                    if knots[i+degree+1] != knots[i+1] else 0) for i in range(count)]
    return previous[:count], derivatives


def samples(knots, count, order, domain, subdivisions):
    lo, hi = domain or (knots[order-1], knots[count])
    breaks = sorted(set([lo, hi] + [k for k in knots if lo < k < hi]))
    return [a + (b-a)*step/subdivisions for a,b in zip(breaks,breaks[1:])
            for step in range(subdivisions)] + [hi]


def surface(points, weights, u_count, u_basis, v_basis):
    ub, du = u_basis; vb, dv = v_basis
    value, tangent_u, tangent_v = Gf.Vec3d(0), Gf.Vec3d(0), Gf.Vec3d(0)
    total = total_u = total_v = 0.0
    for j in range(len(vb)):
        for i in range(len(ub)):
            index = j*u_count+i
            w = weights[index] if weights else 1.0
            b, bu, bv = ub[i]*vb[j]*w, du[i]*vb[j]*w, ub[i]*dv[j]*w
            value += Gf.Vec3d(points[index])*b
            tangent_u += Gf.Vec3d(points[index])*bu
            tangent_v += Gf.Vec3d(points[index])*bv
            total += b; total_u += bu; total_v += bv
    value /= total
    tangent_u = (tangent_u-value*total_u)/total
    tangent_v = (tangent_v-value*total_v)/total
    return value, Gf.Cross(tangent_u, tangent_v).GetNormalized()


def evaluated_reference(stage, output, subdivisions=32):
    prims = [p for p in stage.Traverse() if p.IsA(UsdGeom.NurbsPatch) or p.IsA(UsdGeom.NurbsCurves)]
    if not prims:
        return stage, []
    proxy = Usd.Stage.CreateNew(str(output))
    proxy.GetRootLayer().subLayerPaths = [stage.GetRootLayer().realPath]
    UsdGeom.SetStageUpAxis(proxy, UsdGeom.GetStageUpAxis(stage))
    UsdGeom.SetStageMetersPerUnit(proxy, UsdGeom.GetStageMetersPerUnit(stage))
    records = []
    for prim in prims:
        if prim.IsA(UsdGeom.NurbsPatch):
            patch = UsdGeom.NurbsPatch(prim)
            if patch.GetTrimCurveCountsAttr().Get():
                raise ValueError(f'Trimmed NURBS reference tessellation is unsupported: {prim.GetPath()}')
            points, weights = patch.GetPointsAttr().Get(), patch.GetPointWeightsAttr().Get()
            uc, vc = patch.GetUVertexCountAttr().Get(), patch.GetVVertexCountAttr().Get()
            uo, vo = patch.GetUOrderAttr().Get(), patch.GetVOrderAttr().Get()
            uk, vk = patch.GetUKnotsAttr().Get(), patch.GetVKnotsAttr().Get()
            us = samples(uk, uc, uo, patch.GetURangeAttr().Get(), subdivisions)
            vs = samples(vk, vc, vo, patch.GetVRangeAttr().Get(), subdivisions)
            values = [surface(points, weights, uc, basis(uk,uc,uo,u), basis(vk,vc,vo,v)) for v in vs for u in us]
            mesh = UsdGeom.Mesh.Define(proxy, prim.GetPath())
            mesh.CreatePointsAttr([Gf.Vec3f(p) for p,n in values])
            # USD orientation reverses winding semantics itself; retain original
            # winding and flip authored normals for a left-handed surface.
            sign = -1 if patch.GetOrientationAttr().Get() == 'leftHanded' else 1
            mesh.CreateNormalsAttr([Gf.Vec3f(n*sign) for p,n in values]); mesh.SetNormalsInterpolation('vertex')
            indices = []
            for v in range(len(vs)-1):
                for u in range(len(us)-1):
                    a = v*len(us)+u; b=a+1; c=b+len(us); d=a+len(us)
                    indices.extend([a,b,c,a,c,d])
            mesh.CreateFaceVertexCountsAttr([3]*(len(indices)//3)); mesh.CreateFaceVertexIndicesAttr(indices)
            mesh.CreateSubdivisionSchemeAttr('none')
            records.append({'path':str(prim.GetPath()),'sourceType':'NurbsPatch','vertices':len(values),'triangles':len(indices)//3})
        else:
            curve = UsdGeom.NurbsCurves(prim)
            points, weights = curve.GetPointsAttr().Get(), curve.GetPointWeightsAttr().Get()
            counts, orders, knots, ranges = curve.GetCurveVertexCountsAttr().Get(), curve.GetOrderAttr().Get(), curve.GetKnotsAttr().Get(), curve.GetRangesAttr().Get()
            evaluated, new_counts, offset, knot_offset = [], [], 0, 0
            for index, count in enumerate(counts):
                order = orders[index]; curve_knots = knots[knot_offset:knot_offset+count+order]
                ts = samples(curve_knots,count,order,ranges[index] if ranges else None,subdivisions)
                for t in ts:
                    coefficients = basis(curve_knots,count,order,t)[0]
                    weighted = [b*(weights[offset+i] if weights else 1) for i,b in enumerate(coefficients)]
                    evaluated.append(Gf.Vec3f(sum((Gf.Vec3d(points[offset+i])*b for i,b in enumerate(weighted)),Gf.Vec3d(0))/sum(weighted)))
                new_counts.append(len(ts)); offset+=count; knot_offset+=count+order
            result = UsdGeom.BasisCurves.Define(proxy,prim.GetPath())
            result.CreatePointsAttr(evaluated); result.CreateCurveVertexCountsAttr(new_counts)
            result.CreateTypeAttr('linear'); result.CreateWrapAttr('nonperiodic')
            records.append({'path':str(prim.GetPath()),'sourceType':'NurbsCurves','vertices':len(evaluated),'curves':len(new_counts)})
    proxy.GetRootLayer().Save()
    return proxy, records
