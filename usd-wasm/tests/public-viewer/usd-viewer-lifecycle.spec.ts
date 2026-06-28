import { expect, test, type Page } from '@playwright/test';

const publicSamples = {
    helmet: {
        label: 'Lifecycle DamagedHelmet USDZ',
        url: '/test-fixtures/asset-explorer/DamagedHelmet.glb.three.usdz',
        filename: 'DamagedHelmet.glb.three.usdz',
        maxGeometries: 150,
        maxTextures: 24,
    },
    boombox: {
        label: 'Lifecycle BoomBox USDZ',
        url: '/test-fixtures/asset-explorer/BoomBox.glb.three.usdz',
        filename: 'BoomBox.glb.three.usdz',
        maxGeometries: 300,
        maxTextures: 80,
    },
};

const assetExplorerSamples = {
    antiqueCameraOv: {
        filename: 'AntiqueCamera.glb.ov.usdz',
        url: 'https://asset-explorer.needle.tools/downloads/AntiqueCamera.glb.ov.usdz',
    },
    animatedMorphSphereOv: {
        label: 'Animated Morph Sphere',
        filename: 'AnimatedMorphSphere.glb.ov.usdz',
        url: 'https://asset-explorer.needle.tools/downloads/AnimatedMorphSphere.glb.ov.usdz',
    },
};

const usdWgBaseUrl = 'https://raw.githubusercontent.com/usd-wg/assets/main/';
const usdWgSamples = [
    {
        label: 'OpenChessSet',
        filename: 'chess_set.usda',
        url: `${usdWgBaseUrl}full_assets/OpenChessSet/chess_set.usda`,
    },
    {
        label: 'StandardShaderBall',
        filename: 'standard_shader_ball_scene.usda',
        url: `${usdWgBaseUrl}full_assets/StandardShaderBall/standard_shader_ball_scene.usda`,
    },
    {
        label: 'USD-WG all primitives',
        filename: 'all_primitives.usda',
        url: `${usdWgBaseUrl}test_assets/schemaTests/usdGeom/primitives/all_primitives.usda`,
    },
    {
        label: 'USD-WG nested transforms',
        filename: 'xforms_nested.usda',
        url: `${usdWgBaseUrl}test_assets/schemaTests/usdGeom/transforms/xforms_nested.usda`,
    },
    {
        label: 'USD-WG subdivision quads',
        filename: 'subdiv_loop_quads.usda',
        url: `${usdWgBaseUrl}test_assets/schemaTests/usdGeom/meshes/subdiv_loop_quads/subdiv_loop_quads.usda`,
    },
    {
        label: 'USD-WG single sided mesh',
        filename: 'singleSided.usda',
        url: `${usdWgBaseUrl}test_assets/schemaTests/usdGeom/meshes/singleSided/singleSided.usda`,
    },
    {
        label: 'USD-WG points value types',
        filename: 'pointsTypes.usda',
        url: `${usdWgBaseUrl}test_assets/schemaTests/usdGeom/meshes/points_types/pointsTypes.usda`,
    },
];

const fatalConsolePatterns = [
    /out of memory/i,
    /Cannot enlarge memory/i,
    /RuntimeError/i,
    /unreachable/i,
    /Failed to load USD file/i,
    /wasm memory/i,
    /\babort\b/i,
];

