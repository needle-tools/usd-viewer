import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: false,
resolve: { dedupe: ['three'] }, optimizeDeps: { noDiscovery: true, include: ['three', 'three/webgpu', 'three/tsl', 'three/addons/loaders/MaterialXLoader.js'] },
server: { port: 0, headers: {
    'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Opener-Policy': 'same-origin',
} }, plugins: [{ name: 'volume-test-page', configureServer(server) {
    server.middlewares.use((_req, res, next) => {
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        next();
    });
    server.middlewares.use('/src/bindings/emHdBindings.js', async (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(await readFile(root + '/src/bindings/emHdBindings.js'));
    });
    server.middlewares.use('/volume-test', (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><link rel="icon" href="data:,"><title>Bounded volume test</title>'); });
} }] });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu'] });
try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    page.on('console', message => { if (message.type() === 'error' || /THREE\.TSL.*warn/i.test(message.text())) { errors.push(message.text()); console.error(message.text()); } });
    await page.goto(server.resolvedUrls.local[0] + 'volume-test');
    backendLoop: for (const forceWebGL of [true, false]) {
        for (const emission of [false, true]) {
            errors.length = 0;
            const result = await page.evaluate(async options => {
                const { probeVolumeStage } = await import('/tests/hydra/volume-browser.js');
                return probeVolumeStage(options);
            }, { forceWebGL, emission });
            console.log(JSON.stringify({ requestedBackend: forceWebGL ? 'WebGL2' : 'WebGPU', emission, ...result }));
            assert.deepEqual(errors, [], 'shader/runtime errors');
            if (result.skip && !forceWebGL) continue backendLoop;
            assert.deepEqual(result.backend, { isWebGPUBackend: !forceWebGL, isWebGLBackend: forceWebGL }, 'actual renderer backend');
            assert.deepEqual(result.terminals, ['volume'], 'native Hydra must export the volume terminal');
            assert.ok(result.materials.some(material => material.type === 'BoundedVolumeNodeMaterial'), 'real USD volume terminal must produce a bounded medium');
            assert.ok(result.materials.every(material => material.side === 1), 'surface sidedness must not change the back-face volume proxy');
            const expected = emission ? [51, 102, 153] : [171, 94, 35];
            expected.forEach((value, channel) => assert.ok(Math.abs(result.pixel[channel] - value) <= 2, `channel ${channel}: expected ${value}, got ${result.pixel[channel]}`));
            expected.forEach((value, channel) => assert.ok(Math.abs(result.beautyPixel[channel] - value) <= 2, `Beauty channel ${channel}: expected ${value}, got ${result.beautyPixel[channel]}`));
            result.occluderOnly.slice(0,3).forEach((value, channel) => assert.ok(Math.abs(result.occluded[channel]-value)<=2, `Beauty opaque occluder channel ${channel}: expected ${value}, got ${result.occluded[channel]}`));
        }
        for (const name of ['ember-torus', 'jade-plume', 'violet-lattice']) {
            errors.length = 0;
            const result = await page.evaluate(async options => {
                const { probeProceduralVolume } = await import('/tests/hydra/volume-browser.js');
                return probeProceduralVolume(options);
            }, { forceWebGL, name });
            assert.deepEqual(errors, [], `${name}: shader/runtime errors`);
            if (result.skip && !forceWebGL) {
                console.log(JSON.stringify({ requestedBackend: 'WebGPU', name, ...result }));
                continue backendLoop;
            }
            assert.deepEqual(result.backend, { isWebGPUBackend: !forceWebGL, isWebGLBackend: forceWebGL }, 'actual renderer backend');
            assert.ok(result.bright > 20 && result.dark > 20, `${name}: procedural coefficients must produce visible spatial variation`);
            console.log(JSON.stringify({ requestedBackend: forceWebGL ? 'WebGL2' : 'WebGPU', name, ...result }));
        }
    }
} finally { await browser.close(); await server.close(); }
