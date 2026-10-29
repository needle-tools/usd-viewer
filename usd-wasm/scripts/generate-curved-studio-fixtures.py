#!/usr/bin/env python3
"""Author the curved-surface studio scenes: designed subdivision, spline and NURBS models.

Run with native OpenUSD Python:
  PYTHONPATH=/Users/herbst/OpenUSD-26.05-native/lib/python /usr/local/bin/python3 \
    usd-wasm/scripts/generate-curved-studio-fixtures.py

Deterministic and rerunnable. It writes only the `studio-*` stages, their UV texture and
the matching `curved-studio-*` manifest entries; other manifest entries are preserved in
order. Each stage is reopened and checked, and every NURBS prim is evaluated with
scripts/nurbs_reference.py into .cache/curved-studio/ (ignored) to prove the helper used
for native captures accepts it.
"""
import json, math, struct, sys, zlib
from pathlib import Path
from pxr import Gf, Sdf, Usd, UsdGeom, UsdShade

sys.path.insert(0, str(Path(__file__).resolve().parent))
from nurbs_reference import basis, evaluated_reference, surface  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests/fixtures/coverage/curved-surfaces'
CACHE = ROOT / '.cache/curved-studio'
TEXTURE = 'textures/studio-uv-grid.png'
TAU = math.tau
F, C3, F3 = Sdf.ValueTypeNames.Float, Sdf.ValueTypeNames.Color3f, Sdf.ValueTypeNames.Float3


def v3(p): return Gf.Vec3f(*(round(c, 5) + 0.0 for c in p))
def add(a, b): return tuple(x + y for x, y in zip(a, b))
def sub(a, b): return tuple(x - y for x, y in zip(a, b))
def mul(a, s): return tuple(x * s for x in a)
def dot(a, b): return sum(x * y for x, y in zip(a, b))
def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def norm(a): l = math.sqrt(dot(a, a)); return mul(a, 1 / l)
def lerp(a, b, t): return tuple(x + (y - x) * t for x, y in zip(a, b))
def rotate(v, axis, angle):  # Rodrigues rotation
    c, s = math.cos(angle), math.sin(angle)
    return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)))


# --- shared authoring helpers -------------------------------------------------------

def write_texture():
    """128px UV calibration grid: warm cells ramp along u, cool cells along v, so seams,
    flips and repeat wrapping are visible."""
    def pixel(x, y):
        u, v = x / 127, 1 - y / 127
        if x % 16 == 0 or y % 16 == 0: return (70, 58, 50)
        if (x // 16 + y // 16) % 2: return tuple(round(c) for c in lerp((178, 84, 52), (214, 150, 60), u))
        return tuple(round(c) for c in lerp((238, 226, 204), (198, 214, 196), v))
    raw = b''.join(b'\0' + bytes(c for x in range(128) for c in pixel(x, y)) for y in range(128))
    chunk = lambda tag, data: struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))
    data = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 128, 128, 8, 2, 0, 0, 0)) +
            chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    path = OUT / TEXTURE
    path.parent.mkdir(exist_ok=True)
    if not path.exists() or path.read_bytes() != data: path.write_bytes(data)


def look(stage, name, color, rough=.5, metal=0., coat=0., emissive=None, primvar=None, texture=None):
    """UsdPreviewSurface; `primvar` drives diffuse from displayColor, `texture` from st."""
    UsdGeom.Scope.Define(stage, '/World/Looks')
    mat = UsdShade.Material.Define(stage, f'/World/Looks/{name}')
    shader = UsdShade.Shader.Define(stage, mat.GetPath().AppendChild('Surface'))
    shader.CreateIdAttr('UsdPreviewSurface')
    diffuse = shader.CreateInput('diffuseColor', C3); diffuse.Set(Gf.Vec3f(color))
    shader.CreateInput('roughness', F).Set(rough)
    if metal: shader.CreateInput('metallic', F).Set(metal)
    if coat: shader.CreateInput('clearcoat', F).Set(coat); shader.CreateInput('clearcoatRoughness', F).Set(.06)
    if emissive: shader.CreateInput('emissiveColor', C3).Set(Gf.Vec3f(emissive))
    if primvar:
        reader = UsdShade.Shader.Define(stage, mat.GetPath().AppendChild('Color'))
        reader.CreateIdAttr('UsdPrimvarReader_float3')
        reader.CreateInput('varname', Sdf.ValueTypeNames.String).Set(primvar)
        reader.CreateInput('fallback', F3).Set(Gf.Vec3f(color))
        diffuse.ConnectToSource(reader.CreateOutput('result', F3))
    if texture:
        st = UsdShade.Shader.Define(stage, mat.GetPath().AppendChild('UV'))
        st.CreateIdAttr('UsdPrimvarReader_float2')
        st.CreateInput('varname', Sdf.ValueTypeNames.String).Set('st')
        tex = UsdShade.Shader.Define(stage, mat.GetPath().AppendChild('Texture'))
        tex.CreateIdAttr('UsdUVTexture')
        tex.CreateInput('file', Sdf.ValueTypeNames.Asset).Set(Sdf.AssetPath(texture))
        tex.CreateInput('st', Sdf.ValueTypeNames.Float2).ConnectToSource(st.CreateOutput('result', Sdf.ValueTypeNames.Float2))
        for wrap in ('wrapS', 'wrapT'): tex.CreateInput(wrap, Sdf.ValueTypeNames.Token).Set('repeat')
        tex.CreateInput('sourceColorSpace', Sdf.ValueTypeNames.Token).Set('sRGB')
        diffuse.ConnectToSource(tex.CreateOutput('rgb', F3))
    mat.CreateSurfaceOutput().ConnectToSource(shader.ConnectableAPI(), 'surface')
    return mat


def finish(gprim, mat, color):
    """Bind a material and keep a displayColor fallback for viewers without shading."""
    if not UsdGeom.PrimvarsAPI(gprim).HasPrimvar('displayColor'):
        gprim.CreateDisplayColorPrimvar(UsdGeom.Tokens.constant).Set([Gf.Vec3f(color)])
    UsdShade.MaterialBindingAPI.Apply(gprim.GetPrim()).Bind(mat)
    extent = UsdGeom.Boundable.ComputeExtentFromPlugins(UsdGeom.Boundable(gprim), Usd.TimeCode.Default())
    UsdGeom.Boundable(gprim).CreateExtentAttr(extent)


def subd(stage, path, points, counts, indices, scheme='catmullClark', boundary='edgeAndCorner',
         creases=(), corners=(), holes=(), fv_linear=None, triangles=None):
    """Mesh with subdivision tags. `creases` are (vertex chain, sharpness) so chains longer
    than one edge are authored as single creases."""
    m = UsdGeom.Mesh.Define(stage, path)
    m.CreatePointsAttr([v3(p) for p in points])
    m.CreateFaceVertexCountsAttr(counts); m.CreateFaceVertexIndicesAttr(indices)
    m.CreateSubdivisionSchemeAttr(scheme); m.CreateInterpolateBoundaryAttr(boundary)
    if fv_linear: m.CreateFaceVaryingLinearInterpolationAttr(fv_linear)
    if triangles: m.CreateTriangleSubdivisionRuleAttr(triangles)
    if creases:
        m.CreateCreaseIndicesAttr([v for chain, _ in creases for v in chain])
        m.CreateCreaseLengthsAttr([len(chain) for chain, _ in creases])
        m.CreateCreaseSharpnessesAttr([s for _, s in creases])
    if corners:
        m.CreateCornerIndicesAttr([i for i, _ in corners]); m.CreateCornerSharpnessesAttr([s for _, s in corners])
    if holes: m.CreateHoleIndicesAttr(sorted(holes))
    return m