const usdWgRegressionPatterns = [
    /does not provide an export named/i,
    /stage could(?:n't| not) be created/i,
    /Camera fit size is zero/i,
    /Camera fit size .*NaN/i,
    /Could not load sublayer/i,
    /EXR textures are not fully supported yet/i,
    /Failed to open USD stage/i,
    /Failed to load USD file/i,
];

test.describe('public usd-viewer lifecycle', () => {
    test('disposes prior Hydra stages while switching public viewer samples', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.goto('/?viewer=three');
        await page.waitForFunction(() => {
            const log = document.getElementById('message-log')?.textContent || '';
            return Boolean(globalThis['NEEDLE:USD:GET']) && log.includes('Loading done');
        });
        await addLocalLifecycleSamples(page);

        const states = [];
        for (const sample of [
            publicSamples.helmet,
            publicSamples.boombox,
            publicSamples.helmet,
            publicSamples.boombox,
            publicSamples.helmet,
        ]) {
            await loadPublicSample(page, sample.label);
            const state = await waitForPublicViewerLoad(page, sample.filename);
            expect(state.filename).toBe(sample.filename);
            expect(state.driverAlive).toBe(true);
            expect(state.hasHydraHandle).toBe(true);
            expect(state.children).toBeGreaterThan(0);
            expect(state.rendererMemory.geometries).toBeLessThanOrEqual(sample.maxGeometries);
            expect(state.rendererMemory.textures).toBeLessThanOrEqual(sample.maxTextures);
            states.push(state);
        }

        expect(states[0].rendererMemory).toEqual(states[2].rendererMemory);
        expect(states[2].rendererMemory).toEqual(states[4].rendererMemory);
        expect(diagnostics).toEqual([]);
    });

    test('loads a public viewer sample through the Needle Engine loader element', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.goto(`/?file=${publicSamples.helmet.url}&viewer=three`);
        await waitForPublicViewerLoad(page, publicSamples.helmet.filename);

        await Promise.all([
            page.waitForURL(/viewer=needle-loader/),
            page.click('[data-viewer-mode="needle-loader"]'),
        ]);
        const state = await waitForNeedleLoaderMode(page, publicSamples.helmet.filename);

        expect(state.filename).toBe(publicSamples.helmet.filename);
        expect(state.activeButton).toBe('needle-loader');
        expect(state.hasHydraHandle).toBe(true);
        expect(state.driverAlive).toBe(true);
        expect(state.hasNeedleContext).toBe(true);
        expect(state.needleChildren).toBeGreaterThan(0);
        expect(state.elementSrc).toContain(publicSamples.helmet.url);
        expect(state.contactShadows).toBe('0.7');
        expect(state.threeCanvasDisplay).toBe('none');
        expect(state.needleDisplay).toBe('block');
        expect(new URL(state.href).searchParams.get('viewer')).toBe('needle-loader');
        expect(diagnostics).toEqual([]);
    });

    test('loads representative USD-WG assets through the Needle Engine loader element', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        const usdWgDiagnostics = collectConsoleMatches(page, usdWgRegressionPatterns);

        for (const sample of usdWgSamples) {
            await page.goto(`/?file=${encodeURIComponent(sample.url)}&viewer=needle-loader`);
            const state = await waitForNeedleLoaderMode(page, sample.filename);

            expect(state.filename).toBe(sample.filename);
            expect(state.activeButton).toBe('needle-loader');
            expect(state.hasHydraHandle).toBe(true);
            expect(state.driverAlive).toBe(true);
            expect(state.hasNeedleContext).toBe(true);
            expect(state.needleChildren).toBeGreaterThan(0);
            expect(state.elementSrc).toContain(sample.url);
            expect(new URL(state.href).searchParams.get('viewer')).toBe('needle-loader');
        }

        expect(usdWgDiagnostics).toEqual([]);
        expect(diagnostics).toEqual([]);
    });

    test('respects USD doubleSided=false through the Needle Engine loader element', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        const usdWgDiagnostics = collectConsoleMatches(page, usdWgRegressionPatterns);
        const sample = usdWgSamples.find(entry => entry.filename === 'singleSided.usda')!;

        await page.goto(`/?file=${encodeURIComponent(sample.url)}&viewer=needle-loader`);
        await waitForNeedleLoaderMode(page, sample.filename);

        const sides = await page.evaluate(() => {
            const result: number[] = [];
            window.needleEngineContext?.scene?.traverse?.((object: any) => {
                if (!String(object.userData?.usdPath || '').includes('/World/Plane_')) return;
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                for (const material of materials) {
                    if (material) result.push(material.side);
                }
            });
            return result;
        });

        expect(sides.length).toBeGreaterThan(0);
        expect(new Set(sides)).toEqual(new Set([0]));
        expect(usdWgDiagnostics).toEqual([]);
        expect(diagnostics).toEqual([]);
    });

    test('defaults public viewer samples to Needle mode', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.goto(`/?file=${publicSamples.helmet.url}`);
        const state = await waitForNeedleLoaderMode(page, publicSamples.helmet.filename);

        expect(state.activeButtonText).toBe('Needle');
        expect(state.contactShadows).toBe('0.7');
        expect(new URL(state.href).searchParams.get('viewer')).toBe('needle-loader');
        expect(diagnostics).toEqual([]);
    });

    test('switches empty public viewer from Needle to three.js', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.goto('/?file=&viewer=needle-loader');
        await expect(page.locator('[data-viewer-mode="needle-loader"]')).toHaveClass(/active/);

        await Promise.all([
            page.waitForURL(/viewer=three/),
            page.click('[data-viewer-mode="three"]'),
        ]);

        await page.waitForFunction(() => document.body.classList.contains('viewer-mode-three'));
        const state = await page.evaluate(async () => ({
            href: location.href,
            activeButton: document.querySelector('[data-viewer-mode].active')?.getAttribute('data-viewer-mode') || '',
            runtime: (await import('viewer-runtime')).runtimeViewerMode,
            threeRevision: (await import('three')).REVISION,
        }));

        expect(state.activeButton).toBe('three');
        expect(state.runtime).toBe('three');
        expect(state.threeRevision).toBe('185');
        expect(new URL(state.href).searchParams.get('viewer')).toBe('three');
        expect(diagnostics).toEqual([]);
    });

    test('keeps three.js camera controls interactive', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.goto(`/?file=${publicSamples.helmet.url}&viewer=three`);
        await waitForPublicViewerLoad(page, publicSamples.helmet.filename);

        const before = await page.evaluate(() => window.camera.position.toArray());
        await page.mouse.move(640, 450);
        await page.mouse.down();
        await page.mouse.move(820, 470, { steps: 12 });
        await page.mouse.up();
        await page.waitForTimeout(500);
        const after = await page.evaluate(() => window.camera.position.toArray());

        expect(cameraMoved(before, after)).toBe(true);
        expect(diagnostics).toEqual([]);
    });

    test('switches between Asset Explorer Omniverse samples from a direct URL', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.goto(`/?file=${encodeURIComponent(assetExplorerSamples.antiqueCameraOv.url)}&viewer=three`);
        await waitForPublicViewerLoad(page, assetExplorerSamples.antiqueCameraOv.filename);

        await page.click('.dropdown-button');
        await page.click('[data-sample-group="gltf"]');
        await page.waitForFunction(label => {
            return Array.from(document.querySelectorAll<HTMLAnchorElement>('.gallery-card'))
                .some(card => card.dataset.name === label && card.href.includes('.ov.usdz'));
        }, assetExplorerSamples.animatedMorphSphereOv.label);

        await page.click(`.gallery-card[data-name="${assetExplorerSamples.animatedMorphSphereOv.label}"]`);
        const state = await waitForPublicViewerLoad(page, assetExplorerSamples.animatedMorphSphereOv.filename);

        expect(state.filename).toBe(assetExplorerSamples.animatedMorphSphereOv.filename);
        expect(new URL(state.href).searchParams.get('file')).toBe(assetExplorerSamples.animatedMorphSphereOv.url);
        expect(state.loadedConverterVisible).toBe(true);
        expect(state.loadedConverter).toBe('omniverse');
        expect(diagnostics).toEqual([]);
    });
});

