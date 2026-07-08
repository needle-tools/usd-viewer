import { expect, test } from '@playwright/test';

const orderStressAssets = [
    'USDZ Cube',
    'Payload Root',
    'Nested Variants',
    'Binding Override Variants',
    'Parent Folder References',
    'DamagedHelmet GLB',
    'BoomBox USDZ',
    'CesiumMan USDZ',
    'Catmull-Clark Cube',
];

const forbiddenConsolePatterns = [
    /Failed to load texture/i,
    /Error in fetch_asset/i,
    /Failed to load resource/i,
    /out of memory/i,
    /RuntimeError/i,
    /Cannot enlarge memory/i,
    /pageerror/i,
    /Unsafe scene index/i,
    /Failed verification/i,
];

test.describe('usd-viewer order-dependent visual regressions', () => {
    test('Gingerbread up-axis stays stable across USDA/USDC/USDA reload order', async ({ page }) => {
        const diagnostics = collectConsoleDiagnostics(page);
        await openViewer(page);

        const states = [];
        for (const assetName of ['Gingerbread USDA', 'Gingerbread USDC', 'Gingerbread USDA']) {
            await loadAssetsInOrder(page, [assetName]);
            states.push(await getViewerState(page));
        }

        for (const state of states) {
            expect(state?.stageMetadata?.upAxis).toBe('z');
            expect(state?.rootRotationX).toBeCloseTo(-Math.PI / 2, 5);
            expect(state?.childCount).toBeGreaterThan(0);
        }
        expect(states[2]?.rootRotationX).toBeCloseTo(states[0]?.rootRotationX ?? 0, 6);
        expectForbiddenDiagnostics(diagnostics);
    });

    test('Gingerbread USDC renders with textured materials in three.js mode', async ({ page }) => {
        const diagnostics = collectConsoleDiagnostics(page);
        await openViewer(page);
        await loadAssetsInOrder(page, ['Gingerbread USDC']);

        const state = await getViewerState(page);
        expect(state?.sceneDiagnostics.meshCount).toBeGreaterThan(0);
        expect(state?.sceneDiagnostics.materialXMaterialCount).toBeGreaterThan(0);
        expect(state?.sceneDiagnostics.materialX?.uniformLightCount).toBe(0);
        expect(state?.sceneDiagnostics.materialX?.uniformEnvRadiance).toBeTruthy();
        expect(await renderAreaScreenshot(page)).toMatchSnapshot('gingerbread-usdc-three.png');
        expectForbiddenDiagnostics(diagnostics);
    });

    test('MaterialX External Ref renders generated MaterialX materials in three.js mode', async ({ page }) => {
        const diagnostics = collectConsoleDiagnostics(page);
        await openViewer(page);
        await loadAssetsInOrder(page, ['MaterialX External Ref']);

        const state = await getViewerState(page);
        expect(state?.sceneDiagnostics.meshCount).toBe(2);
        expect(state?.sceneDiagnostics.materialXMaterialCount).toBeGreaterThanOrEqual(2);
        expect(await renderAreaScreenshot(page)).toMatchSnapshot('materialx-external-ref-three.png');
        expectForbiddenDiagnostics(diagnostics);
    });

    test('MaterialX Texture + Noise remains textured and polygonal after prior asset loads', async ({ page }) => {
        const diagnostics = collectConsoleDiagnostics(page);
        await openViewer(page);
        await loadAssetsInOrder(page, [...orderStressAssets, 'MaterialX Texture + Noise']);
        expect(await renderAreaScreenshot(page)).toMatchSnapshot('materialx-texture-noise-after-order.png');
        expectForbiddenDiagnostics(diagnostics);
    });

    test('MaterialX Procedural Bricks remains textured and polygonal after prior asset loads', async ({ page }) => {
        const diagnostics = collectConsoleDiagnostics(page);
        await openViewer(page);
        await loadAssetsInOrder(page, [...orderStressAssets, 'MaterialX Procedural Bricks']);
        expect(await renderAreaScreenshot(page)).toMatchSnapshot('materialx-procedural-bricks-after-order.png');
        expectForbiddenDiagnostics(diagnostics);
    });

    test('Usdview panel follows stage selection and ObjectsChanged notices', async ({ page }) => {
        const diagnostics = collectConsoleDiagnostics(page);
        await openViewer(page);
        await loadAssetsInOrder(page, ['Payload Root']);

        await expect(page.getByTestId('usdview-panel')).toContainText('Layer Stack');
        await expect(page.getByTestId('usdview-panel')).toContainText('Used Layers');
        await page.getByRole('button', { name: 'PayloadHolder Xform', exact: true }).click();
        await expect(page.getByTestId('usdview-panel')).toContainText('/World/PayloadHolder');
        const payloadLayer = page.getByTestId('usdview-layer-row').filter({ hasText: 'payload_payload.usda' }).first();
        await expect(payloadLayer).toBeVisible();
        await payloadLayer.click();
        await expect(page.getByTestId('usdview-panel')).toContainText('Layer Details');

        await page.getByRole('button', { name: 'Unload', exact: true }).click();
        await expect(page.locator('.status')).toHaveText('Applied /World/PayloadHolder payload unloaded', { timeout: 45_000 });
        await expect(page.getByTestId('usdview-panel')).toContainText('Resynced');
        await expect(page.getByTestId('usdview-panel')).toContainText('/World/PayloadHolder');

        const state = await getViewerState(page);
        expect(state?.usdview?.hasStage).toBe(true);
        expect(state?.usdview?.selectedPath).toBe('/World/PayloadHolder');
        expect(state?.usdview?.selectedLayerIdentifier).toContain('payload_payload.usda');
        expect(state?.usdview?.lastNoticeResyncedPaths).toContain('/World/PayloadHolder');
        expectForbiddenDiagnostics(diagnostics);
    });

    test('parent-folder references resolve for mounted and URL roots', async ({ page }) => {
        const diagnostics = collectConsoleDiagnostics(page);
        await openViewer(page);

        for (const assetName of ['Parent Folder References', 'Parent Folder References URL']) {
            await loadAssetsInOrder(page, [assetName]);
            await page.getByRole('button', { name: 'Shape Cube', exact: true }).click();
            await expect(page.getByTestId('usdview-panel')).toContainText('/World/Shape');
        }

        expectForbiddenDiagnostics(diagnostics);
    });

    test('Usdview timeline pauses and seeks animated stages', async ({ page }) => {
        const diagnostics = collectConsoleDiagnostics(page);
        await openViewer(page);
        await loadAssetsInOrder(page, ['Time Samples']);

        await expect(page.getByTestId('usdview-panel')).toContainText('Timeline');
        await page.getByTestId('usdview-timeline-play').click();
        await page.getByTestId('usdview-timeline-slider').evaluate((element) => {
            const input = element as HTMLInputElement;
            input.value = '24';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await expect.poll(async () => (await getViewerState(page))?.usdview?.currentTime).toBe(24);

        const state = await getViewerState(page);
        expect(state?.stageMetadata?.startTimeCode).toBe(1);
        expect(state?.stageMetadata?.endTimeCode).toBe(48);
        expect(state?.usdview?.isPlaying).toBe(false);
        expect(state?.sceneDiagnostics.meshCount).toBeGreaterThan(0);
        expect(await renderAreaScreenshot(page)).toMatchSnapshot('time-samples-three.png');
        expectForbiddenDiagnostics(diagnostics);
    });

    test('animated HTTP assets do not dirty Hydra during an async initial draw', async ({ page }) => {
        const diagnostics = collectConsoleDiagnostics(page);
        await openViewer(page);

        await loadUrl(page, 'https://github.com/usd-wg/assets/blob/main/full_assets/ElephantWithMonochord/SoC-ElephantWithMonochord.usdc', 'Elephant With Monochord');

        const state = await getViewerState(page);
        expect(state?.childCount).toBeGreaterThan(0);
        expectForbiddenDiagnostics(diagnostics);
    });

    test('invalid remote MaterialX texture assets fall back without crashing Hydra', async ({ page }) => {
        const diagnostics = collectConsoleDiagnostics(page);
        await openViewer(page);

        await loadUrl(page, 'https://github.com/usd-wg/assets/blob/main/test_assets/MaterialXTest/basicTextured.usda', 'Basic Textured Invalid Textures');

        const state = await getViewerState(page);
        expect(state?.childCount).toBeGreaterThan(0);
        expectCrashDiagnostics(diagnostics);
    });

    test('Catmull-Clark Cube remains subdivided in the demo viewer', async ({ page }) => {
        const diagnostics = collectConsoleDiagnostics(page);
        await openViewer(page);
        await loadAssetsInOrder(page, ['Catmull-Clark Cube']);

        const state = await getViewerState(page);
        expect(state?.sceneDiagnostics.meshCount).toBe(1);
        expect(state?.sceneDiagnostics.maxPositionCount).toBeGreaterThan(36);
        expect(state?.sceneDiagnostics.maxAbsBound).toBeLessThan(0.95);
        expect(await renderAreaScreenshot(page)).toMatchSnapshot('catmull-clark-cube-three.png');
        expectForbiddenDiagnostics(diagnostics);
    });

    test('Needle Engine host loads representative technical samples', async ({ page }) => {
        const diagnostics = collectConsoleDiagnostics(page);
        await openViewer(page, 'needle-engine');
        await expect(page.getByRole('button', { name: 'Needle Direct Hydra', exact: true })).toHaveAttribute('aria-pressed', 'true');

        await loadAssetsInOrder(page, [
            'USDZ Cube',
            'DamagedHelmet GLB',
            'MaterialX Procedural Bricks',
        ], 'needle-engine');

        const state = await getViewerState(page);
        expect(state?.renderHost).toBe('needle-engine');
        expect(state?.childCount).toBeGreaterThan(0);
        expect(await renderAreaScreenshot(page)).toMatchSnapshot('needle-engine-procedural-bricks.png');
        expectForbiddenDiagnostics(diagnostics);
    });

    test('Needle Engine host shows camera and point light helpers', async ({ page }) => {
        const diagnostics = collectConsoleDiagnostics(page);
        await openViewer(page, 'needle-engine');
        await loadAssetsInOrder(page, ['Camera + Light'], 'needle-engine');

        const state = await getViewerState(page);
        expect(state?.sceneDiagnostics.cameraHelperCount).toBeGreaterThan(0);
        expect(state?.sceneDiagnostics.pointLightHelperCount).toBeGreaterThan(0);
        expectForbiddenDiagnostics(diagnostics);
    });

    test('Needle Engine host renders unmaterialed meshes without material-array groups', async ({ page }) => {
        const diagnostics = collectConsoleDiagnostics(page);
        await openViewer(page, 'needle-engine');
        await loadAssetsInOrder(page, ['Unmaterialed Empty Subset'], 'needle-engine');

        const state = await getViewerState(page);
        expect(state?.renderHost).toBe('needle-engine');
        expect(state?.sceneDiagnostics.meshCount).toBe(1);
        expect(state?.sceneDiagnostics.maxPositionCount).toBe(3);
        expect(state?.sceneDiagnostics.materialArrayMeshCount).toBe(0);
        expect(state?.sceneDiagnostics.maxGeometryGroupCount).toBe(0);
        expectForbiddenDiagnostics(diagnostics);
    });

    test('Face-varying normals fixture keeps unmaterialed meshes on single materials', async ({ page }) => {
        const diagnostics = collectConsoleDiagnostics(page);
        await openViewer(page);
        await loadAssetsInOrder(page, ['Face-Varying Normals Matrix']);

        const state = await getViewerState(page);
        expect(state?.sceneDiagnostics.meshCount).toBeGreaterThan(1);
        expect(state?.sceneDiagnostics.materialArrayMeshCount).toBe(0);
        expectForbiddenDiagnostics(diagnostics);
    });

    test('Needle Engine host completes USDA and API scene loads after prior assets', async ({ page }) => {
        const diagnostics = collectConsoleDiagnostics(page);
        await openViewer(page, 'needle-engine');

        await loadAssetsInOrder(page, [
            'Gingerbread USDC',
            'Gingerbread USDA',
        ], 'needle-engine');

        await loadApiScene(page, 'Preview Material', 'Loaded API preview');
        await loadApiScene(page, 'Variant Cube', 'Loaded API variant-cube');

        const state = await getViewerState(page);
        expect(state?.renderHost).toBe('needle-engine');
        expect(state?.usdview?.hasStage).toBe(true);
        expectForbiddenDiagnostics(diagnostics);
    });

    test('selected model deep-link survives render mode switches', async ({ page }) => {
        const diagnostics = collectConsoleDiagnostics(page);
        await page.goto('/?host=three&model=Payload+Root');
        await expect(page.locator('.status')).toHaveText('Loaded Payload Root', { timeout: 45_000 });
        expect((await getViewerState(page))?.renderMode).toBe('three');
        expect((await getViewerState(page))?.model).toBe('Payload Root');

        await page.getByRole('button', { name: 'Needle', exact: true }).click();
        await expect(page.locator('.status')).toHaveText('Loaded Payload Root', { timeout: 45_000 });
        const state = await getViewerState(page);
        expect(state?.renderMode).toBe('needle-loader');
        expect(state?.model).toBe('Payload Root');
        expect(new URL(page.url()).searchParams.get('model')).toBe('Payload Root');
        expectForbiddenDiagnostics(diagnostics);
    });

    test('Needle Engine loader mode exposes usdview inspection state', async ({ page }) => {
        const diagnostics = collectConsoleDiagnostics(page);
        await openViewer(page, 'needle-engine', 'loader');
        await expect(page.getByRole('button', { name: 'Needle', exact: true })).toHaveAttribute('aria-pressed', 'true');

        await loadAssetsInOrder(page, [
            'DamagedHelmet GLB',
            'BoomBox GLB',
            'CesiumMan GLB',
            'Payload Root',
        ], 'needle-engine', 'loader');

        await expect(page.getByTestId('usdview-panel')).toBeVisible();
        await expect(page.getByTestId('usdview-panel')).toContainText('Layer Stack');
        await page.getByRole('button', { name: 'PayloadHolder Xform', exact: true }).click();
        await expect(page.getByTestId('usdview-panel')).toContainText('/World/PayloadHolder');
        const state = await getViewerState(page);
        expect(state?.renderHost).toBe('needle-engine');
        expect(state?.needleIntegration).toBe('loader');
        expect(state?.usdview?.hasStage).toBe(true);
        expectForbiddenDiagnostics(diagnostics);
    });
});

type NeedleIntegration = 'direct' | 'loader';

async function openViewer(page, host: 'three' | 'needle-engine' = 'three', needle: NeedleIntegration = 'direct') {
    const query = new URLSearchParams({ host });
    if (host === 'needle-engine') query.set('needle', needle);
    await page.goto(`/?${query.toString()}`);
    await expect(page.locator('.status')).toHaveText('Ready');
    await expect.poll(async () => (await getViewerState(page))?.renderHost).toBe(host);
    await expect.poll(async () => (await getViewerState(page))?.needleIntegration).toBe(needle);
}

async function loadAssetsInOrder(page, assetNames: string[], host: 'three' | 'needle-engine' = 'three', needle: NeedleIntegration = 'direct') {
    for (const assetName of assetNames) {
        await page.getByRole('button', { name: assetName, exact: true }).click();
        await expect(page.locator('.status')).toHaveText(`Loaded ${assetName}`, { timeout: 45_000 });
        expect((await getViewerState(page))?.renderHost).toBe(host);
        expect((await getViewerState(page))?.needleIntegration).toBe(needle);
        await waitForFrames(page, 4);
    }
}

async function loadApiScene(page, buttonName: string, loadedStatus: string) {
    await page.getByRole('button', { name: buttonName, exact: true }).click();
    await expect(page.locator('.status')).toHaveText(loadedStatus, { timeout: 45_000 });
    await waitForFrames(page, 4);
}

async function loadUrl(page, url: string, label: string) {
    await page.evaluate(({ url, label }) => {
        return (window as Window & { loadFile: (url: string, label?: string) => Promise<void> }).loadFile(url, label);
    }, { url, label });
    await expect(page.locator('.status')).toHaveText(`Loaded ${label}`, { timeout: 120_000 });
    await waitForFrames(page, 4);
}

async function renderAreaScreenshot(page) {
    await page.getByRole('button', { name: 'Fit Camera', exact: true }).click();
    await waitForFrames(page, 4);
    await page.addStyleTag({ content: '.test-buttons, .usdview-panel { visibility: hidden !important; }' });
    await waitForFrames(page, 4);
    return page.screenshot({
        animations: 'disabled',
        clip: { x: 220, y: 110, width: 900, height: 560 },
    });
}

async function waitForFrames(page, frames: number) {
    await page.evaluate(async frameCount => {
        for (let i = 0; i < frameCount; i++) {
            await new Promise(requestAnimationFrame);
        }
    }, frames);
}

async function getViewerState(page) {
    return await page.evaluate(() => {
        const testWindow = window as Window & {
            __usdViewerTestState?: () => {
                status: string;
                childCount: number;
                renderHost: 'three' | 'needle-engine';
                needleIntegration: NeedleIntegration;
                renderMode: 'three' | 'needle-direct' | 'needle-loader';
                model: string | null;
                rootRotationX: number | null;
                stageMetadata: { upAxis: string } | null;
                sceneDiagnostics: {
                    meshCount: number;
                    materialArrayMeshCount: number;
                    maxGeometryGroupCount: number;
                    maxPositionCount: number;
                    maxAbsBound: number;
                    materialXMaterialCount: number;
                    pointLightHelperCount: number;
                    cameraHelperCount: number;
                    materialX?: Record<string, unknown>;
                };
                usdview: {
                    hasStage: boolean;
                    selectedPath: string;
                    selectedLayerIdentifier: string;
                    currentTime: number;
                    isPlaying: boolean;
                    lastNoticeResyncedPaths: string[];
                };
            };
        };
        return testWindow.__usdViewerTestState?.();
    });
}

function collectConsoleDiagnostics(page) {
    const diagnostics: string[] = [];
    page.on('console', message => {
        if (message.type() === 'error' || message.type() === 'warning') {
            diagnostics.push(`${message.type()}: ${message.text()}`);
        }
    });
    page.on('pageerror', error => {
        diagnostics.push(`pageerror: ${error.stack || error.message}`);
    });
    return diagnostics;
}

function expectForbiddenDiagnostics(diagnostics: string[]) {
    const forbidden = diagnostics.filter(diagnostic =>
        forbiddenConsolePatterns.some(pattern => pattern.test(diagnostic)));
    expect(forbidden).toEqual([]);
}

function expectCrashDiagnostics(diagnostics: string[]) {
    const crashPatterns = [
        /Error in fetch_asset/i,
        /out of memory/i,
        /memory access out of bounds/i,
        /RuntimeError/i,
        /Cannot enlarge memory/i,
        /Hydra draw failed/i,
        /pageerror/i,
    ];
    const crashes = diagnostics.filter(diagnostic =>
        crashPatterns.some(pattern => pattern.test(diagnostic)));
    expect(crashes).toEqual([]);
}
