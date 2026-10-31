import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {test} from 'node:test';

async function fixture(t, {supports = true, failJspi = false} = {}) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'usd-runtime-selection-')));
    const descriptors = ['Suspending', 'promising'].map(key => [key, Object.getOwnPropertyDescriptor(WebAssembly, key)]);
    for (const [key] of descriptors) Object.defineProperty(WebAssembly, key, {value:supports ? function () {} : undefined, configurable:true, writable:true});
    t.after(async () => {
        for (const [key, descriptor] of descriptors) {
            if (descriptor) Object.defineProperty(WebAssembly, key, descriptor);
            else delete WebAssembly[key];
        }
        await rm(root, {recursive:true, force:true});
    });
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    await writeFile(join(root, 'index.js'), await readFile(new URL('../../src/bindings/index.js', import.meta.url)));
    for (const runtime of ['asyncify', 'jspi']) {
        const stem = runtime === 'jspi' ? 'emHdBindings.jspi' : 'emHdBindings';
        await writeFile(join(root, stem + '.js'), `
let calls = 0;
module.exports = async options => {
    calls++;
    ${runtime === 'jspi' && failJspi ? "throw new Error('JSPI initialization failed');" : ''}
    return { runtime:${JSON.stringify(runtime)}, calls, owner:options.owner,
        script:options.mainScriptUrlOrBlob, wasm:options.locateFile(${JSON.stringify(stem + '.wasm')}) };
};`);
    }
    return {root, ...await import(pathToFileURL(join(root, 'index.js')))};
}

for (const supports of [true, false]) {
    test(`Node keeps default Asyncify binding behavior (JSPI support: ${supports})`, async t => {
        const {getUsdModule} = await fixture(t, {supports});
        const module = await getUsdModule();
        assert.equal(module.runtime, 'asyncify');
        assert.match(module.wasm, /emHdBindings\.wasm$/);
    });
    test(`Node auto selects the matching generated CJS loader (JSPI support: ${supports})`, async t => {
        const {root, getUsdModule} = await fixture(t, {supports});
        const module = await getUsdModule({asyncRuntime:'auto'});
        assert.equal(module.runtime, supports ? 'jspi' : 'asyncify');
        assert.equal(module.wasm, join(root, supports ? 'emHdBindings.jspi.wasm' : 'emHdBindings.wasm'));
    });
}

test('Node keeps the first caller runtime, options and module for concurrent requests', async t => {
    const {getUsdModule} = await fixture(t);
    const script = new Blob(['custom worker']);
    const [first, second] = await Promise.all([
        getUsdModule({asyncRuntime:'jspi', owner:'first', mainScriptUrlOrBlob:script, locateFile:file => '/custom/' + file}),
        getUsdModule({asyncRuntime:'asyncify', owner:'second'}),
    ]);
    assert.equal(first, second);
    assert.equal(first.runtime, 'jspi');
    assert.equal(first.owner, 'first');
    assert.equal(first.calls, 1);
    assert.equal(first.script, script);
    assert.equal(first.wasm, '/custom/emHdBindings.jspi.wasm');
});

test('explicit Asyncify ignores available JSPI support and honors empty locateFile fallback', async t => {
    const {root, getUsdModule} = await fixture(t);
    assert.equal((await getUsdModule({asyncRuntime:'asyncify', locateFile:() => ''})).wasm, join(root, 'emHdBindings.wasm'));
});

test('explicit unsupported JSPI fails before loading a factory and the failure stays cached', async t => {
    const {getUsdModule} = await fixture(t, {supports:false});
    await assert.rejects(getUsdModule({asyncRuntime:'jspi'}), /requires WebAssembly\.Suspending and WebAssembly\.promising/);
    await assert.rejects(getUsdModule({asyncRuntime:'asyncify'}), /requires WebAssembly\.Suspending and WebAssembly\.promising/);
});

test('auto requires both JSPI APIs', async t => {
    const {getUsdModule} = await fixture(t);
    WebAssembly.promising = undefined;
    assert.equal((await getUsdModule({asyncRuntime:'auto'})).runtime, 'asyncify');
});

test('JSPI initialization failure never silently retries Asyncify', async t => {
    const {getUsdModule} = await fixture(t, {failJspi:true});
    const settled = await Promise.allSettled([getUsdModule({asyncRuntime:'auto'}), getUsdModule({asyncRuntime:'asyncify'})]);
    assert.equal(settled[0].status, 'rejected');
    assert.equal(settled[1].status, 'rejected');
    assert.equal(settled[0].reason, settled[1].reason);
    assert.match(settled[0].reason.message, /JSPI initialization failed/);
});

test('invalid runtime options reject before importing any generated loader', async t => {
    const {getUsdModule} = await fixture(t);
    await assert.rejects(getUsdModule({asyncRuntime:'other'}), /Expected auto, jspi, or asyncify/);
});
