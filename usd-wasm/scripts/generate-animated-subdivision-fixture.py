#!/usr/bin/env python3
"""Author "Pip and Pop": a five-second subdivision magic trick on a little stage.

Pip, a soft teal robot lit from inside, winks at the audience and presents Pop, a
tangerine pebble sitting on a spring. Pop crouches, launches, somersaults and lands as
a crisp cube. Pip gasps, stiffens in shock and bursts out laughing; Pop takes a proud
spin and melts back into a pebble. Frames 1..121 at 24 fps form a seamless loop.

What each animated subdivision feature demonstrates:

* /World/Pip/Shell -- holeIndices (int[], held between samples). Eyes and mouth are hole
  faces over an emissive core, so the wink, blink, gasp and laughing mouth are pure
  topology-tag changes. The mouth row of the cage is bent into a smile, so the same
  three hole faces read as a grin. Crease/corner sharpness "stiffens" Pip in shock.
* /World/Pop/Morph -- an eight-point cube cage whose points never change. Only crease
  and corner sharpness animate: corners sharpen first and edges follow; on the way back
  edges soften before corners, so the two tags are visibly distinct.

Everything else (squash and stretch, follow-through, the spring) is ordinary transform
animation, baked from eased keys so playback looks the same in every viewer. Every
animated attribute's default equals its frame-1 sample.

Run with native OpenUSD Python:
  PYTHONPATH=/Users/herbst/OpenUSD-26.05-native/lib/python /usr/local/bin/python3 \\
    usd-wasm/scripts/generate-animated-subdivision-fixture.py

Re-running writes only this stage and its manifest entry; the studio fixtures are untouched.
"""
import importlib.util
import itertools
import json
import math
from pathlib import Path
from pxr import Gf, Usd, UsdGeom

ROOT = Path(__file__).resolve().parents[1]
PATH = 'coverage/curved-surfaces/animated-subdivision-buddies.usda'
ID = 'curved-animated-subdivision-buddies'
spec = importlib.util.spec_from_file_location('studio', Path(__file__).with_name('generate-curved-studio-fixtures.py'))
studio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(studio)

FIRST, LAST = 1, 121
PERIOD = LAST - FIRST
FRAMES = range(FIRST, LAST + 1)
# Baked samples that linear interpolation reproduces this closely (metres or scale
# factors, and degrees) are dropped, keeping the file small without visible change.
TOLERANCE, ANGLE_TOLERANCE = 2e-3, .25


# --- animation toolkit ----------------------------------------------------------------

def mix(a, b, t):
    if isinstance(a, tuple): return tuple(x + (y - x) * t for x, y in zip(a, b))
    return a + (b - a) * t


def distance(a, b):
    if isinstance(a, tuple): return max(abs(x - y) for x, y in zip(a, b))
    return abs(a - b)


def ease(kind, t):
    """How motion arrives at a key: 'in' accelerates (falls, launches), 'out' decelerates
    (rises, recoveries), 'smooth' does both, 'hold' steps when the key is reached."""
    return {'linear': t, 'in': t * t, 'out': 1 - (1 - t) ** 2, 'smooth': t * t * (3 - 2 * t),
            'hold': float(t >= 1)}[kind]


def track(*keys, cycle=0):
    """A channel through (frame, value[, easing]) keys covering the whole loop. The last
    value must equal the first plus `cycle` (e.g. 360 for a full extra turn)."""
    keys = [(k[0], k[1], k[2] if len(k) > 2 else 'smooth') for k in keys]
    assert keys[0][0] == FIRST and keys[-1][0] == LAST and keys[-1][1] == (keys[0][1] + cycle if cycle else keys[0][1]), keys
    def at(frame):
        loops, frame = divmod(frame - FIRST, PERIOD)  # wrap, so lagged readers see the loop
        frame += FIRST
        for (f0, v0, _), (f1, v1, kind) in zip(keys, keys[1:]):
            if frame <= f1: return mix(v0, v1, ease(kind, (frame - f0) / (f1 - f0))) + loops * cycle
    return at


def lag(channel, frames, gain):
    """Follow-through: a dependent part trails its driver by `frames` and swings by the
    difference, so it settles exactly when the driver does (and still loops)."""
    return lambda frame: gain * (channel(frame - frames) - channel(frame))


def bake(attr, channel, cast=float, tolerance=TOLERANCE):
    """Sample every frame, keep only samples that linear interpolation would not
    reproduce, and author the frame-1 value as the default for non-animated readers."""
    values = [(f, channel(f)) for f in FRAMES]
    attr.Set(cast(values[0][1]))
    if all(distance(v, values[0][1]) < 1e-9 for _, v in values): return
    kept = [values[0]]
    for i in range(1, len(values) - 1):
        (f0, a), (f1, b) = kept[-1], values[i + 1]
        skipped = values[f0 - FIRST + 1:i + 1]
        if any(distance(v, mix(a, b, (f - f0) / (f1 - f0))) > tolerance for f, v in skipped):
            kept.append(values[i])
    kept.append(values[-1])
    for frame, value in kept: attr.Set(cast(value), frame)


