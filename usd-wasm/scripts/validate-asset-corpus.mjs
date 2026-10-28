#!/usr/bin/env node
// Exercise locally cached assets. Diagnostic screenshots are not USD reference renders.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function argument(name, fallback) {
    const i = process.argv.indexOf(name);
    return i < 0 ? fallback : process.argv[i + 1];
}
const manifestPath = argument('--manifest');
if (!manifestPath) throw new Error('Usage: node scripts/validate-asset-corpus.mjs --manifest assets.json [--executable /path/to/chromium] [--output results.json] [--base http://127.0.0.1:5194]');
const manifest = JSON.parse(await readFile(resolve(manifestPath), 'utf8'));
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(argument('--output', '.cache/runtime-validation/results.json'));
await mkdir(dirname(output), { recursive: true });
const base = argument('--base', 'http://127.0.0.1:5194');
const selected = argument('--assets')?.split(',');
const results = [];
async function saveResults() {
    await writeFile(output, JSON.stringify({ recordedAt: new Date().toISOString(),
        scope: 'Cold Chromium/SwiftShader renderability and diagnostics; not pixel conformance or GPU performance.',
        results }, null, 2) + '\n');
}
for (const [id, asset] of Object.entries(manifest)) {
    if (selected && !selected.includes(id)) continue;
    if (asset.error || !asset.root) {
        results.push({ id, status: 'unavailable', reason: asset.error || 'No local root asset' });
        continue;
    }
    // A new browser per asset prevents retained stages/decoder caches from
    // concealing memory leaks or changing subsequent assets' startup behavior.
    const browser = await chromium.launch({ headless: true, executablePath: argument('--executable'),
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(240_000);
        const pageErrors = [];
        const consoleErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
        await page.goto(new URL('/tests/asset-corpus/index.html', base).href);
        await page.waitForFunction(() => typeof window.runAssetValidation === 'function');
        const path = relative(packageRoot, resolve(asset.root));
        if (path.startsWith('..')) throw new Error('Asset roots must be inside the package local cache');
        const url = new URL('/' + path.split('/').map(encodeURIComponent).join('/'), base).href;
        const result = await page.evaluate(async ({ url }) => Promise.race([
            window.runAssetValidation(url),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Asset load timed out')), 240_000)),
        ]), { url });
        const shaderError = consoleErrors.some(message => /WebGLProgram.*(?:ERROR|ShaderError)|shader error/i.test(message));
        const renders = result.drawnTriangles > 0 && result.foregroundPixels > 0 && !result.errors.length && !pageErrors.length && !shaderError;
        results.push({ id, status: renders ? 'rendered' : 'failed', referenceTriangles: asset.referenceTriangles,
            ...result, pageErrors, consoleErrors });
        await page.screenshot({ path: resolve(dirname(output), `${id}.png`) });
        console.log(id, renders ? 'rendered' : 'FAILED', result.drawnTriangles, 'drawn triangles');
    } catch (error) {
        results.push({ id, status: 'failed', reason: String(error) });
        console.error(id, String(error));
    } finally {
        await browser.close();
        await saveResults();
    }
}
await saveResults();
if (results.some(result => result.status === 'failed')) process.exitCode = 1;
