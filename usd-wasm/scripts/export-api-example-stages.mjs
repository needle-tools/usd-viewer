// Export the actual executable fixtures for native usdrecord/Storm previews.
// These snapshots are capture inputs only; the viewer executes the JS sources.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { fork } from 'node:child_process';
import { getUsdModule } from '../src/bindings/index.js';
import { executeExample } from '../tests/fixtures/api/execute.js';
import { replExamples, apiExampleAssets, hasAuthoredLighting } from '../tests/fixtures/api/examples.js';
import { testAssetLibrary } from '../tests/fixtures/test-asset-library.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isolated = process.argv[2] === '--example';
// `--only id,id` exports a subset, for refreshing just the changed previews.
const onlyIndex = process.argv.indexOf('--only');
const only = onlyIndex > 0 ? new Set(process.argv[onlyIndex + 1].split(',')) : null;
const positional = process.argv.slice(2).filter((_, i, args) => args[i] !== '--only' && args[i - 1] !== '--only');
const out = resolve(root, (isolated ? process.argv[4] : positional[0]) || '.cache/api-example-captures');

// Match the browser runner's isolation: USD's native layer registry must not
// retain modified fixture layers from one example while capturing the next.
if (!isolated) {
  const entries = [];
  for (const asset of apiExampleAssets.filter(asset => !only || only.has(asset.executable))) {
    const entry = await new Promise((resolveEntry, reject) => {
      const child = fork(fileURLToPath(import.meta.url), ['--example', asset.executable, out], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
      let result, errors = '';
      child.stderr.on('data', chunk => { errors += chunk; });
      child.on('message', value => { result = value; });
      child.once('error', reject);
      child.once('exit', code => code === 0 && result ? resolveEntry(result) : reject(new Error(`${asset.label}: ${errors || `capture export exited ${code}`}`)));
    });
    entries.push(entry); console.log('exported', entry.example);
  }
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'manifest.json'), JSON.stringify(entries, null, 2) + '\n');
  console.log(`Exported ${entries.length} executable examples to ${out}`);
} else {
  const index = apiExampleAssets.findIndex(asset => asset.executable === process.argv[3]);
  if (index < 0) throw new Error('Unknown API example');
  const example = replExamples[index], asset = apiExampleAssets[index], directory = resolve(out, asset.executable);
  const USD = await getUsdModule({ print() {}, printErr: message => console.warn(message) });
  const sceneKitSource = await readFile(resolve(root, 'tests/fixtures/api/scene-kit.js'), 'utf8');
  const authoringSource = await readFile(resolve(root, 'tests/fixtures/api/create-api-stage.js'), 'utf8');
  const result = await executeExample(USD, example, {
    fixtureCatalog: testAssetLibrary,
    readFixture: async path => new Uint8Array(await readFile(resolve(root, 'tests/fixtures', path))),
  });
  if (!result.hasGeometry || !result.files.length) throw new Error(`${asset.label} has no renderable scene`);
  for (const file of result.files) {
    const destination = resolve(directory, file.path);
    await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, file.bytes);
  }
  process.send({ id: `api-${asset.executable}`, example: asset.executable,
    ...(hasAuthoredLighting(example) ? { thumbnailCameraLight: false } : {}),
    sourceFingerprint: createHash('sha256').update(JSON.stringify([example.code, sceneKitSource, authoringSource])).digest('hex'),
    hasGeometry: result.hasGeometry, root: resolve(directory, result.files[0].path) });
  process.exit(0);
}
