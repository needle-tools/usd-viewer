"""Check managed plugin discovery without touching installed hosts."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


class HostInstallation(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        base = Path(self.temporary.name).resolve()
        self.home = base / 'home'
        self.root = base / 'checkout/native'
        self.root.mkdir(parents=True)
        shutil.copyfile(Path(__file__).resolve().parents[1] / 'install-hosts.py',
                        self.root / 'install-hosts.py')
        self.resources = self.root / '.build/usdview/plugin/resources'
        self.resources.mkdir(parents=True)
        (self.resources / 'plugInfo.json').write_text('{}\n')
        (self.resources.parent / 'libhdNeedle.dylib').touch()
        self.prefix = self.home / 'OpenUSD-26.05-native'
        self.registry = self.prefix / 'plugin/usd/plugInfo.json'
        self.registry.parent.mkdir(parents=True)
        self.registry.write_text('{"Includes": ["*/resources/"]}\n')
        self.discovery = self.registry.parent / 'needle-hydra/resources/plugInfo.json'

    def install(self, *arguments):
        environment = dict(os.environ, HOME=str(self.home))
        environment.pop('OPENUSD_NATIVE_PREFIX', None)
        return subprocess.run([sys.executable, str(self.root / 'install-hosts.py'), *arguments],
                              env=environment, text=True, capture_output=True)

    def test_default_prefix_is_repeatable_and_preserves_the_existing_registry(self):
        original = self.registry.read_bytes()
        for _ in range(2):
            result = self.install()
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(self.discovery.read_text()),
                             {'Includes': [str(self.resources) + '/']})
            self.assertEqual(self.registry.read_bytes(), original)
        addon = self.home / 'Library/Application Support/Blender/5.1/scripts/addons/needle_hydra'
        self.assertTrue(addon.is_symlink())
        self.assertEqual(addon.readlink(), self.root / 'hosts/blender/needle_hydra')

    def test_different_plugin_entry_is_not_overwritten(self):
        self.discovery.parent.mkdir(parents=True)
        original = '{"Includes": ["/another/checkout/resources/"]}\n'
        self.discovery.write_text(original)
        result = self.install()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Refusing to replace different USD plugin entry', result.stderr)
        self.assertEqual(self.discovery.read_text(), original)

    def test_explicit_prefix_and_missing_build(self):
        custom = self.home / 'custom-usd'
        self.prefix.rename(custom)
        result = self.install('--usd-prefix', str(custom))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((custom / 'plugin/usd/needle-hydra/resources/plugInfo.json').is_file())
        (self.resources.parent / 'libhdNeedle.dylib').unlink()
        result = self.install('--usd-prefix', str(custom))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Build the usdview Hydra plugin', result.stderr)
        result = self.install('--usd-prefix', str(self.prefix))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('No standalone OpenUSD plugin registry', result.stderr)


if __name__ == '__main__':
    unittest.main()
