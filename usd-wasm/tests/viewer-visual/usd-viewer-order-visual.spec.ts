import { expect, test } from '@playwright/test';

const orderStressAssets = [
    'USDZ Cube',
    'Payload Root',
    'Nested Variants',
    'Binding Override Variants',
    'DamagedHelmet GLB',
    'BoomBox USDZ',
    'CesiumMan USDZ',
    'Catmull-Clark Cube',
];

const forbiddenConsolePatterns = [
    /Failed to load texture/i,
    /out of memory/i,
    /RuntimeError/i,
    /Cannot enlarge memory/i,
    /pageerror/i,
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
});

async function openViewer(page) {
    await page.goto('/');
    await expect(page.locator('.status')).toHaveText('Ready');
}

async function loadAssetsInOrder(page, assetNames: string[]) {
    for (const assetName of assetNames) {
        await page.getByRole('button', { name: assetName, exact: true }).click();
        await expect(page.locator('.status')).toHaveText(`Loaded ${assetName}`, { timeout: 45_000 });
        await waitForFrames(page, 4);
    }
}

async function renderAreaScreenshot(page) {
    await page.addStyleTag({ content: '.test-buttons { visibility: hidden !important; }' });
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
                rootRotationX: number | null;
                stageMetadata: { upAxis: string } | null;
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
