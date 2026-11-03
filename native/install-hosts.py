#!/usr/bin/env python3
"""Make this checkout discoverable by installed usdview, Blender and Houdini."""
import argparse
import json
import os
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--blender-version', default='5.1')
parser.add_argument('--houdini-version', default='22.0')
parser.add_argument('--usd-prefix', type=Path,
                    help='Standalone OpenUSD installation (default: OPENUSD_NATIVE_PREFIX or ~/OpenUSD-26.05-native)')
args = parser.parse_args()
root = Path(__file__).resolve().parent
prefix = (args.usd_prefix or Path(os.environ.get(
    'OPENUSD_NATIVE_PREFIX', Path.home() / 'OpenUSD-26.05-native'))).expanduser().resolve()
if (prefix / 'plugin/usd/plugInfo.json').is_file():
    resources = root / '.build/usdview/plugin/resources'
    if not (resources / 'plugInfo.json').is_file() or not (resources.parent / 'libhdNeedle.dylib').is_file():
        raise SystemExit('Build the usdview Hydra plugin before installing standalone USD discovery')
    # The installation already scans */resources/. Include this build's real
    # manifest so its relative library/resource paths keep working after rebuilds.
    discovery = prefix / 'plugin/usd/needle-hydra/resources/plugInfo.json'
    configuration = {'Includes': [str(resources) + '/']}
    if discovery.exists() and json.loads(discovery.read_text()) != configuration:
        raise SystemExit(f'Refusing to replace different USD plugin entry: {discovery}')
    discovery.parent.mkdir(parents=True, exist_ok=True)
    discovery.write_text(json.dumps(configuration, indent=2) + '\n')
    print(f'usdview plugin discovery: {discovery}')
elif args.usd_prefix or os.environ.get('OPENUSD_NATIVE_PREFIX'):
    raise SystemExit(f'No standalone OpenUSD plugin registry at {prefix}/plugin/usd')
else:
    print(f'usdview installation absent at {prefix}; use --usd-prefix to select another installation')
addon = Path.home() / f'Library/Application Support/Blender/{args.blender_version}/scripts/addons/needle_hydra'
target = root / 'hosts/blender/needle_hydra'
addon.parent.mkdir(parents=True, exist_ok=True)
if addon.is_symlink() and addon.resolve() == target:
    pass
elif addon.exists() or addon.is_symlink():
    raise SystemExit(f'Refusing to replace existing add-on: {addon}')
else:
    addon.symlink_to(target, target_is_directory=True)
package = Path.home() / f'Library/Preferences/houdini/{args.houdini_version}/packages/needle-hydra.json'
package.parent.mkdir(parents=True, exist_ok=True)
legacy_configuration = {'env': [
    {'PXR_PLUGINPATH_NAME': str(root / '.build/houdini/plugin/resources')},
    {'HOUDINI_PATH': str(root / 'hosts/houdini')},
]}
appended_configuration = {'env': [
    {name: {'value': value, 'method': 'append'}}
    for entry in legacy_configuration['env'] for name, value in entry.items()
]}
override_variables = {'PXR_PLUGINPATH_NAME': 'NEEDLE_HOUDINI_PLUGIN_ROOT',
                      'HOUDINI_PATH': 'NEEDLE_HOUDINI_HOST_ROOT'}
configuration = {'env': [
    {name: {'value': '${' + override_variables[name] + '-' + value + '}', 'method': 'append'}}
    for entry in legacy_configuration['env'] for name, value in entry.items()
]}
# Preserve explicit launch-time SDK and metadata overrides. Upgrade only our
# exact previous package; never rewrite a user's different configuration.
if package.exists() and json.loads(package.read_text()) not in [configuration, legacy_configuration, appended_configuration]:
    raise SystemExit(f'Refusing to replace different package: {package}')
package.write_text(json.dumps(configuration, indent=2) + '\n')
print(f'Blender add-on: {addon}\nHoudini package: {package}')