def revolve(profile, segs, radial=lambda ring, seg: 1., bottom=True, top='ngon'):
    """Quad cage of revolution, outward-facing. Rings follow `profile` (r, y); `radial`
    scales individual cage vertices. Caps: n-gon, triangle fan to a pole, or open."""
    pts = [(r * radial(i, s) * math.cos(TAU * s / segs), y, r * radial(i, s) * math.sin(TAU * s / segs))
           for i, (r, y) in enumerate(profile) for s in range(segs)]
    vid = lambda ring, seg: ring * segs + seg % segs
    counts, indices, faces = [], [], {}
    if bottom: counts.append(segs); indices += [vid(0, s) for s in range(segs)]
    for ring in range(len(profile) - 1):
        for s in range(segs):
            faces[ring, s] = len(counts); counts.append(4)
            indices += [vid(ring, s), vid(ring + 1, s), vid(ring + 1, s + 1), vid(ring, s + 1)]
    last = len(profile) - 1
    if top == 'ngon':
        counts.append(segs); indices += [vid(last, s) for s in reversed(range(segs))]
    elif isinstance(top, tuple):  # ('fan', pole height)
        pts.append((0, top[1], 0))
        for s in range(segs): counts.append(3); indices += [vid(last, s + 1), vid(last, s), len(pts) - 1]
    return pts, counts, indices, faces, vid


def ring_chain(vid, ring, segs): return [vid(ring, s) for s in range(segs)] + [vid(ring, 0)]


def camera(stage, direction, margin=.86, focal=50.):
    """Perspective camera (4:3 aperture as the capture pipeline) looking along -direction,
    fitted so all authored control points (padded by curve widths) span `margin` of the
    frame. Native captures and viewers then share the intended view."""
    xforms, samples = UsdGeom.XformCache(), []
    for prim in stage.Traverse():
        world = xforms.GetLocalToWorldTransform(prim)
        if prim.IsA(UsdGeom.PointBased):
            widths = UsdGeom.Curves(prim).GetWidthsAttr().Get() if prim.IsA(UsdGeom.Curves) else None
            pad = max(widths) / 2 if widths else 0
            samples += [(tuple(world.Transform(Gf.Vec3d(p))), pad) for p in UsdGeom.PointBased(prim).GetPointsAttr().Get()]
        elif prim.IsA(UsdGeom.Boundable):
            lo, hi = UsdGeom.Boundable(prim).GetExtentAttr().Get()
            corners = [Gf.Vec3d(*[(hi if i >> a & 1 else lo)[a] for a in range(3)]) for i in range(8)]
            samples += [(tuple(world.Transform(c)), 0) for c in corners]
    back = norm(direction); right = norm(cross((0, 1, 0), back)); up = cross(back, right)
    centre = mul(tuple(map(sum, zip(*(p for p, _ in samples)))), 1 / len(samples))
    local = [(dot(sub(p, centre), right), dot(sub(p, centre), up), dot(sub(p, centre), back), pad) for p, pad in samples]
    tan_x, tan_y, ox, oy = 18 / focal * margin, 13.5 / focal * margin, 0., 0.
    for _ in range(6):  # alternate distance fitting and re-centring in the image plane
        distance = max(max(z + (abs(x - ox) + pad) / tan_x, z + (abs(y - oy) + pad) / tan_y) for x, y, z, pad in local)
        nx = [(x - ox) / (distance - z) for x, y, z, _ in local]; ny = [(y - oy) / (distance - z) for x, y, z, _ in local]
        ox += (min(nx) + max(nx)) / 2 * distance; oy += (min(ny) + max(ny)) / 2 * distance
    center = add(centre, add(mul(right, ox), mul(up, oy)))
    eye = add(center, mul(back, distance))
    cam = UsdGeom.Camera.Define(stage, '/World/Camera')
    cam.CreateFocalLengthAttr(focal); cam.CreateHorizontalApertureAttr(36); cam.CreateVerticalApertureAttr(27)
    cam.CreateClippingRangeAttr(Gf.Vec2f(round(distance * .02, 4), round(distance * 10, 3)))
    view = Gf.Matrix4d().SetLookAt(Gf.Vec3d(*eye), Gf.Vec3d(*center), Gf.Vec3d(0, 1, 0)).GetInverse()
    rounded = Gf.Matrix4d(*[[round(view[r][c], 6) + 0.0 for c in range(4)] for r in range(4)])
    UsdGeom.Xformable(cam).AddTransformOp().Set(rounded)


# --- subdivision --------------------------------------------------------------------

def pierced_lantern(stage):
    """Catmull-Clark holes (staggered windows reveal an emissive core), closed infinite and
    semi-sharp crease chains, a 16-gon base cap, and a triangle-fan spire using the
    smooth triangle rule with an infinitely sharp corner at its pole."""
    profile = [(.42, 0), (.62, .04), (.66, .16), (.52, .26), (.70, .45), (.86, .80), (.90, 1.15),
               (.86, 1.50), (.70, 1.80), (.56, 1.92), (.70, 2.02), (.68, 2.14), (.48, 2.40), (.22, 2.70)]
    segs = 16
    pts, counts, indices, faces, vid = revolve(profile, segs, top=('fan', 3.05))
    holes = [faces[4, s] for s in range(0, segs, 2)] + [faces[6, s] for s in range(1, segs, 2)]
    creases = [(ring_chain(vid, 2, segs), 10.), (ring_chain(vid, 3, segs), 4.),
               (ring_chain(vid, 9, segs), 10.), (ring_chain(vid, 10, segs), 2.5)]
    brass = look(stage, 'Brass', (.78, .55, .25), rough=.32, metal=.9)
    body = subd(stage, '/World/Lantern', pts, counts, indices, creases=creases,
                corners=[(len(pts) - 1, 10.)], holes=holes, triangles='smooth')
    body.CreateDoubleSidedAttr(True); finish(body, brass, (.78, .55, .25))
    core = UsdGeom.Sphere.Define(stage, '/World/Core'); core.CreateRadiusAttr(.46)
    core.AddTranslateOp().Set(Gf.Vec3d(0, 1.12, 0))
    finish(core, look(stage, 'Ember', (1, .62, .3), rough=.6, emissive=(2.4, 1.25, .42)), (1, .62, .3))
    camera(stage, (.9, .32, 1.3))
    return {'vertices': len(pts), 'faces': len(counts), 'holes': len(holes), 'creaseChains': 4,
            'ngonFaces': 1, 'triangleFaces': segs, 'cornerSharpness': 10.0}


