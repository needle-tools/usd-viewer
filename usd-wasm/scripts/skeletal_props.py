"""Small, solid UsdSkel performances; geometry stays in skeleton bind space."""
import math
from pxr import Gf, UsdGeom, UsdSkel

TAU = math.tau
INK = (.055, .095, .13)
CREAM = (.96, .91, .74)
TEAL = (.08, .62, .62)
CORAL = (.94, .29, .22)
GOLD = (.98, .64, .13)
PURPLE = (.49, .28, .78)


class Parts:
    """Join rounded components into one mesh, retaining their skin weights."""
    def __init__(self):
        self.points, self.normals, self.colors, self.faces, self.weights = [], [], [], [], []

    def vertex(self, point, normal, color, influence):
        self.points.append(tuple(point))
        self.normals.append(tuple(Gf.Vec3d(*normal).GetNormalized()))
        self.colors.append(color)
        self.weights.append(influence(point) if callable(influence) else influence)
        return len(self.points) - 1

    def ellipsoid(self, center, radius, color, influence, tilt=0, rings=16, sides=24):
        # A single vertex at each pole avoids zero-area sphere faces.
        rotation = Gf.Rotation(Gf.Vec3d(0, 0, 1), tilt)
        def vertex(x, y, z):
            local = Gf.Vec3d(x * radius[0], y * radius[1], z * radius[2])
            normal = rotation.TransformDir(Gf.Vec3d(x / radius[0], y / radius[1], z / radius[2]))
            return self.vertex(Gf.Vec3d(*center) + rotation.TransformDir(local), normal, color, influence)
        bottom = vertex(0, -1, 0)
        bands = []
        for row in range(1, rings):
            angle = math.pi * row / rings
            bands.append([vertex(math.sin(angle) * math.cos(TAU * i / sides),
                                 -math.cos(angle), math.sin(angle) * math.sin(TAU * i / sides))
                          for i in range(sides)])
        top = vertex(0, 1, 0)
        for i in range(sides):
            j = (i + 1) % sides
            self.faces.append([bottom, bands[0][i], bands[0][j]])
            for low, high in zip(bands, bands[1:]):
                self.faces.append([low[i], high[i], high[j], low[j]])
            self.faces.append([bands[-1][i], top, bands[-1][j]])

    def beam(self, a, b, radius, color, influence, sides=12):
        axis = (Gf.Vec3d(*b) - Gf.Vec3d(*a)).GetNormalized()
        reference = Gf.Vec3d(0, 0, 1) if abs(axis[2]) < .8 else Gf.Vec3d(1, 0, 0)
        u = Gf.Cross(axis, reference).GetNormalized()
        v = Gf.Cross(axis, u).GetNormalized()
        bands = []
        for center in (a, b):
            bands.append([self.vertex(Gf.Vec3d(*center) + radius * (u * math.cos(TAU*i/sides) + v * math.sin(TAU*i/sides)),
                                      u * math.cos(TAU*i/sides) + v * math.sin(TAU*i/sides), color, influence)
                          for i in range(sides)])
        for i in range(sides):
            j = (i+1) % sides
            self.faces.append([bands[0][i], bands[0][j], bands[1][j], bands[1][i]])
        # Rounded end caps meet the cylindrical side tangentially.
        for center in (a, b):
            self.ellipsoid(center, (radius, radius, radius), color, influence, rings=6, sides=sides)

    def ring(self, center, major, minor, color, influence):
        bands = []
        for i in range(24):
            a = TAU * i / 24
            bands.append([self.vertex((center[0] + (major + minor*math.cos(b))*math.cos(a),
                                       center[1] + minor*math.sin(b),
                                       center[2] + (major + minor*math.cos(b))*math.sin(a)),
                                      (math.cos(b)*math.cos(a), math.sin(b), math.cos(b)*math.sin(a)), color, influence)
                          for b in [TAU*j/8 for j in range(8)]])
        for i in range(24):
            for j in range(8):
                self.faces.append([bands[i][j], bands[i][(j+1)%8], bands[(i+1)%24][(j+1)%8], bands[(i+1)%24][j]])

    def flat_face(self, indices):
        a, b, c = (Gf.Vec3d(*self.points[i]) for i in indices[:3])
        normal = Gf.Cross(b-a, c-a).GetNormalized()
        self.faces.append([self.vertex(self.points[i], normal, self.colors[i], self.weights[i]) for i in indices])

    def mesh(self, stage, joint_count):
        mesh = UsdGeom.Mesh.Define(stage, '/World/Rig/Surface')
        mesh.CreatePointsAttr(self.points)
        mesh.CreateFaceVertexCountsAttr([len(face) for face in self.faces])
        mesh.CreateFaceVertexIndicesAttr([index for face in self.faces for index in face])
        mesh.CreateSubdivisionSchemeAttr('none')
        mesh.CreateNormalsAttr(self.normals)
        mesh.SetNormalsInterpolation('vertex')
        mesh.CreateDisplayColorAttr(self.colors)
        mesh.GetDisplayColorPrimvar().SetInterpolation('vertex')
        binding = UsdSkel.BindingAPI.Apply(mesh.GetPrim())
        binding.CreateSkeletonRel().SetTargets(['/World/Rig/Skeleton'])
        binding.CreateGeomBindTransformAttr(Gf.Matrix4d(1))
        binding.CreateJointIndicesPrimvar(False, joint_count).Set(list(range(joint_count))*len(self.points))
        binding.CreateJointWeightsPrimvar(False, joint_count).Set([w for weights in self.weights for w in weights])
        return mesh, binding


