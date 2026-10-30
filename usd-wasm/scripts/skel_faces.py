"""Rounded, expressive face rigs for the blend-shape coverage fixtures.

Every facial feature is a patch laid on the head ellipsoid in (x, y) face
coordinates plus a height above the skin. Expression targets re-evaluate the
same topology with different parameters, so offsets stay local to the moving
features and never cut into the head. Patch rims sink slightly under the skin
to hide seams. All head geometry follows one rigid head joint.
"""
import math
from pxr import Gf, UsdGeom, UsdSkel

MODES = ('blend', 'sparse', 'inbetween')
FRAMES = range(1, 98)            # four seconds at 24 fps; frame 97 repeats frame 1
NECK_Y, HEAD_Y, SINK = .8, 1.32, -.01
EYE_PEAK, LID_LIFT = .012, .03
FIXED_GROUPS = {'body', 'head', 'hair', 'ears', 'nose', 'freckles'}

DESIGNS = {
    'blend': dict(radii=(.6, .57, .56), skin=(.95, .66, .52), hair=(.42, .16, .08), brow_color=(.3, .12, .07),
                  iris=(.4, .24, .1), lips=(.8, .3, .32), blush=(.97, .45, .47), shirt=(.12, .55, .6),
                  eye=(.19, -.02, .085, .1), brow=(.16, .085, .02, .022), mouth=(-.28, .13, .026), curve=.012,
                  nose=(-.12, .05, .055, .05), cheek=(.27, -.15), hairstyle=(.6, -.4, .08, 5, .09)),
    'sparse': dict(radii=(.56, .63, .55), skin=(.58, .36, .24), hair=(.07, .06, .09), brow_color=(.05, .04, .05),
                   iris=(.18, .42, .25), lips=(.48, .19, .2), blush=(.78, .32, .3), shirt=(.95, .7, .18),
                   eye=(.2, -.01, .08, .095), brow=(.17, .095, .03, .012), mouth=(-.31, .14, .03), curve=.008,
                   nose=(-.13, .055, .06, .06), cheek=(.27, -.16), hairstyle=(.64, -.25, .15, 0, 0)),
    'inbetween': dict(radii=(.63, .56, .57), skin=(.98, .8, .68), hair=(.93, .72, .32), brow_color=(.68, .45, .2),
                      iris=(.22, .48, .85), lips=(.86, .4, .42), blush=(.98, .55, .55), shirt=(.88, .36, .34),
                      eye=(.2, -.03, .09, .1), brow=(.15, .09, .018, .028), mouth=(-.27, .12, .024), curve=.015,
                      nose=(-.13, .045, .05, .045), cheek=(.29, -.12), hairstyle=(.55, -.5, .07, 9, .05),
                      freckles=((.11, -.16), (.145, -.13), (.18, -.17))),
}

# Expression deltas; pairs are (viewer-left, viewer-right) feature values.
NEUTRAL = dict(lid=(.55, .55), lid_curve=(-.1, -.1), eye=(1, 1), brow=(0, 0), tilt=(0, 0), arch=(0, 0),
               cheek=(0, 0), puff=(0, 0), width=0, open=0, curve=0, corner=(0, 0))
SMILE = dict(lid=(-.12, -.12), brow=(.012, .012), cheek=(.03, .03), puff=(.012, .012), width=.035, open=.055, curve=.075)
HALF_SMILE = dict(lid=(-.06, -.06), cheek=(.016, .016), puff=(.006, .006), width=.025, curve=.05)
WINK = dict(lid=(0, -1.57), lid_curve=(0, .4), brow=(.018, -.02), tilt=(0, -.012), cheek=(0, .03), puff=(0, .01),
            corner=(0, .03), curve=.01)
SURPRISE = dict(lid=(.35, .35), lid_curve=(.05, .05), eye=(.15, .15), brow=(.05, .05), arch=(.015, .015),
                cheek=(-.01, -.01), width=-.075, open=.075, curve=-.012)