def instrument_housing(stage):
    """Creased mechanical box: per-edge semi-sharp fillets and infinitely sharp base edges,
    inset panel rims, sharp top corners, and indexed face-varying displayColor (four panel
    colours) feeding the material through a primvar reader. Dial knobs use n-gon caps."""
    xs = [-1.2, -1.08, -.82, -.76, -.25, .25, .76, .82, 1.08, 1.2]
    ys = [0, .1, .42, .46, .66, .70, .9, 1.0]
    zs = [-.8, -.68, -.45, -.40, .40, .45, .68, .8]
    axes, lattice, pts, cell = (xs, ys, zs), {}, [], {}
    ends = [len(a) - 1 for a in axes]
    for i in range(len(xs)):
        for j in range(len(ys)):
            for k in range(len(zs)):
                if i in (0, ends[0]) or j in (0, ends[1]) or k in (0, ends[2]):
                    lattice[i, j, k] = len(pts); cell[len(pts)] = (i, j, k); pts.append([xs[i], ys[j], zs[k]])
    # Recess the top panel and the front display window by moving their inner cage rings.
    for (i, j, k), n in lattice.items():
        if j == ends[1] and 3 <= i <= 6 and 3 <= k <= 4: pts[n][1] = .9
        if k == ends[2] and 3 <= i <= 6 and 3 <= j <= 4: pts[n][2] = .73
    SLATE, ORANGE, GLASS, GRAPHITE = range(4)
    counts, indices, colors = [], [], []
    for axis in range(3):
        b_axis, c_axis = [a for a in range(3) if a != axis]
        for side in (0, ends[axis]):
            for b in range(ends[b_axis]):
                for c in range(ends[c_axis]):
                    def key(bb, cc):
                        idx = [0, 0, 0]; idx[axis], idx[b_axis], idx[c_axis] = side, bb, cc; return lattice[tuple(idx)]
                    quad = [key(b, c), key(b + 1, c), key(b + 1, c + 1), key(b, c + 1)]
                    p = [[axes[a][cell[q][a]] for a in range(3)] for q in quad]
                    normal = cross(sub(p[1], p[0]), sub(p[2], p[1]))
                    if normal[axis] * (1 if side else -1) < 0: quad.reverse()
                    tone = SLATE
                    panel = (axis == 1 and side) or (axis == 2 and side)
                    if panel and 2 <= b and b + 1 <= 7 and 2 <= c and c + 1 <= 5:
                        floor = 3 <= b and b + 1 <= 6 and 3 <= c and c + 1 <= 4
                        tone = (ORANGE if axis == 1 else GLASS) if floor else GRAPHITE
                    counts.append(4); indices += quad; colors += [tone] * 4
    edges = {tuple(sorted((indices[o + n], indices[o + (n + 1) % 4]))) for o in range(0, len(indices), 4) for n in range(4)}
    def extreme(n): return sum(cell[n][a] in (0, ends[a]) for a in range(3))
    def on_ring(a, b, face_axis, lo, hi):  # edge running along a rectangular panel ring
        u, w = [x for x in range(3) if x != face_axis]
        ca, cb = cell[a], cell[b]
        if ca[face_axis] != ends[face_axis] or cb[face_axis] != ends[face_axis]: return False
        inside = all(lo[0] <= c[u] <= hi[0] and lo[1] <= c[w] <= hi[1] for c in (ca, cb))
        return inside and ((ca[u] == cb[u] and ca[u] in (lo[0], hi[0])) or (ca[w] == cb[w] and ca[w] in (lo[1], hi[1])))
    creases = []
    for a, b in sorted(edges):
        if extreme(a) >= 2 and extreme(b) >= 2:  # outer box edges
            ja, jb = cell[a][1], cell[b][1]
            creases.append(([a, b], 10. if ja == jb == 0 else 2.5 if ja == jb == ends[1] else 1.5))
        elif on_ring(a, b, 1, (2, 2), (7, 5)) or on_ring(a, b, 2, (2, 2), (7, 5)): creases.append(([a, b], 10.))
        elif on_ring(a, b, 1, (3, 3), (6, 4)) or on_ring(a, b, 2, (3, 3), (6, 4)): creases.append(([a, b], 3.))
    corners = [(lattice[i, ends[1], k], 2.) for i in (0, ends[0]) for k in (0, ends[2])]
    body = subd(stage, '/World/Housing', pts, counts, indices, creases=creases, corners=corners, fv_linear='all')
    palette = [(.36, .42, .48), (.92, .42, .12), (.06, .30, .34), (.12, .13, .14)]
    pv = body.CreateDisplayColorPrimvar(UsdGeom.Tokens.faceVarying)
    pv.Set([Gf.Vec3f(c) for c in palette]); pv.SetIndices(colors)
    paint = look(stage, 'Enamel', palette[0], rough=.42, metal=.08, primvar='displayColor')
    finish(body, paint, palette[0])
    knob_profile = [(.20, 0), (.21, .10), (.19, .16), (.13, .18)]
    for name, x, scale in (('Dial', -.38, 1.), ('Trim', .34, .62)):
        kp, kc, ki, _, kv = revolve([(r * scale, y * (1.25 if scale < 1 else 1)) for r, y in knob_profile], 12)
        knob = subd(stage, f'/World/{name}', kp, kc, ki, creases=[(ring_chain(kv, 2, 12), 3.)])
        knob.AddTranslateOp().Set(Gf.Vec3d(x, .9, 0))
        knob.CreateDisplayColorPrimvar(UsdGeom.Tokens.constant).Set([Gf.Vec3f(palette[3])])
        finish(knob, paint, palette[3])
    camera(stage, (1.0, .9, 1.35))
    return {'vertices': len(pts), 'faces': len(counts), 'edgeCreases': len(creases), 'corners': len(corners),
            'faceVaryingColorIndices': len(colors), 'faceVaryingLinearInterpolation': 'all', 'knobs': 2}


def fluted_vase(stage):
    """Open-rim Catmull-Clark shell (edgeOnly boundary), alternating fluted cage with
    semi-sharp vertical crease chains, a 24-gon base, and indexed face-varying st with a
    vertical UV seam plus a separate base island (faceVaryingLinearInterpolation=boundaries)
    sampled by a repeating texture."""
    profile = [(.30, 0), (.40, .02), (.42, .10), (.36, .22), (.62, .60), (.78, 1.05), (.70, 1.50),
               (.46, 1.85), (.40, 2.05), (.52, 2.25), (.66, 2.36)]
    segs = 24
    pts, counts, indices, faces, vid = revolve(profile, segs, radial=lambda i, s: .88 if i >= 3 and s % 2 else 1., top=None)
    creases = [(ring_chain(vid, 2, segs), 3.)] + [([vid(i, s) for i in range(3, len(profile))], 1.2) for s in range(0, segs, 2)]
    lengths = [0.]
    for (r0, y0), (r1, y1) in zip(profile, profile[1:]): lengths.append(lengths[-1] + math.hypot(r1 - r0, y1 - y0))
    st = [(3 * s / segs, 2 * l / lengths[-1]) for l in lengths for s in range(segs + 1)]
    sti = lambda ring, s: ring * (segs + 1) + s
    st_indices = list(range(len(st), len(st) + segs))  # base cap island
    st += [(.5 + .45 * math.cos(TAU * s / segs), .5 + .45 * math.sin(TAU * s / segs)) for s in range(segs)]
    for ring in range(len(profile) - 1):
        for s in range(segs): st_indices += [sti(ring, s), sti(ring + 1, s), sti(ring + 1, s + 1), sti(ring, s + 1)]
    m = subd(stage, '/World/Vase', pts, counts, indices, boundary='edgeOnly', creases=creases, fv_linear='boundaries')
    m.CreateDoubleSidedAttr(True)
    pv = UsdGeom.PrimvarsAPI(m).CreatePrimvar('st', Sdf.ValueTypeNames.TexCoord2fArray, UsdGeom.Tokens.faceVarying)
    pv.Set([Gf.Vec2f(round(u, 5), round(v, 5)) for u, v in st]); pv.SetIndices(st_indices)
    finish(m, look(stage, 'Glaze', (.80, .55, .40), rough=.35, coat=.6, texture=TEXTURE), (.80, .55, .40))
    camera(stage, (.6, .55, 1.4))
    return {'vertices': len(pts), 'faces': len(counts), 'boundary': 'edgeOnly', 'creaseChains': len(creases),
            'stValues': len(st), 'stIndices': len(st_indices), 'uvSeams': 2}


