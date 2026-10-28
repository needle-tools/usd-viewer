// Requires macOS Safari with remote automation enabled and a running public viewer.
// USD_VIEWER_BASE_URL=http://localhost:3003 npm run test:safari-reloads
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

assert.equal(process.platform, 'darwin', 'This regression requires actual macOS Safari.');
const baseURL = process.env.USD_VIEWER_BASE_URL || 'http://localhost:3003';
const reportPath = process.env.USD_SAFARI_REPORT;
const reloads = Number(process.env.USD_SAFARI_RELOADS || 12);
assert.ok(Number.isInteger(reloads) && reloads >= 4, 'Use at least four consecutive reloads.');
assert.equal((await fetch(baseURL, { signal: AbortSignal.timeout(10_000) })).status, 200);

const portProbe = createServer();
await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const driver = spawn('/usr/bin/safaridriver', ['-p', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
let driverOutput = '';
driver.stdout.on('data', data => { driverOutput += data; });
driver.stderr.on('data', data => { driverOutput += data; });
const driverURL = `http://127.0.0.1:${port}`;
let sessionId;
const report = { baseURL, started: new Date().toISOString(), browser: null, steps: [], passed: false };

async function command(path, body, method = 'POST', timeout = 30_000) {
    const response = await fetch(driverURL + (sessionId ? `/session/${sessionId}` : '') + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
    });
    const { value } = await response.json();
    if (value?.error) throw new Error(`${value.error}: ${value.message}`);
    return value;
}

async function checkReady(action, expectedIndex) {
    const started = Date.now();
    const deadline = started + 40_000;
    let state;
    do {
        state = await command('/execute/sync', { args: [], script: `
            if (!window.__safariReloadCheck) {
                window.__safariReloadCheck = { restored: false };
                addEventListener('pageshow', event => { window.__safariReloadCheck.restored = event.persisted; });
            }
            const needle = new URL(location.href).searchParams.get('viewer') === 'needle';
            const context = window.needleEngineContext;
            const root = needle ? context?.scene : window.usdRoot;
            const renderer = needle ? context?.renderer : window.renderer;
            const gl = renderer?.getContext?.();
            const extension = gl?.getExtension('WEBGL_debug_renderer_info');
            let materials = 0;
            root?.traverse?.(object => {
                for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
                    if (material?.constructor?.name === 'MaterialXMaterial') materials++;
                }
            });
            return {
                url: location.href,
                ready: !!window.usdHydra && materials > 0 && !document.querySelector('#loading-overlay')?.classList.contains('visible'),
                driverAlive: !!window.driver && !window.driver.isDeleted?.(),
                materials,
                contextLost: gl?.isContextLost(),
                glError: gl?.getError(),
                renderer: gl ? gl.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : null,
                restored: window.__safariReloadCheck.restored,
                build: document.querySelector('#openusd-build-info')?.textContent,
                log: document.querySelector('#message-log')?.textContent?.slice(-1500),
            };` }, 'POST', Math.max(1, Math.min(30_000, deadline - Date.now())));
        if (state.ready || /Out of memory|Failed to load the USD module/i.test(state.log || '')) break;
        await new Promise(resolve => setTimeout(resolve, 200));
    } while (Date.now() < deadline);
    report.steps.push({ action, elapsedMs: Date.now() - started, ...state });
    console.log(JSON.stringify(report.steps.at(-1)));
    assert.ok(state.ready && state.driverAlive, `${action}: runtime/stage not ready: ${state.log}`);
    assert.equal(new URL(state.url).searchParams.get('safariReloadTest'), String(expectedIndex), `${action}: wrong history destination`);
    assert.equal(state.contextLost, false, `${action}: lost WebGL context`);
    assert.equal(state.glError, 0, `${action}: WebGL error`);
}

function assetURL(viewer, iteration) {
    const url = new URL(baseURL);
    url.search = new URLSearchParams({
        debug: '', viewer, waitForMaterials: '1', safariReloadTest: String(iteration),
        file: '/test-fixtures/materialx/custom_nodedef_materialx.usda',
    }).toString();
    return url.href;
}

try {
    const startDeadline = Date.now() + 10_000;
    for (;;) {
        try { await fetch(`${driverURL}/status`, { signal: AbortSignal.timeout(500) }); break; }
        catch (error) {
            if (driver.exitCode !== null || Date.now() > startDeadline) throw new Error(`safaridriver did not start: ${driverOutput}`, { cause: error });
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    const session = await command('/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } });
    sessionId = session.sessionId;
    report.browser = session.capabilities;
    await command('/timeouts', { pageLoad: 25_000, script: 25_000 });
    await command('/url', { url: assetURL('three', 0) });
    await checkReady('initial', 0);
    for (let index = 0; index < reloads; index++) {
        await command('/refresh', {});
        await checkReady(`reload ${index + 1}`, 0);
    }
    for (let index = 1; index <= 8; index++) {
        await command('/url', { url: assetURL(index % 2 ? 'needle' : 'three', index) });
        await checkReady(`navigation ${index}`, index);
    }
    for (const [direction, expectedIndex] of [['back', 7], ['back', 6], ['back', 5], ['forward', 6], ['forward', 7], ['forward', 8]]) {
        await command(`/${direction}`, {});
        await checkReady(direction, expectedIndex);
    }
    report.passed = true;
} finally {
    if (sessionId) await command('', undefined, 'DELETE').catch(error => { report.cleanupError = String(error); });
    driver.kill('SIGTERM');
    await Promise.race([once(driver, 'exit'), new Promise(resolve => setTimeout(resolve, 2000))]);
    if (driver.exitCode === null && driver.signalCode === null) driver.kill('SIGKILL');
    if (reportPath) {
        await mkdir(dirname(reportPath), { recursive: true });
        await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    }
}