# Gallery frames inside expression holds: grin, surprise, closed half smile.
THUMBNAIL_FRAMES = {'advanced-blendshape': 27, 'advanced-blendshape-sparse': 20, 'advanced-blendshape-inbetween': 23}
SHAPES = {'smile': ('/World/Rig/Smile', SMILE), 'wink': ('/World/Rig/Wink', WINK),
          'surprise': ('/World/Rig/Surprise', SURPRISE)}
# Eased (frame, weight) keys; equal neighbours are holds and every track ends where it starts.
TIMELINES = {
    'blend': dict(smile=[(1, 0), (8, 0), (20, 1), (34, 1), (42, 0)], wink=[(42, 0), (48, 1), (56, 1), (62, 0)],
                  surprise=[(64, 0), (72, 1), (84, 1), (92, 0)]),
    'sparse': dict(surprise=[(1, 0), (6, 0), (14, 1), (26, 1), (34, 0)], smile=[(36, 0), (46, 1), (60, 1), (68, 0)],
                   wink=[(70, 0), (76, 1), (84, 1), (90, 0)]),
    'inbetween': dict(smile=[(1, 0), (8, 0), (16, .5), (30, .5), (40, 1), (54, 1), (64, .5), (72, .5), (80, 0)],
                      wink=[(82, 0), (86, 1), (90, 1), (94, 0)]),
}


def mix(a, b, t): return tuple(x + (y - x) * t for x, y in zip(a, b))
def shade(c, k): return tuple(min(1, v * k) for v in c)


def pose(delta):
    out = {}
    for key, base in NEUTRAL.items():
        d = delta.get(key, 0 if not isinstance(base, tuple) else (0, 0))
        out[key] = tuple(b + x for b, x in zip(base, d)) if isinstance(base, tuple) else base + d
    return out


class Mesh:
    def __init__(self): self.points, self.colors, self.joints, self.counts, self.indices, self.groups = [], [], [], [], [], {}

    def normals(self):
        # Area-weighted normals keep rounded parts smooth without subdivision.
        values = [Gf.Vec3f(0) for _ in self.points]
        start = 0
        for count in self.counts:
            face = self.indices[start:start + count]; start += count
            normal = Gf.Vec3f(0)
            for a, b in zip(face, face[1:] + face[:1]):
                normal += Gf.Cross(self.points[a], self.points[b])
            for index in face: values[index] += normal
        return [n.GetNormalized() if n.GetLength() > 1e-9 else Gf.Vec3f(0, 0, 1) for n in values]

    def grid(self, rows, group, joint=1, wrap=False):
        """Rows run bottom to top, columns left to right; a one-point row is a pole."""
        ids = []
        for row in rows:
            ids.append(list(range(len(self.points), len(self.points) + len(row))))
            for point, color in row: self.points.append(point); self.colors.append(Gf.Vec3f(*color))
        self.groups.setdefault(group, []).extend(i for r in ids for i in r)
        self.joints.extend([joint] * sum(map(len, ids)))
        for lo, hi in zip(ids, ids[1:]):
            n = max(len(lo), len(hi))
            for i in range(n if wrap else n - 1):
                k = (i + 1) % n
                face = [lo[0], hi[k], hi[i]] if len(lo) == 1 else [lo[i], lo[k], hi[0]] if len(hi) == 1 else [lo[i], lo[k], hi[k], hi[i]]
                self.counts.append(len(face)); self.indices.extend(face)


def place(d, x, y, h):
    """Point on the head ellipsoid at face coordinates (x, y), lifted h along its normal."""
    rx, ry, rz = d['radii']; a, b = x / rx, y / ry
    p = (rx * math.cos(b) * math.sin(a), ry * math.sin(b), rz * math.cos(b) * math.cos(a))
    n = (p[0] / rx ** 2, p[1] / ry ** 2, p[2] / rz ** 2); k = h / math.sqrt(sum(v * v for v in n))
    return Gf.Vec3f(p[0] + n[0] * k, HEAD_Y + p[1] + n[1] * k, p[2] + n[2] * k)


