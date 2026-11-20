#!/usr/bin/env python3
"""Generate texture orientation, UV transform and color space conformance scenes.

Every scene is a unit quad (UV 0,0 at its bottom-left) with an unlit material, so
a correct renderer shows each texture value directly. Expected pixels come from
the published specifications, not from any renderer:

- UsdPreviewSurface, UsdUVTexture and UsdTransform2d: OpenUSD usdShaders
  (UsdTransform2d.osl: result = R(rotation) * (scale * in) + translation,
  counter-clockwise degrees; st (0,0) is the image's bottom-left).
- MaterialX stdlib 1.39: texcoord (0,0) is the image's bottom-left; tiledimage
  is image(texcoord * uvtiling - uvoffset); place2d and rotate2d follow
  NG_place2d_vector2 and mx_rotate_vector2 (clockwise for positive degrees);
  gltf_image follows NG_gltf_image_* in libraries/bxdf/gltf_pbr.mtlx.
- Color spaces: the MaterialX cmlib and OpenUSD Gf color space definitions.

The manifest stores, per scene, sample points in quad UV space and the expected
display-referred sRGB value (or chart cell) at each. Storm is a comparison, not
the reference: `--storm` renders every scene with usdrecord and writes where it
agrees or disagrees with the expectation to .cache/texture-conventions/.

Requires the native OpenUSD Python with MaterialX (PYTHONPATH=<native>/lib/python),
Pillow, oiiotool (OpenImageIO) and toktx (KTX-Software). --storm uses USD_STORM_ROOT
(default ~/OpenUSD-26.05-native) and fails unless usdrecord reports HdStormRendererPlugin;
USD_STORM_ARCH=x86_64 runs an Intel install under Rosetta.
"""
from pathlib import Path
import argparse, json, math, shutil, struct, subprocess, tempfile, zlib
from PIL import Image, PngImagePlugin
from pxr import Gf, Sdf, Sdr, Usd, UsdGeom, UsdShade, UsdUtils, Vt

ROOT = Path(__file__).resolve().parents[1] / 'tests/fixtures'
SUITE = 'texture-conventions'
OUT = ROOT / 'coverage' / SUITE
TEX = OUT / 'textures'
REG = Sdr.Registry()
T = Sdf.ValueTypeNames

# A 4x4 chart of 16 distinct sRGB colors, listed top row first as the image is viewed.
CHART = [
    (230, 25, 75), (60, 180, 75), (255, 225, 25), (0, 130, 200),
    (245, 130, 48), (145, 30, 180), (70, 240, 240), (240, 50, 230),
    (210, 245, 60), (250, 190, 212), (0, 128, 128), (220, 190, 255),
    (170, 110, 40), (255, 250, 200), (128, 0, 0), (0, 0, 128),
]
CHART_NAMES = ['red', 'green', 'yellow', 'blue', 'orange', 'purple', 'cyan', 'magenta',
               'lime', 'pink', 'teal', 'lavender', 'brown', 'beige', 'maroon', 'navy']
# Color space levels: columns are code values, rows are gray, red, green and blue.
LEVELS = [48, 112, 176, 240]
LEVEL_ROWS = [(1, 1, 1), (1, 0, 0), (0, 1, 0), (0, 0, 1)]
SIZE = 256
# Image default for constant addressing, linear, and its display value.
MX_DEFAULT = (0.5, 0.0, 0.5)

# ---------------------------------------------------------------- color math

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def linear_to_srgb(c):
    c = min(max(c, 0.0), 1.0)
    return c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055

def mat(m, v): return tuple(sum(m[r][k] * v[k] for k in range(3)) for r in range(3))

# Matrices to linear Rec.709 (D65), as in MaterialX libraries/cmlib.
P3_TO_709 = [[1.2249401, -0.2249404, 0.0], [-0.0420569, 1.0420571, 0.0], [-0.0196376, -0.0786361, 1.0982735]]
AP1_TO_709 = [[1.70505, -0.62179, -0.08326], [-0.13026, 1.14080, -0.01055], [-0.02400, -0.12897, 1.15297]]
IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]

# Decoding from stored code values to linear Rec.709, per color space name.
# Both MaterialX names and OpenUSD Gf names appear in real assets.
def decoder(space):
    srgb = lambda v: tuple(srgb_to_linear(x) for x in v)
    linear = lambda v: v
    g22 = lambda v: tuple(x ** 2.2 for x in v)
    table = {
        'srgb_texture': (srgb, IDENTITY), 'srgb_rec709_scene': (srgb, IDENTITY), 'sRGB': (srgb, IDENTITY),
        'lin_rec709': (linear, IDENTITY), 'lin_rec709_scene': (linear, IDENTITY),
        'raw': (linear, IDENTITY), 'data': (linear, IDENTITY),
        'g22_rec709': (g22, IDENTITY), 'g22_rec709_scene': (g22, IDENTITY),
        'srgb_displayp3': (srgb, P3_TO_709), 'srgb_p3d65_scene': (srgb, P3_TO_709),
        'lin_displayp3': (linear, P3_TO_709), 'lin_p3d65_scene': (linear, P3_TO_709),
        'acescg': (linear, AP1_TO_709), 'lin_ap1': (linear, AP1_TO_709), 'lin_ap1_scene': (linear, AP1_TO_709),
    }
    transfer, matrix = table[space]
    return lambda v: mat(matrix, transfer(v))

MX_DEFAULT_SRGB = None  # filled after linear_to_srgb is defined

def display(code, space):
    """Expected 8-bit display value of a stored code value shown unlit."""
    linear = decoder(space)(tuple(c / 255 for c in code))
    return [round(linear_to_srgb(c) * 255) for c in linear]

MX_DEFAULT_SRGB = tuple(round(linear_to_srgb(c) * 255) for c in MX_DEFAULT)

# ---------------------------------------------------------------- textures

