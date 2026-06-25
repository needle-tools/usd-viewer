import { expect, test } from '@playwright/test';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

type NeedleEnginePage = {
    id: string;
    version: string;
    runtimeShape: 'dist' | 'module';
    runtimeVersion: string;
    pagePath: string;
};

type NeedleEngineResult = {
    version: string;
    runtimeShape: string;
    runtimeVersion: string;
    threeRevision: string;
    sceneStats: {
        objects: number;
        meshes: number;
        geometriesWithPosition: number;
        materials: number;
        materialTextures: number;
    };
    pluginStats: {
        objects: number;
        meshes: number;
        geometriesWithPosition: number;
        materials: number;
        materialTextures: number;
    };
};

test('USD package loads through Needle Engine runtime shapes', async ({ page }) => {
    const manifest = JSON.parse(await readFile(resolve('.cache/usd-needle-engine-pages/manifest.json'), 'utf8')) as { pages: NeedleEnginePage[] };
    expect(manifest.pages.length).toBeGreaterThan(0);

    const results: NeedleEngineResult[] = [];
    const failures: string[] = [];

    for (const matrixPage of manifest.pages) {
        try {
            const result = await runNeedleEnginePage(page, matrixPage);
            results.push(result);
            console.log(`[usd-needle-engine-matrix] ${result.version}: ready three r${result.threeRevision}`);
        }
        catch (error) {
            const message = error instanceof Error ? error.stack || error.message : String(error);
            failures.push(`${matrixPage.id}: ${message}`);
        }
    }

    console.log(`[usd-needle-engine-matrix-artifact] ${JSON.stringify({
        generatedAt: new Date().toISOString(),
        totalCases: manifest.pages.length,
        results,
        failures,
        summary: {
            passed: results.length,
            failed: failures.length,
        },
    })}`);

    if (failures.length) {
        throw new Error(`USD Needle Engine matrix failures:\n${failures.join('\n\n')}`);
    }
    expect(results).toHaveLength(manifest.pages.length);
});

async function runNeedleEnginePage(page, matrixPage: NeedleEnginePage): Promise<NeedleEngineResult> {
    const diagnostics: string[] = [];
    page.removeAllListeners('console');
    page.removeAllListeners('pageerror');
    page.on('console', message => {
        if (message.type() === 'error' || message.type() === 'warning') {
            diagnostics.push(`${message.type()}: ${message.text()}`);
        }
    });
    page.on('pageerror', error => {
        diagnostics.push(`pageerror: ${error.stack || error.message}`);
    });

    await page.goto(`/__rawfs${matrixPage.pagePath}`);
    const stateHandle = await page.waitForFunction(
        () => (window as any).__USD_NEEDLE_ENGINE_MATRIX__ || (window as any).__USD_NEEDLE_ENGINE_MATRIX_ERROR__,
        null,
        { timeout: 120_000 },
    );
    const state = await stateHandle.jsonValue() as any;
    const error = await page.evaluate(() => (window as any).__USD_NEEDLE_ENGINE_MATRIX_ERROR__ || null);
    if (!state || error) {
        const phase = await page.evaluate(() => (window as any).__USD_NEEDLE_ENGINE_MATRIX_PHASE__ || 'unknown').catch(() => 'unknown');
        const browserErrors = await page.evaluate(() => (window as any).__USD_NEEDLE_ENGINE_MATRIX_ERRORS__ || []).catch(() => []);
        throw new Error(`${error || `Matrix page for ${matrixPage.id} did not expose Needle Engine USD state.`}; phase=${phase}; browserErrors=${JSON.stringify(browserErrors)}; diagnostics=${JSON.stringify(diagnostics)}`);
    }

    expect(state.status).toBe('ready');
    expect(state.runtimeShape).toBe(matrixPage.runtimeShape);
    expect(state.engineExports.Context).toBe('function');
    expect(state.engineExports.GameObject).toBe('function');
    expect(state.engineExports.serializable).toBe('function');
    expect(state.addonExports.OrbitControls).toBe('function');
    expect(state.usdExports.getUsdModule).toBe('function');
    expect(state.usdExports.createThreeHydra).toBe('function');
    expect(state.usdExports.addPluginForNeedleEngine).toBe('function');
    expect(state.usdExports.getHydraHandleFromNeedleEngineAsset).toBe('function');
    expect(state.usdExports.hdWebSyncDriver).toBe('function');
    expect(state.usdExports.stageGetUpAxis).toBe('function');
    expect(state.openusd).toBe('0.26.5');
    expect(state.modules.materialX).toBe(true);
    expect(state.modules.usdGltf).toBe(true);
    expect(state.modules.openSubdiv).toBe(true);
    expect(state.sceneStats.meshes).toBeGreaterThan(0);
    expect(state.sceneStats.geometriesWithPosition).toBeGreaterThan(0);
    expect(state.sceneStats.materials).toBeGreaterThan(0);
    expect(state.pluginStats.meshes).toBeGreaterThan(0);
    expect(state.pluginHydraHandle.available).toBe(true);
    expect(state.pluginHydraHandle.update).toBe('function');
    expect(state.pluginHydraHandle.dispose).toBe('function');
    expect(state.pluginStats.geometriesWithPosition).toBeGreaterThan(0);
    expect(state.pluginStats.materials).toBeGreaterThan(0);
    expect(state.diagnostics.errors).toEqual([]);
    expect(state.diagnostics.warnings.filter((warning: string) => warning.includes("Selected hydra renderer doesn't support prim type"))).toEqual([]);

    return {
        version: matrixPage.version,
        runtimeShape: matrixPage.runtimeShape,
        runtimeVersion: matrixPage.runtimeVersion,
        threeRevision: state.threeRevision,
        sceneStats: state.sceneStats,
        pluginStats: state.pluginStats,
    };
}
