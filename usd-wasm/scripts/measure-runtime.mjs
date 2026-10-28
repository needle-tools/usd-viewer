#!/usr/bin/env node
// Fresh-process measurements; heap reservation and process RSS are distinct.
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const script = fileURLToPath(import.meta.url);
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const argument = name => args[args.indexOf(name) + 1];

if (args.includes('--child')) {
    const { Group } = await import('three');
    const { createThreeHydra } = await import('../src/create.three.js');
    const { getUsdModule } = await import(pathToFileURL(resolve(argument('--bindings'), 'index.js')));
    const started = performance.now();
    const USD = await getUsdModule({ print() {}, printErr() {}, setStatus() {} });
    const moduleMs = performance.now() - started;
    const moduleRss = process.memoryUsage().rss;
    const moduleHeap = USD.wasmMemory.buffer.byteLength;
    const source = '#usda 1.0\ndef Xform "World"\n{\n def Cube "Cube" {}\n}\n';
    const scene = new Group();
    const handle = await createThreeHydra({
        USD, scene, url: 'memory-probe.usda', buffer: new TextEncoder().encode(source),
    });
    await handle.ready();
    await handle.materialsReady();
    const result = {
        moduleMs, moduleRss, moduleHeap,
        stageMs: performance.now() - started - moduleMs,
        stageRss: process.memoryUsage().rss,
        stageHeap: USD.wasmMemory.buffer.byteLength,
        visibleMeshes: scene.children.filter(object => object.isMesh && object.visible).length,
    };
    await handle.dispose();
    console.log(JSON.stringify(result));
    process.exit(0);
}

const bindings = [resolve(packageRoot, 'src/bindings')];
if (args.includes('--baseline')) bindings.unshift(resolve(argument('--baseline')));
const runs = args.includes('--runs') ? Number(argument('--runs')) : 3;
if (!Number.isInteger(runs) || runs < 1 || runs > 20) throw new Error('--runs must be between 1 and 20');
const results = [];
for (const directory of bindings) {
    const sizes = [];
    for (const file of ['emHdBindings.js', 'emHdBindings.wasm']) {
        const bytes = await readFile(resolve(directory, file));
        sizes.push({
            file, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length,
            brotli: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
        });
    }
    const samples = [];
    for (let i = 0; i < runs; ++i) {
        const child = spawnSync(process.execPath, [script, '--child', '--bindings', directory], {
            encoding: 'utf8', timeout: 120000,
        });
        if (child.error || child.status !== 0) throw new Error(child.error?.message || child.stderr || child.stdout);
        const sample = JSON.parse(child.stdout.trim().split('\n').at(-1));
        if (sample.visibleMeshes !== 1) throw new Error('Memory probe did not produce the expected cube');
        samples.push(sample);
    }
    const median = {};
    for (const key of Object.keys(samples[0])) {
        median[key] = samples.map(sample => sample[key]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    }
    results.push({ bindings: directory, sizes, samples, median });
}
console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, results }, null, 2));
