import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const json = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const browser = await json('.cache/coverage-validation/browser-results.json');
const skinning = await json('.cache/coverage-validation/skinning-comparison.json');
const catalog = await import(new URL('tests/fixtures/coverage/asset-library.js', root));
assert.equal(browser.results.length, catalog.coverageAssetLibrary.length);
assert.equal(new Set(browser.results.map(result => result.id)).size, browser.results.length);
const sources = {};
for (const name of ['src/hydra/materialPrimvars.js', 'src/hydra/ThreeJsRenderDelegate.js', 'src/hydra/strokeGeometry.js', 'src/hydra/vdbVolumeMaterial.js', 'src/hydra/materialxDefinitions.js', 'src/bindings/emHdBindings.wasm']) {
    sources[name] = createHash('sha256').update(await readFile(new URL(name, root))).digest('hex');
}
if (browser.wasmSha256AtStart) {
    assert.equal(browser.wasmSha256AtStart, browser.wasmSha256AtEnd, 'Runtime changed during the corpus run');
    assert.equal(sources['src/bindings/emHdBindings.wasm'], browser.wasmSha256AtStart,
        'Run the corpus against the current artifact before regenerating its source summary');
}
const results = browser.results.map(result => ({
    id: result.id,
    loaded: result.loaded,
    visiblePixels: result.smoke.rendered,
    materialXMaterialsCreated: result.diagnostics?.materialXCreateSuccess || 0,
    splatCounts: (result.samples?.[0]?.scene.particleFields || []).map(field => field.numSplats).filter(count => count !== null),
    sampledAnimationChanged: result.animation?.sceneDataChanged || false,
    unsupportedPrimTypes: [...new Set((result.consoleMessages || []).flatMap(message =>
        [...message.text.matchAll(/doesn't support prim type '([^']+)'/g)].map(match => match[1])))],
    ...(skinning.results.some(rig => rig.id === result.id) ? {
        nativeSkinningPositionsMatch: skinning.results.find(rig => rig.id === result.id).pass,
    } : {}),
}));
const report = {
    recordedAt: browser.recordedAt,
    testedWasmSha256: browser.wasmSha256AtStart || sources['src/bindings/emHdBindings.wasm'],
    scope: 'Chromium render samples at frames 1, 24 and 48; WebGLRenderer for surfaces, node renderer with forceWebGL for bounded volumes. Authored lighting and fixture metadata are honored; other cases use framing and preview lights. Visible pixels and successful material creation do not establish complete feature conformance.',
    sources,
    fixtureCount: results.length,
    loaded: results.filter(result => result.loaded).length,
    visible: results.filter(result => result.visiblePixels).length,
    nativeSkinning: {
        comparedFixtures: skinning.results.length,
        matchingFixtures: skinning.results.filter(result => result.pass).length,
        frames: [1, 24, 48],
        tolerance: skinning.tolerance,
        maxObservedPositionError: Math.max(...skinning.results.flatMap(result => result.samples.map(sample => sample.maxError))),
        scope: skinning.scope,
    },
    results,
};
const output = new URL('.cache/coverage-validation/runtime-validation.json', root);
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(`${report.loaded}/${report.fixtureCount} loaded, ${report.visible} visible; ${report.nativeSkinning.matchingFixtures} native skinning comparisons pass. ${fileURLToPath(output)}`);