def r(value): return round(value, 5) + 0.


def vec3d(v): return Gf.Vec3d(*map(r, v))


def vec3f(v): return Gf.Vec3f(*map(r, v))


def xform(stage, path, translate=None, rotate=(), scale=None):
    """Xform with ops in USD's order translate -> rotations -> scale. Each argument is a
    constant or a channel; rotations are ('X'|'Y'|'Z', degrees-or-channel) pairs."""
    prim = UsdGeom.Xform.Define(stage, path)
    animate(prim.AddTranslateOp(), translate or (0, 0, 0), vec3d)
    for axis, value in rotate:
        animate(getattr(prim, f'AddRotate{axis}Op')(), value, r, ANGLE_TOLERANCE)
    if scale is not None: animate(prim.AddScaleOp(), scale, vec3f)
    return prim


def animate(op, value, cast, tolerance=TOLERANCE):
    if callable(value): bake(op.GetAttr(), value, cast, tolerance)
    else: op.Set(cast(value))


# --- geometry -------------------------------------------------------------------------

def lattice_box(xs, ys, zs):
    """Welded quad cage over a box whose cells follow the breakpoints on each axis.
    Returns faces keyed by (side, u cell, v cell), the twelve box-edge crease chains
    and the eight corner vertices; `ids` maps lattice coordinates to point indices."""
    axes = (xs, ys, zs)
    points, ids, counts, indices, faces = [], {}, [], [], {}
    def vertex(key):
        if key not in ids:
            ids[key] = len(points)
            points.append(tuple(axes[a][key[a]] for a in range(3)))
        return ids[key]
    # (side, normal axis, high end?, u axis, v axis) with u x v pointing outwards, so
    # every quad winds counter-clockwise seen from outside.
    for name, n, high, u, v in [('front', 2, 1, 0, 1), ('back', 2, 0, 1, 0), ('right', 0, 1, 1, 2),
                                ('left', 0, 0, 2, 1), ('top', 1, 1, 2, 0), ('bottom', 1, 0, 0, 2)]:
        for j in range(len(axes[v]) - 1):
            for i in range(len(axes[u]) - 1):
                quad = []
                for du, dv in ((0, 0), (1, 0), (1, 1), (0, 1)):
                    key = [0, 0, 0]
                    key[n], key[u], key[v] = high * (len(axes[n]) - 1), i + du, j + dv
                    quad.append(vertex(tuple(key)))
                faces[name, i, j] = len(counts)
                counts.append(4)
                indices += quad
    ends = [(0, len(a) - 1) for a in axes]
    chains = []
    for a in range(3):
        b, c = [k for k in range(3) if k != a]
        for eb, ec in itertools.product(ends[b], ends[c]):
            chain = []
            for t in range(len(axes[a])):
                key = [0, 0, 0]
                key[a], key[b], key[c] = t, eb, ec
                chain.append(ids[tuple(key)])
            chains.append(chain)
    corners = [ids[key] for key in itertools.product(*ends)]
    return points, counts, indices, faces, chains, corners, ids


def coil(turns, segments, sides, radius, wire, height):
    """Helix tube for Pop's spring: rings of `sides` points swept along the helix.
    Open ends hide inside the base plate and the cushion."""
    rings = turns * segments + 1
    points = []
    for k in range(rings):
        angle = math.tau * k / segments
        centre = (radius * math.cos(angle), height * k / (rings - 1), radius * math.sin(angle))
        outward = (math.cos(angle), 0, math.sin(angle))
        tangent = studio.norm((-radius * math.sin(angle) * math.tau / segments, height / (rings - 1),
                               radius * math.cos(angle) * math.tau / segments))
        binormal = studio.cross(tangent, outward)
        for s in range(sides):
            phi = math.tau * s / sides
            points.append(studio.add(centre, studio.add(studio.mul(outward, wire * math.cos(phi)),
                                                         studio.mul(binormal, wire * math.sin(phi)))))
    counts, indices = [], []
    for k in range(rings - 1):
        for s in range(sides):
            counts.append(4)
            indices += [k * sides + s, k * sides + (s + 1) % sides, (k + 1) * sides + (s + 1) % sides, (k + 1) * sides + s]
    # Flip the winding if the first quad faces into the wire.
    a, b, d = (points[i] for i in (indices[0], indices[1], indices[3]))
    if studio.dot(studio.cross(studio.sub(b, a), studio.sub(d, a)), studio.sub(a, (radius, 0, 0))) < 0:
        indices = [i for o in range(0, len(indices), 4) for i in reversed(indices[o:o + 4])]
    return points, counts, indices