def ellipsoid(m, center, radii, color, group, joint=0, rows=12, cols=24):
    (cx, cy, cz), (rx, ry, rz) = center, radii
    def at(b, a): return (Gf.Vec3f(cx + rx * math.cos(b) * math.sin(a), cy + ry * math.sin(b), cz + rz * math.cos(b) * math.cos(a)), color)
    rings = [[at(-math.pi / 2 + math.pi * j / rows, -math.pi + math.tau * i / cols) for i in range(cols)] for j in range(1, rows)]
    m.grid([[at(-math.pi / 2, 0)]] + rings + [[at(math.pi / 2, 0)]], group, joint, wrap=True)


def dome(m, d, group, center, radii, peak, color, rings=(1, .75, .5, .25), segs=16):
    """Rounded cap on the head; rings run outside-in so faces point outward."""
    (cx, cy), (rx, ry) = center, radii
    angles = [math.tau * k / segs for k in range(segs)]
    rows = [[(place(d, cx + rx * r * math.cos(a), cy + ry * r * math.sin(a), SINK + (peak - SINK) * math.sqrt(1 - r * r)), color(r))
             for a in angles] for r in rings]
    m.grid(rows + [[(place(d, cx, cy, peak), color(0))]], group, wrap=True)


def eye_height(u, v): return SINK + (EYE_PEAK - SINK) * math.sqrt(max(0, 1 - u * u - v * v))


def eye(m, d, side, p):
    """Eyeball dome with painted iris, a glint and an upper lid that rides above it."""
    i = (side + 1) // 2; ex, ey, rx, ry = d['eye']; k = p['eye'][i]; cx, rx, ry = side * ex, rx * k, ry * k
    iris, white, pupil = d['iris'], (.97, .96, .94), (.04, .03, .04)
    def ball(r): return white if r >= .5 else shade(iris, .55) if r >= .44 else iris if r >= .35 else mix(iris, (1, 1, 1), .25) if r >= .23 else pupil
    dome(m, d, 'eyes', (cx, ey), (rx, ry), EYE_PEAK, ball, rings=(1, .85, .66, .52, .46, .4, .3, .24, .18, .09), segs=24)
    gu, gv = -.28, .3
    dome(m, d, 'eyes', (cx + gu * rx, ey + gv * ry), (.14 * rx, .14 * rx), eye_height(gu, gv) + .005, lambda r: (1, 1, 1), rings=(1, .5), segs=8)
    # Lid rows run from the lash line up over the eye top into a sunk crease row.
    edge, curve = p['lid'][i], p['lid_curve'][i]
    def span(v): return 1.12 * math.sqrt(max(.08, 1 - (v / 1.12) ** 2))
    cols = [-1.2] + [c / 4 - 1 for c in range(9)] + [1.2]
    rows = []
    for j in range(8):
        row = []
        for s in cols:
            v0 = edge + curve * min(s * s, 1); v = 1.15 if j == 7 else v0 + (1 - v0) * j / 6; u = s * span(v)
            h = SINK if j == 7 or abs(s) > 1 else max(eye_height(u, v), 0) + LID_LIFT
            row.append((place(d, cx + rx * u, ey + ry * v, h), (.12, .08, .08) if j == 0 else shade(d['skin'], .9)))
        rows.append(row)
    m.grid(rows, 'lids')


def brow(m, d, side, p):
    i = (side + 1) // 2; by, half, thick, arch = d['brow']; bx = side * d['eye'][0]
    rows = []
    for t in (-1, -.6, 0, .6, 1):
        row = []
        for c in range(11):
            s = c / 5 - 1
            y = by + p['brow'][i] + (arch + p['arch'][i]) * (1 - s * s) + p['tilt'][i] * s * side + t * thick * (1 - .4 * s * s)
            row.append((place(d, bx + half * s, y, SINK + .034 * math.sqrt(max(0, (1 - t * t) * (1 - s ** 6)))), d['brow_color']))
        rows.append(row)
    m.grid(rows, 'brows')