async function addLocalLifecycleSamples(page: Page) {
    await page.evaluate(samples => {
        const host = document.querySelector('.file-grid') || document.body;
        for (const sample of Object.values(samples)) {
            const link = document.createElement('a');
            link.className = 'file';
            link.href = `?file=${new URL(sample.url, location.href).href}`;
            link.textContent = sample.label;
            host.appendChild(link);
        }
    }, publicSamples);
}

function collectFatalDiagnostics(page: Page) {
    return collectConsoleMatches(page, fatalConsolePatterns);
}

function collectConsoleMatches(page: Page, patterns: RegExp[]) {
    const diagnostics: Array<{ type: string, text: string }> = [];
    page.on('console', message => {
        const text = message.text();
        if (patterns.some(pattern => pattern.test(text))) {
            diagnostics.push({ type: message.type(), text });
        }
    });
    page.on('pageerror', error => {
        diagnostics.push({ type: 'pageerror', text: error.stack || error.message });
    });
    return diagnostics;
}

async function loadPublicSample(page: Page, label: string) {
    await page.evaluate(sampleLabel => {
        const link = Array.from(document.querySelectorAll<HTMLAnchorElement>('a.file'))
            .find(candidate => candidate.textContent?.trim() === sampleLabel);
        if (!link) throw new Error(`Missing public sample link: ${sampleLabel}`);
        link.click();
    }, label);
}