def sphere(stage, path, center, radius, material, color, scale=(1, 1, 1)):
    prim = UsdGeom.Sphere.Define(stage, path)
    prim.CreateRadiusAttr(radius)
    prim.AddTranslateOp().Set(vec3d(center))
    prim.AddScaleOp().Set(vec3f(scale))
    studio.finish(prim, material, color)
    return prim


def capsule(stage, path, center, radius, height, axis, material, color):
    prim = UsdGeom.Capsule.Define(stage, path)
    prim.CreateRadiusAttr(radius)
    prim.CreateHeightAttr(height)
    prim.CreateAxisAttr(axis)
    prim.AddTranslateOp().Set(vec3d(center))
    studio.finish(prim, material, color)
    return prim


def cylinder(stage, path, center, radius, height, material, color):
    prim = UsdGeom.Cylinder.Define(stage, path)
    prim.CreateRadiusAttr(radius)
    prim.CreateHeightAttr(height)
    prim.CreateAxisAttr('Y')
    prim.AddTranslateOp().Set(vec3d(center))
    studio.finish(prim, material, color)
    return prim


def sharpness_tags(mesh, chains, corners, crease, corner):
    """Author constant crease/corner topology and bake animated sharpness arrays."""
    mesh.CreateCreaseIndicesAttr([i for chain in chains for i in chain])
    mesh.CreateCreaseLengthsAttr([len(chain) for chain in chains])
    mesh.CreateCornerIndicesAttr(corners)
    bake(mesh.CreateCreaseSharpnessesAttr(), crease, lambda s: [round(s, 3) + 0.] * len(chains), .01)
    bake(mesh.CreateCornerSharpnessesAttr(), corner, lambda s: [round(s, 3) + 0.] * len(corners), .01)


def level(amount, limit=8.):
    """Map a perceived 0..1 sharpening to a sharpness value. Each unit of sharpness keeps
    the sharp rule for one more subdivision level, halving the remaining rounding, so the
    visible change is logarithmic: amount .5 -> 1, .75 -> 2, .875 -> 3 ..."""
    return min(limit, -math.log2(max(1 - amount, 2 ** -limit)))


# --- stage ------------------------------------------------------------------------------

STAGE_TOP = .3
PIP_AT = (-1.15, STAGE_TOP, .1)
POP_AT = (1.25, STAGE_TOP, .2)
SHELL_Y = 1.33      # Pip's shell centre above its feet
POP_HALF = .65      # Pop's cube cage half-size
COIL_HEIGHT = .5
SEAT = .07 + .1     # base plate plus cushion thickness under Pop


def build_stage(stage, looks):
    """Oval platform, a cyclorama that sweeps into it, and footlights along the front."""
    profile = [(3.0, 0), (3.18, .03), (3.24, .15), (3.14, .27), (2.96, STAGE_TOP)]
    pts, counts, indices, faces, vid = studio.revolve(profile, 32)
    platform = studio.subd(stage, '/World/Stage', pts, counts, indices,
                           creases=[(studio.ring_chain(vid, 4, 32), 2.)])
    platform.AddScaleOp().Set(Gf.Vec3f(1, 1, .62))
    studio.finish(platform, looks['sand'], (.92, .84, .7))

    # Cyclorama: a curved wall whose lowest rows bend forward into the floor. Vertex
    # colours fade from dusky rose to midnight and darken towards the wings.
    columns, angle = 16, math.radians(66)
    rows = [(.86, STAGE_TOP - .01), (.95, .5), (1., 1.1), (1., 2.2), (1., 3.5)]
    points, colors = [], []
    low, high = (.56, .27, .42), (.06, .08, .2)
    for row, (inset, y) in enumerate(rows):
        for c in range(columns + 1):
            theta = -angle + 2 * angle * c / columns
            points.append((2.85 * inset * math.sin(theta), y, -1.72 * inset * math.cos(theta) + .25))
            shade = 1 - .45 * (theta / angle) ** 2
            colors.append(studio.mul(studio.lerp(low, high, (y - STAGE_TOP) / (rows[-1][1] - STAGE_TOP)), shade))
    counts, indices = [], []
    for row in range(len(rows) - 1):
        for c in range(columns):
            a = row * (columns + 1) + c
            counts.append(4)
            indices += [a, a + 1, a + columns + 2, a + columns + 1]
    wall = studio.subd(stage, '/World/Cyclorama', points, counts, indices)
    wall.CreateDoubleSidedAttr(True)
    wall.CreateDisplayColorPrimvar(UsdGeom.Tokens.vertex).Set([vec3f(c) for c in colors])
    studio.finish(wall, looks['dusk'], low)

    for n in range(7):
        theta = math.radians(-54 + 18 * n)
        sphere(stage, f'/World/Footlight{n + 1}', (2.86 * math.sin(theta), STAGE_TOP, 2.86 * .62 * math.cos(theta)),
               .085, looks['footlight'], (1, .85, .6), (1, .7, 1))