def mouth(m, d, p):
    """Lips around a dark interior; open, width, curve and corners shape every expression."""
    my, w0, lip = d['mouth']; w = w0 + p['width']; dark = (.2, .05, .07)
    rows = []
    for t in (-1, -.82, -.6, -.42, -.3, -.15, 0, .15, .3, .42, .6, .82, 1):
        a = abs(t)
        color = dark if a < .1 or t == -.15 else (.96, .94, .9) if t == .15 else mix(dark, d['lips'], .5) if a == .3 else d['lips']
        row = []
        for c in range(17):
            s = c / 8 - 1; q = 1 - s * s
            o = p['open'] * q ** .6 + .006; thick = lip * (.45 + .55 * math.sqrt(q))
            y = my + (d['curve'] + p['curve'] + p['corner'][s > 0]) * s * s
            if a <= .3: y += math.copysign(o * a / .3, t); h = .003
            else:
                u = (a - .3) / .7; y += math.copysign(o + thick * u, t); h = .003 + (SINK - .003) * u + .03 * math.sin(math.pi * u)
            row.append((place(d, w * s, y, SINK + (h - SINK) * (1 - s ** 8)), color))
        rows.append(row)
    m.grid(rows, 'mouth')


def hair(m, d):
    front, back, thick, bangs, amp = d['hairstyle']; rx, ry = d['radii'][:2]
    cols = [-math.pi + math.tau * i / 40 for i in range(40)]
    def line(a):
        f = (1 + math.cos(a)) / 2
        return back + (front - back) * math.sqrt(f) - amp * f ** 3 * abs(math.sin(bangs * a / 2))
    rows = []
    for frac in (0, .05, .3, .55, .8):
        h = SINK if frac == 0 else thick * (.85 + .3 * frac)
        rows.append([(place(d, a * rx, (line(a) + (math.pi / 2 - line(a)) * frac) * ry, h), mix(d['hair'], shade(d['hair'], 1.35), frac)) for a in cols])
    m.grid(rows + [[(place(d, 0, ry * math.pi / 2, thick * 1.15), shade(d['hair'], 1.4))]], 'hair', wrap=True)


def face_mesh(d, p):
    m, skin, rx, ry = Mesh(), d['skin'], *d['radii'][:2]
    ellipsoid(m, (0, .36, 0), (.5, .4, .34), d['shirt'], 'body')
    ellipsoid(m, (0, NECK_Y, 0), (.15, .18, .14), shade(skin, .86), 'body')
    rings = [[(place(d, (-math.pi + math.tau * i / 32) * rx, (-math.pi / 2 + math.pi * j / 18) * ry, 0), skin) for i in range(32)] for j in range(1, 18)]
    m.grid([[(place(d, 0, -ry * math.pi / 2, 0), skin)]] + rings + [[(place(d, 0, ry * math.pi / 2, 0), skin)]], 'head', wrap=True)
    hair(m, d)
    ny, nrx, nry, npeak = d['nose']
    dome(m, d, 'nose', (0, ny), (nrx, nry), npeak, lambda r: mix(shade(skin, .97), d['blush'], .18 * (1 - r)), rings=(1, .8, .55, .3))
    for x, y in d.get('freckles', ()):
        for side in (-1, 1): dome(m, d, 'freckles', (side * x, y), (.012, .012), .004, lambda r: shade(skin, .72), rings=(1, .5), segs=8)
    for side in (-1, 1):
        i = (side + 1) // 2; cx, cy = d['cheek']
        dome(m, d, 'ears', (side * rx * 1.45, -.05), (.1, .14), .05, lambda r: mix(shade(skin, .9), d['blush'], .3 * (1 - r)), rings=(1, .7, .4))
        dome(m, d, 'cheeks', (side * cx, cy + p['cheek'][i]), (.085, .06), .008 + p['puff'][i], lambda r: mix(skin, d['blush'], .85 * (1 - r * r)), rings=(1, .7, .4))
        eye(m, d, side, p); brow(m, d, side, p)
    mouth(m, d, p)
    return m


def track(keys, frame):
    for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
        if f0 <= frame <= f1:
            t = (frame - f0) / (f1 - f0); return v0 + (v1 - v0) * t * t * (3 - 2 * t)
    return keys[0][1] if frame < keys[0][0] else keys[-1][1]