async function waitForPublicViewerLoad(page: Page, filename: string) {
    await page.waitForFunction(expectedFilename => {
        const overlay = document.getElementById('loading-overlay');
        const overlayHidden = !overlay || !overlay.classList.contains('visible');
        const driver = window.driver;
        const driverAlive = Boolean(driver) && (typeof driver.isDeleted !== 'function' || !driver.isDeleted());
        const actualFilename = document.querySelector('.filename-text')?.textContent || '';
        return overlayHidden && driverAlive && actualFilename === expectedFilename;
    }, filename);
    await page.waitForTimeout(1000);
    return await page.evaluate(() => ({
        href: location.href,
        filename: document.querySelector('.filename-text')?.textContent || '',
        children: window.usdRoot?.children?.length ?? -1,
        driverAlive: Boolean(window.driver) && (typeof window.driver.isDeleted !== 'function' || !window.driver.isDeleted()),
        hasHydraHandle: Boolean(window.usdHydra),
        loadedConverterVisible: !document.querySelector<HTMLLabelElement>('#converter-select-wrap')?.hidden,
        loadedConverter: document.querySelector<HTMLSelectElement>('#converter-select')?.value || '',
        rendererMemory: window.renderer?.info?.memory ? { ...window.renderer.info.memory } : { geometries: -1, textures: -1 },
    }));
}

async function waitForNeedleLoaderMode(page: Page, filename: string) {
    await page.waitForFunction(expectedFilename => {
        const element = document.querySelector('needle-engine');
        const driver = window.driver;
        const driverAlive = Boolean(driver) && (typeof driver.isDeleted !== 'function' || !driver.isDeleted());
        const actualFilename = document.querySelector('.filename-text')?.textContent || '';
        return document.body.classList.contains('viewer-mode-needle-loader')
            && actualFilename === expectedFilename
            && Boolean(element?.context)
            && Boolean(window.needleEngineContext)
            && Boolean(window.usdHydra)
            && driverAlive;
    }, filename);
    await page.waitForTimeout(1000);
    return await page.evaluate(() => ({
        href: location.href,
        filename: document.querySelector('.filename-text')?.textContent || '',
        activeButton: document.querySelector('[data-viewer-mode].active')?.getAttribute('data-viewer-mode') || '',
        activeButtonText: document.querySelector('[data-viewer-mode].active')?.textContent?.trim() || '',
        elementSrc: document.querySelector('needle-engine')?.getAttribute('src') || '',
        contactShadows: document.querySelector('needle-engine')?.getAttribute('contactshadows') || '',
        driverAlive: Boolean(window.driver) && (typeof window.driver.isDeleted !== 'function' || !window.driver.isDeleted()),
        hasHydraHandle: Boolean(window.usdHydra),
        hasNeedleContext: Boolean(window.needleEngineContext),
        needleChildren: window.needleEngineContext?.scene?.children?.length ?? -1,
        threeCanvasDisplay: getComputedStyle(document.querySelector('.usd-viewer-three-canvas')!).display,
        needleDisplay: getComputedStyle(document.querySelector('needle-engine')!).display,
    }));
}

function cameraMoved(before: number[], after: number[]) {
    return before.some((value, index) => Math.abs(value - after[index]) > 0.0001);
}
