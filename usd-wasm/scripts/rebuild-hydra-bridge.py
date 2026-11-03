#!/usr/bin/env python3
"""Recompile only the Hydra bridge, reusing an existing OpenUSD build and link plan."""
import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import re
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--compile-commands', type=Path, required=True,
                    help='JSON list of [source, argv, cwd] from an existing bridge build')
parser.add_argument('--link-command', type=Path, required=True, help='Existing link argv JSON')
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--link-cwd', type=Path, help='Working directory of the existing link plan')
parser.add_argument('--runtime', choices=['asyncify', 'jspi'], required=True)
parser.add_argument('--build-info', type=Path, required=True)
parser.add_argument('--materialx-repo', type=Path,
                    help='MaterialX checkout supplying library resources and build provenance')
args = parser.parse_args()
output = args.output.resolve()
(output / 'generated').mkdir(parents=True, exist_ok=True)
base = json.loads(args.compile_commands.read_text())
source_root = next(Path(source).resolve().parents[3] for source, _, _ in base
                   if Path(source).name == 'emHdBindings.cpp')
bindgen = source_root / 'pxr/usdImaging/hdEmscripten/bindgen'
subprocess.run([sys.executable, str(bindgen / 'generate_bindings.py'),
                '--manifest', str(bindgen / 'core-bindings.json'),
                '--cpp-out', str(output / 'generated/emHdCoreBindings.inc'),
                '--dts-out', str(output / 'generated/usd-core-bindings.d.ts')], check=True)
info = json.loads(args.build_info.read_text())
info['openusd']['gitSha'] = subprocess.check_output(
    ['git', '-C', str(source_root), 'rev-parse', 'HEAD'], text=True).strip()
info['openusd']['gitDirty'] = subprocess.call(
    ['git', '-C', str(source_root), 'diff', '--quiet', 'HEAD']) != 0
materialx_root = args.materialx_repo.resolve() if args.materialx_repo else None
if materialx_root:
    previous_sha = info['dependencies']['materialX'].get('gitSha')
    if not previous_sha or subprocess.call([
        'git', '-C', str(materialx_root), 'diff', '--quiet', previous_sha, 'HEAD', '--',
        'source/MaterialXCore', 'source/MaterialXFormat',
    ]) != 0:
        parser.error('MaterialX Core/Format changed; rebuild its native libraries before relinking')
    cmake = (materialx_root / 'CMakeLists.txt').read_text()
    version = '.'.join(re.search(r'set\(MATERIALX_' + part + r'_VERSION\s+(\d+)\)', cmake)[1]
                       for part in ['MAJOR', 'MINOR', 'BUILD'])
    info['dependencies']['materialX'] = {
        'version': version,
        'gitSha': subprocess.check_output(
            ['git', '-C', str(materialx_root), 'rev-parse', 'HEAD'], text=True).strip(),
        'gitDirty': subprocess.call(
            ['git', '-C', str(materialx_root), 'diff', '--quiet', 'HEAD']) != 0,
    }
metadata = json.dumps(info, indent=2) + '\n'
(output / 'openusd-build-info.json').write_text(metadata)
(output / 'generated/openusdBuildInfo.h').write_text(
    '#pragma once\nstatic constexpr char kHdEmscriptenOpenUsdBuildInfoJson[] = '
    'R"HDUSDINFO(\n' + metadata + ')HDUSDINFO";\n')
commands = []
for source, command, cwd in base:
    name = Path(source).name
    if name not in ['emHdBindings.cpp', 'webRenderDelegate.cpp']:
        continue
    command = command.copy()
    command.insert(1, '-I' + str(output))
    if args.runtime == 'jspi':
        command = [value.replace('-fexceptions', '-fwasm-exceptions') for value in command]
    command[command.index('-o') + 1] = str(output / (name + '.o'))
    command[command.index('-MF') + 1] = str(output / (name + '.d'))
    commands.append([source, command, cwd])
(output / 'compile-commands.json').write_text(json.dumps(commands, indent=2))

def compile_one(item):
    source, command, cwd = item
    log = output / (Path(source).name + '.log')
    print('Compiling', Path(source).name, flush=True)
    with log.open('w') as stream:
        result = subprocess.run(command, cwd=cwd, stdout=stream, stderr=subprocess.STDOUT)
    if result.returncode:
        print(log.read_text()[-12000:], flush=True)
    result.check_returncode()

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    list(pool.map(compile_one, commands))
link = json.loads(args.link_command.read_text())
link_cwd = args.link_cwd or Path(commands[0][2])
for index, value in enumerate(link):
    if value.endswith('.a') and not Path(value).is_absolute():
        link[index] = str((link_cwd / value).resolve())
    if Path(value).name in ['emHdBindings.cpp.o', 'webRenderDelegate.cpp.o']:
        link[index] = str(output / Path(value).name)
    if materialx_root and '@/usd/usdMtlx/resources/libraries/' in value:
        _, destination = value.rsplit('@', 1)
        relative = destination.removeprefix('/usd/usdMtlx/resources/libraries/')
        library = materialx_root / 'libraries' / relative
        if not library.is_file():
            raise FileNotFoundError(library)
        link[index] = str(library) + '@' + destination
name = 'emHdBindings.jspi' if args.runtime == 'jspi' else 'emHdBindings'
link[link.index('-o') + 1] = str(output / (name + '.js'))
(output / 'link-command.json').write_text(json.dumps(link, indent=2))
(output / 'link-cwd.txt').write_text(str(link_cwd.resolve()) + '\n')
print('Linking bridge against existing OpenUSD libraries', flush=True)
with (output / 'link.log').open('w') as stream:
    result = subprocess.run(link, cwd=link_cwd, stdout=stream, stderr=subprocess.STDOUT,
                            env={**os.environ, 'BINARYEN_CORES': '2'})
if result.returncode:
    print((output / 'link.log').read_text()[-12000:], flush=True)
result.check_returncode()
print('Incremental bridge build complete:', output, flush=True)