def loop_trefoil(stage):
    """Loop-scheme triangle cage of a closed genus-one trefoil tube (rotation-minimizing
    frames with closure twist removed) and a closed semi-sharp crease chain that spirals
    along it as a ridge."""
    rings, sides, radius = 42, 6, .2
    curve = lambda t: (.46 * (math.sin(t) + 2 * math.sin(2 * t)), .46 * (math.cos(t) - 2 * math.cos(2 * t)) + .1, -.46 * math.sin(3 * t))
    tangent = lambda t: norm(sub(curve(t + 1e-4), curve(t - 1e-4)))
    frames, normal = [], norm(cross(tangent(0), (0, 0, 1)))
    for i in range(rings + 1):  # double-reflection rotation-minimizing frames
        t = TAU * i / rings
        if i:
            prev, x0, x1 = TAU * (i - 1) / rings, curve(TAU * (i - 1) / rings), curve(t)
            v1 = sub(x1, x0); c1 = dot(v1, v1)
            nl = sub(normal, mul(v1, 2 / c1 * dot(v1, normal))); tl = sub(tangent(prev), mul(v1, 2 / c1 * dot(v1, tangent(prev))))
            v2 = sub(tangent(t), tl); c2 = dot(v2, v2)
            normal = norm(sub(nl, mul(v2, 2 / c2 * dot(v2, nl))))
        frames.append(normal)
    first = frames[0]; closing = math.atan2(dot(cross(frames[-1], first), tangent(0)), dot(frames[-1], first))
    pts = []
    for i in range(rings):
        t = TAU * i / rings; T = tangent(t); n = rotate(frames[i], T, closing * i / rings); b = cross(T, n)
        for k in range(sides):
            a = TAU * k / sides; pts.append(add(curve(t), add(mul(n, radius * math.cos(a)), mul(b, radius * math.sin(a)))))
    vid = lambda i, k: (i % rings) * sides + k % sides
    tris = []
    for i in range(rings):
        for k in range(sides):
            a, b, c, d = vid(i, k), vid(i, k + 1), vid(i + 1, k + 1), vid(i + 1, k)
            tris += [(a, b, c), (a, c, d)] if (i + k) % 2 else [(a, b, d), (b, c, d)]
    def outward(tri):
        p = [pts[n] for n in tri]; centroid = mul(add(add(p[0], p[1]), p[2]), 1 / 3)
        i = tri[0] // sides; return dot(cross(sub(p[1], p[0]), sub(p[2], p[0])), sub(centroid, curve(TAU * i / rings)))
    if outward(tris[0]) < 0: tris = [t[::-1] for t in tris]
    assert all(outward(t) > 0 for t in tris)
    chain = [vid(i, 0) for i in range(rings)] + [vid(0, 0)]
    m = subd(stage, '/World/Knot', pts, [3] * len(tris), [n for t in tris for n in t], scheme='loop', creases=[(chain, 2.)])
    finish(m, look(stage, 'Cobalt', (.10, .22, .55), rough=.18, coat=1.), (.10, .22, .55))
    camera(stage, (.25, .3, 1.0))
    return {'vertices': len(pts), 'triangles': len(tris), 'scheme': 'loop', 'creaseChainLength': len(chain)}


# --- curves -------------------------------------------------------------------------

def basis_curves(stage, path, curve_type, basis_name, wrap, strands, widths, width_interp, colors, normals=None, normals_interp=None):
    c = UsdGeom.BasisCurves.Define(stage, path)
    c.CreateTypeAttr(curve_type); c.CreateWrapAttr(wrap)
    if basis_name: c.CreateBasisAttr(basis_name)
    c.CreateCurveVertexCountsAttr([len(s) for s in strands]); c.CreatePointsAttr([v3(p) for s in strands for p in s])
    c.CreateWidthsAttr([round(w, 5) for w in widths]); c.SetWidthsInterpolation(width_interp)
    if normals: c.CreateNormalsAttr([v3(n) for n in normals]); c.SetNormalsInterpolation(normals_interp)
    pv = c.CreateDisplayColorPrimvar(UsdGeom.Tokens.uniform if len(colors) > 1 else UsdGeom.Tokens.constant)
    pv.Set([Gf.Vec3f(col) for col in colors])
    return c


def braided_rope(stage):
    """Cubic B-spline tubes: a three-strand braid with per-vertex tapered widths and
    amplitudes pre-compensated for B-spline smoothing, and a coiled two-ply cord whose
    twist rate accelerates toward the centre. Per-curve uniform displayColor."""
    fibre = look(stage, 'Fibre', (.8, .7, .5), rough=.72, primvar='displayColor')
    n, cycles = 36, 3.5  # ten control points per cycle; tighter winding makes strands collide
    h = TAU * cycles / (n - 1); shrink = lambda k: (4 + 2 * math.cos(k * h)) / 6
    axis = lambda t: (-2.1 + 2.6 * t, .12, .34 * math.sin(TAU * .8 * t - .9))
    strands, widths = [], []
    for strand in range(3):
        pts = []
        for i in range(n):
            t = i / (n - 1); a = axis(t); T = norm(sub(axis(t + 1e-4), axis(t - 1e-4))); side = norm(cross(T, (0, 1, 0)))
            u = h * i + TAU * strand / 3
            pts.append(add(a, add(mul(side, .17 * math.sin(u) / shrink(1)), (0, .12 * math.sin(2 * u) / shrink(2), 0))))
            widths.append(.105 * (.55 + .45 * min(1, 3 * math.sin(math.pi * t))))
        strands.append(pts)
    braid = basis_curves(stage, '/World/Braid', 'cubic', 'bspline', 'nonperiodic', strands, widths, UsdGeom.Tokens.vertex,
                         [(.55, .12, .10), (.90, .84, .70), (.22, .32, .45)])
    finish(braid, fibre, (.55, .12, .10))
    # The cord's lay tightens from a 0.6 to a 0.2 pitch per unit of arc length as it coils inward.
    centre, plies, count = (1.25, .05, .55), [], 161
    coil = lambda t: add(centre, ((.82 - .55 * t) * math.cos(math.pi * (1 + 2.6 * t)), 0, (.82 - .55 * t) * math.sin(math.pi * (1 + 2.6 * t))))
    phases = [0.]
    for i in range(1, count):
        t0, t1 = (i - 1) / (count - 1), i / (count - 1)
        phases.append(phases[-1] + TAU * math.dist(coil(t0), coil(t1)) / (.6 - .4 * (t0 + t1) / 2))
    widths = []
    for ply in range(2):
        pts = []
        for i in range(count):
            t = i / (count - 1); a = coil(t); T = norm(sub(coil(t + 1e-4), coil(t - 1e-4)))
            side, phase = cross(T, (0, 1, 0)), phases[i] + math.pi * ply
            pts.append(add(a, add(mul(side, .045 * math.cos(phase)), (0, .045 * math.sin(phase) + .04, 0))))
            widths.append(.08 - .03 * t)
        plies.append(pts)
    cord = basis_curves(stage, '/World/Cord', 'cubic', 'bspline', 'nonperiodic', plies, widths, UsdGeom.Tokens.vertex,
                        [(.78, .56, .22), (.88, .78, .55)])
    finish(cord, fibre, (.78, .56, .22))
    camera(stage, (.25, 1.15, 1.0))
    return {'braidStrands': 3, 'braidControlPoints': 3 * n, 'cordPlies': 2, 'cordControlPoints': 2 * count,
            'basis': 'bspline', 'widthInterpolation': 'vertex'}