def chart_pixels():
    cell = SIZE // 4
    return [CHART[(y // cell) * 4 + x // cell] for y in range(SIZE) for x in range(SIZE)]

def level_pixels():
    cell = SIZE // 4
    return [tuple(LEVELS[x // cell] * k for k in LEVEL_ROWS[y // cell]) for y in range(SIZE) for x in range(SIZE)]

def save_png(path, pixels, mode='RGB', chunks=()):
    image = Image.new('RGB', (SIZE, SIZE)); image.putdata(pixels)
    info = PngImagePlugin.PngInfo()
    for name, data in chunks: info.add(name, data)
    (image.convert('L') if mode == 'L' else image).save(path, pnginfo=info)

def save_tga(path, pixels, top_left):
    # Uncompressed 24-bit TGA. Descriptor bit 5 selects the top-left origin.
    header = struct.pack('<BBBHHBHHHHBB', 0, 0, 2, 0, 0, 0, 0, 0, SIZE, SIZE, 24, 0x20 if top_left else 0)
    rows = [pixels[y * SIZE:(y + 1) * SIZE] for y in range(SIZE)]
    if not top_left: rows.reverse()
    path.write_bytes(header + b''.join(bytes(c for p in row for c in (p[2], p[1], p[0])) for row in rows))

def run(*args): subprocess.run(args, check=True, capture_output=True)

def textures():
    TEX.mkdir(parents=True, exist_ok=True)
    chart, levels = chart_pixels(), level_pixels()
    save_png(TEX / 'chart.png', chart)
    save_png(TEX / 'levels.png', levels)
    save_png(TEX / 'levels-gray.png', [(p[0], p[0], p[0]) for p in level_pixels_gray()], mode='L')
    # The file's own color space metadata, which sourceColorSpace "auto" checks first.
    save_png(TEX / 'levels-gamma1.png', levels, chunks=[(b'gAMA', struct.pack('>I', 100000))])
    save_png(TEX / 'levels-gray-srgb.png', [(p[0], p[0], p[0]) for p in level_pixels_gray()], mode='L', chunks=[(b'sRGB', b'\x00')])
    Image.open(TEX / 'chart.png').save(TEX / 'chart.jpg', quality=95, subsampling=0)
    save_tga(TEX / 'chart-top-left.tga', chart, True)
    save_tga(TEX / 'chart-bottom-left.tga', chart, False)
    run('oiiotool', str(TEX / 'chart.png'), '-d', 'uint16', '-o', str(TEX / 'chart-16bit.png'))
    # Linear float data equal to the decoded sRGB chart and levels.
    run('oiiotool', str(TEX / 'chart.png'), '--colorconvert', 'sRGB', 'linear', '-d', 'half', '-o', str(TEX / 'chart-linear.exr'))
    run('oiiotool', str(TEX / 'levels.png'), '-d', 'half', '-o', str(TEX / 'levels-raw.exr'))
    # KTX2 with the default top-left (rd) orientation and the bottom-left (ru) one.
    # RGBA8: three.js KTX2Loader rejects 3-channel uncompressed formats (tracked separately).
    run('toktx', '--t2', '--target_type', 'RGBA', '--assign_oetf', 'srgb', str(TEX / 'chart-rd.ktx2'), str(TEX / 'chart.png'))
    run('toktx', '--t2', '--target_type', 'RGBA', '--assign_oetf', 'srgb', '--lower_left_maps_to_s0t0', str(TEX / 'chart-ru.ktx2'), str(TEX / 'chart.png'))
    # Basis Universal UASTC, the compressed form real assets use; its blocks cannot be row-flipped.
    run('toktx', '--t2', '--target_type', 'RGBA', '--encode', 'uastc', '--assign_oetf', 'srgb', str(TEX / 'chart-uastc-rd.ktx2'), str(TEX / 'chart.png'))
    run('toktx', '--t2', '--target_type', 'RGBA', '--encode', 'uastc', '--assign_oetf', 'srgb', '--lower_left_maps_to_s0t0', str(TEX / 'chart-uastc-ru.ktx2'), str(TEX / 'chart.png'))

def level_pixels_gray():
    cell = SIZE // 4
    return [(LEVELS[x // cell],) * 3 for y in range(SIZE) for x in range(SIZE)]

# ---------------------------------------------------------------- UV mappings
# Each mapping takes quad UV (u, v) and returns MaterialX/USD texture coordinates.

def deg(a): return math.radians(a)
def rot_ccw(x, y, a): c, s = math.cos(deg(a)), math.sin(deg(a)); return c * x - s * y, s * x + c * y
def rot_mx(x, y, a): c, s = math.cos(deg(a)), math.sin(deg(a)); return c * x + s * y, -s * x + c * y

def transform2d(scale=(1, 1), rotation=0.0, translation=(0, 0)):
    def f(u, v):
        x, y = rot_ccw(scale[0] * u, scale[1] * v, rotation)
        return x + translation[0], y + translation[1]
    return f

def place2d(pivot=(0, 0), scale=(1, 1), rotate=0.0, offset=(0, 0), order=0):
    def f(u, v):
        x, y = u - pivot[0], v - pivot[1]
        if order == 0:
            x, y = rot_mx(x / scale[0], y / scale[1], rotate); x, y = x - offset[0], y - offset[1]
        else:
            x, y = rot_mx(x - offset[0], y - offset[1], rotate); x, y = x / scale[0], y / scale[1]
        return x + pivot[0], y + pivot[1]
    return f

def gltf_image(scale=(1, 1), rotate=0.0, offset=(0, 0), order=0):
    return place2d((0, 1), (1 / scale[0], 1 / scale[1]), -rotate, (-offset[0], offset[1]), order)

def identity(u, v): return u, v

# Wrap modes, by MaterialX and USD name, applied per axis.
def wrap(x, mode):
    if mode in ('periodic', 'repeat'): return x - math.floor(x), False
    if mode == 'mirror':
        m = x - 2 * math.floor(x / 2)
        return (2 - m if m > 1 else m), False
    if mode == 'clamp': return min(max(x, 0.0), 1.0), x < 0 or x > 1
    if mode in ('constant', 'black'): return (None, False) if x < 0 or x > 1 else (x, False)
    raise ValueError(mode)

def chart_cell(s, t, wrap_s, wrap_t):
    """Chart index at texture coordinates, or 'default', or None near a cell border."""
    ws, clamped_s = wrap(s, wrap_s); wt, clamped_t = wrap(t, wrap_t)
    if ws is None or wt is None: return 'default'
    for value, clamped in ((ws, clamped_s), (wt, clamped_t)):
        f = value * 4 - math.floor(value * 4)
        if not clamped and (f < 0.15 or f > 0.85): return None
    col = min(int(ws * 4), 3); row_from_bottom = min(int(wt * 4), 3)
    return (3 - row_from_bottom) * 4 + col

GRID = [(i + 0.5) / 8 for i in range(8)]

def chart_samples(mapping, wrap_s='periodic', wrap_t='periodic', default=(0, 0, 0), st1=False):
    samples = []
    for v in GRID:
        for u in GRID:
            s, t = mapping(1 - u if st1 else u, v)
            cell = chart_cell(s, t, wrap_s, wrap_t)
            if cell is None: continue
            if cell == 'default': samples.append({'uv': [u, v], 'srgb': list(default), 'label': 'default'})
            else: samples.append({'uv': [u, v], 'chart': cell, 'label': CHART_NAMES[cell]})
    return samples

def level_samples(space, gray=False):
    samples = []
    for row in range(4):
        for col in range(4):
            code = (LEVELS[col],) * 3 if gray else tuple(LEVELS[col] * k for k in LEVEL_ROWS[row])
            samples.append({'uv': [(col + 0.5) / 4, 1 - (row + 0.5) / 4], 'code': list(code), 'srgb': display(code, space)})
    return samples

def value_samples(linear):
    return [{'uv': [u, v], 'srgb': [round(linear_to_srgb(c) * 255) for c in linear]} for u in (0.25, 0.75) for v in (0.25, 0.75)]

# ---------------------------------------------------------------- authoring

def node(stage, path, identifier, **inputs):
    definition = REG.GetShaderNodeByIdentifier(identifier)
    if not definition: raise ValueError('Unknown Sdr identifier ' + identifier)
    shader = UsdShade.Shader.Define(stage, path); shader.CreateIdAttr(identifier)
    for key, value in inputs.items(): setin(shader, key, value)
    for key in definition.GetShaderOutputNames():
        shader.CreateOutput(key, definition.GetShaderOutput(key).GetTypeAsSdfType().GetSdfType())
    return shader

def setin(shader, key, value):
    definition = REG.GetShaderNodeByIdentifier(shader.GetIdAttr().Get())
    prop = definition.GetShaderInput(key)
    if prop is None: raise ValueError(f'{shader.GetIdAttr().Get()} has no input {key}')
    inp = shader.CreateInput(key, prop.GetTypeAsSdfType().GetSdfType())
    if isinstance(value, (UsdShade.Output, UsdShade.Input)): inp.ConnectToSource(value)
    elif isinstance(value, UsdShade.Shader): inp.ConnectToSource(value.GetOutput('out'))
    else: inp.Set(value)
    return inp

def out(shader, name='out'): return shader.GetOutput(name)

def file_input(shader, key, path, color_space=None):
    inp = setin(shader, key, Sdf.AssetPath(path))
    if color_space: inp.GetAttr().SetColorSpace(color_space)
    return inp

def new_stage(name, label, features, folder=None, second_uv=False):
    path = (folder or OUT) / (name + '.usda')
    layer = Sdf.Layer.FindOrOpen(str(path)) if path.exists() else Sdf.Layer.CreateNew(str(path))
    layer.Clear(); stage = Usd.Stage.Open(layer)
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y); UsdGeom.SetStageMetersPerUnit(stage, 1)
    world = UsdGeom.Xform.Define(stage, '/World'); stage.SetDefaultPrim(world.GetPrim())
    stage.SetMetadata('documentation', label + '. ' + ', '.join(features) + '.')
    quad = UsdGeom.Mesh.Define(stage, '/World/Quad')
    quad.CreatePointsAttr([(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)])
    quad.CreateFaceVertexCountsAttr([4]); quad.CreateFaceVertexIndicesAttr([0, 1, 2, 3])
    quad.CreateNormalsAttr([(0, 0, 1)] * 4); quad.SetNormalsInterpolation('vertex')
    quad.CreateSubdivisionSchemeAttr('none'); quad.CreateDoubleSidedAttr(True)
    quad.CreateExtentAttr([(-1, -1, 0), (1, 1, 0)])
    primvars = UsdGeom.PrimvarsAPI(quad)
    primvars.CreatePrimvar('st', T.TexCoord2fArray, 'vertex').Set([(0, 0), (1, 0), (1, 1), (0, 1)])
    if second_uv:
        # A second UV set, mirrored horizontally, to prove the authored set is used.
        primvars.CreatePrimvar('st1', T.TexCoord2fArray, 'vertex').Set([(1, 0), (0, 0), (0, 1), (1, 1)])
    UsdGeom.Scope.Define(stage, '/World/Looks')
    camera = UsdGeom.Camera.Define(stage, '/World/Camera')
    camera.CreateProjectionAttr('orthographic')
    camera.CreateHorizontalApertureAttr(20); camera.CreateVerticalApertureAttr(20)
    camera.CreateClippingRangeAttr(Gf.Vec2f(0.1, 100))
    UsdGeom.Xformable(camera).AddTranslateOp().Set((0, 0, 5))
    return stage, quad

def preview_material(stage, quad, emissive):
    """Unlit UsdPreviewSurface: black diffuse, no specular, emission shows the value."""
    mat = UsdShade.Material.Define(stage, '/World/Looks/Feature')
    surface = node(stage, '/World/Looks/Feature/Surface', 'UsdPreviewSurface', diffuseColor=(0, 0, 0),
                   useSpecularWorkflow=1, specularColor=(0, 0, 0), roughness=1.0)
    setin(surface, 'emissiveColor', emissive)
    mat.CreateSurfaceOutput().ConnectToSource(surface.GetOutput('surface'))
    UsdShade.MaterialBindingAPI.Apply(quad.GetPrim()).Bind(mat)
    return mat

def mtlx_material(stage, quad):
    """Unlit MaterialX surface; callers connect emission_color."""
    mat = UsdShade.Material.Define(stage, '/World/Looks/Feature')
    surface = node(stage, '/World/Looks/Feature/Surface', 'ND_surface_unlit', emission=1.0)
    mat.CreateSurfaceOutput('mtlx').ConnectToSource(surface.GetOutput('out'))
    UsdShade.MaterialBindingAPI.Apply(quad.GetPrim()).Bind(mat)
    return mat, surface

LOOK = '/World/Looks/Feature/'

def uv_texture(stage, file, st=None, varname='st', wrap_s='repeat', wrap_t='repeat', space='sRGB', meta=None, fallback=None):
    reader = node(stage, LOOK + 'UV', 'UsdPrimvarReader_float2', varname=varname)
    wraps = {key: value for key, value in (('wrapS', wrap_s), ('wrapT', wrap_t)) if value is not None}
    texture = node(stage, LOOK + 'Texture', 'UsdUVTexture', st=st(reader.GetOutput('result')) if st else reader.GetOutput('result'), **wraps)
    file_input(texture, 'file', file, meta)
    if space is not None: setin(texture, 'sourceColorSpace', space)
    if fallback is not None: setin(texture, 'fallback', fallback)
    return texture

CASES = []
STORM_P3 = 'Storm applies only the sRGB and raw names to UsdUVTexture (hdSt/textureObject.cpp); other color spaces fall back to auto without a gamut conversion.'

def case(name, label, group, features, samples, files, notes=None, storm=None):
    CASES.append(dict(name=name, label=label, group=group, features=features, samples=samples, files=files, notes=notes, storm=storm))

# ---------------------------------------------------------------- orientation: UsdPreviewSurface

def build_preview_orientation():
    group = 'Texture orientation'
    rows = [
        ('orient-preview-identity', 'PreviewSurface chart', ['UsdUVTexture', 'st'], None, identity, 'repeat', 'repeat'),
        ('orient-preview-translate', 'PreviewSurface translation', ['UsdTransform2d', 'translation'], dict(translation=(0.25, 0.5)), None, 'repeat', 'repeat'),
        ('orient-preview-rotate', 'PreviewSurface rotation', ['UsdTransform2d', 'rotation 90'], dict(rotation=90.0, translation=(1, 0)), None, 'repeat', 'repeat'),
        ('orient-preview-scale', 'PreviewSurface scale', ['UsdTransform2d', 'non-uniform scale'], dict(scale=(2, 0.5)), None, 'repeat', 'repeat'),
        ('orient-preview-combined', 'PreviewSurface combined transform', ['UsdTransform2d', 'scale', 'rotation 30', 'translation'], dict(scale=(1.5, 1.25), rotation=30.0, translation=(0.2, -0.1)), None, 'repeat', 'repeat'),
        ('orient-preview-mirror-clamp', 'PreviewSurface mirror and clamp', ['UsdUVTexture', 'wrapS mirror', 'wrapT clamp'], dict(scale=(2, 2), translation=(-0.5, -0.5)), None, 'mirror', 'clamp'),
        ('orient-preview-black-repeat', 'PreviewSurface black and repeat', ['UsdUVTexture', 'wrapS black', 'wrapT repeat'], dict(scale=(2, 2), translation=(-0.5, -0.5)), None, 'black', 'repeat'),
        # Unauthored wrap modes default to useMetadata: the file's own opinion, else black. PNG has none.
        ('orient-preview-wrap-unauthored', 'PreviewSurface unauthored wrap', ['UsdUVTexture', 'wrapS and wrapT useMetadata (unauthored)'], dict(scale=(2, 2), translation=(-0.5, -0.5)), None, None, None),
    ]
    for name, label, features, xf, mapping, ws, wt in rows:
        stage, quad = new_stage(name, label, features)
        st = None
        if xf:
            def st(source, xf=xf):
                transform = node(stage, LOOK + 'Transform', 'UsdTransform2d', **{'in': source}, **{k: (Gf.Vec2f(*v) if isinstance(v, tuple) else v) for k, v in xf.items()})
                return transform.GetOutput('result')
        texture = uv_texture(stage, 'textures/chart.png', st=st, wrap_s=ws, wrap_t=wt, fallback=Gf.Vec4f(0, 0, 0, 1))
        preview_material(stage, quad, texture.GetOutput('rgb'))
        stage.GetRootLayer().Save()
        case(name, label, group, features, chart_samples(mapping or transform2d(**xf), ws or 'black', wt or 'black'), ['textures/chart.png'])
    # Second UV set, and a varname supplied through the material interface as in Apple's exports.
    stage, quad = new_stage('orient-preview-st1', 'PreviewSurface second UV set', ['UsdPrimvarReader_float2', 'varname st1'], second_uv=True)
    texture = uv_texture(stage, 'textures/chart.png', varname='st1')
    preview_material(stage, quad, texture.GetOutput('rgb')); stage.GetRootLayer().Save()
    case('orient-preview-st1', 'PreviewSurface second UV set', group, ['varname st1'], chart_samples(identity, st1=True), ['textures/chart.png'])
    stage, quad = new_stage('orient-preview-varname-interface', 'PreviewSurface varname from material input', ['UsdPrimvarReader_float2', 'connected varname'], second_uv=True)
    texture = uv_texture(stage, 'textures/chart.png')
    material = preview_material(stage, quad, texture.GetOutput('rgb'))
    varname = material.CreateInput('frame:varname', T.String); varname.Set('st1')
    UsdShade.Shader(stage.GetPrimAtPath(LOOK + 'UV')).GetInput('varname').ConnectToSource(varname)
    stage.GetRootLayer().Save()
    case('orient-preview-varname-interface', 'PreviewSurface varname from material input', group, ['connected varname st1'], chart_samples(identity, st1=True), ['textures/chart.png'])

# ---------------------------------------------------------------- orientation: MaterialX

def build_mtlx_orientation():
    group = 'Texture orientation'
    def make(name, label, features, graph, samples, storm=None):
        stage, quad = new_stage(name, label, features, second_uv='st1' in name)
        mat, surface = mtlx_material(stage, quad)
        setin(surface, 'emission_color', graph(stage))
        stage.GetRootLayer().Save()
        case(name, label, group, features, samples, ['textures/chart.png'], storm=storm)

    def image(stage, texcoord=None, **inputs):
        img = node(stage, LOOK + 'Image', 'ND_image_color3', **inputs)
        file_input(img, 'file', 'textures/chart.png', 'srgb_texture')
        if texcoord is not None: setin(img, 'texcoord', texcoord)
        return out(img)

    make('orient-mx-image-default', 'MaterialX image, default texcoord', ['ND_image_color3', 'default UV0'], lambda s: image(s), chart_samples(identity))
    make('orient-mx-image-texcoord', 'MaterialX image, texcoord node', ['ND_image_color3', 'ND_texcoord_vector2'],
         lambda s: image(s, out(node(s, LOOK + 'TexCoord', 'ND_texcoord_vector2', index=0))), chart_samples(identity))
    make('orient-mx-image-geomprop', 'MaterialX image, st geomprop', ['ND_image_color3', 'ND_geompropvalue_vector2 st'],
         lambda s: image(s, out(node(s, LOOK + 'Geomprop', 'ND_geompropvalue_vector2', geomprop='st'))), chart_samples(identity))
    make('orient-mx-image-st-with-st1', 'MaterialX image, st beside st1', ['ND_image_color3', 'ND_geompropvalue_vector2 st', 'second UV set present'],
         lambda s: image(s, out(node(s, LOOK + 'Geomprop', 'ND_geompropvalue_vector2', geomprop='st'))), chart_samples(identity))
    make('orient-mx-image-st1', 'MaterialX image, st1 geomprop', ['ND_image_color3', 'ND_geompropvalue_vector2 st1'],
         lambda s: image(s, out(node(s, LOOK + 'Geomprop', 'ND_geompropvalue_vector2', geomprop='st1'))), chart_samples(identity, st1=True))

    def scaled(stage, mode_u, mode_v):
        uv = node(stage, LOOK + 'TexCoord', 'ND_texcoord_vector2', index=0)
        mul = node(stage, LOOK + 'Scale', 'ND_multiply_vector2', in1=out(uv), in2=Gf.Vec2f(2, 2))
        sub = node(stage, LOOK + 'Shift', 'ND_subtract_vector2', in1=out(mul), in2=Gf.Vec2f(0.5, 0.5))
        return image(stage, out(sub), uaddressmode=mode_u, vaddressmode=mode_v, default=Gf.Vec3f(*MX_DEFAULT))
    shift = transform2d(scale=(2, 2), translation=(-0.5, -0.5))
    make('orient-mx-address-mirror-clamp', 'MaterialX mirror and clamp', ['ND_image_color3', 'uaddressmode mirror', 'vaddressmode clamp'],
         lambda s: scaled(s, 'mirror', 'clamp'), chart_samples(shift, 'mirror', 'clamp'))
    make('orient-mx-address-constant-periodic', 'MaterialX constant and periodic', ['ND_image_color3', 'uaddressmode constant', 'vaddressmode periodic'],
         lambda s: scaled(s, 'constant', 'periodic'), chart_samples(shift, 'constant', 'periodic', default=MX_DEFAULT_SRGB),
         storm='Storm samples constant addressing as transparent black instead of the image default (hdSt/materialXFilter.cpp).')

    def tiled(stage):
        img = node(stage, LOOK + 'Image', 'ND_tiledimage_color3', uvtiling=Gf.Vec2f(2, 1), uvoffset=Gf.Vec2f(0.25, 0))
        file_input(img, 'file', 'textures/chart.png', 'srgb_texture'); return out(img)
    make('orient-mx-tiledimage', 'MaterialX tiled image', ['ND_tiledimage_color3', 'uvtiling', 'uvoffset'], tiled,
         chart_samples(lambda u, v: (u * 2 - 0.25, v * 1 - 0)))

    for order in (0, 1):
        params = dict(pivot=(0.5, 0.5), scale=(0.5, 1), rotate=90.0, offset=(0.25, 0), order=order)
        def placed(stage, params=params):
            uv = node(stage, LOOK + 'TexCoord', 'ND_texcoord_vector2', index=0)
            place = node(stage, LOOK + 'Place', 'ND_place2d_vector2', texcoord=out(uv), pivot=Gf.Vec2f(*params['pivot']),
                         scale=Gf.Vec2f(*params['scale']), rotate=params['rotate'], offset=Gf.Vec2f(*params['offset']), operationorder=params['order'])
            return image(stage, out(place))
        make(f'orient-mx-place2d-order{order}', f'MaterialX place2d, operation order {order}', ['ND_place2d_vector2', 'pivot', 'scale', 'rotate', 'offset', f'operationorder {order}'],
             placed, chart_samples(place2d(**params)))

    def hextiled(stage):
        # Tiling 1 with no random rotation, scale or offset reduces to a plain lookup.
        img = node(stage, LOOK + 'Image', 'ND_hextiledimage_color3', tiling=Gf.Vec2f(1, 1), rotation=0.0, rotationrange=Gf.Vec2f(0, 0),
                   scale=1.0, scalerange=Gf.Vec2f(1, 1), offset=1.0, offsetrange=Gf.Vec2f(0, 0))
        file_input(img, 'file', 'textures/chart.png', 'srgb_texture'); return out(img)
    make('orient-mx-hextiledimage', 'MaterialX hex-tiled image without randomness', ['ND_hextiledimage_color3', 'tiling 1', 'no randomness'], hextiled, chart_samples(identity))

    for label, params in [('identity', {}), ('transformed', dict(scale=(2, 1), rotate=0.0, offset=(0.25, 0.0)))]:
        def gltf(stage, params=params):
            img = node(stage, LOOK + 'Image', 'ND_gltf_image_color3_color3_1_0',
                       **({'scale': Gf.Vec2f(*params['scale']), 'rotate': params['rotate'], 'offset': Gf.Vec2f(*params['offset'])} if params else {}))
            file_input(img, 'file', 'textures/chart.png', 'srgb_texture'); return out(img)
        make(f'orient-mx-gltf-image-{label}', f'MaterialX glTF image, {label}', ['ND_gltf_image_color3_color3_1_0'] + (['scale', 'offset'] if params else []),
             gltf, chart_samples(gltf_image(**params)))

    def usd_nodes(stage):
        reader = node(stage, LOOK + 'UV', 'ND_UsdPrimvarReader_vector2', varname='st')
        transform = node(stage, LOOK + 'Transform', 'ND_UsdTransform2d', **{'in': out(reader)}, rotation=90.0, translation=Gf.Vec2f(1, 0))
        # MaterialX's UsdUVTexture has no sourceColorSpace; the file's colorspace applies.
        texture = node(stage, LOOK + 'Texture', 'ND_UsdUVTexture_23', st=out(transform))
        file_input(texture, 'file', 'textures/chart.png', 'srgb_texture')
        return texture.GetOutput('rgb')
    make('orient-mx-usd-nodes', 'MaterialX UsdUVTexture and UsdTransform2d', ['ND_UsdUVTexture_23', 'ND_UsdTransform2d', 'ND_UsdPrimvarReader_vector2'],
         usd_nodes, chart_samples(transform2d(rotation=90.0, translation=(1, 0))),
         storm="Storm 26.05 cannot generate this shader: HdMtlx leaves ND_UsdPrimvarReader_vector2's geompropvalue without a geomprop.")

    # Texture coordinates shown as color, with no image involved.
    stage, quad = new_stage('orient-mx-texcoord-color', 'MaterialX texcoord as color', ['ND_texcoord_vector2', 'no image'])
    mat, surface = mtlx_material(stage, quad)
    uv = node(stage, LOOK + 'TexCoord', 'ND_texcoord_vector2', index=0)
    setin(surface, 'emission_color', out(node(stage, LOOK + 'AsColor', 'ND_convert_vector2_color3', **{'in': out(uv)})))
    stage.GetRootLayer().Save()
    case('orient-mx-texcoord-color', 'MaterialX texcoord as color', group, ['ND_texcoord_vector2', 'no image'],
         [{'uv': [u, v], 'srgb': [round(linear_to_srgb(u) * 255), round(linear_to_srgb(v) * 255), 0]} for v in (0.125, 0.5, 0.875) for u in (0.125, 0.5, 0.875)], [])

# ---------------------------------------------------------------- orientation: image formats

def build_formats():
    group = 'Texture orientation: formats'
    formats = [('png16', 'chart-16bit.png', 'sRGB', 'srgb_texture'), ('jpeg', 'chart.jpg', 'sRGB', 'srgb_texture'),
               ('tga-top-left', 'chart-top-left.tga', 'sRGB', 'srgb_texture'), ('tga-bottom-left', 'chart-bottom-left.tga', 'sRGB', 'srgb_texture'),
               ('exr', 'chart-linear.exr', 'raw', 'lin_rec709'), ('ktx2-rd', 'chart-rd.ktx2', 'sRGB', 'srgb_texture'), ('ktx2-ru', 'chart-ru.ktx2', 'sRGB', 'srgb_texture'),
               ('ktx2-uastc-rd', 'chart-uastc-rd.ktx2', 'sRGB', 'srgb_texture'), ('ktx2-uastc-ru', 'chart-uastc-ru.ktx2', 'sRGB', 'srgb_texture')]
    for key, file, usd_space, mx_space in formats:
        name = f'format-{key}-preview'; label = f'{key.upper()} chart, PreviewSurface'
        stage, quad = new_stage(name, label, ['UsdUVTexture', key])
        preview_material(stage, quad, uv_texture(stage, 'textures/' + file, space=usd_space).GetOutput('rgb')); stage.GetRootLayer().Save()
        no_ktx2 = 'Storm has no KTX2 reader.' if key.startswith('ktx2') else None
        case(name, label, group, ['UsdUVTexture', key], chart_samples(identity), ['textures/' + file], storm=no_ktx2)
        name = f'format-{key}-mx'; label = f'{key.upper()} chart, MaterialX image'
        stage, quad = new_stage(name, label, ['ND_image_color3', key])
        mat, surface = mtlx_material(stage, quad)
        img = node(stage, LOOK + 'Image', 'ND_image_color3'); file_input(img, 'file', 'textures/' + file, mx_space)
        setin(surface, 'emission_color', out(img)); stage.GetRootLayer().Save()
        case(name, label, group, ['ND_image_color3', key], chart_samples(identity), ['textures/' + file], storm=no_ktx2)

# ---------------------------------------------------------------- color spaces

def build_color_spaces():
    group = 'Texture color spaces'
    # UsdUVTexture sourceColorSpace and asset colorSpace metadata.
    rows = [
        ('cs-preview-source-srgb', 'sourceColorSpace sRGB', 'levels.png', 'sRGB', None, 'srgb_texture'),
        ('cs-preview-source-raw', 'sourceColorSpace raw', 'levels.png', 'raw', None, 'raw'),
        ('cs-preview-auto-rgb8', 'sourceColorSpace auto, 8-bit RGB', 'levels.png', 'auto', None, 'srgb_texture'),
        ('cs-preview-auto-gray8', 'sourceColorSpace auto, 8-bit gray', 'levels-gray.png', 'auto', None, 'raw'),
        ('cs-preview-auto-png-gamma1', 'sourceColorSpace auto, 8-bit RGB with PNG gAMA 1.0', 'levels-gamma1.png', 'auto', None, 'raw'),
        ('cs-preview-auto-png-srgb-gray', 'sourceColorSpace auto, 8-bit gray with PNG sRGB chunk', 'levels-gray-srgb.png', 'auto', None, 'srgb_texture'),
        ('cs-preview-auto-exr', 'sourceColorSpace auto, float EXR', 'levels-raw.exr', 'auto', None, 'raw'),
        ('cs-preview-meta-raw', 'asset colorSpace raw', 'levels.png', None, 'raw', 'raw'),
        ('cs-preview-meta-displayp3', 'asset colorSpace srgb_displayp3', 'levels.png', None, 'srgb_displayp3', 'srgb_displayp3'),
        ('cs-preview-meta-gf-p3', 'asset colorSpace srgb_p3d65_scene', 'levels.png', None, 'srgb_p3d65_scene', 'srgb_p3d65_scene'),
    ]
    for name, label, file, source, meta, expect in rows:
        stage, quad = new_stage(name, 'PreviewSurface ' + label, ['UsdUVTexture', label])
        preview_material(stage, quad, uv_texture(stage, 'textures/' + file, space=source, meta=meta).GetOutput('rgb')); stage.GetRootLayer().Save()
        case(name, 'PreviewSurface ' + label, group, ['UsdUVTexture', label], level_samples(expect, gray='gray' in file), ['textures/' + file],
             storm=STORM_P3 if meta and 'p3' in meta else None)
    # MaterialX file colorspace, by MaterialX and OpenUSD names.
    for space in ['srgb_texture', 'lin_rec709', 'g22_rec709', 'srgb_displayp3', 'lin_displayp3', 'acescg', 'lin_ap1', 'srgb_rec709_scene', 'g22_rec709_scene', 'srgb_p3d65_scene', 'lin_ap1_scene']:
        name = 'cs-mx-' + space.replace('_', '-'); label = f'MaterialX image colorspace {space}'
        stage, quad = new_stage(name, label, ['ND_image_color3', 'colorspace ' + space])
        mat, surface = mtlx_material(stage, quad)
        img = node(stage, LOOK + 'Image', 'ND_image_color3'); file_input(img, 'file', 'textures/levels.png', space)
        setin(surface, 'emission_color', out(img)); stage.GetRootLayer().Save()
        case(name, label, group, ['ND_image_color3', 'colorspace ' + space], level_samples(space), ['textures/levels.png'])
    # Color space inherited through the namespace (UsdColorSpaceAPI) by a texture in nested node graphs.
    for terminal in ['preview', 'mx']:
        name = f'cs-{terminal}-inherited-nested'; label = ('PreviewSurface' if terminal == 'preview' else 'MaterialX') + ' color space inherited by nested graph'
        stage, quad = new_stage(name, label, ['UsdColorSpaceAPI', 'nested NodeGraph'])
        outer = UsdShade.NodeGraph.Define(stage, LOOK + 'Outer'); inner = UsdShade.NodeGraph.Define(stage, LOOK + 'Outer/Inner')
        api = Usd.ColorSpaceAPI.Apply(outer.GetPrim()); api.CreateColorSpaceNameAttr(Gf.ColorSpaceNames.SRGBP3D65)
        base = LOOK + 'Outer/Inner/'
        if terminal == 'preview':
            reader = node(stage, base + 'UV', 'UsdPrimvarReader_float2', varname='st')
            texture = node(stage, base + 'Texture', 'UsdUVTexture', st=reader.GetOutput('result'))
            file_input(texture, 'file', 'textures/levels.png')
            result = texture.GetOutput('rgb')
        else:
            img = node(stage, base + 'Image', 'ND_image_color3'); file_input(img, 'file', 'textures/levels.png')
            result = out(img)
        inner.CreateOutput('color', T.Color3f).ConnectToSource(result)
        outer.CreateOutput('color', T.Color3f).ConnectToSource(inner.GetOutput('color'))
        if terminal == 'preview': preview_material(stage, quad, outer.GetOutput('color'))
        else:
            mat, surface = mtlx_material(stage, quad); setin(surface, 'emission_color', outer.GetOutput('color'))
        stage.GetRootLayer().Save()
        case(name, label, group, ['UsdColorSpaceAPI srgb_p3d65_scene on outer NodeGraph', 'texture in nested NodeGraph'],
             level_samples('srgb_p3d65_scene'), ['textures/levels.png'],
             notes='The texture authors no color space of its own; the one applied to the enclosing NodeGraph governs it.',
             storm=STORM_P3 if terminal == 'preview' else None)
    # Color values, not textures, with a color space.
    stage, quad = new_stage('cs-mx-value-srgb', 'MaterialX color value in srgb_texture', ['ND_constant_color3', 'colorSpace srgb_texture'])
    mat, surface = mtlx_material(stage, quad)
    constant = node(stage, LOOK + 'Value', 'ND_constant_color3', value=Gf.Vec3f(0.5, 0.25, 0.75))
    constant.GetInput('value').GetAttr().SetColorSpace('srgb_texture')
    setin(surface, 'emission_color', out(constant)); stage.GetRootLayer().Save()
    case('cs-mx-value-srgb', 'MaterialX color value in srgb_texture', group, ['ND_constant_color3', 'colorSpace srgb_texture'],
         value_samples(decoder('srgb_texture')((0.5, 0.25, 0.75))), [])
    stage, quad = new_stage('cs-preview-value-p3', 'PreviewSurface color value in lin_p3d65_scene', ['emissiveColor', 'colorSpace lin_p3d65_scene'])
    material = preview_material(stage, quad, Gf.Vec3f(0.2, 0.5, 0.1))
    UsdShade.Shader(stage.GetPrimAtPath(LOOK + 'Surface')).GetInput('emissiveColor').GetAttr().SetColorSpace('lin_p3d65_scene')
    stage.GetRootLayer().Save()
    case('cs-preview-value-p3', 'PreviewSurface color value in lin_p3d65_scene', group, ['emissiveColor', 'colorSpace lin_p3d65_scene'],
         value_samples(decoder('lin_p3d65_scene')((0.2, 0.5, 0.1))), [],
         storm='Storm does not convert UsdPreviewSurface color values from their authored color space.')

# ---------------------------------------------------------------- packages

def build_packages():
    group = 'Texture packaging'
    sources = {'orient-preview-identity': 'PreviewSurface chart', 'orient-mx-image-default': 'MaterialX image chart',
               'cs-preview-meta-displayp3': 'PreviewSurface asset colorSpace srgb_displayp3', 'cs-mx-srgb-displayp3': 'MaterialX colorspace srgb_displayp3'}
    for source, label in sources.items():
        name = 'usdz-' + source; target = OUT / (name + '.usdz')
        if target.exists(): target.unlink()
        assert UsdUtils.CreateNewUsdzPackage(Sdf.AssetPath(str(OUT / (source + '.usda'))), str(target)), target
        original = next(c for c in CASES if c['name'] == source)
        case(name, 'USDZ ' + label, group, ['USDZ package'] + original['features'], original['samples'], [], notes='Textures are package members.', storm=original['storm'])
    # A package whose material layer lives in a subfolder and references textures relative to itself.
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp); (tmp / 'looks').mkdir(); (tmp / 'textures').mkdir()
        shutil.copy(TEX / 'chart.png', tmp / 'textures/chart.png')
        looks = Usd.Stage.CreateNew(str(tmp / 'looks/materials.usda'))
        UsdGeom.Scope.Define(looks, '/Looks'); looks.SetDefaultPrim(looks.GetPrimAtPath('/Looks'))
        mat = UsdShade.Material.Define(looks, '/Looks/Feature')
        surface = node(looks, '/Looks/Feature/Surface', 'ND_surface_unlit', emission=1.0)
        img = node(looks, '/Looks/Feature/Image', 'ND_image_color3'); file_input(img, 'file', '../textures/chart.png', 'srgb_texture')
        setin(surface, 'emission_color', out(img)); mat.CreateSurfaceOutput('mtlx').ConnectToSource(surface.GetOutput('out'))
        looks.GetRootLayer().Save()
        root, quad = new_stage('scene', 'USDZ nested material layer', ['referenced layer in subfolder'], folder=tmp)
        root.RemovePrim('/World/Looks')
        looks_prim = root.DefinePrim('/World/Looks'); looks_prim.GetReferences().AddReference('./looks/materials.usda')
        UsdShade.MaterialBindingAPI.Apply(quad.GetPrim()).Bind(UsdShade.Material(root.GetPrimAtPath('/World/Looks/Feature')))
        root.GetRootLayer().Save()
        target = OUT / 'usdz-nested-layer.usdz'
        if target.exists(): target.unlink()
        assert UsdUtils.CreateNewUsdzPackage(Sdf.AssetPath(str(tmp / 'scene.usda')), str(target)), target
    case('usdz-nested-layer', 'USDZ nested material layer', group, ['USDZ package', 'referenced layer in subfolder', 'relative texture path'],
         chart_samples(identity), [], notes='The texture path is relative to the referenced layer, not the root layer.')

# ---------------------------------------------------------------- validation, manifest, Storm

def validate(path):
    stage = Usd.Stage.Open(str(path)); assert stage and stage.GetDefaultPrim(), path
    assert not stage.GetCompositionErrors(), (path, stage.GetCompositionErrors())
    for prim in stage.Traverse():
        if prim.IsA(UsdShade.Shader):
            identifier = UsdShade.Shader(prim).GetIdAttr().Get(); assert REG.GetShaderNodeByIdentifier(identifier), identifier
        for attr in prim.GetAttributes():
            for target in attr.GetConnections(): assert stage.GetAttributeAtPath(target), (attr.GetPath(), target)
    bound = UsdShade.MaterialBindingAPI(stage.GetPrimAtPath('/World/Quad')).ComputeBoundMaterial()[0]
    assert bound, path
    return {'boundMaterial': str(bound.GetPath())}

STORM_HELP = ('Set USD_STORM_ROOT to a native OpenUSD install whose usdrecord loads Storm. An install that '
              'registers other Hydra renderers can select one of them even when Storm is requested.')

def storm(cases):
    """Render with Storm and record where it matches the specification-derived expectation."""
    import os, platform
    cache = ROOT.parents[1] / '.cache' / SUITE; cache.mkdir(parents=True, exist_ok=True)
    usd_root = Path(os.environ.get('USD_STORM_ROOT', Path.home() / 'OpenUSD-26.05-native'))
    python = os.environ.get('USD_STORM_PYTHON', shutil.which('python3'))
    prefix = ['arch', '-x86_64'] if os.environ.get('USD_STORM_ARCH') == 'x86_64' and platform.machine() == 'arm64' else []
    env = {**os.environ, 'PYTHONPATH': str(usd_root / 'lib/python')}
    report = []
    for c in cases:
        root = OUT / (c['name'] + ('.usdz' if c['name'].startswith('usdz-') else '.usda'))
        image = cache / (c['name'] + '.png')
        if image.exists(): image.unlink()
        result = subprocess.run(prefix + [python, str(usd_root / 'bin/usdrecord'), '--camera', '/World/Camera', '--renderer', 'Storm',
                                '--imageWidth', '512', str(root), str(image)], capture_output=True, text=True, env=env)
        if 'Renderer plugin: HdStormRendererPlugin' not in result.stdout + result.stderr:
            raise SystemExit('usdrecord did not render with Storm. ' + STORM_HELP + '\n' + (result.stdout + result.stderr)[-600:])
        if result.returncode != 0 or not image.exists():
            report.append({'id': c['name'], 'rendered': False, 'error': result.stderr[-400:]}); continue
        pixels = Image.open(image).convert('RGB'); w, h = pixels.size
        mismatches = []
        for sample in c['samples']:
            u, v = sample['uv']; got = pixels.getpixel((min(int(u * w), w - 1), min(int((1 - v) * h), h - 1)))
            want = CHART[sample['chart']] if 'chart' in sample else tuple(sample['srgb'])
            if max(abs(a - b) for a, b in zip(got, want)) > (24 if 'chart' in sample else 6):
                mismatches.append({'uv': sample['uv'], 'expected': list(want), 'storm': list(got)})
        report.append({'id': c['name'], 'rendered': True, 'samples': len(c['samples']), 'mismatches': mismatches})
    for entry, c in zip(report, cases): entry['knownDeviation'] = c['storm']
    (cache / 'storm-report.json').write_text(json.dumps(report, indent=2) + '\n')
    agree = sum(1 for r in report if r.get('rendered') and not r['mismatches'])
    unexpected = [r['id'] for r in report if (not r.get('rendered') or r['mismatches']) and not r['knownDeviation']]
    print(f'Storm agrees with the expectation in {agree} of {len(report)} scenes; see {cache / "storm-report.json"}.')
    print('Unexpected Storm differences: ' + (', '.join(unexpected) if unexpected else 'none'))

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--storm', action='store_true', help='Render with Storm and compare.')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    textures()
    build_preview_orientation(); build_mtlx_orientation(); build_formats(); build_color_spaces(); build_packages()
    manifest = []
    for c in CASES:
        package = c['name'].startswith('usdz-')
        root = f'coverage/{SUITE}/{c["name"]}.' + ('usdz' if package else 'usda')
        evidence = validate(ROOT / root)
        manifest.append({'id': f'{SUITE}-{c["name"]}', 'label': c['label'], 'group': c['group'], 'root': root,
                         'files': [root] + [f'coverage/{SUITE}/{f}' for f in c['files']],
                         'features': c['features'], 'environment': 'none', 'thumbnailCameraLight': False,
                         'scenePrimitiveLightIntensityScale': 1, 'camera': '/World/Camera',
                         'assertions': ['Native composition has no errors', 'All shader identifiers resolve in native Sdr',
                                        'All connection targets exist', 'The quad resolves its bound material'],
                         'expected': {'unlit': True, 'samples': c['samples'], **({'notes': c['notes']} if c['notes'] else {}),
                                      **({'stormDeviation': c['storm']} if c['storm'] else {})},
                         'evidence': evidence})
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=1) + '\n')
    print(f'Wrote {len(manifest)} texture convention scenes.')
    if args.storm: storm(CASES)

if __name__ == '__main__': main()
