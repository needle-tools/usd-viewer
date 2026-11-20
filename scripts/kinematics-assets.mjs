import { build } from 'esbuild';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = await build({
  absWorkingDir: root,
  entryPoints: [fileURLToPath(import.meta.resolve('closed-chain-ik/core'))],
  outfile: 'kinematics.js',
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
  minify: true, legalComments: 'linked', metafile: true, write: false,
  footer: { js: '/* Third-party licenses: kinematics.js.LICENSE.txt */' },
});

const packages = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  let folder = dirname(resolve(root, input));
  while (!existsSync(join(folder, 'package.json')) && dirname(folder) !== folder) folder = dirname(folder);
  if (existsSync(join(folder, 'package.json'))) packages.add(folder);
}
const notices = [];
for (const folder of [...packages].sort()) {
  const pkg = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'));
  const license = readdirSync(folder).find(name => /^licen[cs]e(?:$|\.)/i.test(name));
  let text;
  if (license) text = readFileSync(join(folder, license), 'utf8');
  else if (pkg.license) {
    const readme = readFileSync(join(folder, 'README.md'), 'utf8');
    text = `License declared by package.json: ${pkg.license}\n${readme.match(/# License[\s\S]*$/i)?.[0] || ''}`;
  }
  if (!text) throw new Error(`Missing bundled license for ${pkg.name}`);
  notices.push(`${pkg.name} ${pkg.version}\n${JSON.stringify(pkg.repository || pkg.homepage || '')}\n\n${text}`);
}

export const kinematicsAssets = new Map(result.outputFiles.map(file => [basename(file.path), file.text]));
kinematicsAssets.set('kinematics.js.LICENSE.txt', notices.join('\n\n----------------------------------------\n\n'));