def armillary(stage):
    """Periodic Catmull-Rom rings with uniform (per-curve) widths, a linear polar axis, and
    pinned cubic B-spline scroll legs, under a tilted transform."""
    brass = look(stage, 'Brass', (.80, .60, .26), rough=.3, metal=.85, primvar='displayColor')
    def circle(radius, e1, e2, centre=(0, 0, 0), n=12):
        return [add(centre, add(mul(e1, radius * math.cos(TAU * k / n)), mul(e2, radius * math.sin(TAU * k / n)))) for k in range(n)]
    X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
    tilt = math.radians(23.44); sphere = UsdGeom.Xform.Define(stage, '/World/Sphere')
    sphere.AddRotateZOp().Set(-38.)
    rings = [circle(1, X, Z), circle(math.cos(tilt), X, Z, (0, math.sin(tilt), 0)), circle(math.cos(tilt), X, Z, (0, -math.sin(tilt), 0)),
             circle(math.sin(tilt), X, Z, (0, math.cos(tilt), 0), 8), circle(math.sin(tilt), X, Z, (0, -math.cos(tilt), 0), 8),
             circle(1, X, Y), circle(1, Z, Y), circle(1, X, (0, math.sin(tilt), math.cos(tilt)), n=16)]
    colors = [(.82, .62, .28)] * 7 + [(.25, .52, .48)]
    c = basis_curves(stage, '/World/Sphere/Rings', 'cubic', 'catmullRom', 'periodic', rings,
                     [.04, .025, .025, .025, .025, .04, .04, .085], UsdGeom.Tokens.uniform, colors)
    finish(c, brass, colors[0])
    a = basis_curves(stage, '/World/Sphere/Axis', 'linear', None, 'nonperiodic', [[(0, -1.16, 0), (0, 1.16, 0)]], [.03],
                     UsdGeom.Tokens.constant, [(.62, .45, .2)])
    finish(a, brass, (.62, .45, .2))
    globe = UsdGeom.Sphere.Define(stage, '/World/Sphere/Globe'); globe.CreateRadiusAttr(.2)
    finish(globe, look(stage, 'Lapis', (.12, .25, .5), rough=.25, coat=.8), (.12, .25, .5))
    frame = basis_curves(stage, '/World/Frame', 'cubic', 'catmullRom', 'periodic',
                         [circle(1.16, X, Y), circle(1.16, X, Z), circle(1.3, X, Z, (0, -1.36, 0), 16)],
                         [.07, .07, .05], UsdGeom.Tokens.uniform, [(.70, .52, .22)] * 3)
    finish(frame, brass, (.70, .52, .22))
    leg = [(1.16, 0), (1.22, -.35), (1.05, -.8), (.9, -1.15), (1.1, -1.38), (1.36, -1.32), (1.4, -1.18), (1.29, -1.12)]
    legs = [[(r * math.cos(a), y, r * math.sin(a)) for r, y in leg] for a in (math.pi / 2 + TAU * k / 3 for k in range(3))]
    stand = basis_curves(stage, '/World/Legs', 'cubic', 'bspline', 'pinned', legs, [.06], UsdGeom.Tokens.constant, [(.30, .22, .14)])
    finish(stand, brass, (.30, .22, .14))
    camera(stage, (1, .35, 1.25))
    return {'ringCurves': 8, 'frameCurves': 3, 'periodicCatmullRom': True, 'pinnedBspline': 3, 'linearAxis': 1,
            'widthInterpolation': 'uniform'}


def ribbon_rosette(stage):
    """Cubic Bezier ribbons: authored per-vertex normals orient each flat ribbon and add a
    twist along it; varying (per-segment-end) widths swell the loops."""
    satin = look(stage, 'Satin', (.72, .10, .14), rough=.32, primvar='displayColor')
    def bezier(cps, s):  # point and tangent on a two-segment cubic Bezier at global s
        seg = min(int(s * 2), 1); t = s * 2 - seg; p = cps[3 * seg:3 * seg + 4]
        point = add(add(mul(p[0], (1 - t) ** 3), mul(p[1], 3 * t * (1 - t) ** 2)), add(mul(p[2], 3 * t * t * (1 - t)), mul(p[3], t ** 3)))
        d = add(add(mul(sub(p[1], p[0]), 3 * (1 - t) ** 2), mul(sub(p[2], p[1]), 6 * t * (1 - t))), mul(sub(p[3], p[2]), 3 * t * t))
        return point, norm(d)
    curves, normals, widths, colors = [], [], [], []
    def ribbon(local, angle, lift, scale, twist, width, color):
        e = (math.cos(angle), 0, math.sin(angle)); side = (-math.sin(angle), 0, math.cos(angle)); up = (0, 1, 0)
        cps = [add((0, lift, 0), add(mul(e, a * scale), add(mul(up, b * scale), mul(side, c * scale)))) for a, b, c in local]
        curves.append(cps); widths.extend(width); colors.append(color)
        for k in range(7):
            _, T = bezier(cps, k / 6); base = norm(cross(T, side)) if abs(dot(T, side)) < .99 else up
            normals.append(rotate(base, T, twist(k / 6)))
    loop = [(0, 0, 0), (.25, .30, .06), (.75, .55, .12), (1.05, .28, 0), (.95, .02, -.12), (.40, .02, -.06), (0, .02, 0)]
    for k in range(8):
        ribbon(loop, TAU * k / 8 + math.pi / 8, 0, 1., lambda s: .6 * math.sin(math.pi * s), [.10, .25, .10],
               (.72, .10, .14) if k % 2 else (.58, .06, .11))
    for k in range(6):
        ribbon(loop, TAU * k / 6, .1, .62, lambda s: -.5 * math.sin(math.pi * s), [.08, .19, .08], (.86, .66, .26))
    tail = [(0, 0, 0), (.3, -.05, 0), (.7, -.12, .05), (1.1, -.15, .12), (1.5, -.15, .18), (1.8, -.12, .1), (2.05, -.1, 0)]
    for angle in (math.radians(100), math.radians(140)):
        ribbon(tail, angle, -.02, 1., lambda s: math.pi * s, [.2, .22, .24], (.72, .10, .14))
    c = basis_curves(stage, '/World/Ribbons', 'cubic', 'bezier', 'nonperiodic', curves, widths, UsdGeom.Tokens.varying,
                     colors, normals, UsdGeom.Tokens.vertex)
    finish(c, satin, (.72, .10, .14))
    camera(stage, (.35, 1.2, 1.0))
    return {'curves': len(curves), 'controlPoints': 7 * len(curves), 'basis': 'bezier', 'segmentsPerCurve': 2,
            'normals': len(normals), 'widthInterpolation': 'varying'}


def rational_aqueduct(stage):
    """Multi-span NurbsCurves: exact rational quadratic semicircular arches (two quarter
    spans, weight sqrt(2)/2) joined to straight piers through doubled interior knots (C0
    joins), mixed per-curve order (3 for arcades, 2 for cornice polylines) and ranges."""
    counts, orders, knots, ranges, points, weights, colors = [], [], [], [], [], [], []
    w = math.sqrt(.5)
    def add_curve(order, cps, ws, color):
        n = len(cps); counts.append(n); orders.append(order); points.extend(cps); weights.extend(ws); colors.append(color)
        if order == 3:
            spans = (n - 1) // 2; knots.extend([0, 0, 0] + [k for k in range(1, spans) for _ in (0, 1)] + [spans] * 3)
        else:
            spans = n - 1; knots.extend([0] + list(range(n)) + [n - 1])
        ranges.append(Gf.Vec2d(0, spans))
    def arcade(x0, arches, pier, span, base, spring, top, z):
        cps, ws, x = [(x0 + pier, base, z)], [1.], x0 + pier
        def line(p):
            q = cps[-1]; cps.extend([lerp(q, p, .5), p]); ws.extend([1., 1.])
        r = span / 2
        for k in range(arches):
            line((x, spring, z))
            for corner, end in (((x, spring + r, z), (x + r, spring + r, z)), ((x + span, spring + r, z), (x + span, spring, z))):
                cps.extend([corner, end]); ws.extend([w, 1.])
            line((x + span, base, z))
            if k < arches - 1: line((x + span + pier, base, z))
            x += span + pier
        add_curve(3, cps, ws, (.82, .68, .46))
        add_curve(2, [(x0, base, z), (x0, top, z), (x, top, z), (x, base, z)], [1.] * 4, (.58, .44, .28))
    # Twelve small upper arches share the 4.22-unit length of the four large lower ones.
    tiers = [(4, .22, .78, 0, .75, 1.30), (4, .22, .78, 1.30, 1.85, 2.38), (12, .07, .2758, 2.38, 2.58, 2.85)]
    for z in (.18, -.18):
        for arches, pier, span, base, spring, top in tiers:
            arcade(-2.11, arches, pier, span, base, spring, top, z)
    c = UsdGeom.NurbsCurves.Define(stage, '/World/Aqueduct')
    c.CreateCurveVertexCountsAttr(counts); c.CreateOrderAttr(orders); c.CreateKnotsAttr(knots); c.CreateRangesAttr(ranges)
    c.CreatePointsAttr([v3(p) for p in points]); c.CreatePointWeightsAttr([round(x, 7) for x in weights])
    c.CreateWidthsAttr([.035]); c.SetWidthsInterpolation(UsdGeom.Tokens.constant)
    c.CreateDisplayColorPrimvar(UsdGeom.Tokens.uniform).Set([Gf.Vec3f(col) for col in colors])
    finish(c, look(stage, 'Limestone', (.82, .68, .46), rough=.8, primvar='displayColor'), (.82, .68, .46))
    camera(stage, (.5, .25, 1.3))
    return {'curves': len(counts), 'controlPoints': len(points), 'orders': sorted(set(orders)), 'knots': len(knots),
            'rationalWeights': True, 'arches': 2 * sum(t[0] for t in tiers)}