def create_prop(stage, path, name, label, mode, finish, box):
    stage.SetStartTimeCode(1)
    stage.SetEndTimeCode(97)
    stage.SetFramesPerSecond(24)
    stage.SetTimeCodesPerSecond(24)
    root = UsdSkel.Root.Define(stage, '/World/Rig')
    parts = Parts()
    joints = ['root', 'root/tip']
    origins = [(0, 0, 0), (0, 1, 0)]
    parents = [-1, 0]
    if mode == 'bind':
        joints = ['root', 'root/leftWing', 'root/rightWing']
        origins = [(0, 0, 0), (-.34, 1.15, 0), (.34, 1.15, 0)]
        parents = [-1, 0, 0]
    elif mode == 'names':
        joints = ['root', 'root/stem', 'root/stem/blossom']
        origins = [(0, 0, 0), (0, .8, 0), (0, 1.6, 0)]
        parents = [-1, 0, 1]
    elif mode == 'rest':
        origins[1] = (.34, 1.12, 0)
    elif mode == 'multi':
        origins[1] = (0, .45, 0)
    elif mode == 'rotation':
        origins[1] = (0, 1.25, 0)
    count = len(joints)
    def rigid(index): return tuple(float(i == index) for i in range(count))
    base, tip = rigid(0), rigid(count-1)
    def blend(point):
        # The bending influence starts at its pivot, avoiding a reverse kink.
        t = min(1, max(0, (point[1]-.45) / 1.65 if mode == 'multi' else point[1] / 2.1))
        t = t*t*(3-2*t)
        return (1-t, t)
    def flower_weights(point):
        y = max(0, min(1.6, point[1])) / .8
        a, b = min(int(y), 1), min(int(y)+1, 2)
        fraction = y-a
        result = [0., 0., 0.]
        result[a] += 1-fraction
        result[b] += fraction
        return tuple(result)
    accent = {'rest':GOLD, 'bind':CORAL, 'names':PURPLE, 'multi':TEAL,
              'dual':GOLD, 'translate':CORAL, 'rotation':TEAL}[mode]

    if mode == 'rest':
        parts.ellipsoid((0, .82, 0), (.39, .48, .27), TEAL, base)
        parts.ellipsoid((0, 1.48, 0), (.45, .36, .30), CREAM, base)
        for x in (-.22, .22):
            parts.ellipsoid((x, 1.98, -.03), (.105, .32, .10), TEAL, base, tilt=-x*30)
            parts.ellipsoid((x, 1.49, .278), (.095, .12, .045), INK, base)
            parts.ellipsoid((x-.025, 1.53, .316), (.026, .035, .016), CREAM, base)
            parts.ellipsoid((x, .17, .09), (.20, .12, .28), INK, base)
            parts.beam((x, .20, .03), (x, .46, .03), .075, TEAL, base)
        parts.ellipsoid((0, 1.31, .292), (.12, .05, .035), CORAL, base)
        parts.beam((-.42, 1.1, 0), (-.62, .67, .02), .095, TEAL, base)
        parts.beam((.34, 1.12, 0), (.88, 1.5, 0), .095, TEAL, tip)
        parts.ellipsoid((.91, 1.55, 0), (.14, .18, .12), GOLD, tip, tilt=-30)
        for y in (.69, .92): parts.ellipsoid((0, y, .26), (.055, .055, .025), GOLD, base)
    elif mode == 'bind':
        parts.ellipsoid((0, 1.12, 0), (.45, .63, .34), GOLD, base)
        parts.ellipsoid((0, 1.66, .08), (.34, .32, .29), GOLD, base)
        parts.ellipsoid((0, .98, .28), (.30, .39, .10), CREAM, base)
        for x in (-.14, .14):
            parts.ellipsoid((x, 1.7, .338), (.072, .10, .035), INK, base)
            parts.ellipsoid((x-.02, 1.73, .368), (.021, .029, .014), CREAM, base)
            parts.beam((x, .12, 0), (x, .55, 0), .045, CORAL, base)
            parts.ellipsoid((x, .09, .1), (.14, .065, .18), CORAL, base)
        parts.ellipsoid((0, 1.52, .40), (.11, .095, .19), CORAL, base)
        for side in (-1, 1):
            weights = rigid(1 if side < 0 else 2)
            for feather in range(4):
                parts.ellipsoid((side*(.65+.10*feather), 1.20-.105*feather, 0),
                                (.42, .12, .16), CORAL if feather%2 else GOLD, weights, tilt=side*(24+feather*13))
        for i in range(3):
            parts.ellipsoid(((i-1)*.08, 1.97, -.025), (.07, .20, .08), CORAL, base, tilt=(i-1)*18)
    elif mode == 'names':
        parts.beam((0, .12, 0), (0, 1.62, 0), .07, (.14, .46, .25), flower_weights)
        for side, y in [(-1, .6), (1, 1.02)]:
            parts.ellipsoid((side*.28, y, 0), (.36, .12, .08), TEAL, flower_weights, tilt=side*32)
        for i in range(10):
            angle = TAU*i/10
            parts.ellipsoid((.43*math.sin(angle), 1.88+.43*math.cos(angle), 0),
                            (.18, .32, .13), PURPLE if i%2 else (.74, .43, .80), tip, tilt=-math.degrees(angle))
        parts.ellipsoid((0, 1.88, .16), (.32, .32, .17), GOLD, tip)
        for x in (-.105, .105): parts.ellipsoid((x, 1.94, .315), (.045, .064, .025), INK, tip)
        parts.ellipsoid((0, 1.77, .323), (.085, .035, .02), CORAL, tip)
    elif mode == 'multi':
        for i in range(23):
            y = .12 + i*.09
            parts.beam((.06*math.sin(y*3), y, 0), (.06*math.sin((y+.09)*3), y+.09, 0),
                       .07, (.12, .50, .32), blend)
        for i in range(7):
            y = .47+i*.23
            side = -1 if i%2 else 1
            length = .56-.035*i
            parts.ellipsoid((side*length*.52, y, 0), (length*.65, .13, .075),
                            TEAL if i%2 else (.40, .75, .34), blend, tilt=side*29)
        parts.ellipsoid((0, 2.1, 0), (.13, .27, .085), (.57, .81, .36), blend)
        for x, y, r in [(-.83, .65, .065), (.75, 1.38, .09), (-.65, 1.93, .045)]:
            parts.ellipsoid((x, y, -.08), (r, r, r), (.56, .82, .84), base)
    elif mode == 'dual':
        bands = []
        for row in range(33):
            y = .15 + row*2/32
            band = []
            for i in range(24):
                angle = TAU*i/24
                radius = .32+.045*math.cos(angle*4)
                derivative = -.18*math.sin(angle*4)
                color = [TEAL, GOLD, CORAL, PURPLE][(i//6)%4]
                band.append(parts.vertex((radius*math.cos(angle), y, radius*math.sin(angle)),
                                         (radius*math.cos(angle)+derivative*math.sin(angle), 0,
                                          radius*math.sin(angle)-derivative*math.cos(angle)), color, blend))
            bands.append(band)
        for low, high in zip(bands, bands[1:]):
            for i in range(24): parts.faces.append([low[i], high[i], high[(i+1)%24], low[(i+1)%24]])
        parts.ellipsoid((0, .15, 0), (.365, .13, .365), GOLD, blend)
        parts.ellipsoid((0, 2.15, 0), (.365, .13, .365), GOLD, blend)
        for y in (.17, 2.13): parts.ring((0, y, 0), .35, .035, CREAM, blend)
    elif mode == 'translate':
        parts.ellipsoid((0, .53, 0), (.47, .39, .33), CORAL, base)
        for x in (-.29, .29):
            parts.ellipsoid((x, .16, .03), (.19, .13, .27), INK, base)
            parts.ellipsoid((x, .58, .30), (.06, .06, .025), GOLD, base)
        # Keep enough tube inside the fixed collar at maximum extension.
        parts.beam((0, .25, 0), (0, 1.18, 0), .13, CREAM, tip)
        for y in (.77, .90): parts.ring((0, y, 0), .185, .045, INK, base)
        parts.ellipsoid((0, 1.30, 0), (.38, .29, .29), TEAL, tip)
        parts.ellipsoid((0, 1.31, .26), (.23, .19, .09), CREAM, tip)
        parts.ellipsoid((0, 1.31, .34), (.10, .13, .045), INK, tip)
        parts.ellipsoid((-.032, 1.35, .38), (.03, .04, .016), CREAM, tip)
        parts.beam((0, 1.57, 0), (0, 1.77, 0), .025, GOLD, tip)
        parts.ellipsoid((0, 1.8, 0), (.075, .075, .075), CORAL, tip)
    elif mode == 'rotation':
        parts.beam((0, .13, -.04), (0, 1.25, -.04), .055, CREAM, base)
        for blade in range(4):
            angle = TAU*blade/4
            color = [CORAL, GOLD, TEAL, PURPLE][blade]
            def vertex(r, side, front):
                theta = angle-.6*r
                width = .28*math.sin(math.pi*r)
                x, y = .035+1.0*r, side*width
                return parts.vertex((x*math.cos(theta)-y*math.sin(theta),
                                     1.25+x*math.sin(theta)+y*math.cos(theta),
                                     .10*math.sin(math.pi*r)+front*.035),
                                    (0, 0, front), color, tip)
            front_rows, back_rows = [], []
            for i in range(1, 12):
                r = i/12
                front_rows.append([vertex(r, -1, 1), vertex(r, 1, 1)])
                back_rows.append([vertex(r, -1, -1), vertex(r, 1, -1)])
            for rows, reverse in [(front_rows, False), (back_rows, True)]:
                for low, high in zip(rows, rows[1:]):
                    face = [low[0], high[0], high[1], low[1]]
                    parts.faces.append(list(reversed(face)) if reverse else face)
            for front, back, next_front, next_back in zip(front_rows, back_rows, front_rows[1:], back_rows[1:]):
                parts.flat_face([front[0], back[0], next_back[0], next_front[0]])
                parts.flat_face([front[1], next_front[1], next_back[1], back[1]])
            parts.flat_face([front_rows[0][0], front_rows[0][1], back_rows[0][1], back_rows[0][0]])
            parts.flat_face([front_rows[-1][0], back_rows[-1][0], back_rows[-1][1], front_rows[-1][1]])
        parts.ellipsoid((0, 1.25, .09), (.20, .20, .14), GOLD, tip)

    skeleton = UsdSkel.Skeleton.Define(stage, '/World/Rig/Skeleton')
    skeleton.CreateJointsAttr(joints)
    skeleton.CreateBindTransformsAttr([Gf.Matrix4d(1).SetTranslate(Gf.Vec3d(*point)) for point in origins])
    local = [Gf.Vec3f(*point) if parent < 0 else Gf.Vec3f(*(point[i]-origins[parent][i] for i in range(3)))
             for point, parent in zip(origins, parents)]
    skeleton.CreateRestTransformsAttr([Gf.Matrix4d(1).SetTranslate(Gf.Vec3d(point)) for point in local])
    if mode == 'names': skeleton.CreateJointNamesAttr(['Ground', 'Sway', 'Blossom'])
    _, binding = parts.mesh(stage, count)
    if mode == 'dual': binding.CreateSkinningMethodAttr('dualQuaternion')
    animation = UsdSkel.Animation.Define(stage, '/World/Rig/Animation')
    animation.CreateJointsAttr(joints)
    translations = animation.CreateTranslationsAttr()
    rotations = animation.CreateRotationsAttr()
    animation.CreateScalesAttr([Gf.Vec3h(1)]*count)
    def quat(axis, degrees): return Gf.Quatf(Gf.Rotation(Gf.Vec3d(*axis), degrees).GetQuat())
    def pose(u):
        if u == 1: u = 0  # Preserve exact endpoint arrays, including quaternion signs.
        sine, cosine = math.sin(TAU*u), math.cos(TAU*u)
        t, q = list(local), [Gf.Quatf(1)]*count
        if mode == 'rest':
            q[1] = quat((0, 0, 1), 12+30*sine)
            t[0] = Gf.Vec3f(0, .035*(1-cosine), 0)
        elif mode == 'bind':
            q[1], q[2] = quat((0, 0, 1), -22-25*sine), quat((0, 0, 1), 22+25*sine)
            t[0] = Gf.Vec3f(0, .07*(1-cosine), 0)
        elif mode == 'names':
            q = [quat((0, 0, 1), 8*sine), quat((0, 0, 1), 17*math.sin(TAU*u+.5)), quat((0, 0, 1), -12*math.sin(TAU*u+.9))]
        elif mode == 'multi':
            q[0], q[1] = quat((0, 1, 0), 7*sine), quat((0, 0, 1), 38*sine)
        elif mode == 'dual':
            q[1] = quat((0, 1, 0), 135*sine)*quat((0, 0, 1), 14*math.sin(TAU*u))
        elif mode == 'translate':
            t[1] = local[1] + Gf.Vec3f(0, .34*(1-cosine), 0)
        elif mode == 'rotation': q[1] = quat((0, 0, 1), 360*u)
        return t, q
    default_t, default_q = pose(.125)
    translations.Set(default_t)
    rotations.Set(default_q)
    for frame in range(1, 98, 2):
        t, q = pose((frame-1)/96)
        translations.Set(t, frame)
        rotations.Set(q, frame)
    UsdSkel.BindingAPI.Apply(root.GetPrim()).CreateAnimationSourceRel().SetTargets([animation.GetPath()])
    box(stage, '/World/Base', (0, -.08, 0), (.13, .20, .25), (2.8, .16, 1.25))
    box(stage, '/World/BaseTrim', (0, .012, 0), accent, (2.65, .025, 1.10))
    camera = UsdGeom.Camera.Define(stage, '/World/Camera')
    camera.CreateFocalLengthAttr(48)
    camera.CreateHorizontalApertureAttr(36)
    camera.CreateVerticalApertureAttr(27)
    camera.AddTransformOp().Set(Gf.Matrix4d().SetLookAt(Gf.Vec3d(2.5, 2.1, 7.8), Gf.Vec3d(0, 1.12, 0), Gf.Vec3d(0, 1, 0)).GetInverse())
    checks = [('Valid joint hierarchy', lambda s: list(UsdSkel.Skeleton.Get(s, '/World/Rig/Skeleton').GetJointsAttr().Get()) == joints),
              ('Skin binds to skeleton', lambda s: bool(UsdSkel.BindingAPI(s.GetPrimAtPath('/World/Rig/Surface')).GetSkeletonRel().GetTargets())),
              ('Loop endpoints match', lambda s: all(s.GetPrimAtPath('/World/Rig/Animation').GetAttribute(attr).Get(1) == s.GetPrimAtPath('/World/Rig/Animation').GetAttribute(attr).Get(97) for attr in ('translations', 'rotations')))]
    if mode == 'rest': checks.append(('Joint-local rest transforms', lambda s: len(UsdSkel.Skeleton.Get(s, '/World/Rig/Skeleton').GetRestTransformsAttr().Get()) == count))
    if mode == 'bind': checks.append(('Skeleton-space bind transforms', lambda s: len(UsdSkel.Skeleton.Get(s, '/World/Rig/Skeleton').GetBindTransformsAttr().Get()) == count))
    if mode == 'names': checks.append(('Joint display names authored', lambda s: list(UsdSkel.Skeleton.Get(s, '/World/Rig/Skeleton').GetJointNamesAttr().Get()) == ['Ground', 'Sway', 'Blossom']))
    if mode in ('multi', 'dual'): checks.append(('Two normalized joint influences', lambda s: UsdSkel.BindingAPI(s.GetPrimAtPath('/World/Rig/Surface')).GetJointWeightsPrimvar().GetElementSize() == 2))
    if mode == 'dual': checks.append(('Dual quaternion skinning method', lambda s: s.GetPrimAtPath('/World/Rig/Surface').GetAttribute('primvars:skel:skinningMethod').Get() == 'dualQuaternion'))
    if mode in ('translate', 'rotation'): checks.append(('Forty-nine transform samples', lambda s: s.GetPrimAtPath('/World/Rig/Animation').GetAttribute('translations' if mode == 'translate' else 'rotations').GetNumTimeSamples() == 49))
    finish(name, label, 'Skeletal animation', stage, path, ['UsdSkel', mode], checks,
           expected='A four-second skinned performance with matching loop endpoints; compare deformation against native UsdSkel.BakeSkinning')
