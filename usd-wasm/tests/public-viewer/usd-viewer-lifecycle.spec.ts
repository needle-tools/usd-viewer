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
    avocadoThree: {
        filename: 'Avocado.glb.three.usdz',
        url: 'https://asset-explorer.needle.tools/downloads/Avocado.glb.three.usdz',
    },
    animatedMorphSphereOv: {
        label: 'Animated Morph Sphere',
        filename: 'AnimatedMorphSphere.glb.ov.usdz',
        url: 'https://asset-explorer.needle.tools/downloads/AnimatedMorphSphere.glb.ov.usdz',
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

    test('renders versioned Asset Explorer converter families', async ({ page }) => {
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
                        { id: 'three-r185', available: true, usdzUri: 'https://asset-explorer.needle.tools/downloads/Synthetic.glb.three-r185.usdz' },
                        { id: 'needle-engine', available: true, usdzUri: 'https://asset-explorer.needle.tools/downloads/Synthetic.glb.needle-engine.usdz' },
                        { id: 'blender-5-1', available: true, usdzUri: 'https://asset-explorer.needle.tools/downloads/Synthetic.glb.blender-5-1.usdz' },
                        { id: 'openusd-adobe-gltf', available: true, usdzUri: 'https://asset-explorer.needle.tools/downloads/Synthetic.glb.openusd-adobe-gltf.usdz' },
                        { id: 'guc', available: true, usdzUri: 'https://asset-explorer.needle.tools/downloads/Synthetic.glb.guc.usdz' },
                        { id: 'three-r154', available: true, usdzUri: 'https://asset-explorer.needle.tools/downloads/Synthetic.glb.three.usdz' },
                    ],
                }],
            }),
        }));

        await page.goto('/?viewer=needle');
        await page.click('.dropdown-button');
        await page.waitForFunction(() => document.querySelectorAll('#converter-toggle button').length === 7);

        const state = await page.evaluate(() => ({
            topSelectExists: Boolean(document.querySelector('#converter-select-wrap, #converter-select')),
            converters: Array.from(document.querySelectorAll<HTMLButtonElement>('#converter-toggle button')).map(button => button.dataset.converter),
            firstHref: document.querySelector<HTMLAnchorElement>('.gallery-card')?.getAttribute('href') || '',
        }));

        expect(state.topSelectExists).toBe(false);
        expect(state.converters).toEqual([
            'three-r185',
            'three-r154',
            'needle-engine',
            'blender-5-1',
            'openusd-adobe-gltf',
            'guc',
            'original-gltf',
        ]);
        expect(state.firstHref).toContain('Synthetic.glb.three-r185.usdz');

        await page.dispatchEvent('#converter-toggle button[data-converter="blender-5-1"]', 'pointerdown', { bubbles: true, pointerType: 'mouse', button: 0 });
        await expect(page.locator('#converter-toggle button[data-converter="blender-5-1"]')).toHaveClass(/active/);
        await expect(page.locator('#converter-toggle button.active')).toHaveAttribute('data-converter', 'blender-5-1');
        await expect(page.locator('.gallery-card')).toHaveAttribute('href', '?file=https://asset-explorer.needle.tools/downloads/Synthetic.glb.blender-5-1.usdz');

        await page.dispatchEvent('#converter-toggle button[data-converter="original-gltf"]', 'click');
        await expect(page.locator('#converter-toggle button.active')).toHaveAttribute('data-converter', 'original-gltf');
        await expect(page.locator('.gallery-card')).toHaveAttribute('href', '?file=https://asset-explorer.needle.tools/downloads/Synthetic.glb');
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
