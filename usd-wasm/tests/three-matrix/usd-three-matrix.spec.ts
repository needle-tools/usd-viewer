import { expect, test } from '@playwright/test';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

type MatrixPage = {
    id: string;
    version: string;
    rendererMode: string;
    fixtureName: string;
    fixtureUrl: string;
    fixtureFiles: Array<{ path: string; url: string }> | null;
    fixtureSource: string;
    fixtureExpectedRenderable: boolean;
    fixtureExpectedRenderableReason: string | null;
    fixtureExpectedMaterialXMaterials: number;
    pagePath: string;
};
type MatrixResult = {
    version: string;
    rendererMode: string;
    fixtureName: string;
    fixtureUrl: string;
    fixtureFiles: Array<{ path: string; url: string }> | null;
    fixtureSource: string;
    fixtureExpectedRenderable: boolean;
    fixtureExpectedRenderableReason: string | null;
    fixtureExpectedMaterialXMaterials: number;
    rendererClass: string | null;
    backendType: string;
    status: 'ready' | 'unsupported';
    unsupportedReason?: string;
    loadMs: number;
    suite?: {
        fixture: { name: string; url: string; source: string };
        threeRevision: string;
        renderer: { className: string | null; backendType: string; rendered: boolean };
        usd: {
            moduleReady: boolean;
            bindingApi: Record<string, string>;
            childCount: number;
            sceneStats: {
                objects: number;
                meshes: number;
                geometriesWithPosition: number;
                materials: number;
                materialXMaterials: number;
                meshPhysicalMaterials: number;
                namedMaterials: string[];
            };
            handleMethods: Record<string, string>;
            hydraDiagnostics: Record<string, unknown> | null;
        };
        diagnostics: { errors: string[]; warnings: string[]; phase?: string };
    };
};

const caseTimeoutMs = Number(process.env.NEEDLE_USD_MATRIX_CASE_TIMEOUT_MS ?? 60_000);

test('USD WASM Three adapter loads a fixture across cached Three versions and renderer modes', async ({ page }) => {
    const manifest = JSON.parse(await readFile(resolve('.cache/usd-three-matrix-pages/manifest.json'), 'utf8')) as { pages: MatrixPage[] };
    expect(manifest.pages.length).toBeGreaterThan(0);

    const results: MatrixResult[] = [];
    const failures: string[] = [];

    for (const matrixPage of manifest.pages) {
        try {
            const result = await runMatrixPage(page, matrixPage);
            results.push(result);
            console.log(`[usd-three-matrix] ${result.version}/${result.rendererMode}/${result.fixtureName}: ${result.status} ${result.backendType}`);
        }
        catch (error) {
            const message = error instanceof Error ? error.stack || error.message : String(error);
            failures.push(`${matrixPage.id}: ${message}`);
        }
    }

    const artifact = {
        generatedAt: new Date().toISOString(),
        totalCases: manifest.pages.length,
        results,
        failures,
        summary: {
            passed: results.filter(result => result.status === 'ready').length,
            unsupported: results.filter(result => result.status === 'unsupported').length,
            failed: failures.length,
        },
    };
    console.log(`[usd-three-matrix-artifact] ${JSON.stringify(artifact)}`);

    if (failures.length) {
        throw new Error(`USD Three matrix failures:\n${failures.join('\n\n')}`);
    }
    expect(results).toHaveLength(manifest.pages.length);
});

