// This measures calls into the generated core binding surface, not assertion,
// behavior or complete SDK coverage. Preview/export harness calls are excluded.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getUsdModule } from '../src/bindings/index.js';
import { executeExample } from '../tests/fixtures/api/execute.js';
import { replExamples, apiExampleAssets } from '../tests/fixtures/api/examples.js';
import { testAssetLibrary } from '../tests/fixtures/test-asset-library.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const metadata = resolve(process.argv[2] || resolve(root, '../../openusd/pxr/usdImaging/hdEmscripten/bindgen/core-bindings.json'));
const schema = JSON.parse(await readFile(metadata, 'utf8'));
const USD = await getUsdModule({ print() {}, printErr() {} });
const entries = [], restore = [], cases = [];
let executing = false, hits = new Set();
function instrument(owner, key, id) {
  const descriptor = Object.getOwnPropertyDescriptor(owner, key);
  if (typeof descriptor?.value !== 'function') throw new Error(`Binding metadata/runtime mismatch: ${id}`);
  entries.push(id);
  const wrapped = new Proxy(descriptor.value, { apply(target, receiver, args) {
    if (executing) hits.add(id);
    return Reflect.apply(target, receiver, args);
  } });
  Object.defineProperty(owner, key, { ...descriptor, value: wrapped });
  restore.push(() => Object.defineProperty(owner, key, descriptor));
}
try {
  for (const type of schema.classes) for (const method of type.methods) instrument(USD[type.jsName].prototype, method.jsName, `${type.jsName}.${method.jsName}`);
  for (const fn of schema.functions) instrument(USD, fn.jsName, `USD.${fn.jsName}`);
  for (const [index, example] of replExamples.entries()) {
    hits = new Set();
    await executeExample(USD, example, {
      fixtureCatalog: testAssetLibrary,
      readFixture: async path => new Uint8Array(await readFile(resolve(root, 'tests/fixtures', path))),
      onExecute: value => { executing = value; },
    });
    cases.push({ id: apiExampleAssets[index].executable, calls: [...hits].sort() });
  }
} finally {
  for (const undo of restore.reverse()) undo();
}
const called = new Set(cases.flatMap(example => example.calls));
const report = {
  scope: 'Generated EditTarget, Layer, Attribute, Relationship, Prim, Stage methods and five core functions only. Calls entered during example execution (including example helpers); excludes preview/export harness calls.',
  exclusions: ['Schema wrappers and math/vector types', 'HdWebSyncDriver', 'Emscripten internals/filesystem', 'SDK exports and returned controllers', 'Browser viewer integration', 'Assertions, argument combinations and failure-path coverage'],
  examples: cases.length, callableEntries: entries.length, calledEntries: called.size,
  callEntryPercent: Number((called.size / entries.length * 100).toFixed(1)),
  byClass: schema.classes.map(type => ({ name: type.jsName, total: type.methods.length,
    called: type.methods.filter(method => called.has(`${type.jsName}.${method.jsName}`)).length })),
  missing: entries.filter(id => !called.has(id)).sort(), cases,
};
const output = resolve(root, '.cache/api-example-call-audit.json');
await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, cases: undefined }, null, 2));