# --- Pip ----------------------------------------------------------------------------------

# Pip's face lives on the front of the cage. Columns: the eyes are the second and fourth
# cells, so the left eye face is centred at local (-.36, .36) where the tests probe it.
XS = [-.9, -.54, -.18, .18, .54, .9]
YS = [-.95, -.55, -.18, .04, .18, .54, .84, 1.12]  # belly, chin, mouth, cheek gap, eyes, brow, crown
ZS = [-.78, -.26, .26, .78]
LEFT_EYE, RIGHT_EYE = ('front', 1, 4), ('front', 3, 4)
GRIN = [('front', 1, 2), ('front', 2, 2), ('front', 3, 2)]
GASP = [('front', 2, 2)]


def shape_pip(points, ids):
    """Turn the box lattice into a friendly gumdrop: wider at the belly, domed crown,
    softly bulging face, and the mouth row bent into a smile: its middle drops and its
    corners lift, the lower lip more than the upper, so the open cells form a grin."""
    last = [len(XS) - 1, len(YS) - 1, len(ZS) - 1]
    shaped = list(points)
    for key, index in ids.items():
        x, y, z = points[index]
        belly = 1 + .07 * max(0, -y)
        x, z = x * belly, z * belly
        if key[1] == last[1]:  # crown
            y += .1 * (1 - (x / .9) ** 2) * (1 - (z / .78) ** 2)
        if key[2] == last[2]:  # face
            z += .06 * (1 - (x / .9) ** 2) * (1 - ((y - .08) / 1.04) ** 2)
            if abs(x) <= .55 and key[1] in (2, 3):
                drop, lift = {2: (.13, .2), 3: (.05, .1)}[key[1]]  # lower lip, upper lip
                y += lift * (x / .54) ** 2 - drop
        shaped[index] = (x, y, z)
    return shaped