def head_rotation(frame, w):
    u = (frame - 1) % 96 / 96   # frame 97 evaluates exactly like frame 1
    yaw = 4 * math.sin(math.tau * u)
    nod = 1.5 * math.sin(2 * math.tau * u) + 2.5 * w.get('smile', 0) - 5 * w.get('surprise', 0)
    r = Gf.Rotation(Gf.Vec3d(0, 1, 0), yaw) * Gf.Rotation(Gf.Vec3d(1, 0, 0), nod) * Gf.Rotation(Gf.Vec3d(0, 0, 1), -6 * w.get('wink', 0))
    q = r.GetQuat(); return Gf.Quatf(q.GetReal(), Gf.Vec3f(q.GetImaginary()))


def offsets(base, target):
    assert len(base) == len(target)
    out = [b - a for a, b in zip(base, target)]
    assert all(math.isfinite(v) for o in out for v in o)
    return out


def build(stage, mode):
    """Author /World/Rig with Surface, Skeleton, Animation and expression targets; return data checks."""
    d = DESIGNS[mode]; stage.SetEndTimeCode(FRAMES[-1])
    face = face_mesh(d, pose({})); points = face.points; n = len(points)
    assert all(math.isfinite(v) for pt in points for v in pt)
    root = UsdSkel.Root.Define(stage, '/World/Rig'); skel = UsdSkel.Skeleton.Define(stage, '/World/Rig/Skeleton')
    joints = ['root', 'root/head']; neck = Gf.Matrix4d(1).SetTranslate(Gf.Vec3d(0, NECK_Y, 0))
    skel.CreateJointsAttr(joints); skel.CreateRestTransformsAttr([Gf.Matrix4d(1), neck]); skel.CreateBindTransformsAttr([Gf.Matrix4d(1), neck])
    mesh = UsdGeom.Mesh.Define(stage, '/World/Rig/Surface')
    mesh.CreatePointsAttr(points); mesh.CreateFaceVertexCountsAttr(face.counts); mesh.CreateFaceVertexIndicesAttr(face.indices)
    mesh.CreateSubdivisionSchemeAttr('none'); mesh.CreateDoubleSidedAttr(True)
    normals = face.normals(); mesh.CreateNormalsAttr(normals); mesh.SetNormalsInterpolation('vertex')
    mesh.CreateDisplayColorAttr(face.colors); mesh.GetDisplayColorPrimvar().SetInterpolation('vertex')
    binding = UsdSkel.BindingAPI.Apply(mesh.GetPrim()); binding.CreateSkeletonRel().SetTargets([skel.GetPath()])
    binding.CreateGeomBindTransformAttr(Gf.Matrix4d(1))
    binding.CreateJointIndicesPrimvar(False, 1).Set(face.joints); binding.CreateJointWeightsPrimvar(False, 1).Set([1.0] * n)
    fixed = {i for g in FIXED_GROUPS for i in face.groups.get(g, ())}
    names = list(TIMELINES[mode])
    for name in names:
        path, delta = SHAPES[name]
        target = face_mesh(d, pose(delta)); assert target.counts == face.counts and target.indices == face.indices
        offs = offsets(points, target.points); normal_offs = offsets(normals, target.normals())
        shape = UsdSkel.BlendShape.Define(stage, path)
        if mode == 'sparse':
            moved = [i for i, o in enumerate(offs) if o.GetLength() > 0 or normal_offs[i].GetLength() > 1e-8]
            assert moved and not fixed.intersection(moved), name
            shape.CreateOffsetsAttr([offs[i] for i in moved]); shape.CreatePointIndicesAttr(moved)
            shape.CreateNormalOffsetsAttr([normal_offs[i] for i in moved])
        else:
            shape.CreateOffsetsAttr(offs); shape.CreateNormalOffsetsAttr(normal_offs)
        if mode == 'inbetween' and name == 'smile':
            half = shape.CreateInbetween('half'); half.SetWeight(.5)
            half_mesh = face_mesh(d, pose(HALF_SMILE))
            half.SetOffsets(offsets(points, half_mesh.points))
            half.SetNormalOffsets(offsets(normals, half_mesh.normals()))
    binding.CreateBlendShapesAttr(names); binding.CreateBlendShapeTargetsRel().SetTargets([SHAPES[x][0] for x in names])
    anim = UsdSkel.Animation.Define(stage, '/World/Rig/Animation'); anim.CreateJointsAttr(joints)
    anim.CreateTranslationsAttr([Gf.Vec3f(0, 0, 0), Gf.Vec3f(0, NECK_Y, 0)]); anim.CreateScalesAttr([Gf.Vec3h(1), Gf.Vec3h(1)])
    anim.CreateBlendShapesAttr(names); rotations = anim.CreateRotationsAttr(); weights = anim.CreateBlendShapeWeightsAttr()
    for frame in FRAMES:
        w = {x: track(TIMELINES[mode][x], frame) for x in names}
        rotations.Set([Gf.Quatf(1), head_rotation(frame, w)], frame); weights.Set([w[x] for x in names], frame)
    UsdSkel.BindingAPI.Apply(root.GetPrim()).CreateAnimationSourceRel().SetTargets([anim.GetPath()])
    base = UsdGeom.Cylinder.Define(stage, '/World/Base'); base.CreateAxisAttr('Y'); base.CreateRadiusAttr(1.05); base.CreateHeightAttr(.12)
    base.AddTranslateOp().Set(Gf.Vec3d(0, -.06, 0)); base.CreateDisplayColorAttr([Gf.Vec3f(.74, .73, .71)])
    camera = UsdGeom.Camera.Define(stage, '/World/Camera'); camera.CreateFocalLengthAttr(42); camera.CreateHorizontalApertureAttr(36); camera.CreateVerticalApertureAttr(27)
    camera.AddTransformOp().Set(Gf.Matrix4d().SetLookAt(Gf.Vec3d(.85, 1.4, 3.6), Gf.Vec3d(0, 1.05, 0), Gf.Vec3d(0, 1, 0)).GetInverse())
    return checks(mode, joints, names, n)