# --- NURBS surfaces -----------------------------------------------------------------

CIRCLE_KNOTS = [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4]


def circle_dirs(sign=1):
    """Nine rational quadratic control directions/weights of an exact unit circle."""
    w = math.sqrt(.5)
    return [((math.cos(sign * k * math.pi / 4) / (w if k % 2 else 1), math.sin(sign * k * math.pi / 4) / (w if k % 2 else 1)),
             w if k % 2 else 1.) for k in range(9)]


def arc_dirs(start, sweep, spans):
    """Rational quadratic arc (exact) as control directions/weights in its plane."""
    out, step = [], sweep / spans
    for k in range(2 * spans + 1):
        angle = start + step * k / 2; mid = k % 2; s = math.cos(step / 2) if mid else 1.
        out.append(((math.cos(angle) / s, math.sin(angle) / s), s))
    return out


def patch(stage, path, u, v, pts, weights, u_order, v_order, u_knots, v_knots, u_form='open', v_form='open',
          u_range=None, v_range=None, outward=None):
    """NurbsPatch (U-fast control order). Orientation is chosen from the evaluated surface
    normal at the domain centre so the authored front faces `outward(point)`."""
    m = UsdGeom.NurbsPatch.Define(stage, path)
    m.CreateUVertexCountAttr(u); m.CreateVVertexCountAttr(v); m.CreateUOrderAttr(u_order); m.CreateVOrderAttr(v_order)
    m.CreateUKnotsAttr(u_knots); m.CreateVKnotsAttr(v_knots); m.CreateUFormAttr(u_form); m.CreateVFormAttr(v_form)
    u_range = u_range or (u_knots[u_order - 1], u_knots[u]); v_range = v_range or (v_knots[v_order - 1], v_knots[v])
    m.CreateURangeAttr(Gf.Vec2d(*u_range)); m.CreateVRangeAttr(Gf.Vec2d(*v_range))
    authored = [v3(p) for p in pts]; m.CreatePointsAttr(authored)
    if weights and any(abs(x - 1) > 1e-9 for x in weights): m.CreatePointWeightsAttr([round(x, 7) for x in weights])
    if outward:
        mu, mv = sum(u_range) / 2 + .13, sum(v_range) / 2 + .07
        point, normal = surface(authored, weights, u, basis(u_knots, u, u_order, mu), basis(v_knots, v, v_order, mv))
        left = dot(tuple(normal), outward(tuple(point))) < 0
        m.CreateOrientationAttr('leftHanded' if left else 'rightHanded')
    m.CreateDoubleSidedAttr(True)
    return m


def revolved(profile, sweep, origin=(0, 0, 0), axis=(0, 1, 0), e1=(1, 0, 0), e2=(0, 0, 1)):
    """Exact tensor-product surface of revolution: profile (radius, height, weight) x sweep
    (direction, weight). Returns U-fast points/weights with U = sweep."""
    pts, ws = [], []
    for r, h, wp in profile:
        for (c, s), wd in sweep:
            pts.append(add(origin, add(mul(axis, h), mul(add(mul(e1, c), mul(e2, s)), r)))); ws.append(wp * wd)
    return pts, ws


def amphora(stage):
    """Rational surfaces of revolution: an exact-circle closed U (uForm closed) body over a
    nonuniform cubic profile pinched to a pole at the base, plus two exact torus-section
    handles (rational in both directions); the mirrored handle needs leftHanded orientation."""
    body = [(0, 0), (.36, 0), (.30, .16), (1.02, .62), (.98, 1.42), (.30, 1.80), (.27, 2.25), (.50, 2.40), (.44, 2.50)]
    pts, ws = revolved([(r, y, 1.) for r, y in body], circle_dirs(-1))
    v_knots = [0, 0, 0, 0, .5, 1.4, 2.2, 2.9, 3.4, 4, 4, 4, 4]
    radial = lambda p: (p[0], 0, p[2])
    clay = look(stage, 'Terracotta', (.66, .32, .18), rough=.55, coat=.25)
    m = patch(stage, '/World/Body', 9, 9, pts, ws, 3, 4, CIRCLE_KNOTS, v_knots, u_form='closed', outward=radial)
    finish(m, clay, (.66, .32, .18))
    orientations = [m.GetOrientationAttr().Get()]
    # Seat both handle ends just inside the evaluated body wall (neck above, shoulder below).
    authored = m.GetPointsAttr().Get()
    profile = [surface(authored, ws, 9, basis(CIRCLE_KNOTS, 9, 3, 0), basis(v_knots, 9, 4, 4 * k / 200))[0] for k in range(201)]
    body_r = lambda y: math.hypot(*min(profile, key=lambda p: abs(p[1] - y))[0::2])
    centre_x, centre_y, arm = .56, 1.80, .30
    seated = lambda a: centre_x + arm * math.cos(math.radians(a)) <= body_r(centre_y + arm * math.sin(math.radians(a))) - .03
    start = next(a for a in range(90, 200) if seated(a))
    end = next(a for a in range(-20, -150, -1) if seated(a))
    sweep = math.radians(end - start)
    for name, side in (('HandleEast', 1), ('HandleWest', -1)):
        centre = (side * centre_x, centre_y, 0)
        path_dirs = arc_dirs(math.radians(start if side > 0 else 180 - start), sweep * side, 4)
        tube = [(arm + .055 * c, .055 * s, w) for (c, s), w in circle_dirs()]
        hp, hw = [], []
        for (pc, ps), pw in path_dirs:  # V = sweep along the handle arc, U = tube cross-section
            for r, h, w in tube:
                hp.append(add(centre, add(mul((pc, ps, 0), r), (0, 0, h)))); hw.append(w * pw)
        def tube_out(p, centre=centre, path_dirs=path_dirs):
            q = sub(p, centre); radial_dir = norm((q[0], q[1], 0)); return sub(q, mul(radial_dir, arm))
        h = patch(stage, f'/World/{name}', 9, 9, hp, hw, 3, 3, CIRCLE_KNOTS, CIRCLE_KNOTS, u_form='closed', outward=tube_out)
        finish(h, clay, (.66, .32, .18)); orientations.append(h.GetOrientationAttr().Get())
    camera(stage, (.7, .35, 1.4))
    return {'patches': 3, 'controlPoints': 243, 'rationalWeights': True, 'uForm': 'closed',
            'orientations': orientations, 'degeneratePole': True, 'handleSweepDegrees': start - end}