def build_pip(stage, looks):
    # Dope sheet. Easing names how a motion arrives at its key.
    turn = track((1, 14), (12, 14), (20, 0), (33, 0), (39, 22), (58, 22), (62, 6, 'out'), (86, 0),
                 (104, 14), (121, 14))
    lean = track((1, 0), (12, 0), (20, -5), (25, 5, 'out'), (33, 0), (40, 0), (44, -4, 'out'), (57, -2),
                 (61, 8, 'out'), (68, 0), (71, 3), (74, -2), (77, 3), (80, -2), (83, 2), (90, 0), (121, 0))
    squash = track((1, 1), (8, 1.025), (16, 1), (33, 1), (40, .84, 'in'), (43, 1.1, 'out'), (49, 1),
                   (58, 1), (61, 1.1, 'out'), (64, .9, 'in'), (68, 1),
                   (70, .95), (72, 1), (74, .95), (76, 1), (78, .95), (80, 1), (82, .96), (85, 1),
                   (110, 1), (115, 1.02), (121, 1))
    hop = track((1, 0), (58, 0), (62, .2, 'out'), (65, 0, 'in'), (121, 0))
    recoil = track((1, 0), (58, 0), (64, -.14, 'out'), (90, -.14), (110, 0), (121, 0))
    xform(stage, '/World/Pip',
          translate=lambda f: (PIP_AT[0] + recoil(f), PIP_AT[1] + hop(f), PIP_AT[2]),
          rotate=[('Y', turn), ('Z', lean)],
          scale=lambda f: (squash(f) ** -.5, squash(f), squash(f) ** -.5))

    points, counts, indices, faces, chains, corners, ids = lattice_box(XS, YS, ZS)
    shell = studio.subd(stage, '/World/Pip/Shell', shape_pip(points, ids), counts, indices)
    shell.AddTranslateOp().Set(Gf.Vec3d(0, SHELL_Y, 0))
    shell.CreateDoubleSidedAttr(True)
    studio.finish(shell, looks['teal'], (.03, .55, .52))
    # Soft toy by default; the shock at frame 61 stiffens the edges, corners a beat later.
    sharpness_tags(shell, chains, corners,
                   track((1, .25), (57, .25), (61, 3., 'out'), (66, 3.), (76, .25), (121, .25)),
                   track((1, .25), (58, .25), (63, 4., 'out'), (68, 4.), (80, .25), (121, .25)))

    # Integer arrays are held between samples, so each sample is an instant expression.
    eyes, closed = [LEFT_EYE, RIGHT_EYE], []
    expressions = [(1, eyes + GRIN), (25, [RIGHT_EYE] + GRIN),           # wink at the audience
                   (33, eyes + GRIN), (37, eyes),                           # concentrate, lips pressed
                   (43, eyes + GRIN), (47, eyes),                           # "ta-da!", then hold breath
                   (58, eyes + GASP), (67, eyes + GRIN),                    # gasp, recover
                   (69, GRIN), (72, closed), (75, GRIN), (78, closed),     # laugh with eyes squeezed shut
                   (81, GRIN), (84, eyes + GRIN),
                   (100, GRIN), (103, eyes + GRIN)]                          # an ordinary blink
    holes = shell.CreateHoleIndicesAttr(sorted(faces[f] for f in expressions[0][1]))
    for frame, open_faces in expressions:
        holes.Set(sorted(faces[f] for f in open_faces), frame)
    holes.Set(sorted(faces[f] for f in expressions[0][1]), LAST)

    # Warm core seen through every open hole face.
    sphere(stage, '/World/Pip/Glow', (0, SHELL_Y + .085, 0), 1, looks['ember'], (1, .62, .2), (.8, .98, .68))

    look_x = track((1, 0), (14, 0), (18, .06), (24, 0), (36, 0), (39, .07), (95, .07), (104, .05), (121, 0))
    look_y = track((1, 0), (39, 0), (44, -.04), (49, .07), (57, -.05, 'in'), (61, 0), (95, 0), (121, 0))
    pupil = track((1, 1), (57, 1), (60, .68, 'out'), (66, .68), (70, 1), (121, 1))
    brow_lift = track((1, 0), (12, 0), (18, .07), (24, .03), (33, .03), (38, -.02), (43, .08), (47, .02),
                      (58, .13, 'out'), (67, .05), (70, .09), (82, .09), (95, 0), (121, 0))
    wink = track((1, 0), (22, 0), (25, 1, 'out'), (31, 1), (34, 0), (121, 0))
    # Laughing "^ ^" lids wait inside the glowing core and slide onto the face exactly
    # while the eye holes are closed (frames 69..83).
    lids = track((1, .55), (69, .83, 'hold'), (84, .55, 'hold'), (121, .55))
    for side, name in [(-1, 'Left'), (1, 'Right')]:
        winking = (lambda f: wink(f)) if side < 0 else (lambda f: 0)
        eye = xform(stage, f'/World/Pip/{name}Pupil',
                    translate=lambda f: (side * .36 + look_x(f), SHELL_Y + .36 + look_y(f), .72),
                    scale=lambda f: (pupil(f),) * 3)
        sphere(stage, f'{eye.GetPath()}/Iris', (0, 0, 0), .1, looks['ink'], (.03, .04, .08), (.9, 1.15, .45))
        sphere(stage, f'{eye.GetPath()}/Glint', (.035, .05, .04), .028, looks['glint'], (1, 1, 1))
        # Brows: raised in delight and surprise; the winking brow drops, inner end first.
        # (Channels are baked immediately, so closing over loop variables is safe here.)
        xform(stage, f'/World/Pip/{name}Brow',
              translate=lambda f: (side * .36, SHELL_Y + .7 + brow_lift(f) - .07 * winking(f), .82),
              rotate=[('Z', lambda f: side * 14 * winking(f))])
        capsule(stage, f'/World/Pip/{name}Brow/Bar', (0, 0, 0), .035, .17, 'X', looks['ink'], (.03, .04, .08))
        squint = xform(stage, f'/World/Pip/{name}LaughLid', translate=lambda f: (side * .36, SHELL_Y + .34, lids(f)))
        for half, tilt in [(-1, 32), (1, -32)]:
            stroke = xform(stage, f'{squint.GetPath()}/Stroke{"AB"[half > 0]}', translate=(half * .055, 0, 0), rotate=[('Z', tilt)])
            capsule(stage, f'{stroke.GetPath()}/Bar', (0, 0, 0), .03, .08, 'X', looks['ink'], (.03, .04, .08))
        sphere(stage, f'/World/Pip/{name}Cheek', (side * .7, SHELL_Y - .06, .8), .11, looks['blush'], (1, .45, .55), (1, .62, .35))

    # Arms swing from the shoulder; elbows and mittens trail it (follow-through).
    reach = {  # outward swing (0 hangs, 180 points up) and forward (-) / back (+) swing, degrees
        -1: (track((1, 16), (33, 16), (40, 30, 'in'), (43, 140, 'out'), (55, 128), (58, 128), (61, 55, 'out'),
                   (66, 45), (69, 18), (85, 18), (96, 16), (121, 16)),
             track((1, 0), (33, 0), (40, 45, 'in'), (43, 0, 'out'), (58, 0), (61, -75, 'out'), (66, -70),
                   (69, -48), (85, -48), (96, 0), (121, 0))),
        1: (track((1, 16), (12, 16), (19, 100, 'out'), (30, 92), (33, 92), (40, 30, 'in'), (43, 140, 'out'),
                  (55, 128), (58, 128), (61, 55, 'out'), (66, 45), (69, 18), (85, 18), (96, 16), (121, 16)),
            track((1, 0), (12, 0), (19, -20, 'out'), (33, -20), (40, 45, 'in'), (43, 0, 'out'), (58, 0),
                  (61, -75, 'out'), (66, -70), (69, -48), (85, -48), (96, 0), (121, 0))),
    }
    for side, name in [(-1, 'Left'), (1, 'Right')]:
        out, forward = reach[side]
        shoulder = xform(stage, f'/World/Pip/{name}Arm', translate=(side * .93, SHELL_Y - .12, 0),
                         rotate=[('X', forward), ('Z', lambda f: side * out(f))])
        capsule(stage, f'{shoulder.GetPath()}/Upper', (0, -.17, 0), .085, .2, 'Y', looks['cream'], (.95, .92, .84))
        elbow = xform(stage, f'{shoulder.GetPath()}/Elbow', translate=(0, -.34, 0),
                      rotate=[('X', lag(forward, 3, .5)),
                              ('Z', lambda f, sway=lag(out, 3, .45): side * (12 + sway(f)))])
        capsule(stage, f'{elbow.GetPath()}/Lower', (0, -.12, 0), .08, .14, 'Y', looks['cream'], (.95, .92, .84))
        sphere(stage, f'{elbow.GetPath()}/Mitten', (0, -.3, 0), .16, looks['coral'], (.98, .38, .32), (1, 1.05, .9))
        capsule(stage, f'/World/Pip/{name}Leg', (side * .42, .3, 0), .09, .14, 'Y', looks['brass'], (.95, .7, .3))
        sphere(stage, f'/World/Pip/{name}Foot', (side * .44, .1, .07), .2, looks['coral'], (.98, .38, .32), (1.1, .5, 1.45))

    # The antenna bends against sideways motion and springs against squash.
    tip = lambda f: lag(lean, 4, 1.6)(f) + lag(recoil, 3, -160)(f)
    boing = lag(squash, 3, 1.8)
    antenna = xform(stage, '/World/Pip/Antenna', translate=(0, SHELL_Y + 1.15, 0), rotate=[('Z', tip)],
                    scale=lambda f: (1, max(.6, 1 + boing(f)), 1))
    sphere(stage, f'{antenna.GetPath()}/Collar', (0, 0, 0), .1, looks['brass'], (.95, .7, .3), (1, .5, 1))
    capsule(stage, f'{antenna.GetPath()}/Stem', (0, .2, 0), .028, .32, 'Y', looks['brass'], (.95, .7, .3))
    sphere(stage, f'{antenna.GetPath()}/Bulb', (0, .45, 0), .11, looks['bulb'], (1, .4, .45))
    return shell, faces


