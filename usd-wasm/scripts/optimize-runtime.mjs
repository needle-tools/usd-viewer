#!/usr/bin/env node
// Optional post-link size pass. Keep the native link output as the input so
// the transformation and its exact Binaryen version remain reproducible.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
export const flags = [
    '--enable-threads', '--enable-bulk-memory', '--enable-bulk-memory-opt',
    '--enable-call-indirect-overlong', '--enable-multivalue', '--enable-mutable-globals',
    '--enable-nontrapping-float-to-int', '--enable-reference-types', '--enable-sign-ext',
    '--merge-similar-functions', '-Oz', '--strip-debug', '--strip-producers',
];

export async function describeOptimization(input, output, optimizer = process.env.WASM_OPT || 'wasm-opt') {
    const [before, after, version] = await Promise.all([
        readFile(input), readFile(output), execute(optimizer, ['--version']),
    ]);
    const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
    return {
        schema: 1, optimizer: version.stdout.trim(), arguments: flags,
        input: { bytes: before.length, sha256: sha256(before) },
        output: { bytes: after.length, sha256: sha256(after) },
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const [input, output] = process.argv.slice(2);
    if (!input || !output || resolve(input) === resolve(output)) {
        throw new Error('Usage: WASM_OPT=/path/to/wasm-opt node scripts/optimize-runtime.mjs input.wasm output.wasm');
    }
    const optimizer = process.env.WASM_OPT || 'wasm-opt';
    await execute(optimizer, [input, ...flags, '-o', output], {
        env: { ...process.env, BINARYEN_CORES: process.env.BINARYEN_CORES || '2' },
        maxBuffer: 1024 * 1024,
    });
    const info = await describeOptimization(input, output, optimizer);
    await writeFile(`${output}.optimization.json`, JSON.stringify(info, null, 2) + '\n');
    console.log(JSON.stringify(info, null, 2));
}