def checks(mode, joints, names, n):
    def prim(st, path): return st.GetPrimAtPath(path)
    def shapes(st): return [UsdSkel.BlendShape(prim(st, SHAPES[x][0])) for x in names]
    def looped(st):
        anim = prim(st, '/World/Rig/Animation')
        return all(attr.GetTimeSamples() == [float(f) for f in FRAMES] and attr.Get(FRAMES[0]) == attr.Get(FRAMES[-1])
                   for attr in (anim.GetAttribute('rotations'), anim.GetAttribute('blendShapeWeights')))
    def weights(st):
        b = UsdSkel.BindingAPI(prim(st, '/World/Rig/Surface')); w = b.GetJointWeightsPrimvar()
        return w.GetElementSize() == 1 and len(w.Get()) == n and all(v == 1 for v in w.Get()) and set(b.GetJointIndicesPrimvar().Get()) == {0, 1}
    out = [('Two joint hierarchy', lambda st: list(UsdSkel.Skeleton(prim(st, '/World/Rig/Skeleton')).GetJointsAttr().Get()) == joints),
           ('Skin binds to skeleton', lambda st: bool(UsdSkel.BindingAPI(prim(st, '/World/Rig/Surface')).GetSkeletonRel().GetTargets())),
           ('Expression targets are bound', lambda st: len(UsdSkel.BindingAPI(prim(st, '/World/Rig/Surface')).GetBlendShapeTargetsRel().GetTargets()) == len(names)),
           ('Single rigid influence weights are normalized', weights),
           ('Frames 1-97 sampled with matching loop endpoints', looped)]
    if mode == 'sparse':
        def sparse(st):
            return all(0 < len(s.GetPointIndicesAttr().Get()) == len(s.GetOffsetsAttr().Get()) < n / 2 for s in shapes(st))
        out.append(('Sparse targets index only moving facial features', sparse))
    else:
        out.append(('Dense targets cover every point', lambda st: all(len(s.GetOffsetsAttr().Get()) == n for s in shapes(st))))
    if mode == 'inbetween':
        def distinct(st):
            shape = UsdSkel.BlendShape(prim(st, '/World/Rig/Smile')); half = shape.GetInbetween('half')
            full, mid = shape.GetOffsetsAttr().Get(), half.GetOffsets()
            return half.GetWeight() == .5 and max((m - .5 * f).GetLength() for f, m in zip(full, mid)) > .01
        out.append(('Half-smile inbetween is a distinct pose at weight 0.5', distinct))
    return out