# --- Pop ------------------------------------------------------------------------------------

def build_pop(stage, looks):
    # Spring compression (1 = rest) and Pop's own squash; both ring down after the landing.
    spring = track((1, 1), (14, .96), (28, 1), (33, 1), (40, .5, 'in'), (44, 1.22, 'out'), (49, 1),
                   (57, 1), (59, .58, 'out'), (63, 1.12), (67, .94), (71, 1.03), (75, 1),
                   (96, 1), (100, .9), (106, 1), (121, 1))
    stretch = track((1, 1), (33, 1), (40, .84, 'in'), (43, 1.18, 'out'), (49, 1), (56, 1.1, 'in'),
                    (59, .78, 'out'), (63, 1.06), (67, 1), (93, 1), (98, .9), (104, 1.03), (108, 1), (121, 1))
    air = track((1, 0), (41, 0), (49, 1.25, 'out'), (57, 0, 'in'), (121, 0))
    flip = track((1, 0), (42, 0), (56, -360, 'linear'), (121, -360), cycle=-360)          # somersault
    face = track((1, -18), (22, -18), (30, 0), (69, 0), (83, 360), (104, 360), (116, 342), (121, 342), cycle=360)
    wobble = track((1, 0), (24, 0), (28, 10, 'out'), (34, 0), (93, 0), (95, 6), (97, -6), (99, 4), (101, -3), (103, 0), (121, 0))
    # Corners sharpen ahead of the edges; on the way back edges soften first.
    corner = track((1, 0), (43, 0), (51, 1), (91, 1), (103, 0), (121, 0))
    crease = track((1, 0), (46, 0), (55, 1), (85, 1), (97, 0), (121, 0))
    # How far the faces have flattened: the bottom rests lower and the face sits higher as
    # the pebble (face centres at about .84 of the cage) becomes a cube.
    flat = lambda f: .75 * crease(f) + .25 * corner(f)
    bottom = lambda f: POP_HALF * (.84 + .16 * flat(f))
    seat = lambda f: POP_AT[1] + SEAT + COIL_HEIGHT * spring(f)

    xform(stage, '/World/Pop',
          translate=lambda f: (POP_AT[0], seat(f) + bottom(f) * stretch(f) + air(f), POP_AT[2]),
          rotate=[('X', flip), ('Y', face), ('Z', wobble)],
          scale=lambda f: (stretch(f) ** -.5, stretch(f), stretch(f) ** -.5))
    # This six-face cage changes only its subdivision tags, so a points/transform
    # animation cannot accidentally hide a broken crease sync.
    points, counts, indices, _, chains, corners, _ = lattice_box(*[[-POP_HALF, POP_HALF]] * 3)
    morph = studio.subd(stage, '/World/Pop/Morph', points, counts, indices)
    studio.finish(morph, looks['tangerine'], (.98, .45, .12))
    sharpness_tags(morph, chains, corners, lambda f: level(crease(f)), lambda f: level(corner(f), 4.))
    features = xform(stage, '/World/Pop/Face', translate=lambda f: (0, 0, POP_HALF * (.78 + .21 * flat(f))))
    for side, name in [(-1, 'Left'), (1, 'Right')]:
        sphere(stage, f'{features.GetPath()}/{name}Eye', (side * .2, .1, 0), .075, looks['ink'], (.03, .04, .08), (1, 1.3, .5))
        sphere(stage, f'{features.GetPath()}/{name}Glint', (side * .2 + .025, .14, .03), .02, looks['glint'], (1, 1, 1))
    capsule(stage, f'{features.GetPath()}/Smile', (0, -.1, .035), .03, .1, 'X', looks['ink'], (.03, .04, .08))

    base = POP_AT
    UsdGeom.Xform.Define(stage, '/World/Springboard')
    cylinder(stage, '/World/Springboard/Base', (base[0], base[1] + .035, base[2]), .42, .07, looks['brass'], (.95, .7, .3))
    points, counts, indices = coil(4, 12, 6, .3, .05, COIL_HEIGHT)
    coil_mesh = studio.subd(stage, '/World/Springboard/Coil', points, counts, indices)
    coil_mesh.AddTranslateOp().Set(vec3d((base[0], base[1] + .07, base[2])))
    bake(coil_mesh.AddScaleOp().GetAttr(), lambda f: (1, spring(f), 1), vec3f)  # compress, never re-cage
    studio.finish(coil_mesh, looks['brass'], (.95, .7, .3))
    cushion = xform(stage, '/World/Springboard/Seat', translate=lambda f: (base[0], seat(f) - .05, base[2]))
    sphere(stage, f'{cushion.GetPath()}/Cushion', (0, 0, 0), .44, looks['teal'], (.03, .55, .52), (1, .14, 1))

    # "Pop!": sparks burst out of the landing and fade by shrinking (never to zero scale).
    burst = track((1, 0), (57, 0), (58, .05, 'hold'), (68, 1, 'out'), (69, 0, 'hold'), (121, 0))
    for n in range(8):
        theta = math.tau * (n + .5) / 8
        direction = (math.cos(theta), math.sin(theta) * .8 + .15, .35)
        xform(stage, f'/World/Spark{n + 1}',
              translate=lambda f: studio.add((POP_AT[0], POP_AT[1] + SEAT + COIL_HEIGHT + POP_HALF, POP_AT[2]),
                                                         studio.mul(direction, .55 + .9 * burst(f))),
              scale=lambda f: (max(.01, 4 * burst(f) * (1 - burst(f))),) * 3)
        sphere(stage, f'/World/Spark{n + 1}/Star', (0, 0, 0), .07, looks['spark'], (1, .85, .3), (1, 1, .6))
    return morph


