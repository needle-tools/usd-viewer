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
    antiqueCameraThree: {
        filename: 'AntiqueCamera.glb.three.usdz',
        url: 'https://asset-explorer.needle.tools/downloads/AntiqueCamera.glb.three.usdz',
    },
    avocadoThree: {
        filename: 'Avocado.glb.three.usdz',
        url: 'https://asset-explorer.needle.tools/downloads/Avocado.glb.three.usdz',
    },
    animatedMorphSphereThree: {
        label: 'Animated Morph Sphere',
        filename: 'AnimatedMorphSphere.glb.three.usdz',
        url: 'https://asset-explorer.needle.tools/downloads/AnimatedMorphSphere.glb.three.usdz',
    },
    animatedMorphSphereBlender: {
        label: 'Animated Morph Sphere',
        filename: 'AnimatedMorphSphere.glb.blender.usdz',
        url: 'https://asset-explorer.needle.tools/downloads/AnimatedMorphSphere.glb.blender.usdz',
    },
};

const assetExplorerApi = 'https://asset-explorer.needle.tools/api/models.json';

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
        label: 'USD-WG nested scopes and transforms',
        filename: 'scopes_and_xforms_nested.usda',
        url: `${usdWgBaseUrl}test_assets/schemaTests/usdGeom/transforms/scopes_and_xforms_nested.usda`,
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
            page.waitForURL(/viewer=needle/),
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
        expect(state.autoplay).toBe(true);
        expect(state.contactShadows).toBe('0.7');
        expect(state.threeCanvasDisplay).toBe('none');
        expect(state.needleDisplay).toBe('block');
        expect(new URL(state.href).searchParams.get('viewer')).toBe('needle');
        expect(diagnostics).toEqual([]);
    });

    test('loads representative USD-WG assets through the Needle Engine loader element', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        const usdWgDiagnostics = collectConsoleMatches(page, usdWgRegressionPatterns);

        for (const sample of usdWgSamples) {
            await page.goto(`/?file=${encodeURIComponent(sample.url)}&viewer=needle`);
            const state = await waitForNeedleLoaderMode(page, sample.filename);

            expect(state.filename).toBe(sample.filename);
            expect(state.activeButton).toBe('needle-loader');
            expect(state.hasHydraHandle).toBe(true);
            expect(state.driverAlive).toBe(true);
            expect(state.hasNeedleContext).toBe(true);
            expect(state.needleChildren).toBeGreaterThan(0);
            expect(state.elementSrc).toContain(sample.url);
            expect(new URL(state.href).searchParams.get('viewer')).toBe('needle');
        }

        expect(usdWgDiagnostics).toEqual([]);
        expect(diagnostics).toEqual([]);
    });

    test('renders USD-WG bilinear cubes with usdview-style hull geometry and geometric normals', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        const sample = usdWgSamples.find(entry => entry.filename === 'scopes_and_xforms_nested.usda')!;

        await page.goto(`/?file=${encodeURIComponent(sample.url)}&viewer=three`);
        await waitForPublicViewerLoad(page, sample.filename);

        const cubeState = await page.evaluate(() => {
            const meshes: any[] = [];
            window.usdRoot?.traverse?.((object: any) => {
                if (object.isMesh) meshes.push(object);
            });
            const cube = meshes.find(mesh => mesh.name === 'cube') || meshes.at(-1);
            const normals = Array.from(cube?.geometry?.attributes?.normal?.array || []) as number[];
            const uniqueNormals: string[] = [];
            for (let i = 0; i < normals.length; i += 3) {
                const key = normals.slice(i, i + 3).map(value => Number(value).toFixed(3)).join(',');
                if (!uniqueNormals.includes(key)) uniqueNormals.push(key);
            }
            return {
                meshCount: meshes.length,
                positionCount: cube?.geometry?.attributes?.position?.count ?? 0,
                normalCount: cube?.geometry?.attributes?.normal?.count ?? 0,
                uniqueNormals: uniqueNormals.sort(),
            };
        });

        expect(cubeState.meshCount).toBeGreaterThanOrEqual(5);
        expect(cubeState.positionCount).toBe(36);
        expect(cubeState.normalCount).toBe(36);
        expect(cubeState.uniqueNormals).toEqual([
            '-1.000,0.000,0.000',
            '0.000,-1.000,0.000',
            '0.000,0.000,-1.000',
            '0.000,0.000,1.000',
            '0.000,1.000,0.000',
            '1.000,0.000,0.000',
        ]);
        expect(diagnostics).toEqual([]);
    });

    test('respects USD doubleSided=false through the Needle Engine loader element', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        const usdWgDiagnostics = collectConsoleMatches(page, usdWgRegressionPatterns);
        const sample = usdWgSamples.find(entry => entry.filename === 'singleSided.usda')!;

        await page.goto(`/?file=${encodeURIComponent(sample.url)}&viewer=needle`);
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
        expect(state.autoplay).toBe(true);
        expect(state.contactShadows).toBe('0.7');
        expect(new URL(state.href).searchParams.get('viewer')).toBe('needle');
        expect(diagnostics).toEqual([]);
    });

    test('switches empty public viewer from Needle to three.js', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.goto('/?file=&viewer=needle');
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

    test('renders toolbar tooltips through the shared body portal', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.goto('/?file=&viewer=needle');

        await page.locator('#viewer-mode-toggle').hover();
        await expect(page.locator('.ui-tooltip.visible')).toHaveText('USD can be rendered either with Needle Engine or with three.js. Choose the render engine here.');

        const rendererState = await page.evaluate(() => {
            const toggle = document.querySelector('#viewer-mode-toggle')!;
            const tooltip = document.querySelector('.ui-tooltip.visible')!;
            return {
                tooltipParentIsBody: tooltip.parentElement === document.body,
                toggleContainsTooltip: toggle.contains(tooltip),
                toggleOverflow: getComputedStyle(toggle).overflow,
                buttons: Array.from(toggle.querySelectorAll('[data-viewer-mode]')).map(button => ({
                    label: button.textContent?.trim() || '',
                    mode: button.getAttribute('data-viewer-mode') || '',
                    active: button.classList.contains('active'),
                })),
            };
        });

        expect(rendererState.tooltipParentIsBody).toBe(true);
        expect(rendererState.toggleContainsTooltip).toBe(false);
        expect(rendererState.toggleOverflow).toBe('hidden');
        expect(rendererState.buttons).toEqual([
            { label: 'Needle', mode: 'needle-loader', active: true },
            { label: 'three.js', mode: 'three', active: false },
        ]);

        await page.locator('#export-gltf').hover();
        await expect(page.locator('.ui-tooltip.visible')).toHaveText('Load a USD file first to convert');
        expect(diagnostics).toEqual([]);
    });

    test('keeps material loading non-blocking by default with an opt-in blocking mode', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.goto(`/?file=${publicSamples.helmet.url}&viewer=needle`);
        await waitForNeedleLoaderMode(page, publicSamples.helmet.filename);

        await expect(page.locator('#wait-materials-toggle')).toHaveCount(0);
        expect(new URL(page.url()).searchParams.get('waitForMaterials')).toBeNull();
        expect(await countTexturedUsdMaterials(page, 'needle')).toBeGreaterThan(0);

        await page.goto(`/?file=${publicSamples.helmet.url}&viewer=needle&waitForMaterials=1`);
        await waitForNeedleLoaderMode(page, publicSamples.helmet.filename);
        await expect(page.locator('#wait-materials-toggle')).toHaveCount(0);
        expect(await countTexturedUsdMaterials(page, 'needle')).toBeGreaterThan(0);

        await Promise.all([
            page.waitForURL(/viewer=three/),
            page.click('[data-viewer-mode="three"]'),
        ]);
        await waitForPublicViewerLoad(page, publicSamples.helmet.filename);
        expect(await countTexturedUsdMaterials(page, 'three')).toBeGreaterThan(0);

        const state = await page.evaluate(() => ({
            waitForMaterials: new URL(location.href).searchParams.get('waitForMaterials'),
            toggleExists: !!document.querySelector('#wait-materials-toggle'),
            activeButton: document.querySelector('[data-viewer-mode].active')?.getAttribute('data-viewer-mode') || '',
        }));

        expect(state.waitForMaterials).toBe('1');
        expect(state.toggleExists).toBe(false);
        expect(state.activeButton).toBe('three');
        expect(diagnostics).toEqual([]);
    });

    test('keeps texture maps without cloning uniformly culled materials', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.goto(`/?file=${publicSamples.helmet.url}&viewer=three&waitForMaterials=1`);
        await waitForPublicViewerLoad(page, publicSamples.helmet.filename);

        const stats = await page.evaluate(() => {
            const result = {
                texturedMaterials: 0,
                texturedSideClones: 0,
            };
            window.usdRoot?.traverse?.((object: any) => {
                if (!object.isMesh || !object.userData?.usdPath) return;
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                for (const material of materials) {
                    if (!material?.map) continue;
                    result.texturedMaterials++;
                    if (material.userData?.usdHydraSideCloneOf) {
                        result.texturedSideClones++;
                    }
                }
            });
            return result;
        });

        expect(stats.texturedMaterials).toBeGreaterThan(0);
        expect(stats.texturedSideClones).toBe(0);
        expect(diagnostics).toEqual([]);
    });

    test('clones shared materials only for mixed cull sides', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.goto('/?file=/test-fixtures/usd-concepts/shared_material_mixed_cull.usda&viewer=three&waitForMaterials=1');
        await waitForPublicViewerLoad(page, 'shared_material_mixed_cull.usda');

        const stats = await page.evaluate(() => {
            const entries: Array<{ path: string, side: number, cloneOf: string }> = [];
            window.usdRoot?.traverse?.((object: any) => {
                const path = String(object.userData?.usdPath || '');
                if (!object.isMesh || !/\/World\/(?:DoubleSidedPlane|SingleSidedPlane)$/.test(path)) return;
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                for (const material of materials) {
                    if (!material) continue;
                    entries.push({
                        path,
                        side: material.side,
                        cloneOf: material.userData?.usdHydraSideCloneOf || '',
                    });
                }
            });
            return {
                entries,
                cloneCount: entries.filter(entry => entry.cloneOf).length,
                sides: Array.from(new Set(entries.map(entry => entry.side))).sort(),
            };
        });

        expect(stats.entries).toHaveLength(2);
        expect(stats.cloneCount).toBe(2);
        expect(stats.sides).toEqual([0, 2]);
        expect(diagnostics).toEqual([]);
    });

    test('keeps mixed-cull material side variants synced with animated material updates', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.goto('/?file=/test-fixtures/edge-cases/shared_material_mixed_cull_animated.usda&viewer=three&waitForMaterials=1');
        await waitForPublicViewerLoad(page, 'shared_material_mixed_cull_animated.usda');

        const frameOne = await seekAndReadMixedCullMaterials(page, 1);
        const frameTwentyFour = await seekAndReadMixedCullMaterials(page, 24);

        expect(frameOne.entries).toHaveLength(2);
        expect(frameOne.cloneCount).toBe(2);
        expect(frameOne.sides).toEqual([0, 2]);
        expectColorsCloseTo(frameOne.colors, [0.1, 0.25, 1]);

        expect(frameTwentyFour.entries).toHaveLength(2);
        expect(frameTwentyFour.cloneCount).toBe(2);
        expect(frameTwentyFour.sides).toEqual([0, 2]);
        expectColorsCloseTo(frameTwentyFour.colors, [1, 0.32, 0.05]);
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

    test('switches between Asset Explorer converted samples from a direct URL', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.route(assetExplorerApi, route => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
                models: [
                    {
                        name: 'Antique Camera',
                        slug: 'AntiqueCamera',
                        tags: ['showcase'],
                        thumbnail: 'https://asset-explorer.needle.tools/downloads/AntiqueCamera.glb.three.webp',
                        assets: {
                            glb: 'https://asset-explorer.needle.tools/downloads/AntiqueCamera.glb',
                        },
                        conversions: [
                            { id: 'three-r185', label: 'three', version: '0.185.0', usdz: assetExplorerSamples.antiqueCameraThree.url },
                            { id: 'blender-5-1', label: 'Blender', version: '5.1.2', usdz: 'https://asset-explorer.needle.tools/downloads/AntiqueCamera.glb.blender.usdz' },
                        ],
                    },
                    {
                        name: assetExplorerSamples.animatedMorphSphereBlender.label,
                        slug: 'AnimatedMorphSphere',
                        tags: ['showcase'],
                        thumbnail: 'https://asset-explorer.needle.tools/downloads/AnimatedMorphSphere.glb.three.webp',
                        assets: {
                            glb: 'https://asset-explorer.needle.tools/downloads/AnimatedMorphSphere.glb',
                        },
                        conversions: [
                            { id: 'three-r185', label: 'three', version: '0.185.0', usdz: assetExplorerSamples.animatedMorphSphereThree.url },
                            { id: 'blender-5-1', label: 'Blender', version: '5.1.2', usdz: assetExplorerSamples.animatedMorphSphereBlender.url },
                        ],
                    },
                ],
            }),
        }));
        await page.route(assetExplorerSamples.antiqueCameraThree.url, route => route.fulfill({
            path: 'tests/fixtures/asset-explorer/DamagedHelmet.glb.three.usdz',
        }));
        await page.route(assetExplorerSamples.animatedMorphSphereThree.url, route => route.fulfill({
            path: 'tests/fixtures/asset-explorer/DamagedHelmet.glb.three.usdz',
        }));
        await page.route(assetExplorerSamples.animatedMorphSphereBlender.url, route => route.fulfill({
            path: 'tests/fixtures/asset-explorer/BoomBox.glb.three.usdz',
        }));

        await page.goto(`/?file=${encodeURIComponent(assetExplorerSamples.antiqueCameraThree.url)}&viewer=three`);
        const initialState = await waitForPublicViewerLoad(page, assetExplorerSamples.antiqueCameraThree.filename);
        expect(initialState.loadedConverterVisible).toBe(true);
        expect(initialState.loadedConverter).toBe('three-r185');

        await page.click('.dropdown-button');
        await page.click('[data-sample-group="gltf"]');
        await page.waitForFunction(label => {
            return Array.from(document.querySelectorAll<HTMLAnchorElement>('.gallery-card'))
                .some(card => card.dataset.name === label && card.href.includes('.three.usdz'));
        }, assetExplorerSamples.animatedMorphSphereThree.label);

        await expect(page.locator(`.gallery-card[data-name="${assetExplorerSamples.animatedMorphSphereThree.label}"]`))
            .toHaveAttribute('href', `?file=${assetExplorerSamples.animatedMorphSphereThree.url}`);

        await page.click(`.gallery-card[data-name="${assetExplorerSamples.animatedMorphSphereThree.label}"]`);
        const loadedDefault = await waitForPublicViewerLoad(page, assetExplorerSamples.animatedMorphSphereThree.filename);
        expect(loadedDefault.loadedConverterVisible).toBe(true);
        expect(loadedDefault.loadedConverter).toBe('three-r185');

        await page.dispatchEvent('#loaded-converter-toggle button[data-converter="blender-5-1"]', 'pointerdown', { bubbles: true, pointerType: 'mouse', button: 0 });
        const state = await waitForPublicViewerLoad(page, assetExplorerSamples.animatedMorphSphereBlender.filename);

        expect(state.filename).toBe(assetExplorerSamples.animatedMorphSphereBlender.filename);
        expect(new URL(state.href).searchParams.get('file')).toBe(assetExplorerSamples.animatedMorphSphereBlender.url);
        expect(state.loadedConverterVisible).toBe(true);
        expect(state.loadedConverter).toBe('blender-5-1');
        expect(diagnostics).toEqual([]);
    });

    test('loads original glTF samples with native viewer loaders', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        const glbUrl = '/test-fixtures/asset-explorer/DamagedHelmet.glb';

        await page.goto(`/?file=${glbUrl}&viewer=three`);
        const threeState = await waitForNativeGltfLoad(page, 'DamagedHelmet.glb', 'three');
        expect(threeState.filename).toBe('DamagedHelmet.glb');
        expect(threeState.hasHydraHandle).toBe(false);
        expect(threeState.hasUsdStage).toBe(false);
        expect(threeState.threeChildren).toBeGreaterThan(0);
        expect(threeState.cameraFit?.meshCount).toBeGreaterThan(0);
        expect(threeState.cameraFit?.angleToCenterDeg).toBeLessThan(1);
        expect(threeState.cameraFit?.cameraOffsetAlignment).toBeGreaterThan(0.999);
        expect(threeState.cameraFit?.ndc.minX).toBeGreaterThanOrEqual(-0.98);
        expect(threeState.cameraFit?.ndc.maxX).toBeLessThanOrEqual(0.98);
        expect(threeState.cameraFit?.ndc.minY).toBeGreaterThanOrEqual(-0.98);
        expect(threeState.cameraFit?.ndc.maxY).toBeLessThanOrEqual(0.98);

        await page.goto(`/?file=${glbUrl}&viewer=needle`);
        const needleState = await waitForNativeGltfLoad(page, 'DamagedHelmet.glb', 'needle-loader');
        expect(needleState.filename).toBe('DamagedHelmet.glb');
        expect(needleState.hasHydraHandle).toBe(false);
        expect(needleState.hasUsdStage).toBe(false);
        expect(needleState.needleSrc).toBe(glbUrl);
        expect(needleState.autoplay).toBe(true);
        expect(needleState.hasNeedleContext).toBe(true);
        expect(needleState.cameraFit?.meshCount).toBeGreaterThan(0);
        expect(needleState.cameraFit?.angleToCenterDeg).toBeLessThan(1);
        expect(needleState.cameraFit?.ndc.minX).toBeGreaterThanOrEqual(-0.98);
        expect(needleState.cameraFit?.ndc.maxX).toBeLessThanOrEqual(0.98);
        expect(needleState.cameraFit?.ndc.minY).toBeGreaterThanOrEqual(-0.98);
        expect(needleState.cameraFit?.ndc.maxY).toBeLessThanOrEqual(0.98);
        expect(diagnostics).toEqual([]);
    });

    test('keeps Needle Engine renderer alive while switching converted and original glTF variants', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        const contextDiagnostics = collectConsoleMatches(page, [
            /Attempting to recover WebGL context/i,
            /WEBGL_lose_context/i,
            /webgl context (?:lost|was lost)/i,
        ]);
        const sample = {
            name: 'Animated Colors Cube',
            slug: 'AnimatedColorsCube',
            glb: 'https://asset-explorer.needle.tools/downloads/AnimatedColorsCube.glb',
            usdz: 'https://asset-explorer.needle.tools/downloads/AnimatedColorsCube.glb.three.usdz',
        };
        await page.route(assetExplorerApi, route => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
                models: [{
                    name: sample.name,
                    slug: sample.slug,
                    tags: ['showcase'],
                    thumbnail: 'https://asset-explorer.needle.tools/downloads/AnimatedColorsCube.glb.three.webp',
                    assets: { glb: sample.glb },
                    conversions: [
                        { id: 'three-r185', label: 'three', version: '0.185.0', usdz: sample.usdz },
                    ],
                }],
            }),
        }));
        await page.route(sample.usdz, route => route.fulfill({
            path: 'tests/fixtures/asset-explorer/DamagedHelmet.glb.three.usdz',
        }));
        await page.route(sample.glb, route => route.fulfill({
            path: 'tests/fixtures/asset-explorer/DamagedHelmet.glb',
        }));

        await page.goto(`/?file=${encodeURIComponent(sample.usdz)}&viewer=needle`);
        await waitForNeedleLoaderMode(page, 'AnimatedColorsCube.glb.three.usdz');
        const firstLifecycleState = await page.evaluate(() => {
            const element = document.querySelector('needle-engine');
            (window as any).__needleLifecycleElement = element;
            (window as any).__needleLifecycleContext = element?.context;
            return {
                src: element?.getAttribute('src') || '',
                sameElement: element === (window as any).__needleLifecycleElement,
                sameContext: element?.context === (window as any).__needleLifecycleContext,
            };
        });
        expect(firstLifecycleState.src).toBe(sample.usdz);
        expect(firstLifecycleState.sameElement).toBe(true);
        expect(firstLifecycleState.sameContext).toBe(true);

        await page.dispatchEvent('#loaded-converter-toggle button[data-converter="original-gltf"]', 'pointerdown', { bubbles: true, pointerType: 'mouse', button: 0 });
        const originalState = await waitForNativeGltfLoad(page, 'AnimatedColorsCube.glb', 'needle-loader');
        expect(originalState.needleSrc).toBe(sample.glb);
        expect(await page.evaluate(() => {
            const element = document.querySelector('needle-engine');
            return {
                sameElement: element === (window as any).__needleLifecycleElement,
                sameContext: element?.context === (window as any).__needleLifecycleContext,
            };
        })).toEqual({ sameElement: true, sameContext: true });

        await page.dispatchEvent('#loaded-converter-toggle button[data-converter="three-r185"]', 'pointerdown', { bubbles: true, pointerType: 'mouse', button: 0 });
        await waitForNeedleLoaderMode(page, 'AnimatedColorsCube.glb.three.usdz');
        expect(await page.evaluate(() => {
            const element = document.querySelector('needle-engine');
            return {
                src: element?.getAttribute('src') || '',
                sameElement: element === (window as any).__needleLifecycleElement,
                sameContext: element?.context === (window as any).__needleLifecycleContext,
            };
        })).toEqual({ src: sample.usdz, sameElement: true, sameContext: true });

        expect(contextDiagnostics).toEqual([]);
        expect(diagnostics).toEqual([]);
    });

    test('keeps WebGL contexts stable during rapid Needle USD asset switches', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        const contextDiagnostics = collectConsoleMatches(page, [
            /Attempting to recover WebGL context/i,
            /Too many active WebGL contexts/i,
            /WEBGL_lose_context/i,
            /webgl context (?:lost|was lost)/i,
        ]);

        await page.addInitScript(() => {
            const originalGetContext = HTMLCanvasElement.prototype.getContext;
            const seen = new WeakMap<HTMLCanvasElement, number>();
            let nextCanvasId = 1;
            (window as any).__webglContextProbe = [];
            HTMLCanvasElement.prototype.getContext = function(type: string, ...args: any[]) {
                const result = originalGetContext.call(this, type, ...args);
                if ((type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') && result) {
                    if (!seen.has(this)) seen.set(this, nextCanvasId++);
                    const canvasId = seen.get(this);
                    const probe = (window as any).__webglContextProbe;
                    if (!probe.some((entry: any) => entry.canvasId === canvasId && entry.type === type)) {
                        probe.push({
                            canvasId,
                            type,
                            stack: new Error().stack || '',
                        });
                    }
                }
                return result;
            } as typeof HTMLCanvasElement.prototype.getContext;
        });

        await page.route('/api/script.js', route => route.fulfill({
            contentType: 'application/javascript',
            body: `
                (() => {
                    function fingerprint() {
                        const canvas = document.createElement('canvas');
                        canvas.getContext('webgl') || canvas.getContext('webgl2');
                    }
                    window.rybbit = {
                        event() { fingerprint(); },
                        pageview() { fingerprint(); },
                    };
                    fingerprint();
                })();
            `,
        }));

        const samples = [
            `${usdWgBaseUrl}test_assets/schemaTests/usdGeom/primitives/cube.usda`,
            `${usdWgBaseUrl}test_assets/schemaTests/usdGeom/primitives/sphere.usda`,
            `${usdWgBaseUrl}test_assets/schemaTests/usdGeom/meshes/singleSided/singleSided.usda`,
            `${usdWgBaseUrl}test_assets/schemaTests/usdGeom/meshes/quad_mesh/quads.usda`,
            `${usdWgBaseUrl}test_assets/schemaTests/usdGeom/meshes/doubleSided/doubleSided_quad.usda`,
        ];

        await page.goto(`/?file=${encodeURIComponent(samples[4])}&viewer=needle`);
        await waitForNeedleLoaderMode(page, 'doubleSided_quad.usda');
        await page.evaluate(() => {
            const events: string[] = [];
            (window as any).__webglContextEvents = events;
            const canvases = [
                window.renderer?.domElement,
                document.querySelector('needle-engine')?.context?.renderer?.domElement,
            ].filter(Boolean) as HTMLCanvasElement[];
            for (const canvas of canvases) {
                canvas.addEventListener('webglcontextlost', () => events.push('lost'), false);
                canvas.addEventListener('webglcontextrestored', () => events.push('restored'), false);
            }
        });

        for (let i = 0; i < 30; i++) {
            await clickSyntheticFileLink(page, samples[i % samples.length]);
            await page.waitForTimeout(250);
        }

        await waitForNeedleLoaderMode(page, 'doubleSided_quad.usda');
        const state = await page.evaluate(() => {
            const contexts = ((window as any).__webglContextProbe || []) as Array<{ stack: string }>;
            const analyticsContexts = contexts.filter(entry => entry.stack.includes('/api/script.js'));
            const element = document.querySelector('needle-engine');
            return {
                contextCount: contexts.length,
                analyticsContextCount: analyticsContexts.length,
                contextEvents: (window as any).__webglContextEvents || [],
                publicLost: Boolean(window.renderer?.getContext?.()?.isContextLost?.()),
                needleLost: Boolean(element?.context?.renderer?.getContext?.()?.isContextLost?.()),
                filename: document.querySelector('.filename-text')?.textContent || '',
                hasHydraHandle: Boolean(window.usdHydra),
                hasNeedleContext: Boolean(window.needleEngineContext),
            };
        });

        expect(state).toMatchObject({
            analyticsContextCount: 0,
            contextEvents: [],
            publicLost: false,
            needleLost: false,
            filename: 'doubleSided_quad.usda',
            hasHydraHandle: true,
            hasNeedleContext: true,
        });
        expect(state.contextCount).toBeLessThanOrEqual(2);
        expect(contextDiagnostics).toEqual([]);
        expect(diagnostics).toEqual([]);
    });

    test('uses smooth normals for Catmull-Clark subdivision meshes', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.route('/api/script.js', route => route.fulfill({
            contentType: 'application/javascript',
            body: 'window.rybbit = { event() {}, pageview() {} };',
        }));

        const catmullUrl = `${usdWgBaseUrl}test_assets/schemaTests/usdGeom/meshes/subdiv_catmullClark/subdiv_catmullClark.usda`;
        await page.goto(`/?file=${encodeURIComponent(catmullUrl)}&viewer=needle`);
        await waitForNeedleLoaderMode(page, 'subdiv_catmullClark.usda');
        const catmull = await getNeedleUsdMeshNormalState(page);
        expect(catmull.positionCount).toBeGreaterThan(36);
        expect(catmull.triangleCount).toBeGreaterThan(12);
        expect(catmull.faceConstantNormals).toBe(0);
        expect(catmull.sampledFaces).toBeGreaterThan(0);
        expect(catmull.sharedPositionDifferentNormalGroups).toBe(0);

        const noneUrl = `${usdWgBaseUrl}test_assets/schemaTests/usdGeom/meshes/subdiv_none/subdiv_none.usda`;
        await page.goto(`/?file=${encodeURIComponent(noneUrl)}&viewer=needle`);
        await waitForNeedleLoaderMode(page, 'subdiv_none.usda');
        const none = await getNeedleUsdMeshNormalState(page);
        expect(none.positionCount).toBe(36);
        expect(none.triangleCount).toBe(12);
        expect(none.faceConstantNormals).toBe(none.sampledFaces);
        expect(diagnostics).toEqual([]);
    });

    test('keeps UVs for subdivided meshes with normal textures', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.route('/api/script.js', route => route.fulfill({
            contentType: 'application/javascript',
            body: 'window.rybbit = { event() {}, pageview() {} };',
        }));

        const sampleUrl = `${usdWgBaseUrl}test_assets/NormalsTextureBiasAndScale/NormalsTextureBiasAndScale.usdz`;
        await page.goto(`/?file=${encodeURIComponent(sampleUrl)}&viewer=needle&waitForMaterials=1`);
        await waitForNeedleLoaderMode(page, 'NormalsTextureBiasAndScale.usdz');

        const state = await page.evaluate(() => {
            const meshes: any[] = [];
            window.needleEngineContext?.scene?.traverse?.((object: any) => {
                if (!object.isMesh || !String(object.userData?.usdPath || '').startsWith('/NormalsTextureBiasAndScale/Geom/')) {
                    return;
                }
                const material = Array.isArray(object.material) ? object.material[0] : object.material;
                const attributes = object.geometry?.attributes || {};
                meshes.push({
                    name: object.name,
                    positionCount: attributes.position?.count || 0,
                    normalCount: attributes.normal?.count || 0,
                    uvCount: attributes.uv?.count || 0,
                    uv2Count: attributes.uv2?.count || 0,
                    hasNormalMap: Boolean(material?.normalMap),
                    normalMapName: material?.normalMap?.name || '',
                });
            });
            return meshes;
        });

        expect(state).toHaveLength(3);
        for (const mesh of state) {
            expect(mesh.positionCount).toBeGreaterThan(36);
            expect(mesh.normalCount).toBe(mesh.positionCount);
            expect(mesh.uvCount).toBe(mesh.positionCount);
            expect(mesh.uv2Count).toBe(mesh.positionCount);
            expect(mesh.hasNormalMap).toBe(true);
            expect(mesh.normalMapName).toMatch(/r_normal_map.*\.png/);
        }
        expect(diagnostics).toEqual([]);
    });

    test('refines varying primvars on subdivision meshes', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.route('/api/script.js', route => route.fulfill({
            contentType: 'application/javascript',
            body: 'window.rybbit = { event() {}, pageview() {} };',
        }));

        await page.goto('/?file=/test-fixtures/subdivision/catmull_clark_varying_color.usda&viewer=needle');
        await waitForNeedleLoaderMode(page, 'catmull_clark_varying_color.usda');

        const state = await getNeedleMeshAttributeState(page, '/World/SubdivVaryingColor');
        expect(state.positionCount).toBeGreaterThan(36);
        expect(state.colorCount).toBe(state.positionCount);
        expect(state.vertexColors).toBe(true);
        expect(diagnostics).toEqual([]);
    });

    test('refines face-varying primvars on subdivision meshes', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.route('/api/script.js', route => route.fulfill({
            contentType: 'application/javascript',
            body: 'window.rybbit = { event() {}, pageview() {} };',
        }));

        await page.goto('/?file=/test-fixtures/subdivision/catmull_clark_facevarying_st.usda&viewer=needle');
        await waitForNeedleLoaderMode(page, 'catmull_clark_facevarying_st.usda');

        const state = await getNeedleMeshAttributeState(page, '/World/SubdivFaceVaryingSt');
        expect(state.positionCount).toBeGreaterThan(36);
        expect(state.uvCount).toBe(state.positionCount);
        expect(state.uv2Count).toBe(state.positionCount);
        expect(diagnostics).toEqual([]);
    });

    test('stores Asset Explorer conversion variants without a gallery switcher', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.route(assetExplorerApi, route => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
                models: [{
                    name: 'Synthetic Converter Matrix',
                    slug: 'SyntheticConverterMatrix',
                    tags: ['showcase'],
                    thumbnail: 'https://asset-explorer.needle.tools/thumbnail.png',
                    assets: {
                        glb: 'https://asset-explorer.needle.tools/downloads/Synthetic.glb',
                    },
                    info: { textures: 2, animations: 1 },
                    conversions: [
                        { id: 'three-r185', label: 'three', version: '0.185.0', available: true, usdz: 'https://asset-explorer.needle.tools/downloads/Synthetic.glb.three.usdz' },
                        { id: 'needle-engine', label: 'Needle', version: '5.1.2', available: true, usdz: 'https://asset-explorer.needle.tools/downloads/Synthetic.glb.needle-engine.usdz' },
                        { id: 'blender-5-1', label: 'Blender', version: '5.1.2', available: true, usdz: 'https://asset-explorer.needle.tools/downloads/Synthetic.glb.blender.usdz' },
                        { id: 'openusd-adobe-gltf', label: 'Adobe glTF', version: 'OpenUSD 26.05', available: true, usdz: 'https://asset-explorer.needle.tools/downloads/Synthetic.glb.openusd-adobe-gltf.usdz' },
                        { id: 'guc', label: 'GUC', version: '0.5', available: true, usdz: 'https://asset-explorer.needle.tools/downloads/Synthetic.glb.guc.usdz' },
                        { id: 'three-r154', label: 'three', version: 'r154', available: true, usdz: 'https://asset-explorer.needle.tools/downloads/Synthetic.glb.three-r154.usdz' },
                    ],
                }],
            }),
        }));

        await page.goto('/?viewer=needle');
        await page.click('.dropdown-button');
        await page.waitForFunction(() => document.querySelectorAll('.gallery-card').length === 1);

        const state = await page.evaluate(() => ({
            topSelectExists: Boolean(document.querySelector('#converter-select-wrap, #converter-select')),
            galleryConverterExists: Boolean(document.querySelector('#converter-toggle')),
            converters: Object.keys(JSON.parse(document.querySelector<HTMLElement>('.gallery-card')?.dataset.conversions || '{}')),
            converterOrder: JSON.parse(document.querySelector<HTMLElement>('.gallery-card')?.dataset.converterOrder || '[]'),
            firstHref: document.querySelector<HTMLAnchorElement>('.gallery-card')?.getAttribute('href') || '',
        }));

        expect(state.topSelectExists).toBe(false);
        expect(state.galleryConverterExists).toBe(false);
        expect(state.converters).toEqual([
            'three-r185',
            'needle-engine',
            'blender-5-1',
            'openusd-adobe-gltf',
            'guc',
            'three-r154',
            'original-gltf',
        ]);
        expect(state.converterOrder).toEqual(state.converters);
        expect(state.firstHref).toContain('Synthetic.glb.three.usdz');
        expect(diagnostics).toEqual([]);
    });

    test('does not infer variants from Asset Explorer usdz summaries', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.route(assetExplorerApi, route => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
                models: [{
                    name: 'Object Variant Matrix',
                    slug: 'ObjectVariantMatrix',
                    tags: ['showcase'],
                    thumbnail: 'https://asset-explorer.needle.tools/thumbnail.png',
                    assets: {
                        glb: 'https://asset-explorer.needle.tools/downloads/ObjectVariant.glb',
                        usdz: {
                            three: 'https://asset-explorer.needle.tools/downloads/ObjectVariant.glb.three.usdz',
                            blender: 'https://asset-explorer.needle.tools/downloads/ObjectVariant.glb.blender.usdz',
                            ov: 'https://asset-explorer.needle.tools/downloads/ObjectVariant.glb.ov.usdz',
                        },
                    },
                }],
            }),
        }));

        await page.goto('/?viewer=needle');
        await page.click('.dropdown-button');
        await page.waitForFunction(() => document.querySelectorAll('.gallery-card').length === 1);

        const state = await page.evaluate(() => ({
            galleryConverterExists: Boolean(document.querySelector('#converter-toggle')),
            converters: Object.keys(JSON.parse(document.querySelector<HTMLElement>('.gallery-card')?.dataset.conversions || '{}')),
            firstHref: document.querySelector<HTMLAnchorElement>('.gallery-card')?.getAttribute('href') || '',
        }));

        expect(state.galleryConverterExists).toBe(false);
        expect(state.converters).toEqual(['original-gltf']);
        expect(state.firstHref).toBe('?file=https://asset-explorer.needle.tools/downloads/ObjectVariant.glb');
        expect(diagnostics).toEqual([]);
    });

    test('uses folder-like sample library defaults and ordering', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.goto('/?viewer=three');
        await page.click('.dropdown-button');

        await expect(page.locator('#sample-group-list > [data-sample-group]').nth(0)).toHaveAttribute('data-sample-group', 'gltf');
        await expect(page.locator('#sample-group-list > [data-sample-group]').nth(1)).toHaveAttribute('data-sample-group', 'usd-wg');
        await expect(page.locator('#gallery-title')).toHaveText('glTF → USD conversions');
        await expect(page.locator('#gallery-subtitle')).toHaveText('Converted from glTF Sample Assets');
        await expect(page.locator('[data-sample-group="gltf"]')).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#usd-wg-group-tree')).toBeHidden();

        await page.waitForFunction(() => {
            const labels = Array.from(document.querySelectorAll('#gltf-group-tree [data-sample-group] span'))
                .map((node) => node.textContent?.trim());
            return labels[0] === 'Showcase' && !labels.includes('Video');
        });

        await page.click('[data-sample-group="gltf"]');
        await expect(page.locator('#gltf-group-tree')).toBeHidden();
        await expect(page.locator('[data-sample-group="gltf"]')).toHaveAttribute('aria-expanded', 'false');
        await page.click('[data-sample-group="gltf"]');
        await expect(page.locator('#gltf-group-tree')).toBeVisible();

        await page.click('[data-sample-group="usd-wg"]');
        await expect(page.locator('#usd-wg-group-tree')).toBeVisible();
        await expect(page.locator('#gltf-group-tree')).toBeHidden();
        await page.waitForFunction(() => {
            const first = document.querySelector('#usd-wg-group-tree [data-sample-group] span');
            return first?.textContent?.trim() === 'Full Assets';
        });
        await page.waitForFunction(() => {
            const firstMeta = document.querySelector('.gallery-card .gallery-meta');
            return firstMeta?.textContent?.includes('full_assets');
        });

        expect(diagnostics).toEqual([]);
    });

    test('shows thumbnails for Needle Cloud samples', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.goto('/?viewer=three');
        await page.click('.dropdown-button');
        await page.click('[data-sample-group="test-models"]');

        const kitchenThumbnail = page.locator('.gallery-card[data-name="Kitchen Set"] .gallery-thumb');
        await expect(kitchenThumbnail).toHaveAttribute('src', /screenshot\.needle\.webp$/);
        await page.waitForFunction(() => {
            const img = document.querySelector<HTMLImageElement>('.gallery-card[data-name="Kitchen Set"] .gallery-thumb');
            return !!img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
        });

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

async function clickSyntheticFileLink(page: Page, url: string) {
    await page.evaluate(fileUrl => {
        const link = document.createElement('a');
        link.className = 'file';
        link.href = `/?file=${encodeURIComponent(fileUrl)}`;
        link.dataset.name = fileUrl.split('/').pop() || fileUrl;
        link.textContent = link.dataset.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
    }, url);
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
        loadedConverterVisible: !document.querySelector<HTMLElement>('#loaded-converter-toggle-wrap')?.hidden,
        loadedConverter: document.querySelector<HTMLButtonElement>('#loaded-converter-toggle button.active')?.dataset.converter || '',
        rendererMemory: window.renderer?.info?.memory ? { ...window.renderer.info.memory } : { geometries: -1, textures: -1 },
    }));
}