def canopy(stage):
    """Multi-patch shell: four cubic petals with nonuniform knots meeting along shared
    control rows (C0 seams, valleys) over a rational flared column."""
    concrete = look(stage, 'Concrete', (.86, .83, .78), rough=.85)
    radii = [.13, .45, .95, 1.45, 1.75]
    for k in range(4):
        pts = []
        for j in range(5):
            phi = math.radians(k * 90 - 45 + j * 22.5)
            square = 1 / max(abs(math.cos(phi)), abs(math.sin(phi)))
            for i, r in enumerate(radii):
                rr = r * (1 + (square - 1) * (i / 4) ** 2)
                billow = .2 * math.sin(math.pi * j / 4) * (i / 4) ** 2 if j % 4 else 0
                pts.append((rr * math.cos(phi), 1.62 + .55 * (r / 1.75) ** 1.6 + billow - .1 * (i == 4), rr * math.sin(phi)))
        m = patch(stage, f'/World/Petal{k}', 5, 5, pts, None, 4, 4, [0, 0, 0, 0, .35, 1, 1, 1, 1], [0, 0, 0, 0, .5, 1, 1, 1, 1],
                  outward=lambda p: (0, 1, 0))
        finish(m, concrete, (.86, .83, .78))
    for k in range(4):  # each petal's last radial row is its neighbour's first: exact shared seam
        a = UsdGeom.NurbsPatch.Get(stage, f'/World/Petal{k}').GetPointsAttr().Get()
        b = UsdGeom.NurbsPatch.Get(stage, f'/World/Petal{(k + 1) % 4}').GetPointsAttr().Get()
        assert all(a[20 + i] == b[i] for i in range(5))
    column = [(.07, 0), (.07, .9), (.09, 1.45), (.13, 1.62)]
    pts, ws = revolved([(r, y, 1.) for r, y in column], circle_dirs(-1))
    col = patch(stage, '/World/Column', 9, 4, pts, ws, 3, 4, CIRCLE_KNOTS, [0, 0, 0, 0, 1, 1, 1, 1], u_form='closed',
                outward=lambda p: (p[0], 0, p[2]))
    finish(col, look(stage, 'Shadow', (.55, .53, .50), rough=.8), (.55, .53, .50))
    camera(stage, (1, .22, 1.3))
    return {'patches': 5, 'petalControlGrid': [5, 5], 'sharedSeams': 4, 'nonuniformKnots': True, 'rationalColumn': True}


def canoe(stage):
    """Cubic hull whose bow and stern rows collapse to zero beam (degenerate pinched edges)
    with nonuniform V knots, plus two thwarts as quadratic-by-linear (order 3 x 2) patches
    seated on the evaluated gunwale."""
    zs = [-2.05, -1.72, -1.0, 0, 1.0, 1.72, 2.05]; beam = [0, .24, .43, .48, .43, .24, 0]
    keel = [.30, -.16, -.30, -.33, -.30, -.16, .30]; sheer = [.50, .26, .14, .12, .14, .26, .50]
    fx, fy = [1, 1.04, .82, 0, -.82, -1.04, -1], [1, .55, .12, 0, .12, .55, 1]
    pts = []
    for i in range(7):
        for j in range(7):
            z = zs[i] * (1 - .1 * (1 - fy[j])) if i in (0, 6) else zs[i]  # raked, rounded stems
            pts.append((fx[j] * beam[i], keel[i] + fy[j] * (sheer[i] - keel[i]), z))
    uk, vk = [0, 0, 0, 0, 1, 2, 3, 4, 4, 4, 4], [0, 0, 0, 0, .8, 2, 3.2, 4, 4, 4, 4]
    hull = patch(stage, '/World/Hull', 7, 7, pts, None, 4, 4, uk, vk, outward=lambda p: (p[0], -.4, 0))
    finish(hull, look(stage, 'Lacquer', (.55, .12, .08), rough=.3, coat=.9), (.55, .12, .08))
    authored = hull.GetPointsAttr().Get()
    wood = look(stage, 'Ash', (.66, .46, .25), rough=.6)
    for name, v in (('ThwartFore', 1.25), ('ThwartAft', 2.75)):
        port = surface(authored, None, 7, basis(uk, 7, 4, 0), basis(vk, 7, 4, v))[0]
        star = surface(authored, None, 7, basis(uk, 7, 4, 4), basis(vk, 7, 4, v))[0]
        tp = []
        for dz in (-.05, .05):
            a, b = add(tuple(port), (0, -.03, dz)), add(tuple(star), (0, -.03, dz))
            tp += [a, add(lerp(a, b, .5), (0, .04, 0)), b]
        t = patch(stage, f'/World/{name}', 3, 2, tp, None, 3, 2, [0, 0, 0, 1, 1, 1], [0, 0, 1, 1], outward=lambda p: (0, 1, 0))
        finish(t, wood, (.66, .46, .25))
    camera(stage, (1.35, .95, .95))
    return {'patches': 3, 'hullControlGrid': [7, 7], 'pinchedEnds': 2, 'thwartOrders': [3, 2], 'nonuniformKnots': True}


def lampshade(stage):
    """Periodic cubic NURBS (uForm periodic, unclamped uniform knots, three wrapped control
    columns) with ruffle amplitude and swirl growing down a clamped V profile."""
    base, wrap = 24, 3
    profile = [(.12, 1.75), (.30, 1.70), (.42, 1.35), (.58, .80), (1.05, .25), (1.30, .12)]
    ruffle = [0, 0, .04, .12, .30, .40]
    pts = []
    for j, (r, y) in enumerate(profile):
        row = []
        for i in range(base):
            sign = 1 if i % 2 == 0 else -1; theta = TAU * i / base + math.radians(5) * j
            rr = r * (1 + ruffle[j] * sign)
            row.append((rr * math.cos(theta), y + .3 * ruffle[j] * sign, -rr * math.sin(theta)))
        pts += row + row[:wrap]
    u = base + wrap
    m = patch(stage, '/World/Shade', u, 6, pts, None, 4, 4, list(range(u + 4)), [0, 0, 0, 0, 1, 2, 3, 3, 3, 3],
              u_form='periodic', outward=lambda p: (p[0], 0, p[2]))
    finish(m, look(stage, 'Celadon', (.62, .78, .66), rough=.28, coat=.5), (.62, .78, .66))
    camera(stage, (.6, .6, 1.3))
    return {'uVertexCount': u, 'vVertexCount': 6, 'uForm': 'periodic', 'wrappedColumns': wrap, 'uKnots': u + 4}


# --- cases, validation and manifest --------------------------------------------------

EXPECT_NATIVE = 'USD geometry and authored topology are valid; Storm support for NURBS may vary.'
CASES = [
    ('studio-pierced-lantern', 'Pierced brass lantern', 'Subdivision', pierced_lantern,
     ['Catmull-Clark', 'hole faces', 'crease chains', 'triangle subdivision rule', 'corner sharpness', 'emission'],
     'Sixteen staggered hole faces must open onto the emissive core; filled windows mean holes are ignored.'),
    ('studio-instrument-housing', 'Creased instrument housing', 'Subdivision', instrument_housing,
     ['Catmull-Clark', 'semi-sharp creases', 'corner sharpness', 'indexed face-varying color', 'primvar reader'],
     'Panel colours stay crisp along their face-varying seams; fillets soften with refinement while base edges stay sharp.'),
    ('studio-fluted-vase', 'Fluted UV-seamed vase', 'Subdivision', fluted_vase,
     ['Catmull-Clark', 'edgeOnly boundary', 'indexed face-varying UVs', 'UV seams', 'textured'],
     'The repeating grid stays continuous across the vertical UV seam; a smeared column means seam indices were dropped.'),
    ('studio-loop-trefoil', 'Loop trefoil knot', 'Subdivision', loop_trefoil,
     ['Loop', 'triangle cage', 'closed crease chain', 'genus one'],
     'The faceted six-sided cage becomes a round tube with a spiral ridge when Loop refinement is applied.'),
    ('studio-braided-rope', 'Braided rope and coiled cord', 'Curves and points', braided_rope,
     ['cubic B-spline', 'vertex widths', 'uniform displayColor', 'variable twist'],
     'Strands taper toward their ends and pass over and under without intersecting.'),
    ('studio-armillary', 'Spline armillary sphere', 'Curves and points', armillary,
     ['periodic Catmull-Rom', 'pinned B-spline', 'linear curves', 'uniform widths', 'transformed curves'],
     'Rings close without seams; the ecliptic band is visibly wider than the other rings.'),
    ('studio-ribbon-rosette', 'Bezier ribbon rosette', 'Curves and points', ribbon_rosette,
     ['cubic Bezier', 'oriented ribbons', 'vertex normals', 'varying widths'],
     'Loops render as flat, twisted ribbons oriented by authored normals; round tubes mean normals were ignored.'),
    ('studio-rational-aqueduct', 'Rational aqueduct arcades', 'NURBS Curves', rational_aqueduct,
     ['NURBS curves', 'rational weights', 'repeated knots', 'mixed order', 'multiple spans'],
     'Arches are exact semicircles with sharp springing joins; cubic-looking or overshooting arches mean weights or knots were ignored.'),
    ('studio-rational-amphora', 'Rational amphora', 'NURBS Surfaces', amphora,
     ['NURBS patch', 'rational weights', 'closed form', 'orientation', 'degenerate pole'],
     'Cross-sections are exact circles; both handles shade outward even though one is leftHanded.'),
    ('studio-shell-canopy', 'Folded shell canopy', 'NURBS Surfaces', canopy,
     ['NURBS patch', 'multiple patches', 'shared seams', 'nonuniform knots', 'rational weights'],
     'Four petals meet without cracks along shared control rows above a flared rational column.'),
    ('studio-lacquered-canoe','Lacquered canoe', 'NURBS Surfaces', canoe,
     ['NURBS patch', 'degenerate edges', 'nonuniform knots', 'mixed order'],
     'Bow and stern pinch to clean stems without shading spikes; thwarts sit on the evaluated gunwale.'),
    ('studio-ruffled-lampshade', 'Ruffled periodic lampshade', 'NURBS Surfaces', lampshade,
     ['NURBS patch', 'periodic form', 'unclamped knots', 'cubic multispan'],
     'Twelve swirling ruffles close seamlessly; a gap or overlap means periodic knots were treated as clamped.'),
]
OWNED = 'curved-studio-'  # every manifest entry with this prefix belongs to this generator