async function runMatrixPage(page, matrixPage: MatrixPage): Promise<MatrixResult> {
    const started = Date.now();
    const pageDiagnostics: string[] = [];
    page.removeAllListeners('console');
    page.removeAllListeners('pageerror');
    page.on('console', message => {
        if (message.type() === 'error' || message.type() === 'warning') {
            pageDiagnostics.push(`${message.type()}: ${message.text()}`);
        }
    });
    page.on('pageerror', error => {
        pageDiagnostics.push(`pageerror: ${error.stack || error.message}`);
    });
    page.on('response', response => {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('application/json') || response.status() >= 400) {
            pageDiagnostics.push(`response: ${response.status()} ${contentType} ${response.url()}`);
        }
    });

    await page.goto(`/__rawfs${matrixPage.pagePath}`);
    const compatibility = await page.waitForFunction(() => (window as any).__USD_THREE_MATRIX__ || (window as any).__USD_THREE_MATRIX_ERROR__, null, { timeout: 120_000 });
    const state = await compatibility.jsonValue() as any;
    const error = await page.evaluate(() => (window as any).__USD_THREE_MATRIX_ERROR__ || null);
    if (!state || error) {
        throw new Error(error || `Matrix page for ${matrixPage.id} did not expose compatibility objects.`);
    }
    if (state.status === 'unsupported') {
        return {
            version: matrixPage.version,
            rendererMode: matrixPage.rendererMode,
            fixtureName: matrixPage.fixtureName,
            fixtureUrl: matrixPage.fixtureUrl,
            fixtureFiles: matrixPage.fixtureFiles,
            fixtureSource: matrixPage.fixtureSource,
            fixtureExpectedRenderable: matrixPage.fixtureExpectedRenderable,
            fixtureExpectedRenderableReason: matrixPage.fixtureExpectedRenderableReason,
            fixtureExpectedMaterialXMaterials: matrixPage.fixtureExpectedMaterialXMaterials,
            rendererClass: state.rendererClass ?? null,
            backendType: state.backendType ?? 'unsupported',
            status: 'unsupported',
            unsupportedReason: state.unsupportedReason ?? 'Unknown unsupported renderer mode.',
            loadMs: Date.now() - started,
        };
    }

    if (matrixPage.rendererMode === 'webgl') expect(state.backendType).toBe('webgl');
    if (matrixPage.rendererMode === 'webgpu-force-webgl2') expect(state.backendType).toBe('webgl');
    if (matrixPage.rendererMode === 'webgpu') expect(String(state.backendType).startsWith('webgpu')).toBe(true);

    let suite;
    try {
        suite = await page.evaluate(timeoutMs => Promise.race([
            (window as any).__USD_THREE_MATRIX__.runSuite(),
            new Promise((_, reject) => setTimeout(() => {
                const phase = (window as any).__USD_THREE_MATRIX_PHASE__ || 'unknown';
                const errors = (window as any).__USD_THREE_MATRIX_ERRORS__ || [];
                reject(new Error(`USD matrix suite timeout after ${timeoutMs}ms at ${phase}; page diagnostics: ${JSON.stringify(errors)}`));
            }, timeoutMs)),
        ]), caseTimeoutMs);
    }
    catch (error) {
        const phase = await page.evaluate(() => (window as any).__USD_THREE_MATRIX_PHASE__ || 'unknown').catch(() => 'unavailable');
        const browserErrors = await page.evaluate(() => (window as any).__USD_THREE_MATRIX_ERRORS__ || []).catch(() => []);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${message}; phase=${phase}; browserDiagnostics=${JSON.stringify(browserErrors)}; playwrightDiagnostics=${JSON.stringify(pageDiagnostics)}`);
    }
    expect(suite.renderer.rendered).toBe(true);
    expect(suite.usd.moduleReady).toBe(true);
    expect(suite.usd.bindingApi.hdWebSyncDriver).toBe('function');
    expect(suite.usd.bindingApi.getStage).toBe('function');
    expect(suite.usd.bindingApi.fsCreateDataFile).toBe('function');
    expect(suite.usd.bindingApi.fsCreatePath).toBe('function');
    expect(suite.usd.bindingApi.fsAnalyzePath).toBe('function');
    expect(suite.usd.bindingApi.fsReaddir).toBe('function');
    expect(suite.usd.bindingApi.fsRmdir).toBe('function');
    expect(suite.usd.bindingApi.fsUnlink).toBe('function');
    expect(suite.usd.bindingApi.readyThen).toBe('function');
    expect(suite.fixture.name).toBe(matrixPage.fixtureName);
    if (matrixPage.fixtureExpectedRenderable) {
        expect(suite.usd.childCount).toBeGreaterThan(0);
        expect(suite.usd.sceneStats.meshes).toBeGreaterThan(0);
        expect(suite.usd.sceneStats.geometriesWithPosition).toBeGreaterThan(0);
        expect(suite.usd.sceneStats.materials).toBeGreaterThan(0);
    }
    else {
        expect(suite.usd.childCount).toBe(0);
        expect(suite.usd.sceneStats.meshes).toBe(0);
    }
    if (matrixPage.fixtureExpectedMaterialXMaterials > 0) {
        expect(suite.usd.sceneStats.materialXMaterials).toBeGreaterThanOrEqual(matrixPage.fixtureExpectedMaterialXMaterials);
    }
    expect(suite.usd.handleMethods.update).toBe('function');
    expect(suite.usd.handleMethods.materialsReady).toBe('function');
    expect(suite.diagnostics.errors).toEqual([]);

    return {
        version: matrixPage.version,
        rendererMode: matrixPage.rendererMode,
        fixtureName: matrixPage.fixtureName,
        fixtureUrl: matrixPage.fixtureUrl,
        fixtureFiles: matrixPage.fixtureFiles,
        fixtureSource: matrixPage.fixtureSource,
        fixtureExpectedRenderable: matrixPage.fixtureExpectedRenderable,
        fixtureExpectedRenderableReason: matrixPage.fixtureExpectedRenderableReason,
        fixtureExpectedMaterialXMaterials: matrixPage.fixtureExpectedMaterialXMaterials,
        rendererClass: state.rendererClass ?? null,
        backendType: state.backendType ?? 'unknown',
        status: 'ready',
        loadMs: Date.now() - started,
        suite,
    };
}