async function waitForNativeGltfLoad(page: Page, filename: string, mode: 'three' | 'needle-loader') {
    await page.waitForFunction(({ expectedFilename, expectedMode }) => {
        const overlay = document.getElementById('loading-overlay');
        const overlayHidden = !overlay || !overlay.classList.contains('visible');
        const actualFilename = document.querySelector('.filename-text')?.textContent || '';
        const nativeThreeLoaded = expectedMode === 'three' && (window.usdRoot?.children?.length ?? 0) > 0;
        const nativeNeedleLoaded = expectedMode === 'needle-loader' && Boolean(document.querySelector('needle-engine')?.context);
        return overlayHidden
            && actualFilename === expectedFilename
            && !window.usdHydra
            && !window.usdStage
            && (nativeThreeLoaded || nativeNeedleLoaded);
    }, { expectedFilename: filename, expectedMode: mode });
    await page.waitForTimeout(1000);
    return await page.evaluate(expectedMode => {
        let cameraFit: any = null;
        const THREE = (window as any).THREE || (window as any).__usdViewerThreeDiagnostics;
        const context = document.querySelector('needle-engine')?.context;
        const camera = expectedMode === 'needle-loader' ? context?.mainCamera : window.camera;
        const loadedRoots = expectedMode === 'needle-loader'
            ? (context?.scene?.children || []).filter((object: any) => {
                if (object === camera || object.isCamera) return false;
                if (/fallback camera|contactshadows/i.test(object.name || '')) return false;
                return true;
            })
            : (window.usdRoot?.children || []);
        if (THREE && camera && loadedRoots.length > 0) {
            for (const root of loadedRoots) root.updateMatrixWorld?.(true);
            camera.updateMatrixWorld(true);
            camera.updateProjectionMatrix?.();

            const meshes: any[] = [];
            for (const root of loadedRoots) {
                root.traverse?.((object: any) => {
                    if (!object.isMesh || !object.geometry?.attributes?.position) return;
                    meshes.push(object);
                });
            }

            const box = new THREE.Box3();
            box.makeEmpty();
            for (const root of loadedRoots) box.expandByObject(root);

            const center = new THREE.Vector3();
            box.getCenter(center);
            const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
            const cameraDirection = new THREE.Vector3();
            camera.getWorldDirection(cameraDirection);
            const toCenter = center.clone().sub(cameraPosition).normalize();
            const defaultCameraOffset = new THREE.Vector3(0, 7, 7).normalize();
            const cameraOffset = cameraPosition.clone().sub(center).normalize();

            const corners: any[] = [];
            for (const x of [box.min.x, box.max.x]) {
                for (const y of [box.min.y, box.max.y]) {
                    for (const z of [box.min.z, box.max.z]) {
                        corners.push(new THREE.Vector3(x, y, z).project(camera));
                    }
                }
            }
            const xs = corners.map(point => point.x).filter(Number.isFinite);
            const ys = corners.map(point => point.y).filter(Number.isFinite);
            cameraFit = {
                meshCount: meshes.length,
                rootNames: loadedRoots.map((object: any) => object.name || object.type || ''),
                angleToCenterDeg: cameraDirection.angleTo(toCenter) * 180 / Math.PI,
                cameraOffsetAlignment: cameraOffset.dot(defaultCameraOffset),
                ndc: {
                    minX: Math.min(...xs),
                    maxX: Math.max(...xs),
                    minY: Math.min(...ys),
                    maxY: Math.max(...ys),
                },
            };
        }
        return {
            filename: document.querySelector('.filename-text')?.textContent || '',
            hasHydraHandle: Boolean(window.usdHydra),
            hasUsdStage: Boolean(window.usdStage),
            threeChildren: window.usdRoot?.children?.length ?? -1,
            hasNeedleContext: Boolean(document.querySelector('needle-engine')?.context),
            needleSrc: document.querySelector('needle-engine')?.getAttribute('src') || '',
            autoplay: document.querySelector('needle-engine')?.hasAttribute('autoplay') ?? false,
            cameraFit,
        };
    }, mode);
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
        autoplay: document.querySelector('needle-engine')?.hasAttribute('autoplay') ?? false,
        contactShadows: document.querySelector('needle-engine')?.getAttribute('contactshadows') || '',
        driverAlive: Boolean(window.driver) && (typeof window.driver.isDeleted !== 'function' || !window.driver.isDeleted()),
        hasHydraHandle: Boolean(window.usdHydra),
        hasNeedleContext: Boolean(window.needleEngineContext),
        needleChildren: window.needleEngineContext?.scene?.children?.length ?? -1,
        threeCanvasDisplay: getComputedStyle(document.querySelector('.usd-viewer-three-canvas')!).display,
        needleDisplay: getComputedStyle(document.querySelector('needle-engine')!).display,
    }));
}