# --- assembly and checks ----------------------------------------------------------------

def main():
    stage = Usd.Stage.CreateInMemory()
    stage.SetDefaultPrim(UsdGeom.Xform.Define(stage, '/World').GetPrim())
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y)
    UsdGeom.SetStageMetersPerUnit(stage, 1)
    stage.SetStartTimeCode(FIRST)
    stage.SetEndTimeCode(LAST)
    stage.SetTimeCodesPerSecond(24)
    stage.SetFramesPerSecond(24)
    look = studio.look
    looks = {
        'teal': look(stage, 'TealEnamel', (.03, .55, .52), rough=.3, coat=.8),
        'tangerine': look(stage, 'TangerineEnamel', (.98, .45, .12), rough=.28, coat=.9),
        'coral': look(stage, 'Coral', (.98, .38, .32), rough=.4, coat=.3),
        'cream': look(stage, 'Porcelain', (.95, .92, .84), rough=.38),
        'brass': look(stage, 'WarmBrass', (.95, .7, .3), rough=.3, metal=.6),
        'ink': look(stage, 'Ink', (.03, .04, .08), rough=.35, coat=.6),
        'blush': look(stage, 'Blush', (1, .45, .55), rough=.7),
        'sand': look(stage, 'StageSand', (.92, .84, .7), rough=.55),
        'dusk': look(stage, 'Cyclorama', (.56, .27, .42), rough=.9, primvar='displayColor'),
        'glint': look(stage, 'Glint', (1, 1, 1), rough=.2, emissive=(.8, .8, .8)),
        'ember': look(stage, 'Ember', (1, .62, .2), rough=.6, emissive=(1.8, .85, .2)),
        'bulb': look(stage, 'Bulb', (1, .4, .45), rough=.3, emissive=(1.6, .35, .4)),
        'footlight': look(stage, 'Footlight', (1, .85, .6), rough=.4, emissive=(1.4, 1.05, .6)),
        'spark': look(stage, 'Spark', (1, .85, .3), rough=.4, emissive=(2., 1.5, .35)),
    }
    build_stage(stage, looks)
    shell, faces = build_pip(stage, looks)
    build_pop(stage, looks)
    studio.camera(stage, (.42, .26, 1.5), margin=.9, focal=50)

    output = ROOT / 'tests/fixtures' / PATH
    stage.GetRootLayer().Export(str(output))
    check = Usd.Stage.Open(str(output))
    assert not check.GetCompositionErrors()
    for prim in check.Traverse():
        if prim.IsA(UsdGeom.Mesh):
            mesh = UsdGeom.Mesh(prim)
            points = mesh.GetPointsAttr().Get()
            assert UsdGeom.Mesh.ValidateTopology(mesh.GetFaceVertexIndicesAttr().Get(), mesh.GetFaceVertexCountsAttr().Get(), len(points))[0]
            assert all(math.isfinite(c) for p in points for c in p), prim.GetPath()
            assert not mesh.GetPointsAttr().GetNumTimeSamples(), 'cages stay still; only tags and transforms move'
        for attr in prim.GetAttributes():
            if attr.GetNumTimeSamples():
                first, default = attr.Get(FIRST), attr.Get(Usd.TimeCode.Default())
                assert first == default, f'{attr.GetPath()} default must match frame {FIRST}'
                last = attr.Get(LAST)
                if attr.GetName().startswith('xformOp:rotate'): first, last = first % 360, last % 360  # whole turns loop
                assert last == first, f'{attr.GetPath()} must loop'
    shell, morph = UsdGeom.Mesh(check.GetPrimAtPath('/World/Pip/Shell')), UsdGeom.Mesh(check.GetPrimAtPath('/World/Pop/Morph'))
    holes = shell.GetHoleIndicesAttr()
    left = faces[LEFT_EYE]
    assert left not in holes.Get(25) and all(left in holes.Get(f) for f in (1, 33, 121)), 'left-eye wink the tests probe'
    assert morph.GetCreaseSharpnessesAttr().Get(1) != morph.GetCreaseSharpnessesAttr().Get(61)
    assert max(morph.GetCreaseSharpnessesAttr().Get(61)) >= 8 and max(morph.GetCreaseSharpnessesAttr().Get(1)) == 0
    crease_samples = morph.GetCreaseSharpnessesAttr().GetNumTimeSamples()
    entry = {'id': ID, 'label': 'Pip and Pop', 'group': 'Subdivision', 'root': PATH, 'files': [PATH],
             'features': ['Catmull-Clark', 'animated hole faces', 'animated crease sharpness', 'animated corner sharpness', 'held topology samples'],
             'complexity': 'adaptive', 'thumbnailComplexity': 'veryhigh',
             'expected': {'native': 'Time-sampled mesh tags and holes resolve at authored frames.',
                          'needle': 'Pip winks, gasps and laughs through hole faces and stiffens in shock; Pop somersaults off its spring, '
                                    'sharpens from a smooth pebble into a cube (corners first) and melts back.'},
             'assertions': {'timeRange': [FIRST, LAST], 'framesPerSecond': 24, 'holeSamples': holes.GetNumTimeSamples(),
                            'creaseSamples': crease_samples, 'stationaryControlCage': '/World/Pop/Morph'}}
    manifest_path = output.with_name('manifest.json')
    manifest = [e for e in json.loads(manifest_path.read_text()) if e['id'] != ID]
    manifest.append(entry)
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    gprims = sum(1 for p in check.Traverse() if p.IsA(UsdGeom.Gprim))
    print(f'Authored {ID}: {gprims} gprims, {len(shell.GetFaceVertexCountsAttr().Get())} shell faces, '
          f'{holes.GetNumTimeSamples()} hole samples, {crease_samples} Pop crease samples')


if __name__ == '__main__':
    main()
