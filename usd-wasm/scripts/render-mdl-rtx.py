"""Capture an authored USD RenderProduct with pinned NVIDIA ovrtx.

Requires LdrColor, HdrColor and DistanceToCameraSD render vars. Camera, illumination and sampling
remain authored in the stage/overlay. Does not convert original materials.
"""
import argparse
import ctypes
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import sys
import traceback

import numpy as np
from PIL import Image
import ovrtx
ovrtx.register_schema_paths()
import ovstage

# The Windows wheel's loader omits nested plugin dependency directories.
# Keep directory cookies alive for the process; no system PATH changes.
_dll_directories = []
_dll_paths = []
if os.name == 'nt':
    _bin = Path(ovrtx.__file__).parent / 'bin'
    _dll_paths = [_bin / 'plugins' / p for p in ('', 'gpu.foundation',
                  'omni.client.lib', 'omni.usd_mdl', 'renderer.imgui', 'rtx')]
    _dll_directories = [os.add_dll_directory(str(p)) for p in _dll_paths]
    _native_renderer = ctypes.WinDLL(str(_bin / 'plugins' / 'rtx' / 'ovrtx.dylib.dll'))


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def needle_agx(rgb):
    """Same matrix order and look as src/renderers/needleAgx.js; output sRGB."""
    inset=np.array([[.842479062253094,.0423282422610123,.0423756549057051],
                    [.0784335999999992,.878468636469772,.0784336],
                    [.0792237451477643,.0791661274605434,.879142973793104]])
    outset=np.array([[1.19687900512017,-.0528968517574562,-.0529716355144438],
                     [-.0980208811401368,1.15190312990417,-.0980434501171241],
                     [-.0990297440797205,-.0989611768448433,1.15107367264116]])
    x=(np.clip(np.log2(np.maximum(rgb,.001)@inset),-12.47393,4.026069)+12.47393)/16.499999
    x2=x*x;x4=x2*x2
    contrast=15.5*x4*x2-40.14*x4*x+31.96*x4-6.868*x2*x+.4298*x2+.1191*x-.00232
    luma=contrast@np.array([.2126,.7152,.0722]);luma=luma[...,None]
    look=luma+1.15*((contrast*1.05)**1.10-luma)
    linear=np.maximum(look@outset,0)**2.2
    return np.clip(np.where(linear<=.0031308,linear*12.92,1.055*linear**(1/2.4)-.055),0,1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stage', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--product', default='/ReferenceRender/Camera')
    parser.add_argument('--audit-mdl', action='store_true')
    parser.add_argument('--verify-inputs', type=Path, help='JSON relative paths to SHA256; resolved beside stage')
    args = parser.parse_args()
    versions = {p: importlib.metadata.version(p) for p in ('ovrtx', 'ovstage')}
    assert versions == {'ovrtx': '0.5.1.385782', 'ovstage': '0.2.1.385922'}, versions
    stage_path = args.stage.resolve()
    folder = stage_path.parent
    expected = json.loads(args.verify_inputs.read_text()) if args.verify_inputs else {}
    for path, sha in expected.items():
        assert digest(folder / path) == sha, path
    args.out.mkdir(parents=True, exist_ok=True)
    log = (args.out / 'renderer.log').resolve()
    renderer = ovrtx.Renderer(config=ovrtx.RendererConfig(
        sync_mode=True, log_file_path=str(log), log_level='info',
        texture_streaming_mode='synchronous'))
    print('RTX renderer created', flush=True)
    stage = ovstage.Stage('usd-material-reference')
    record = {'versions': versions, 'usdPluginPaths': ovrtx.usd_plugin_paths(),
              'stage': str(stage_path), 'stageSha256': digest(stage_path),
              'inputHashes': expected, 'status': 'running',
              'dllDirectories': [str(p) for p in _dll_paths],
              'renderProduct': args.product,
              'processIsolation': {'explicitRendererAndStageDestroy': True,
                  'forcedProcessExitAfterFlush': True,
                  'reason': 'Pinned Windows SDK hangs in interpreter static teardown after explicit destruction; exceptions/failed validation exit 1'},
              'validationScope': 'Pixels, finite HDR and absence of runtime log errors; MDL selection requires separate graph/control proof'}
    images = {}
    try:
        renderer.attach_ovstage(stage)
        ovstage.population.open_usd(stage, str(stage_path), ordinal=1)
        stage.advance_write_floor(1, ovstage.Scope.ALL).wait()
        if args.audit_mdl:
            from ovstage_mdl_audit import audit_mdl_stage
            record['runtimeMdlGraph'] = audit_mdl_stage(stage)
            print('Runtime MDL graph audit complete', flush=True)
        print('Original USD loaded; starting path tracing', flush=True)
        products = renderer.step(render_products={args.product},
                                 delta_time=1 / 60, ordinal=1)
        for product in products.values():
            for frame in product.frames:
                for name in ('LdrColor', 'HdrColor', 'DistanceToCameraSD'):
                    if args.product + '/' + name not in frame.render_vars:
                        continue
                    mapped = frame.render_vars[args.product + '/' + name].map(device=ovrtx.Device.CPU)
                    view = np.from_dlpack(mapped)
                    images[name] = view.copy()
                    del view
                    mapped.unmap()
                    del mapped
        del frame, product, products
        assert images['LdrColor'].ndim == 3 and images['LdrColor'].shape[2] in (3, 4)
        height, width = images['LdrColor'].shape[:2]
        record['resolution'] = [width, height]
        assert images['LdrColor'].dtype == np.uint8
        record['diagnosticLdrRange'] = int(np.ptp(images['LdrColor'][..., :3]))
        rgba = images['HdrColor'].astype('<f4')
        rgba.tofile(args.out / 'render-linear-rgba.f32')
        np.save(args.out / 'render-linear-rgba.npy', rgba)
        record['rgbaTransport'] = {'width': width, 'height': height, 'channels': 4,
            'dtype': 'float32', 'byteOrder': 'little', 'origin': 'top-left',
            'colorSpace': 'linear-sRGB / lin_rec709_scene',
            'alphaMin': float(rgba[..., 3].min()), 'alphaMax': float(rgba[..., 3].max()),
            'cornerRgba': rgba[0, 0].tolist(),
            'note': 'Raw HdrColor including unmasked environment; camera exposure applied, no tone map'}
        (args.out / 'render-linear-rgba.json').write_text(json.dumps(record['rgbaTransport'], indent=2)+'\n')
        if 'DistanceToCameraSD' in images:
            depth = images['DistanceToCameraSD'].astype('<f4')
            np.save(args.out / 'distance-to-camera.npy', depth)
            depth.tofile(args.out / 'distance-to-camera.f32')
            record['depth'] = {'shape':list(depth.shape),'dtype':'float32','origin':'top-left',
                'corner':str(float(depth.reshape(height,width)[0,0])), 'min':str(float(depth.min())),'max':str(float(depth.max())), 'finiteValues':int(np.isfinite(depth).sum())}
        hdr = rgba[..., :3]
        assert np.isfinite(hdr).all() and hdr.max() > 0, 'Invalid HDR output'
        Image.fromarray(images['LdrColor']).save(args.out / 'render-rtx-ldr.png')
        # Keep original scene-linear output. Apply the viewer's actual Needle
        # AgX look and its light backdrop only for the convenient PNG.
        assert 'DistanceToCameraSD' in images, 'Need primary depth for backdrop'
        depth=images['DistanceToCameraSD'].reshape(height,width)
        mask=np.isfinite(depth)&(depth>0)&(depth<1e8)
        srgb=np.array([240,244,239])/255
        backdrop=np.where(srgb<=.04045,srgb/12.92,((srgb+.055)/1.055)**2.4)
        display=np.where(mask[...,None],hdr,backdrop)
        Image.fromarray(np.rint(needle_agx(display)*255).astype('uint8')).save(args.out/'render.png')
        record['display']={'transform':'Needle AgX','exposure':1,'output':'sRGB','background':'#F0F4EF',
                           'backgroundMask':'finite primary depth > 0 and < 1e8','foregroundPixels':int(mask.sum())}
        np.save(args.out / 'render-linear.npy', hdr)
        with (args.out / 'render-linear.pfm').open('wb') as file:
            file.write(f'PF\n{width} {height}\n-1.0\n'.encode())
            file.write(np.flipud(hdr).astype('<f4').tobytes())
        record['outputs'] = {name: digest(args.out / name) for name in (
            'render.png', 'render-linear.npy', 'render-linear.pfm', 'render-linear-rgba.f32', 'render-linear-rgba.npy', 'render-linear-rgba.json')}
        record['linearHdr'] = {'minimum': float(hdr.min()), 'maximum': float(hdr.max()),
                               'finiteValues': int(np.isfinite(hdr).sum())}
    finally:
        renderer.detach_ovstage()
        stage.destroy()
        renderer.destroy()
        text = log.read_text(errors='replace') if log.exists() else ''
        suspicious = [line for line in text.splitlines() if
                      re.search(r'\b(error|fatal)\b', line, re.I) or
                      (re.search(r'mdl|material|texture', line, re.I) and
                       re.search(r'failed|missing|not found|invalid|unable', line, re.I))]
        record['shaderOrRuntimeFailures'] = suspicious
        record['status'] = 'passed' if record.get('outputs') and text and not suspicious else 'failed'
        (args.out / 'capture.json').write_text(json.dumps(record, indent=2, default=str) + '\n')
    assert record['status'] == 'passed', record
    print(json.dumps(record, indent=2, default=str))


if __name__ == '__main__':
    # Explicit renderer/stage destruction is complete before leaving main.
    # The pinned Windows libraries hang during Python/C++ static teardown;
    # this standalone worker exits after flushing durable result/log files.
    try:
        main()
        code = 0
    except BaseException:
        traceback.print_exc()
        code = 1
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(code)