async function getNeedleUsdMeshNormalState(page: Page) {
    return await page.evaluate(() => {
        let target: any = null;
        window.needleEngineContext?.scene?.traverse?.((object: any) => {
            if (!target && object.isMesh && object.userData?.usdPath === '/mesh') {
                target = object;
            }
        });
        if (!target) throw new Error('Missing Needle USD mesh at /mesh');

        const position = target.geometry?.attributes?.position;
        const normal = target.geometry?.attributes?.normal;
        let faceConstantNormals = 0;
        let sampledFaces = 0;
        const positionNormalGroups = new Map<string, Set<string>>();

        if (position && normal) {
            sampledFaces = Math.min(Math.floor(normal.count / 3), 20);
            const values = normal.array;
            for (let face = 0; face < sampledFaces; face++) {
                const offset = face * 9;
                const same01 =
                    Math.abs(values[offset] - values[offset + 3]) < 1e-5 &&
                    Math.abs(values[offset + 1] - values[offset + 4]) < 1e-5 &&
                    Math.abs(values[offset + 2] - values[offset + 5]) < 1e-5;
                const same02 =
                    Math.abs(values[offset] - values[offset + 6]) < 1e-5 &&
                    Math.abs(values[offset + 1] - values[offset + 7]) < 1e-5 &&
                    Math.abs(values[offset + 2] - values[offset + 8]) < 1e-5;
                if (same01 && same02) faceConstantNormals++;
            }

            const count = Math.min(position.count, normal.count);
            for (let i = 0; i < count; i++) {
                const positionKey = [
                    position.getX(i).toFixed(5),
                    position.getY(i).toFixed(5),
                    position.getZ(i).toFixed(5),
                ].join(',');
                const normalKey = [
                    normal.getX(i).toFixed(3),
                    normal.getY(i).toFixed(3),
                    normal.getZ(i).toFixed(3),
                ].join(',');
                let normals = positionNormalGroups.get(positionKey);
                if (!normals) {
                    normals = new Set<string>();
                    positionNormalGroups.set(positionKey, normals);
                }
                normals.add(normalKey);
            }
        }

        let sharedPositionDifferentNormalGroups = 0;
        for (const normals of positionNormalGroups.values()) {
            if (normals.size > 1) sharedPositionDifferentNormalGroups++;
        }

        return {
            positionCount: position?.count || 0,
            normalCount: normal?.count || 0,
            triangleCount: (position?.count || 0) / 3,
            faceConstantNormals,
            sampledFaces,
            sharedPositionDifferentNormalGroups,
        };
    });
}

