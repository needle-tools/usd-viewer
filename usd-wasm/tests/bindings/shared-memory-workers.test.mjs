import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

function probeMemoryAllocations(suppliedMemory) {
    const directory = mkdtempSync(join(tmpdir(), 'usd-worker-memory-'));
    try {
        const bindings = resolve('src/bindings');
        const instrumented = join(directory, 'bindings.cjs');
        const events = join(directory, 'memory.jsonl');
        const contexts = join(directory, 'contexts.jsonl');
        // Pthreads load this same generated file. Record constructor calls
        // synchronously in each global before worker initialization completes.
        const instrumentation = `
const { isMainThread: memoryProbeMain, threadId: memoryProbeThread } = require('node:worker_threads');
require('node:fs').appendFileSync(${JSON.stringify(contexts)}, JSON.stringify({ thread: memoryProbeThread, main: memoryProbeMain }) + '\\n');
const originalMemoryConstructor = WebAssembly.Memory;
WebAssembly.Memory = new Proxy(originalMemoryConstructor, {
    construct(target, args, newTarget) {
        const event = { thread: memoryProbeThread, main: memoryProbeMain, ...args[0] };
        require('node:fs').appendFileSync(${JSON.stringify(events)}, JSON.stringify(event) + '\\n');
        return Reflect.construct(target, args, newTarget);
    },
});
`;
        writeFileSync(instrumented, instrumentation + readFileSync(join(bindings, 'emHdBindings.js'), 'utf8'));
        const runner = join(directory, 'probe.cjs');
        writeFileSync(runner, `
const supplied = ${suppliedMemory} ? new WebAssembly.Memory({ initial: 256, maximum: 32768, shared: true }) : undefined;
const createModule = require(${JSON.stringify(instrumented)});
createModule({
    ...(supplied ? { wasmMemory: supplied } : {}),
    locateFile: file => require('node:path').join(${JSON.stringify(bindings)}, file),
    print() {}, printErr() {},
}).then(USD => {
    const lines = path => require('node:fs').existsSync(path) ? require('node:fs').readFileSync(path, 'utf8').trim().split('\\n').filter(Boolean).map(JSON.parse) : [];
    console.log(JSON.stringify({ events: lines(${JSON.stringify(events)}), contexts: lines(${JSON.stringify(contexts)}), suppliedMemoryPreserved: !supplied || USD.wasmMemory === supplied, version: JSON.parse(USD.GetBuildInfoJson()).openusd.pxrVersion }));
    process.exit(0);
}).catch(error => { console.error(error); process.exit(1); });
`);
        const output = execFileSync(process.execPath, [runner], { encoding: 'utf8', timeout: 30_000 });
        return JSON.parse(output.trim().split('\n').at(-1));
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}

test('pthread workers share the module memory without allocating private shared memories', () => {
    const result = probeMemoryAllocations(false);
    assert.equal(result.version, 2611, 'the actual USD runtime initialized');
    assert.equal(result.contexts.filter(context => !context.main).length, 10, 'all pthread workers started');
    assert.equal(result.events.length, 1, JSON.stringify(result.events));
    assert.equal(result.events[0].main, true, 'only the main runtime constructs memory');
    assert.equal(result.events[0].shared, true);
    assert.equal(result.events[0].maximum, 32768, 'the existing desktop capacity is preserved');
});

test('the runtime preserves a supplied shared memory without replacing it in any thread', () => {
    const result = probeMemoryAllocations(true);
    assert.equal(result.version, 2611, 'the actual USD runtime initialized');
    assert.equal(result.contexts.filter(context => !context.main).length, 10, 'all pthread workers started');
    assert.equal(result.suppliedMemoryPreserved, true);
    assert.deepEqual(result.events, [], 'neither the host nor its pthreads allocate another memory');
});

test('concurrent first calls initialize one host module using the first caller options', () => {
    const directory = mkdtempSync(join(tmpdir(), 'usd-concurrent-init-'));
    try {
        const runner = join(directory, 'probe.mjs');
        const entry = pathToFileURL(resolve('src/bindings/index.js')).href;
        writeFileSync(runner, `
import { getUsdModule } from ${JSON.stringify(entry)};
let allocations = 0;
WebAssembly.Memory = new Proxy(WebAssembly.Memory, {
    construct(target, args, newTarget) {
        allocations++;
        return Reflect.construct(target, args, newTarget);
    },
});
const options = owner => ({ allocationOwner: owner, print() {}, printErr() {} });
const modules = await Promise.all([getUsdModule(options('first')), getUsdModule(options('second'))]);
console.log(JSON.stringify({ sameModule: modules[0] === modules[1], allocations, owners: modules.map(module => module.allocationOwner), version: JSON.parse(modules[0].GetBuildInfoJson()).openusd.pxrVersion }));
process.exit(0);
`);
        const output = execFileSync(process.execPath, [runner], { encoding: 'utf8', timeout: 30_000 });
        const result = JSON.parse(output.trim().split('\n').at(-1));
        assert.equal(result.version, 2611);
        assert.equal(result.sameModule, true, JSON.stringify(result));
        assert.equal(result.allocations, 1);
        assert.deepEqual(result.owners, ['first', 'first']);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