def validate(path, name):
    stage = Usd.Stage.Open(str(path)); assert stage and not stage.GetCompositionErrors(), name
    assert UsdGeom.GetStageUpAxis(stage) == 'Y' and UsdGeom.GetStageMetersPerUnit(stage) == 1
    assert stage.GetDefaultPrim().GetPath() == Sdf.Path('/World') and UsdGeom.Camera.Get(stage, '/World/Camera')
    for prim in stage.Traverse():
        if prim.IsA(UsdGeom.Gprim):
            assert UsdShade.MaterialBindingAPI(prim).ComputeBoundMaterial()[0], prim.GetPath()
            ext = UsdGeom.Boundable(prim).GetExtentAttr().Get(); assert ext and len(ext) == 2, prim.GetPath()
        if prim.IsA(UsdGeom.Mesh):
            m = UsdGeom.Mesh(prim); counts, indices = m.GetFaceVertexCountsAttr().Get(), m.GetFaceVertexIndicesAttr().Get()
            ok, why = UsdGeom.Mesh.ValidateTopology(indices, counts, len(m.GetPointsAttr().Get())); assert ok, why
            if m.GetSubdivisionSchemeAttr().Get() == 'loop': assert set(counts) == {3}
            if m.GetCreaseIndicesAttr().HasAuthoredValue():
                lengths = m.GetCreaseLengthsAttr().Get(); assert sum(lengths) == len(m.GetCreaseIndicesAttr().Get())
                assert len(m.GetCreaseSharpnessesAttr().Get()) in (len(lengths), sum(n - 1 for n in lengths))
            assert all(0 <= h < len(counts) for h in (m.GetHoleIndicesAttr().Get() or []))
            for pv in UsdGeom.PrimvarsAPI(m).GetPrimvars():
                if pv.GetInterpolation() == 'faceVarying':
                    assert pv.IsIndexed() and len(pv.GetIndices()) == len(indices)
                    assert max(pv.GetIndices()) < len(pv.Get())
        if prim.IsA(UsdGeom.BasisCurves):
            c = UsdGeom.BasisCurves(prim); counts = c.GetCurveVertexCountsAttr().Get()
            assert sum(counts) == len(c.GetPointsAttr().Get())
            if c.GetBasisAttr().Get() == 'bezier' and c.GetTypeAttr().Get() == 'cubic': assert all((n - 1) % 3 == 0 for n in counts)
            for attr, interp in ((c.GetWidthsAttr(), c.GetWidthsInterpolation()), (c.GetNormalsAttr(), c.GetNormalsInterpolation())):
                if attr.HasAuthoredValue(): assert c.ComputeInterpolationForSize(len(attr.Get()), Usd.TimeCode.Default()) == interp
            dc = c.GetDisplayColorPrimvar(); assert c.ComputeInterpolationForSize(len(dc.Get()), Usd.TimeCode.Default()) == dc.GetInterpolation()
        if prim.IsA(UsdGeom.NurbsCurves):
            c = UsdGeom.NurbsCurves(prim); counts, orders, knots = c.GetCurveVertexCountsAttr().Get(), c.GetOrderAttr().Get(), c.GetKnotsAttr().Get()
            assert len(knots) == sum(n + o for n, o in zip(counts, orders)) and len(c.GetRangesAttr().Get()) == len(counts)
            assert len(c.GetPointWeightsAttr().Get() or c.GetPointsAttr().Get()) == len(c.GetPointsAttr().Get())
            offset = 0
            for n, o in zip(counts, orders):
                k = knots[offset:offset + n + o]; offset += n + o; assert list(k) == sorted(k) and n >= o
        if prim.IsA(UsdGeom.NurbsPatch):
            p = UsdGeom.NurbsPatch(prim); u, v = p.GetUVertexCountAttr().Get(), p.GetVVertexCountAttr().Get()
            assert len(p.GetPointsAttr().Get()) == u * v
            for knots, n, o in ((p.GetUKnotsAttr().Get(), u, p.GetUOrderAttr().Get()), (p.GetVKnotsAttr().Get(), v, p.GetVOrderAttr().Get())):
                assert len(knots) == n + o and list(knots) == sorted(knots)
            w = p.GetPointWeightsAttr().Get(); assert not w or (len(w) == u * v and min(w) > 0)
            if p.GetUFormAttr().Get() == 'periodic':
                pts = p.GetPointsAttr().Get(); o = p.GetUOrderAttr().Get()
                assert all(pts[r * u + u - o + 1 + i] == pts[r * u + i] for r in range(v) for i in range(o - 1))
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / f'{name}-evaluated.usda').unlink(missing_ok=True)
    _, records = evaluated_reference(stage, CACHE / f'{name}-evaluated.usda', subdivisions=8)
    return records


def main():
    write_texture(); entries, report = [], []
    for name, label, group, build, features, expectation in CASES:
        stage = Usd.Stage.CreateInMemory()
        UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y); UsdGeom.SetStageMetersPerUnit(stage, 1)
        stage.SetDefaultPrim(UsdGeom.Xform.Define(stage, '/World').GetPrim())
        assertions = build(stage)
        path = OUT / f'{name}.usda'
        stage.GetRootLayer().Export(str(path)); path.write_text(path.read_text().rstrip() + '\n')
        evaluated = validate(path, name)
        files = [f'coverage/curved-surfaces/{name}.usda'] + ([f'coverage/curved-surfaces/{TEXTURE}'] if 'textured' in features else [])
        entries.append({'id': 'curved-' + name, 'label': label, 'group': group, 'root': files[0], 'files': files,
                        'features': features, 'complexity': 'high', 'thumbnailComplexity': 'high',
                        'expected': {'native': EXPECT_NATIVE, 'needle': expectation}, 'assertions': assertions})
        report.append({'id': 'curved-' + name, 'opens': True, 'evaluatedNurbs': evaluated, **assertions})
    manifest_path = OUT / 'manifest.json'
    manifest = [e for e in json.loads(manifest_path.read_text()) if not e['id'].startswith(OWNED)] + entries
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    (CACHE / 'validation.json').write_text(json.dumps({'openusdVersion': list(Usd.GetVersion()), 'results': report}, indent=2) + '\n')
    print('Validated', len(entries), 'studio fixtures;', len(manifest), 'curved-surface manifest entries')


if __name__ == '__main__':
    main()