async function getNeedleMeshAttributeState(page: Page, usdPath: string) {
    return await page.evaluate(path => {
        let target: any = null;
        window.needleEngineContext?.scene?.traverse?.((object: any) => {
            if (!target && object.isMesh && object.userData?.usdPath === path) {
                target = object;
            }
        });
        if (!target) throw new Error(`Missing Needle USD mesh at ${path}`);

        const material = Array.isArray(target.material)
            ? target.material[0]
            : target.material;
        const attributes = target.geometry?.attributes || {};
        return {
            positionCount: attributes.position?.count || 0,
            normalCount: attributes.normal?.count || 0,
            colorCount: attributes.color?.count || 0,
            uvCount: attributes.uv?.count || 0,
            uv2Count: attributes.uv2?.count || 0,
            vertexColors: Boolean(material?.vertexColors),
        };
    }, usdPath);
}

async function countTexturedUsdMaterials(page: Page, mode: 'three' | 'needle') {
    return await page.evaluate(renderMode => {
        const root = renderMode === 'needle'
            ? window.needleEngineContext?.scene
            : window.usdRoot;
        let count = 0;
        root?.traverse?.((object: any) => {
            if (!object.isMesh || !object.userData?.usdPath) return;
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            for (const material of materials) {
                if (material?.map) count++;
            }
        });
        return count;
    }, mode);
}

async function seekAndReadMixedCullMaterials(page: Page, timeCode: number) {
    return await page.evaluate(async frame => {
        window.usdHydra?.setPlaying?.(false);
        await window.usdHydra?.setTime?.(frame);
        await window.usdHydra?.materialsReady?.();
        await new Promise(requestAnimationFrame);

        const entries: Array<{ path: string, side: number, cloneOf: string, color: number[] }> = [];
        window.usdRoot?.traverse?.((object: any) => {
            const path = String(object.userData?.usdPath || '');
            if (!object.isMesh || !/\/World\/(?:DoubleSidedPlane|SingleSidedPlane)$/.test(path)) return;
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            for (const material of materials) {
                if (!material) continue;
                entries.push({
                    path,
                    side: material.side,
                    cloneOf: material.userData?.usdHydraSideCloneOf || '',
                    color: material.color?.toArray?.() || [],
                });
            }
        });

        return {
            entries,
            cloneCount: entries.filter(entry => entry.cloneOf).length,
            sides: Array.from(new Set(entries.map(entry => entry.side))).sort(),
            colors: entries.map(entry => entry.color),
        };
    }, timeCode);
}

function expectColorsCloseTo(colors: number[][], expected: [number, number, number]) {
    expect(colors.length).toBeGreaterThan(0);
    for (const color of colors) {
        expect(color[0]).toBeCloseTo(expected[0], 3);
        expect(color[1]).toBeCloseTo(expected[1], 3);
        expect(color[2]).toBeCloseTo(expected[2], 3);
    }
}

function cameraMoved(before: number[], after: number[]) {
    return before.some((value, index) => Math.abs(value - after[index]) > 0.0001);
}
