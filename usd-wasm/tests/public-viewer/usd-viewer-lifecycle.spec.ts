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
    antiqueCameraBlender: {
        filename: 'AntiqueCamera.glb.blender.usdz',
        url: 'https://asset-explorer.needle.tools/downloads/AntiqueCamera.glb.blender.usdz',
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
const gltfSampleAssetsIndex = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/model-index.json';

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

const needleCloudSamples = {
    kitchenSet: {
        label: 'Kitchen Set',
        filename: 'file.usdz',
        url: 'https://cloud-staging.needle.tools/-/assets/Z23hmXBZCdB4p-ZCdB4p/file.usdz',
    },
};

const reportRegressionSamples = [
    {
        label: 'Kitchen Set scalar primvars',
        filename: needleCloudSamples.kitchenSet.filename,
        url: needleCloudSamples.kitchenSet.url,
    },
    {
        label: 'MaterialX basic textures',
        filename: 'basic.usda',
        url: `${usdWgBaseUrl}test_assets/MaterialXTest/basic.usda`,
    },
    {
        label: 'Vehicle missing material binding',
        filename: 'tractorGeo.usd',
        url: `${usdWgBaseUrl}full_assets/Vehicles/USD_Mini_Car_Kit/assets/vehicles/tractor/geo/tractorGeo.usd`,
    },
    {
        label: 'Sublayered internal references',
        filename: 'SublayeredInternalReferenceTest.usda',
        url: `${usdWgBaseUrl}test_assets/RelationshipEncapsulationTests/SublayeredInternalReferenceTest.usda`,
    },
    {
        label: 'Referenced assemblies internal references',
        filename: 'ReferencedAssembliesWithInternalReferencesTest.usda',
        url: `${usdWgBaseUrl}test_assets/RelationshipEncapsulationTests/ReferencedAssembliesWithInternalReferencesTest.usda`,
    },
    {
        label: 'Internal reference',
        filename: 'InternalReferenceTest.usda',
        url: `${usdWgBaseUrl}test_assets/RelationshipEncapsulationTests/InternalReferenceTest.usda`,
    },
    {
        label: 'External bad target washer',
        filename: 'washer.usda',
        url: `${usdWgBaseUrl}test_assets/RelationshipEncapsulationTests/ExternalReferenceBadTargetTest/washer.usda`,
    },
    {
        label: 'External bad target bolt',
        filename: 'bolt.usda',
        url: `${usdWgBaseUrl}test_assets/RelationshipEncapsulationTests/ExternalReferenceBadTargetTest/bolt.usda`,
    },
    {
        label: 'Internal unencapsulated prototypes',
        filename: 'InternalReferenceUnencapsulatedPrototypes.usda',
        url: `${usdWgBaseUrl}test_assets/RelationshipEncapsulationTests/ReferencedAssembliesWithInternalReferencesTest/InternalReferenceUnencapsulatedPrototypes.usda`,
    },
    {
        label: 'Internal encapsulated prototypes',
        filename: 'InternalReferenceEncapsulatedPrototypes.usda',
        url: `${usdWgBaseUrl}test_assets/RelationshipEncapsulationTests/ReferencedAssembliesWithInternalReferencesTest/InternalReferenceEncapsulatedPrototypes.usda`,
    },
    {
        label: 'Sublayered modeling',
        filename: 'hardware.modeling.usda',
        url: `${usdWgBaseUrl}test_assets/RelationshipEncapsulationTests/SublayeredInternalReferenceTest/hardware.modeling.usda`,
    },
];

const fatalConsolePatterns = [
    /out of memory/i,
    /Cannot enlarge memory/i,
    /RuntimeError/i,
    /unreachable/i,
    /worker sent an error/i,
    /Cannot read properties of undefined/i,
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

const primvarRegressionPatterns = [
    /Could not prepare face-varying primvar __faceindex/i,
    /Unsupported interpolation type 'uniform' for primvar (?:__faceindex|sharp_face)/i,
    /Unsupported primvar:\s+(?:__faceindex|sharp_face|PreMenvPosingRefPose)/i,
];

const rendererErrorPatterns = [
    /\[MaterialX\] Failed to load texture/i,
    /Material not found/i,
    /Failed to open USD stage/i,
    /Failed to load USD file/i,
    /Could not prepare face-varying primvar/i,
    /Unsupported interpolation type/i,
    /Unsupported primvar/i,
    /worker sent an error/i,
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

        expect(state.filename).toBe(viewerDisplayFilename(publicSamples.helmet.filename));
        expect(state.activeButton).toBe('needle-loader');
        expect(state.hasHydraHandle).toBe(true);
        expect(state.driverAlive).toBe(true);
        expect(state.hasNeedleContext).toBe(true);
        expect(state.needleChildren).toBeGreaterThan(0);
        expect(state.elementSrc).toContain(publicSamples.helmet.url);
        expect(state.autoplay).toBe(true);
        expect(state.autoRotate).toBe('false');
        expect(state.contactShadows).toBe('0.7');
        expect(state.threeCanvasDisplay).toBe('none');
        expect(state.needleDisplay).toBe('block');
        expect(new URL(state.href).searchParams.get('viewer')).toBe('needle');
        expect(diagnostics).toEqual([]);
    });

    test('loads representative USD-WG assets through the Needle Engine loader element', async ({ page }) => {
        test.setTimeout(420000);
        const diagnostics = collectFatalDiagnostics(page);
        const usdWgDiagnostics = collectConsoleMatches(page, usdWgRegressionPatterns);

        for (const sample of usdWgSamples) {
            await page.goto(`/?file=${encodeURIComponent(sample.url)}&viewer=needle`);
            const state = await waitForNeedleLoaderMode(page, sample.filename);

            expect(state.filename, sample.label).toBe(sample.filename);
            expect(state.activeButton, sample.label).toBe('needle-loader');
            expect(state.hasHydraHandle, sample.label).toBe(true);
            expect(state.driverAlive, sample.label).toBe(true);
            expect(state.hasNeedleContext, sample.label).toBe(true);
            expect(state.needleChildren, sample.label).toBeGreaterThan(0);
            expect(state.elementSrc, sample.label).toContain(sample.url);
            expect(new URL(state.href).searchParams.get('viewer'), sample.label).toBe('needle');
        }

        expect(usdWgDiagnostics).toEqual([]);
        expect(diagnostics).toEqual([]);
    });

    test('loads report regression assets through the Needle Engine loader element without renderer errors', async ({ page }) => {
        test.setTimeout(180000);
        const fatalDiagnostics = collectFatalDiagnostics(page);
        const rendererErrors = collectConsoleErrorsMatching(page, rendererErrorPatterns);
        const primvarDiagnostics = collectConsoleMatches(page, primvarRegressionPatterns);
        await stubAnalytics(page);

        for (const sample of reportRegressionSamples) {
            await page.goto(`/?file=${encodeURIComponent(sample.url)}&viewer=needle&waitForMaterials=1`, {
                waitUntil: 'domcontentloaded',
            });
            const state = await waitForNeedleLoaderMode(page, sample.filename);

            expect(state.filename, sample.label).toBe(sample.filename);
            expect(state.activeButton, sample.label).toBe('needle-loader');
            expect(state.hasHydraHandle, sample.label).toBe(true);
            expect(state.driverAlive, sample.label).toBe(true);
            expect(state.hasNeedleContext, sample.label).toBe(true);
            expect(state.needleChildren, sample.label).toBeGreaterThan(0);
        }

        expect(primvarDiagnostics).toEqual([]);
        expect(rendererErrors).toEqual([]);
        expect(fatalDiagnostics).toEqual([]);
    });

    test('does not load analytics or marketer trackers in debug and browser automation', async ({ page }) => {
        const blockedRequests: string[] = [];
        page.on('request', request => {
            const url = request.url();
            if (
                url.includes('/api/script.js')
                || url.includes('analytics-2.needle.tools')
                || url.includes('rybbit')
                || url.includes('marketer.needle.tools')
                || url.includes('needle.tools/api/v1/rum/t')
                || url.includes('needle.tools/api/v1/needle-engine/ping')
            ) {
                blockedRequests.push(url);
            }
        });

        await page.goto('/?debug&viewer=three', { waitUntil: 'networkidle' });

        expect(blockedRequests).toEqual([]);
        await expect(page.locator('#debug-test-button')).toBeVisible();
        await expect(page.locator('.whats-new')).toHaveCount(0);

        await page.goto('/?debug&viewer=needle&file=/test-fixtures/usd-concepts/camera_light.usda', { waitUntil: 'domcontentloaded' });
        await waitForNeedleLoaderMode(page, 'camera_light.usda');
        await page.evaluate(() => {
            document.dispatchEvent(new Event('visibilitychange'));
            window.dispatchEvent(new PageTransitionEvent('pagehide'));
        });
        await page.waitForTimeout(250);

        expect(blockedRequests).toEqual([]);
    });

    test('caches viewer asset fetches through the service worker', async ({ page }) => {
        await page.goto('/?viewer=three', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(async () => {
            await (window as any).__usdViewerAssetCacheReady;
            return !!navigator.serviceWorker.controller;
        });

        const probeUrl = `/test-fixtures/usd-concepts/camera_light.usda?cache-probe=${Date.now()}`;
        const state = await page.evaluate(async url => {
            const messages: any[] = [];
            navigator.serviceWorker.addEventListener('message', event => {
                if (event.data?.source === 'usd-viewer-asset-cache') messages.push(event.data);
            });

            const first = await fetch(url).then(response => response.text());
            const cache = await caches.open('usd-viewer-asset-cache-v2');
            let cached = await cache.match(url);
            const deadline = performance.now() + 2000;
            while (!cached && performance.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, 50));
                cached = await cache.match(url);
            }
            const second = await fetch(url).then(response => response.text());
            await new Promise(resolve => setTimeout(resolve, 200));

            return {
                cached: !!cached,
                firstLength: first.length,
                secondLength: second.length,
                hitCount: messages.filter(message => message.type === 'hit' && message.url.endsWith(url)).length,
                storeCount: messages.filter(message => message.type === 'store' && message.url.endsWith(url)).length,
            };
        }, probeUrl);

        expect(state.cached).toBe(true);
        expect(state.firstLength).toBeGreaterThan(100);
        expect(state.secondLength).toBe(state.firstLength);
        expect(state.storeCount).toBeGreaterThanOrEqual(1);
        expect(state.hitCount).toBeGreaterThanOrEqual(1);
    });

    test('shows byte progress in the centered loading overlay', async ({ page }) => {
        await page.goto('/?debug&viewer=three', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof (window as any).showLoadingOverlay === 'function' &&
            typeof (window as any).updateLoadingOverlayProgress === 'function');
        await page.evaluate(() => {
            (window as any).showLoadingOverlay('ABeautifulGame.glb.three.usdz');
            (window as any).updateLoadingOverlayProgress({ loaded: 50, total: 100 });
        });

        await expect(page.locator('#loading-overlay')).toHaveClass(/visible/);
        await expect(page.locator('#loading-overlay-filename')).toHaveText('ABeautifulGame.glb.three.usdz');
        await expect(page.locator('#loading-overlay-progress')).toHaveText('50%');
    });

    test('loads authored Needle fixture coverage assets through the Needle Engine loader element', async ({ page }) => {
        test.setTimeout(120000);
        const fatalDiagnostics = collectFatalDiagnostics(page);
        const rendererErrors = collectConsoleErrorsMatching(page, rendererErrorPatterns);
        const fixtures = [
            { filename: 'custom_geomprops_usdshade.usda', url: '/test-fixtures/usd-concepts/custom_geomprops_usdshade.usda' },
            { filename: 'referenced_geomprop_overrides.usda', url: '/test-fixtures/usd-concepts/referenced_geomprop_overrides.usda' },
            { filename: 'liverps_all.usda', url: '/test-fixtures/composition/liverps_all.usda' },
            { filename: 'custom_nodedef_materialx.usda', url: '/test-fixtures/materialx/custom_nodedef_materialx.usda' },
            { filename: 'draco_mixed_overrides.usda', url: '/test-fixtures/draco/draco_mixed_overrides.usda' },
            { filename: 'CubeCompressedTriangles.usda', url: '/test-fixtures/draco/CubeCompressedTriangles.usda' },
        ];

        for (const fixture of fixtures) {
            await page.goto(`/?file=${fixture.url}&viewer=needle&waitForMaterials=1`, {
                waitUntil: 'domcontentloaded',
            });
            const state = await waitForNeedleLoaderMode(page, fixture.filename);
            expect(state.filename, fixture.filename).toBe(fixture.filename);
            expect(state.hasHydraHandle, fixture.filename).toBe(true);
            expect(state.driverAlive, fixture.filename).toBe(true);
            expect(state.hasNeedleContext, fixture.filename).toBe(true);
            expect(state.needleChildren, fixture.filename).toBeGreaterThan(0);

            if (fixture.filename === 'referenced_geomprop_overrides.usda') {
                const meshes = await getNeedleMeshSummaries(page);
                const left = meshes.find(mesh => mesh.path === '/World/LeftReference/Shape');
                const right = meshes.find(mesh => mesh.path === '/World/RightReference/Shape');
                expect(left?.normalCount, 'left referenced geomprop normals').toBe(left?.positionCount);
                expect(right?.normalCount, 'right referenced geomprop normals').toBe(right?.positionCount);
                expect(left?.materialColor, 'left referenced geomprop color').toBe('f9e53f');
                expect(right?.materialColor, 'right referenced geomprop override color').toBe('5099ff');
            }

            if (fixture.filename === 'liverps_all.usda') {
                const meshes = await getNeedleMeshSummaries(page);
                const expectedMaterials = new Map([
                    ['/World/Local/Shape', 'LocalRed'],
                    ['/World/Inherits/Shape', 'InheritsYellow'],
                    ['/World/Variants/Shape', 'VariantOrange'],
                    ['/World/References/Shape', 'ReferenceBlue'],
                    ['/World/Payloads/Shape', 'PayloadCyan'],
                    ['/World/Specializes/Shape', 'SpecializesGreen'],
                ]);
                for (const [path, materialName] of expectedMaterials) {
                    const mesh = meshes.find(entry => entry.path === path);
                    expect(mesh, path).toBeTruthy();
                    expect(mesh?.normalCount, `${path} authored normals`).toBe(mesh?.positionCount);
                    expect(mesh?.materialName, `${path} material`).toBe(materialName);
                }
            }
        }

        expect(rendererErrors).toEqual([]);
        expect(fatalDiagnostics).toEqual([]);
    });

    test('loads MaterialX basic textures without texture errors or tangent retry spam', async ({ page }) => {
        const fatalDiagnostics = collectFatalDiagnostics(page);
        const rendererErrors = collectConsoleErrorsMatching(page, rendererErrorPatterns);
        const tangentPreconditionWarnings = collectConsoleMatches(page, [
            /\[MaterialX\] Cannot generate tangents: geometry requires position and uv attributes/i,
        ]);

        await page.goto(`/?debug&file=${encodeURIComponent(`${usdWgBaseUrl}test_assets/MaterialXTest/basic.usda`)}&viewer=three&waitForMaterials=1`, {
            waitUntil: 'domcontentloaded',
        });
        const state = await waitForPublicViewerLoad(page, 'basic.usda');

        expect(state.hasHydraHandle).toBe(true);
        expect(rendererErrors).toEqual([]);
        expect(tangentPreconditionWarnings).toEqual([]);
        expect(fatalDiagnostics).toEqual([]);
    });

    test('loads TGA roughness textures without WebGL upload or ORM packing errors', async ({ page }) => {
        const diagnostics = collectConsoleMatches(page, [
            /TGA textures are not fully supported yet/i,
            /texSubImage2D: no pixels/i,
            /Something went wrong with the texture promise/i,
            /Something went wrong while packing occlusion\/metallic\/roughness textures/i,
        ]);

        await page.goto(`/?debug&file=${encodeURIComponent(`${usdWgBaseUrl}test_assets/RoughnessTest/RoughnessTest.usdz`)}&viewer=three&waitForMaterials=1`, {
            waitUntil: 'domcontentloaded',
        });
        await waitForPublicViewerLoad(page, 'RoughnessTest.usdz');
        await page.evaluate(async () => {
            await (window as any).usdHydra?.materialsReady?.();
        });

        const packedTextureState = await page.evaluate(() => {
            const materials: any[] = [];
            (window as any).usdRoot?.traverse?.((object: any) => {
                const list = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
                materials.push(...list.filter((material: any) => material.roughnessMap));
            });
            return materials.map(material => ({
                isCanvasTexture: material.roughnessMap?.isCanvasTexture === true,
                isDataTexture: material.roughnessMap?.isDataTexture === true,
                sameMetalness: material.roughnessMap === material.metalnessMap,
                width: material.roughnessMap?.image?.width,
                height: material.roughnessMap?.image?.height,
            }));
        });

        expect(packedTextureState.length).toBeGreaterThan(0);
        expect(packedTextureState.every(texture => texture.isCanvasTexture && !texture.isDataTexture)).toBe(true);
        expect(packedTextureState.every(texture => texture.sameMetalness && texture.width === 256 && texture.height === 256)).toBe(true);
        expect(diagnostics).toEqual([]);
    });

    test('merges authored custom MaterialX NodeDefs from staged sidecars', async ({ page }) => {
        const diagnostics = collectConsoleMatches(page, [
            /Could not find a nodedef/i,
            /Tangents are required for this material/i,
            /Failed to create MaterialX material/i,
        ]);

        await page.goto('/?debug&file=/test-fixtures/materialx/custom_nodedef_materialx.usda&viewer=three&waitForMaterials=1', {
            waitUntil: 'domcontentloaded',
        });
        await waitForPublicViewerLoad(page, 'custom_nodedef_materialx.usda');
        await page.evaluate(async () => {
            await (window as any).usdHydra?.materialsReady?.();
        });

        const materialTypes = await page.evaluate(() => {
            const types: string[] = [];
            (window as any).usdRoot?.traverse?.((object: any) => {
                const list = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
                for (const material of list) types.push(material.constructor?.name || '');
            });
            return types;
        });

        expect(materialTypes).toContain('MaterialXMaterial');
        expect(diagnostics).toEqual([]);
    });

    test('attributes delayed MaterialX texture failures to the debug target that caused them', async ({ page }) => {
        await page.goto('/?debug&viewer=three', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof (window as any).runUsdViewerAssetTest === 'function');

        const report = await page.evaluate(async baseUrl => {
            return await (window as any).runUsdViewerAssetTest({
                targets: [
                    {
                        source: 'usd-wg',
                        name: 'basicTextured',
                        url: `${baseUrl}test_assets/MaterialXTest/basicTextured.usda`,
                    },
                    {
                        source: 'usd-wg',
                        name: 'basic',
                        url: `${baseUrl}test_assets/MaterialXTest/basic.usda`,
                    },
                ],
            });
        }, usdWgBaseUrl);

        const textured = report.results[0];
        const basic = report.results[1];
        expect(textured.name).toBe('basicTextured');
        expect(textured.errors.join('\n')).toMatch(/\[MaterialX\] Failed to load texture/i);
        expect(basic.name).toBe('basic');
        expect(basic.errors.join('\n')).not.toMatch(/\[MaterialX\] Failed to load texture/i);
    });

    test('loads package-internal USDZ textures through the staged filesystem', async ({ page }) => {
        test.setTimeout(120000);
        const diagnostics = collectConsoleMatches(page, [
            /Something went wrong with the texture promise/i,
            /Error when loading texture/i,
            /Material not found/i,
        ]);
        const packageTextureRequests: string[] = [];
        page.on('request', request => {
            const url = request.url();
            if (url.includes('UsdCookie.usdz[') || url.includes('UsdCookie.usdz%5B')) {
                packageTextureRequests.push(url);
            }
        });

        await page.goto(`/?debug&file=${encodeURIComponent(`${usdWgBaseUrl}full_assets/UsdCookie/UsdCookie.usdz`)}&viewer=three&waitForMaterials=1`, {
            waitUntil: 'domcontentloaded',
        });
        await waitForPublicViewerLoad(page, 'UsdCookie.usdz');

        expect(packageTextureRequests).toEqual([]);
        expect(diagnostics).toEqual([]);
    });

    test('reports missing upstream debug targets as skipped instead of Hydra failures', async ({ page }) => {
        const diagnostics = collectConsoleMatches(page, [
            /Failed to open USD stage/i,
            /Failed to load USD file/i,
            /Runtime Error/i,
        ]);

        await page.goto('/?debug&viewer=three', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof (window as any).runUsdViewerAssetTest === 'function');

        const report = await page.evaluate(async url => {
            return await (window as any).runUsdViewerAssetTest({
                targets: [
                    {
                        source: 'usd-wg',
                        name: 'TestLight',
                        url,
                    },
                ],
            });
        }, `${usdWgBaseUrl}full_assets/Teapot/TestLight.usda`);

        expect(report.count).toBe(1);
        expect(report.passed).toBe(0);
        expect(report.skipped).toBe(1);
        expect(report.failed).toBe(0);
        expect(report.results[0]).toMatchObject({
            name: 'TestLight',
            ok: true,
            skipped: true,
            status: 404,
            warnings: [],
            errors: [],
        });
        expect(diagnostics).toEqual([]);
    });

    test('materializes scalar face-varying and uniform primvars as Needle geometry attributes', async ({ page }) => {
        test.setTimeout(120000);
        const fatalDiagnostics = collectFatalDiagnostics(page);
        const rendererErrors = collectConsoleErrorsMatching(page, rendererErrorPatterns);
        const primvarDiagnostics = collectConsoleMatches(page, primvarRegressionPatterns);
        await stubAnalytics(page);

        await page.goto(`/?file=${encodeURIComponent(needleCloudSamples.kitchenSet.url)}&viewer=needle&waitForMaterials=1`, {
            waitUntil: 'domcontentloaded',
        });
        await waitForNeedleLoaderMode(page, needleCloudSamples.kitchenSet.filename);
        const faceIndex = await findNeedlePrimvarAttribute(page, 'primvars:__faceindex');

        expect(faceIndex.count).toBeGreaterThan(0);
        expect(faceIndex.count).toBe(faceIndex.positionCount);
        expect(faceIndex.itemSize).toBe(1);
        expect(faceIndex.arrayType).toMatch(/Int|Float/);
        expect(faceIndex.allFinite).toBe(true);

        const internalReferenceUrl = `${usdWgBaseUrl}test_assets/RelationshipEncapsulationTests/InternalReferenceTest.usda`;
        await page.goto(`/?file=${encodeURIComponent(internalReferenceUrl)}&viewer=needle&waitForMaterials=1`, {
            waitUntil: 'domcontentloaded',
        });
        await waitForNeedleLoaderMode(page, 'InternalReferenceTest.usda');
        const sharpFace = await findNeedlePrimvarAttribute(page, 'primvars:sharp_face');

        expect(sharpFace.count).toBeGreaterThan(0);
        expect(sharpFace.count).toBe(sharpFace.positionCount);
        expect(sharpFace.itemSize).toBe(1);
        expect(sharpFace.arrayType).toMatch(/Int|Float/);
        expect(sharpFace.allFinite).toBe(true);
        expect(sharpFace.valuesAreBoolean).toBe(true);
        expect(sharpFace.hasOne).toBe(true);

        expect(primvarDiagnostics).toEqual([]);
        expect(rendererErrors).toEqual([]);
        expect(fatalDiagnostics).toEqual([]);
    });

    test('materializes authored custom vertex geomprops as Needle geometry attributes', async ({ page }) => {
        const fatalDiagnostics = collectFatalDiagnostics(page);
        const rendererErrors = collectConsoleErrorsMatching(page, rendererErrorPatterns);
        const primvarDiagnostics = collectConsoleMatches(page, primvarRegressionPatterns);
        await stubAnalytics(page);

        await page.goto('/?file=%2Ftest-fixtures%2Fusd-concepts%2Fcustom_vertex_geomprops.usda&viewer=needle&waitForMaterials=1', {
            waitUntil: 'domcontentloaded',
        });
        await waitForNeedleLoaderMode(page, 'custom_vertex_geomprops.usda');

        const meshState = await getNeedleMeshAttributeState(page, '/World/CustomVertexGeomprops');
        expect(meshState.positionCount).toBeGreaterThan(0);
        expect(meshState.normalCount).toBe(meshState.positionCount);
        expect(meshState.colorCount).toBe(meshState.positionCount);
        expect(meshState.vertexColors).toBe(true);

        const temperature = await findNeedlePrimvarAttribute(page, 'primvars:temperature');
        expect(temperature.path).toBe('/World/CustomVertexGeomprops');
        expect(temperature.count).toBe(temperature.positionCount);
        expect(temperature.itemSize).toBe(1);
        expect(temperature.allFinite).toBe(true);
        expect(Math.min(...temperature.sample)).toBeCloseTo(0.05, 5);
        expect(Math.max(...temperature.sample)).toBeCloseTo(1.0, 5);

        const flow = await findNeedlePrimvarAttribute(page, 'primvars:flow');
        expect(flow.path).toBe('/World/CustomVertexGeomprops');
        expect(flow.count).toBe(flow.positionCount);
        expect(flow.itemSize).toBe(3);
        expect(flow.allFinite).toBe(true);

        const cornerId = await findNeedlePrimvarAttribute(page, 'primvars:cornerId');
        expect(cornerId.path).toBe('/World/CustomVertexGeomprops');
        expect(cornerId.count).toBe(cornerId.positionCount);
        expect(cornerId.itemSize).toBe(1);
        expect(cornerId.allFinite).toBe(true);
        expect(cornerId.sample).toContain(0);
        expect(cornerId.sample).toContain(7);

        expect(primvarDiagnostics).toEqual([]);
        expect(rendererErrors).toEqual([]);
        expect(fatalDiagnostics).toEqual([]);
    });

    test('keeps shipped USD-WG manifest entries visible even when an upstream asset is broken', async ({ page }) => {
        const manifest = await page.request.get('/data/usd-wg-assets.json');
        expect(manifest.ok()).toBe(true);
        const data = await manifest.json();
        const entries = flattenUsdWgManifest(data.root);

        expect(entries).toContain('full_assets/Teapot/TestLight.usda');
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

    test('preserves USD-WG McUsd indexed face-varying normals', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        const sample = {
            filename: 'McUsd_10cm.usdz',
            url: `${usdWgBaseUrl}full_assets/McUsd/McUsd_10cm.usdz`,
        };

        await page.goto(`/?file=${encodeURIComponent(sample.url)}&viewer=needle`);
        await waitForNeedleLoaderMode(page, sample.filename);

        const normalState = await waitForNeedleSceneNormalState(
            page,
            state => state.meshCount >= 20,
        );

        expect(normalState.meshCount).toBeGreaterThanOrEqual(20);
        expect(normalState.zeroNormalMeshes).toEqual([]);
        expect(normalState.missingNormalMeshes).toEqual([]);
        expect(normalState.grassBlockTopFirstNormals).toEqual([
            '0.000,1.000,0.000',
            '0.000,1.000,0.000',
            '0.000,1.000,0.000',
            '0.000,1.000,0.000',
            '0.000,1.000,0.000',
            '0.000,1.000,0.000',
        ]);
        expect(diagnostics).toEqual([]);
    });

    test('uses low-complexity subdivision refinement by default for OpenChessSet pieces', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.route('**/api/script.js', route => route.fulfill({
            contentType: 'application/javascript',
            body: 'window.rybbit = { event() {}, pageview() {} };',
        }));

        const bishopUrl = `${usdWgBaseUrl}full_assets/OpenChessSet/assets/Bishop/Bishop_payload.usd`;
        await page.goto(`/?file=${encodeURIComponent(bishopUrl)}&viewer=needle&waitForMaterials=1`);
        await waitForNeedleLoaderMode(page, 'Bishop_payload.usd');

        const state = await getNeedleMeshAttributeState(page, '/Bishop/Geom/Render');
        const { complexity, refineLevel } = await page.evaluate(() => ({
            complexity: window.driver?.GetComplexity?.(),
            refineLevel: window.driver?.GetRefineLevelFallback?.(),
        }));
        expect(complexity).toBeCloseTo(1.0);
        expect(refineLevel).toBe(0);
        expect(state.positionCount).toBe(225168);
        expect(state.normalCount).toBe(state.positionCount);
        expect(state.uvCount).toBe(state.positionCount);
        expect(state.tangentCount).toBe(state.positionCount);
        expect(diagnostics).toEqual([]);
    });

    test('loads high-complexity OpenChessSet subdivision without stalling on primvars', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.route('/api/script.js', route => route.fulfill({
            contentType: 'application/javascript',
            body: 'window.rybbit = { event() {}, pageview() {} };',
        }));

        const bishopUrl = `${usdWgBaseUrl}full_assets/OpenChessSet/assets/Bishop/Bishop_payload.usd`;
        const start = Date.now();
        await page.goto(
            `/?file=${encodeURIComponent(bishopUrl)}&viewer=needle&complexity=high`,
            { waitUntil: 'domcontentloaded' },
        );
        const expectedBishopDisplayName = viewerDisplayFilename('Bishop_payload.usd');
        await page.waitForFunction(expectedFilename => {
            return document.body.classList.contains('viewer-mode-needle-loader')
                && document.querySelector('.filename-text')?.textContent === expectedFilename
                && Boolean(window.driver)
                && Boolean(window.usdHydra);
        }, expectedBishopDisplayName);

        const state = await waitForNeedleMeshAttributeState(
            page,
            '/Bishop/Geom/Render',
            mesh => mesh.positionCount === 3602688 && mesh.uvCount === 3602688,
        );
        const elapsed = Date.now() - start;
        const { complexity, refineLevel } = await page.evaluate(() => ({
            complexity: window.driver?.GetComplexity?.(),
            refineLevel: window.driver?.GetRefineLevelFallback?.(),
        }));
        expect(complexity).toBeCloseTo(1.2);
        expect(refineLevel).toBe(2);
        expect(state.positionCount).toBe(3602688);
        expect(state.normalCount).toBe(state.positionCount);
        expect(state.uvCount).toBe(state.positionCount);
        expect(elapsed).toBeLessThan(30000);
        expect(diagnostics).toEqual([]);
    });

    test('renders OpenChessSet MaterialX pawn instances at their authored positions', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await stubAnalytics(page);

        const chessSetUrl = `${usdWgBaseUrl}full_assets/OpenChessSet/chess_set.usda`;
        await page.goto(`/?file=${encodeURIComponent(chessSetUrl)}&viewer=needle&waitForMaterials=1`);
        await waitForNeedleLoaderMode(page, 'chess_set.usda');

        const expectedBlack = [
            [-0.03125, 0, 0.09375],
            [-0.21875, 0, 0.15625],
            [-0.15625, 0, 0.15625],
            [-0.09375, 0, 0.15625],
            [0.03125, 0, 0.15625],
            [0.09375, 0, 0.15625],
            [0.15625, 0, 0.15625],
            [0.21875, 0, 0.15625],
        ];
        const expectedWhite = [
            [-0.21875, 0, -0.15625],
            [-0.15625, 0, -0.15625],
            [-0.09375, 0, -0.15625],
            [-0.03125, 0, -0.15625],
            [0.15625, 0, -0.15625],
            [0.21875, 0, -0.15625],
            [0.09375, 0, -0.09375],
            [0.03125, 0, -0.03125],
        ];

        const state = await readOpenChessSetPawnInstances(page);
        expect(state.prototypes).toHaveLength(4);
        expect(state.prototypes.every(entry => entry.visible === false)).toBe(true);
        expect(state.instanced).toHaveLength(4);
        for (const entry of state.instanced) {
            expect(entry.visible).toBe(true);
            expect(entry.count).toBe(8);
            expect(entry.matrices).toEqual(entry.path.includes('/Black/') ? expectedBlack : expectedWhite);
        }

        const render = await countNeedlePawnRenderComponents(page);
        expect(render.components).toBeGreaterThanOrEqual(12);
        expect(render.maskedPixels).toBeGreaterThan(1000);
        expect(diagnostics).toEqual([]);
    });

    test('keeps high-complexity Catmull-Clark winding outward', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);

        await page.goto('/?file=/test-fixtures/subdivision/catmull_clark_cube.usda&viewer=needle&complexity=high');
        await waitForNeedleLoaderMode(page, 'catmull_clark_cube.usda');

        const state = await getNeedleMeshAttributeState(page, '/World/SubdivCube');
        const { complexity, refineLevel } = await page.evaluate(() => ({
            complexity: window.driver?.GetComplexity?.(),
            refineLevel: window.driver?.GetRefineLevelFallback?.(),
        }));
        const winding = await getNeedleMeshWindingState(page, '/World/SubdivCube');

        expect(complexity).toBeCloseTo(1.2);
        expect(refineLevel).toBe(2);
        expect(state.positionCount).toBeGreaterThan(36);
        expect(state.normalCount).toBe(state.positionCount);
        expect(winding.sampled).toBeGreaterThan(0);
        expect(winding.aligned).toBeGreaterThan(winding.opposed * 100);
        expect(winding.windingOut).toBeGreaterThan(winding.windingIn * 100);
        expect(diagnostics).toEqual([]);
    });

    test('changes Hydra complexity without repopulating the stage', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);

        await page.goto('/?file=/test-fixtures/subdivision/catmull_clark_cube.usda&viewer=needle&complexity=low');
        await waitForNeedleLoaderMode(page, 'catmull_clark_cube.usda');

        const low = await getNeedleMeshAttributeState(page, '/World/SubdivCube');
        const result = await page.evaluate(async () => {
            const driver = window.usdHydra.driver;
            const originalRepopulate = driver.Repopulate.bind(driver);
            let repopulateCalls = 0;
            driver.Repopulate = (...args: any[]) => {
                repopulateCalls++;
                return originalRepopulate(...args);
            };
            try {
                await window.usdHydra.setComplexity('high');
            } finally {
                driver.Repopulate = originalRepopulate;
            }
            return {
                repopulateCalls,
                complexity: driver.GetComplexity(),
                refineLevel: driver.GetRefineLevelFallback(),
            };
        });
        const high = await getNeedleMeshAttributeState(page, '/World/SubdivCube');

        expect(low.positionCount).toBe(36);
        expect(high.positionCount).toBeGreaterThan(low.positionCount);
        expect(result.repopulateCalls).toBe(0);
        expect(result.complexity).toBeCloseTo(1.2);
        expect(result.refineLevel).toBe(2);
        expect(diagnostics).toEqual([]);
    });

    test('keeps high-complexity left-handed Catmull-Clark winding outward', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);

        await page.goto('/?file=/test-fixtures/subdivision/catmull_clark_left_handed_cube.usda&viewer=needle&complexity=high');
        await waitForNeedleLoaderMode(page, 'catmull_clark_left_handed_cube.usda');

        const state = await getNeedleMeshAttributeState(page, '/World/LeftHandedSubdivCube');
        const winding = await getNeedleMeshWindingState(page, '/World/LeftHandedSubdivCube');

        expect(state.positionCount).toBeGreaterThan(36);
        expect(state.normalCount).toBe(state.positionCount);
        expect(winding.sampled).toBeGreaterThan(0);
        expect(winding.aligned).toBeGreaterThan(winding.opposed * 100);
        expect(winding.windingOut).toBeGreaterThan(winding.windingIn * 100);
        expect(diagnostics).toEqual([]);
    });

    test('keeps Loop non-triangle meshes unrefined while refining triangle meshes', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);

        await page.goto('/?file=/test-fixtures/subdivision/loop_non_triangle_fallback.usda&viewer=needle&complexity=high');
        await waitForNeedleLoaderMode(page, 'loop_non_triangle_fallback.usda');

        const quadFallback = await getNeedleMeshAttributeState(page, '/World/LoopQuadFallback');
        const triangleRefined = await getNeedleMeshAttributeState(page, '/World/LoopTrianglesRefined');

        expect(quadFallback.positionCount).toBe(18);
        expect(quadFallback.normalCount).toBe(quadFallback.positionCount);
        expect(triangleRefined.positionCount).toBeGreaterThan(quadFallback.positionCount * 4);
        expect(triangleRefined.normalCount).toBe(triangleRefined.positionCount);
        expect(diagnostics).toEqual([]);
    });

    test('preserves indexed and non-indexed face-varying normals through triangulation', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.route('/api/script.js', route => route.fulfill({
            contentType: 'application/javascript',
            body: 'window.rybbit = { event() {}, pageview() {} };',
        }));

        await page.goto('/?file=/test-fixtures/primvars/facevarying_normals_matrix.usda&viewer=needle&complexity=high');
        await waitForNeedleLoaderMode(page, 'facevarying_normals_matrix.usda');

        const state = await getNeedleFaceVaryingNormalMatrixState(page);
        const authoredPolygonalMeshes = [
            'IndexedFaceVaryingNone',
            'NonIndexedFaceVaryingNone',
        ];

        for (const name of authoredPolygonalMeshes) {
            const mesh = state[name];
            expect(mesh, name).toBeTruthy();
            expect(mesh.normalCount, name).toBe(mesh.positionCount);
            expect(mesh.zeroNormalCount, name).toBe(0);
            expect(mesh.uniqueNormals, name).toEqual([
                '0.000,1.000,0.000',
                '1.000,0.000,0.000',
            ]);
            expect(mesh.firstSixNormals, name).toEqual([
                '1.000,0.000,0.000',
                '1.000,0.000,0.000',
                '1.000,0.000,0.000',
                '1.000,0.000,0.000',
                '1.000,0.000,0.000',
                '1.000,0.000,0.000',
            ]);
        }

        const authoredZeroMesh = state.AuthoredZeroFaceVaryingNone;
        expect(authoredZeroMesh).toBeTruthy();
        expect(authoredZeroMesh.normalCount).toBe(authoredZeroMesh.positionCount);
        expect(authoredZeroMesh.zeroNormalCount).toBe(authoredZeroMesh.normalCount);
        expect(authoredZeroMesh.uniqueNormals).toEqual(['0.000,0.000,0.000']);
        expect(authoredZeroMesh.firstSixNormals).toEqual([
            '0.000,0.000,0.000',
            '0.000,0.000,0.000',
            '0.000,0.000,0.000',
            '0.000,0.000,0.000',
            '0.000,0.000,0.000',
            '0.000,0.000,0.000',
        ]);

        const subdivisionMeshesWithAuthoredNormals = [
            'IndexedFaceVaryingCatmullClark',
            'NonIndexedFaceVaryingCatmullClark',
        ];
        for (const name of subdivisionMeshesWithAuthoredNormals) {
            const mesh = state[name];
            expect(mesh, name).toBeTruthy();
            expect(mesh.normalCount, name).toBe(mesh.positionCount);
            expect(mesh.zeroNormalCount, name).toBe(0);
            expect(mesh.positionCount, name).toBeGreaterThan(12);
            expect(mesh.uniqueNormals, name).toEqual(['0.000,0.000,1.000']);
            expect(mesh.firstSixNormals, name).toEqual([
                '0.000,0.000,1.000',
                '0.000,0.000,1.000',
                '0.000,0.000,1.000',
                '0.000,0.000,1.000',
                '0.000,0.000,1.000',
                '0.000,0.000,1.000',
            ]);
        }

        expect(state.IndexedFaceVaryingNone.positionCount).toBe(12);
        expect(state.NonIndexedFaceVaryingNone.positionCount).toBe(12);
        expect(state.AuthoredZeroFaceVaryingNone.positionCount).toBe(12);

        const generated = state.CatmullClarkGeneratedNormals;
        expect(generated.normalCount).toBe(generated.positionCount);
        expect(generated.positionCount).toBeGreaterThan(36);
        expect(generated.zeroNormalCount).toBe(0);
        expect(generated.uniqueNormals.length).toBeGreaterThan(6);
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

    test('uses AgX tone mapping for three.js and Needle renderers', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        const fixture = '/test-fixtures/subdivision/catmull_clark_cube.usda';

        await page.goto(`/?file=${fixture}&viewer=three`);
        await waitForPublicViewerLoad(page, 'catmull_clark_cube.usda');
        const threeToneMapping = await page.evaluate(() => ({
            expected: window.__usdViewerThreeDiagnostics?.AgXToneMapping,
            actual: window.renderer?.toneMapping,
            exposure: window.renderer?.toneMappingExposure,
        }));
        expect(threeToneMapping.actual).toBe(threeToneMapping.expected);
        expect(threeToneMapping.exposure).toBe(1);

        await page.goto(`/?file=${fixture}&viewer=needle`);
        await waitForNeedleLoaderMode(page, 'catmull_clark_cube.usda');
        const needleToneMapping = await page.evaluate(() => {
            const renderer = document.querySelector('needle-engine')?.context?.renderer;
            return {
                expected: window.__usdViewerThreeDiagnostics?.AgXToneMapping,
                actual: renderer?.toneMapping,
                exposure: renderer?.toneMappingExposure,
            };
        });
        expect(needleToneMapping.actual).toBe(needleToneMapping.expected);
        expect(needleToneMapping.exposure).toBe(1);
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
        await expect(page.locator('.ui-tooltip.visible')).toHaveText('Load a USD file first to share');
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
                            { id: 'blender-5-1', label: 'Blender', version: '5.1.2', usdz: assetExplorerSamples.antiqueCameraBlender.url },
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
        await page.route(assetExplorerSamples.antiqueCameraBlender.url, route => route.fulfill({
            path: 'tests/fixtures/asset-explorer/BoomBox.glb.three.usdz',
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
        const converterState = await page.evaluate(() => {
            return Array.from(document.querySelectorAll<HTMLButtonElement>('#loaded-converter-toggle button')).map(button => ({
                converter: button.dataset.converter || '',
                text: button.textContent?.trim() || '',
                tip: button.dataset.tip || '',
                hasVisibleVersion: Boolean(button.querySelector('.converter-version')),
            }));
        });
        expect(converterState).toEqual([
            { converter: 'three-r185', text: 'three', tip: 'Version: 0.185.0', hasVisibleVersion: false },
            { converter: 'blender-5-1', text: 'Blender', tip: 'Version: 5.1.2', hasVisibleVersion: false },
            { converter: 'original-gltf', text: 'Original glTF', tip: 'Original glTF/GLB source asset', hasVisibleVersion: false },
        ]);
        await page.locator('#loaded-converter-toggle button[data-converter="three-r185"]').hover();
        await expect(page.locator('.ui-tooltip.visible')).toHaveText('Version: 0.185.0');

        await page.dispatchEvent('#loaded-converter-toggle button[data-converter="blender-5-1"]', 'pointerdown', { bubbles: true, pointerType: 'mouse', button: 0 });
        const state = await waitForPublicViewerLoad(page, assetExplorerSamples.animatedMorphSphereBlender.filename);

        expect(state.filename).toBe(assetExplorerSamples.animatedMorphSphereBlender.filename);
        expect(new URL(state.href).searchParams.get('file')).toBe(assetExplorerSamples.animatedMorphSphereBlender.url);
        expect(state.loadedConverterVisible).toBe(true);
        expect(state.loadedConverter).toBe('blender-5-1');

        await page.click('.dropdown-button');
        await page.click('[data-sample-group="gltf"]');
        await expect(page.locator(`.gallery-card[data-name="Antique Camera"]`))
            .toHaveAttribute('href', `?file=${assetExplorerSamples.antiqueCameraBlender.url}`);

        await page.click('.gallery-card[data-name="Antique Camera"]');
        const nextState = await waitForPublicViewerLoad(page, assetExplorerSamples.antiqueCameraBlender.filename);
        expect(new URL(nextState.href).searchParams.get('file')).toBe(assetExplorerSamples.antiqueCameraBlender.url);
        expect(nextState.loadedConverterVisible).toBe(true);
        expect(nextState.loadedConverter).toBe('blender-5-1');
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

    test('loads dropped USD files from the window drop target', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.goto('/?viewer=needle');
        await waitForDropReady(page);

        const drop = await dropFixtureFile(page, {
            path: 'subdivision/catmull_clark_cube.usda',
            name: 'catmull_clark_cube.usda',
            target: 'window',
            type: 'model/vnd.usda',
        });
        expect(drop.defaultPrevented).toBe(true);

        const state = await waitForNeedleLoaderMode(page, 'catmull_clark_cube.usda');
        expect(state.elementSrc).toBe('catmull_clark_cube.usda');
        expect(state.hasHydraHandle).toBe(true);
        expect(diagnostics).toEqual([]);
    });

    test('loads dropped GLB and glTF files through generated USD wrappers', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);

        await page.goto('/?viewer=needle');
        await waitForDropReady(page);
        const glbDrop = await dropFixtureFile(page, {
            path: 'asset-explorer/DamagedHelmet.glb',
            name: 'DamagedHelmet.glb',
            target: 'canvas',
            type: 'model/gltf-binary',
        });
        expect(glbDrop.defaultPrevented).toBe(true);
        const glbState = await waitForNeedleLoaderMode(page, 'DamagedHelmet.usda');
        expect(glbState.elementSrc).toBe('DamagedHelmet.usda');
        expect(glbState.hasHydraHandle).toBe(true);

        await page.goto('/?viewer=needle');
        await waitForDropReady(page);
        const gltfDrop = await dropFixtureFile(page, {
            path: 'asset-explorer/EmbeddedTriangle.gltf',
            name: 'EmbeddedTriangle.gltf',
            target: 'window',
            type: 'model/gltf+json',
        });
        expect(gltfDrop.defaultPrevented).toBe(true);
        const gltfState = await waitForNeedleLoaderMode(page, 'EmbeddedTriangle.usda');
        expect(gltfState.elementSrc).toBe('EmbeddedTriangle.usda');
        expect(gltfState.hasHydraHandle).toBe(true);
        expect(diagnostics).toEqual([]);
    });

    test('loads dropped MaterialX files through generated preview USD wrappers', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        const materialDiagnostics = collectConsoleMatches(page, [
            /Tangents are required for this material/i,
            /Failed to load texture/i,
        ]);
        await page.goto('/?viewer=needle');
        await waitForDropReady(page);

        const drop = await dropFixtureDirectory(page, {
            rootName: 'raw-materialx-preview',
            files: [
                {
                    path: 'materialx/raw_textured_preview.mtlx',
                    relativePath: 'raw_textured_preview.mtlx',
                    type: 'application/xml',
                },
                {
                    path: 'materialx/textures/checker.png',
                    relativePath: 'textures/checker.png',
                    type: 'image/png',
                },
            ],
        });
        expect(drop.defaultPrevented).toBe(true);

        const state = await waitForNeedleLoaderMode(page, 'raw_textured_preview.usda');
        expect(state.elementSrc).toBe('raw-materialx-preview/raw_textured_preview.usda');
        expect(state.hasHydraHandle).toBe(true);
        await page.evaluate(() => window.usdHydra?.materialsReady?.());
        const meshes = await page.evaluate(() => {
            let preview: any = null;
            let calibration: any = null;
            window.needleEngineContext?.scene?.traverse?.((object: any) => {
                if (object.userData?.usdPath === '/World/PreviewMesh/PreviewMesh') {
                    const textureUniforms = Object.entries(object.material?.uniforms || {})
                        .filter(([, uniform]: any) => uniform?.value?.isTexture)
                        .map(([name, uniform]: any) => ({
                            name,
                            textureName: uniform.value.name || '',
                        }));
                    preview = {
                        name: object.name || '',
                        positionCount: object.geometry?.attributes?.position?.count || 0,
                        uvCount: object.geometry?.attributes?.uv?.count || 0,
                        tangentCount: object.geometry?.attributes?.tangent?.count || 0,
                        textureUniforms,
                    };
                }
                if (object.userData?.usdPath === '/World/CalibrationMesh/CalibrationMesh') {
                    calibration = {
                        name: object.name || '',
                        materialName: object.material?.name || '',
                        materialType: object.material?.type || '',
                    };
                }
            });
            return { preview, calibration };
        });
        expect(meshes.preview.name).toBe('PreviewMesh');
        expect(meshes.preview.positionCount).toBeGreaterThan(0);
        expect(meshes.preview.uvCount).toBe(meshes.preview.positionCount);
        expect(meshes.preview.tangentCount).toBe(meshes.preview.positionCount);
        expect(meshes.preview.textureUniforms).toContainEqual(expect.objectContaining({
            name: 'Albedo_file',
            textureName: expect.stringContaining('raw-materialx-preview/textures/checker.png'),
        }));
        expect(meshes.calibration).toEqual(expect.objectContaining({
            name: 'CalibrationMesh',
            materialName: expect.stringContaining('CalibrationMaterial'),
        }));
        expect(materialDiagnostics).toEqual([]);
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
        expect(catmull.positionCount).toBe(36);
        expect(catmull.triangleCount).toBe(12);
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

    test('keeps Teapot subdivision normals smooth across model variant switches', async ({ page }) => {
        test.setTimeout(120000);
        const diagnostics = collectFatalDiagnostics(page);
        await stubAnalytics(page);

        const teapotUrl = `${usdWgBaseUrl}full_assets/Teapot/Teapot_Materials.usd`;
        await page.goto(`/?file=${encodeURIComponent(teapotUrl)}&viewer=needle&waitForMaterials=1&complexity=high`, {
            waitUntil: 'domcontentloaded',
        });
        await waitForNeedleLoaderMode(page, 'Teapot_Materials.usd');

        const selections = await page.evaluate(async () => {
            const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
            const driver = window.usdHydra.driver;
            const originalRepopulate = driver.Repopulate.bind(driver);
            let repopulateCalls = 0;
            driver.Repopulate = (...args: any[]) => {
                repopulateCalls++;
                return originalRepopulate(...args);
            };
            const result: string[] = [];
            try {
                for (const selection of ['Fancy', 'Utah', 'Fancy', 'Utah']) {
                    await window.usdHydra.editStage(async (stage: any) => {
                        const teapot = stage.GetPrimAtPath('/Teapot');
                        await teapot.SetVariantSelection('modelVariant', selection);
                        result.push(teapot.GetVariantSelection('modelVariant'));
                    });
                    await window.usdHydra.materialsReady?.();
                    await sleep(100);
                }
            } finally {
                driver.Repopulate = originalRepopulate;
            }
            return { result, repopulateCalls };
        });
        expect(selections.result).toEqual(['Fancy', 'Utah', 'Fancy', 'Utah']);
        expect(selections.repopulateCalls).toBe(0);

        const teapot = await getNeedleUsdMeshNormalState(page, '/Teapot/Geometry');
        expect(teapot.positionCount).toBeGreaterThan(100000);
        expect(teapot.normalCount).toBe(teapot.positionCount);
        expect(teapot.sharedPositionDifferentNormalGroups).toBe(0);
        expect(diagnostics).toEqual([]);
    });

    test('keeps StandardShaderBall surface geometry variants smooth and distinct', async ({ page }) => {
        test.setTimeout(180000);
        const diagnostics = collectFatalDiagnostics(page);
        const webglDiagnostics = collectConsoleMatches(page, [
            /GL_INVALID_OPERATION/i,
            /INVALID_OPERATION/i,
            /Vertex buffer is not big enough/i,
        ]);
        await stubAnalytics(page);

        const shaderBallUrl = `${usdWgBaseUrl}full_assets/StandardShaderBall/standard_shader_ball_scene.usda`;
        await page.goto(`/?file=${encodeURIComponent(shaderBallUrl)}&viewer=needle&waitForMaterials=1&complexity=high`, {
            waitUntil: 'domcontentloaded',
        });
        await waitForNeedleLoaderMode(page, 'standard_shader_ball_scene.usda');

        const states = await page.evaluate(async () => {
            const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
            const meshPath = '/standard_shader_ball_scene/shader_ball/material_surface';

            const measure = () => {
                let target: any = null;
                window.needleEngineContext?.scene?.traverse?.((object: any) => {
                    if (!target && object.isMesh && object.userData?.usdPath === meshPath) {
                        target = object;
                    }
                });
                if (!target) throw new Error(`Missing Needle USD mesh at ${meshPath}`);

                const position = target.geometry?.attributes?.position;
                const normal = target.geometry?.attributes?.normal;
                const sampledFaces = Math.min(Math.floor((normal?.count || 0) / 3), 200);
                let faceConstantNormals = 0;
                for (let face = 0; face < sampledFaces; face++) {
                    const index = face * 3;
                    const same01 =
                        Math.abs(normal.getX(index) - normal.getX(index + 1)) < 1e-5 &&
                        Math.abs(normal.getY(index) - normal.getY(index + 1)) < 1e-5 &&
                        Math.abs(normal.getZ(index) - normal.getZ(index + 1)) < 1e-5;
                    const same02 =
                        Math.abs(normal.getX(index) - normal.getX(index + 2)) < 1e-5 &&
                        Math.abs(normal.getY(index) - normal.getY(index + 2)) < 1e-5 &&
                        Math.abs(normal.getZ(index) - normal.getZ(index + 2)) < 1e-5;
                    if (same01 && same02) faceConstantNormals++;
                }
                return {
                    positionCount: position?.count || 0,
                    normalCount: normal?.count || 0,
                    sampledFaces,
                    faceConstantNormals,
                };
            };

            const getSelection = async () => window.usdHydra.editStage(async (stage: any) => (
                stage.GetPrimAtPath('/standard_shader_ball_scene').GetVariantSelection('surface_geometry')
            ));
            const setSelection = async (selection: string) => {
                await window.usdHydra.editStage(async (stage: any) => {
                    const root = stage.GetPrimAtPath('/standard_shader_ball_scene');
                    await root.SetVariantSelection('surface_geometry', selection);
                });
                await window.usdHydra.materialsReady?.();
                await sleep(250);
            };

            const initial = measure();
            const initialSelection = await getSelection();
            await setSelection('triangulated');
            const triangulated = measure();
            const triangulatedSelection = await getSelection();
            await setSelection('subdiv');
            const subdivAgain = measure();
            const subdivAgainSelection = await getSelection();

            return {
                initialSelection,
                initial,
                triangulatedSelection,
                triangulated,
                subdivAgainSelection,
                subdivAgain,
            };
        });

        expect(states.initialSelection).toBe('subdiv');
        expect(states.initial.positionCount).toBeGreaterThan(500000);
        expect(states.initial.normalCount).toBe(states.initial.positionCount);
        expect(states.initial.faceConstantNormals).toBe(0);

        expect(states.triangulatedSelection).toBe('triangulated');
        expect(states.triangulated.positionCount).toBeGreaterThan(100000);
        expect(states.triangulated.positionCount).toBeLessThan(states.initial.positionCount);
        expect(states.triangulated.normalCount).toBe(states.triangulated.positionCount);
        expect(states.triangulated.faceConstantNormals).toBe(0);

        expect(states.subdivAgainSelection).toBe('subdiv');
        expect(states.subdivAgain.positionCount).toBe(states.initial.positionCount);
        expect(states.subdivAgain.normalCount).toBe(states.subdivAgain.positionCount);
        expect(states.subdivAgain.faceConstantNormals).toBe(0);
        expect(webglDiagnostics).toEqual([]);
        expect(diagnostics).toEqual([]);
    });

    test('keeps direct three StandardShaderBall meshes draw-valid across complexity changes', async ({ page }) => {
        test.setTimeout(180000);
        const diagnostics = collectFatalDiagnostics(page);
        const webglDiagnostics = collectConsoleMatches(page, [
            /GL_INVALID_OPERATION/i,
            /INVALID_OPERATION/i,
            /Vertex buffer is not big enough/i,
        ]);
        await stubAnalytics(page);

        const shaderBallUrl = `${usdWgBaseUrl}full_assets/StandardShaderBall/standard_shader_ball_scene.usda`;
        await page.goto(`/?debug&file=${encodeURIComponent(shaderBallUrl)}&viewer=three&waitForMaterials=1&complexity=low`, {
            waitUntil: 'domcontentloaded',
        });
        await waitForPublicViewerLoad(page, 'standard_shader_ball_scene.usda');

        const states = await page.evaluate(async () => {
            const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
            const driver = window.usdHydra.driver;
            const originalRepopulate = driver.Repopulate.bind(driver);
            let repopulateCalls = 0;
            driver.Repopulate = (...args: any[]) => {
                repopulateCalls++;
                return originalRepopulate(...args);
            };

            const collect = (label: string) => {
                const meshes: any[] = [];
                window.usdRoot?.traverse?.((object: any) => {
                    if (!object.isMesh || !object.userData?.usdPath) return;
                    const attributes = object.geometry?.attributes || {};
                    const positionCount = attributes.position?.count || 0;
                    const attributeCounts = Object.fromEntries(
                        Object.entries(attributes).map(([name, attribute]: [string, any]) => [name, attribute?.count || 0])
                    );
                    const shortAttributes = Object.entries(attributeCounts)
                        .filter(([name, count]) => name !== 'position' && Number(count) > 0 && Number(count) < positionCount)
                        .map(([name, count]) => ({ name, count }));
                    meshes.push({
                        path: object.userData.usdPath,
                        visible: object.visible,
                        positionCount,
                        normalCount: attributes.normal?.count || 0,
                        uvCount: attributes.uv?.count || 0,
                        tangentCount: attributes.tangent?.count || 0,
                        shortAttributes,
                    });
                });
                meshes.sort((a, b) => a.path.localeCompare(b.path));
                return {
                    label,
                    complexity: driver.GetComplexity(),
                    refineLevel: driver.GetRefineLevelFallback(),
                    meshes,
                };
            };

            const settle = async () => {
                await window.usdHydra.materialsReady?.();
                for (let i = 0; i < 20; i++) {
                    window.usdHydra.update?.(i / 60);
                    await sleep(50);
                }
            };

            try {
                const initial = collect('initial-low');
                await window.usdHydra.setComplexity('medium');
                await settle();
                const medium = collect('medium');
                await window.usdHydra.setComplexity('low');
                await settle();
                const lowAgain = collect('low-again');
                return { repopulateCalls, initial, medium, lowAgain };
            } finally {
                driver.Repopulate = originalRepopulate;
            }
        });

        const assertAllMeshesVisibleAndValid = (state: typeof states.initial) => {
            expect(state.meshes).toHaveLength(12);
            expect(state.meshes.filter(mesh => !mesh.visible)).toEqual([]);
            expect(state.meshes.flatMap(mesh => mesh.shortAttributes.map((attribute: any) => ({
                path: mesh.path,
                ...attribute,
                positionCount: mesh.positionCount,
            })))).toEqual([]);
        };
        const meshByPath = (state: typeof states.initial, path: string) => {
            const mesh = state.meshes.find(entry => entry.path === path);
            expect(mesh, `${state.label} ${path}`).toBeTruthy();
            return mesh!;
        };

        assertAllMeshesVisibleAndValid(states.initial);
        assertAllMeshesVisibleAndValid(states.medium);
        assertAllMeshesVisibleAndValid(states.lowAgain);

        expect(states.repopulateCalls).toBe(0);
        expect(states.initial.refineLevel).toBe(0);
        expect(states.medium.refineLevel).toBe(1);
        expect(states.lowAgain.refineLevel).toBe(0);

        expect(meshByPath(states.initial, '/standard_shader_ball_scene/shader_ball/material_surface').positionCount).toBe(35028);
        expect(meshByPath(states.medium, '/standard_shader_ball_scene/shader_ball/material_surface').positionCount).toBe(140112);
        expect(meshByPath(states.lowAgain, '/standard_shader_ball_scene/shader_ball/material_surface').positionCount).toBe(35028);

        for (const path of [
            '/standard_shader_ball_scene/shader_ball/neutral_objects/base',
            '/standard_shader_ball_scene/shader_ball/neutral_objects/core',
            '/standard_shader_ball_scene/shader_ball/neutral_objects/sss_bars',
        ]) {
            for (const state of [states.initial, states.medium, states.lowAgain]) {
                const mesh = meshByPath(state, path);
                expect(mesh.tangentCount).toBe(mesh.positionCount);
            }
        }
        expect(webglDiagnostics).toEqual([]);
        expect(diagnostics).toEqual([]);
    });

    test('keeps Needle loader StandardShaderBall meshes draw-valid across complexity changes', async ({ page }) => {
        test.setTimeout(180000);
        const diagnostics = collectFatalDiagnostics(page);
        const webglDiagnostics = collectConsoleMatches(page, [
            /GL_INVALID_OPERATION/i,
            /INVALID_OPERATION/i,
            /Vertex buffer is not big enough/i,
        ]);
        await stubAnalytics(page);

        const shaderBallUrl = `${usdWgBaseUrl}full_assets/StandardShaderBall/standard_shader_ball_scene.usda`;
        await page.goto(`/?file=${encodeURIComponent(shaderBallUrl)}&viewer=needle&waitForMaterials=1&complexity=low`, {
            waitUntil: 'domcontentloaded',
        });
        await waitForNeedleLoaderMode(page, 'standard_shader_ball_scene.usda');

        const states = await page.evaluate(async () => {
            const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
            const driver = window.usdHydra.driver;
            const originalRepopulate = driver.Repopulate.bind(driver);
            let repopulateCalls = 0;
            driver.Repopulate = (...args: any[]) => {
                repopulateCalls++;
                return originalRepopulate(...args);
            };

            const collect = (label: string) => {
                const meshes: any[] = [];
                window.needleEngineContext?.scene?.traverse?.((object: any) => {
                    if (!object.isMesh || !object.userData?.usdPath) return;
                    const attributes = object.geometry?.attributes || {};
                    const positionCount = attributes.position?.count || 0;
                    const attributeCounts = Object.fromEntries(
                        Object.entries(attributes).map(([name, attribute]: [string, any]) => [name, attribute?.count || 0])
                    );
                    const shortAttributes = Object.entries(attributeCounts)
                        .filter(([name, count]) => name !== 'position' && Number(count) > 0 && Number(count) < positionCount)
                        .map(([name, count]) => ({ name, count }));
                    meshes.push({
                        path: object.userData.usdPath,
                        visible: object.visible,
                        positionCount,
                        normalCount: attributes.normal?.count || 0,
                        uvCount: attributes.uv?.count || 0,
                        tangentCount: attributes.tangent?.count || 0,
                        shortAttributes,
                    });
                });
                meshes.sort((a, b) => a.path.localeCompare(b.path));
                return {
                    label,
                    complexity: driver.GetComplexity(),
                    refineLevel: driver.GetRefineLevelFallback(),
                    meshes,
                };
            };

            const settle = async () => {
                await window.usdHydra.materialsReady?.();
                for (let i = 0; i < 20; i++) {
                    window.usdHydra.update?.(i / 60);
                    await sleep(50);
                }
            };

            try {
                const initial = collect('initial-low');
                await window.usdHydra.setComplexity('medium');
                await settle();
                const medium = collect('medium');
                await window.usdHydra.setComplexity('low');
                await settle();
                const lowAgain = collect('low-again');
                return { repopulateCalls, initial, medium, lowAgain };
            } finally {
                driver.Repopulate = originalRepopulate;
            }
        });

        const assertAllMeshesVisibleAndValid = (state: typeof states.initial) => {
            expect(state.meshes).toHaveLength(12);
            expect(state.meshes.filter(mesh => !mesh.visible)).toEqual([]);
            expect(state.meshes.flatMap(mesh => mesh.shortAttributes.map((attribute: any) => ({
                path: mesh.path,
                ...attribute,
                positionCount: mesh.positionCount,
            })))).toEqual([]);
        };
        const meshByPath = (state: typeof states.initial, path: string) => {
            const mesh = state.meshes.find(entry => entry.path === path);
            expect(mesh, `${state.label} ${path}`).toBeTruthy();
            return mesh!;
        };

        assertAllMeshesVisibleAndValid(states.initial);
        assertAllMeshesVisibleAndValid(states.medium);
        assertAllMeshesVisibleAndValid(states.lowAgain);

        expect(states.repopulateCalls).toBe(0);
        expect(states.initial.refineLevel).toBe(0);
        expect(states.medium.refineLevel).toBe(1);
        expect(states.lowAgain.refineLevel).toBe(0);

        expect(meshByPath(states.initial, '/standard_shader_ball_scene/shader_ball/material_surface').positionCount).toBe(35028);
        expect(meshByPath(states.medium, '/standard_shader_ball_scene/shader_ball/material_surface').positionCount).toBe(140112);
        expect(meshByPath(states.lowAgain, '/standard_shader_ball_scene/shader_ball/material_surface').positionCount).toBe(35028);

        for (const path of [
            '/standard_shader_ball_scene/shader_ball/neutral_objects/base',
            '/standard_shader_ball_scene/shader_ball/neutral_objects/core',
            '/standard_shader_ball_scene/shader_ball/neutral_objects/sss_bars',
        ]) {
            for (const state of [states.initial, states.medium, states.lowAgain]) {
                const mesh = meshByPath(state, path);
                expect(mesh.tangentCount).toBe(mesh.positionCount);
            }
        }
        expect(webglDiagnostics).toEqual([]);
        expect(diagnostics).toEqual([]);
    });

    test('keeps low-complexity StandardShaderBall geometry stable across material variants', async ({ page }) => {
        test.setTimeout(180000);
        const diagnostics = collectFatalDiagnostics(page);
        const webglDiagnostics = collectConsoleMatches(page, [
            /GL_INVALID_OPERATION/i,
            /INVALID_OPERATION/i,
            /Vertex buffer is not big enough/i,
        ]);
        await stubAnalytics(page);

        const shaderBallUrl = `${usdWgBaseUrl}full_assets/StandardShaderBall/standard_shader_ball_scene.usda`;
        await page.goto(`/?file=${encodeURIComponent(shaderBallUrl)}&viewer=needle&complexity=low`, {
            waitUntil: 'domcontentloaded',
        });
        await waitForNeedleLoaderMode(page, 'standard_shader_ball_scene.usda');

        const states = await page.evaluate(async () => {
            const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
            const rootPath = '/standard_shader_ball_scene';
            const meshPath = `${rootPath}/shader_ball/material_surface`;
            const driver = window.usdHydra.driver;
            const originalRepopulate = driver.Repopulate.bind(driver);
            let repopulateCalls = 0;
            driver.Repopulate = (...args: any[]) => {
                repopulateCalls++;
                return originalRepopulate(...args);
            };

            const computeVertexNormalCalls: Array<{
                uuid: string;
                usdPath: string;
                positionCount: number;
                normalCount: number;
                hadNormals: boolean;
                stack: string;
            }> = [];
            let originalComputeVertexNormals: any = null;
            let geometryPrototype: any = null;
            window.needleEngineContext?.scene?.traverse?.((object: any) => {
                if (!geometryPrototype && object.isMesh && object.geometry?.constructor?.prototype) {
                    geometryPrototype = object.geometry.constructor.prototype;
                }
            });
            if (!geometryPrototype?.computeVertexNormals) {
                throw new Error('Could not patch BufferGeometry.computeVertexNormals');
            }
            originalComputeVertexNormals = geometryPrototype.computeVertexNormals;
            geometryPrototype.computeVertexNormals = function (...args: any[]) {
                computeVertexNormalCalls.push({
                    uuid: this.uuid || '',
                    usdPath: this.userData?.usdPath || '',
                    positionCount: this.attributes?.position?.count || 0,
                    normalCount: this.attributes?.normal?.count || 0,
                    hadNormals: Boolean(this.attributes?.normal),
                    stack: new Error().stack || '',
                });
                return originalComputeVertexNormals.apply(this, args);
            };

            const hashAttribute = (attribute: any) => {
                if (!attribute?.array?.length) return '';
                const values = attribute.array;
                const step = Math.max(1, Math.floor(values.length / 256));
                let hash = 2166136261;
                for (let i = 0; i < values.length; i += step) {
                    const value = Math.round(values[i] * 100000);
                    hash ^= value;
                    hash = Math.imul(hash, 16777619);
                }
                hash ^= values.length;
                return (hash >>> 0).toString(16);
            };

            const measureSharedNormalContinuity = (position: any, normal: any) => {
                const positionNormalGroups = new Map<string, number[][]>();
                const count = Math.min(position?.count || 0, normal?.count || 0);
                for (let i = 0; i < count; i++) {
                    const positionKey = [
                        position.getX(i).toFixed(4),
                        position.getY(i).toFixed(4),
                        position.getZ(i).toFixed(4),
                    ].join(',');
                    let normals = positionNormalGroups.get(positionKey);
                    if (!normals) {
                        normals = [];
                        positionNormalGroups.set(positionKey, normals);
                    }
                    normals.push([
                        normal.getX(i),
                        normal.getY(i),
                        normal.getZ(i),
                    ]);
                }

                let sharedPositionGroups = 0;
                let discontinuousGroups = 0;
                let minSharedNormalDot = 1;
                for (const normals of positionNormalGroups.values()) {
                    if (normals.length < 2) continue;
                    sharedPositionGroups++;
                    let worstDot = 1;
                    for (let i = 0; i < normals.length; i++) {
                        for (let j = i + 1; j < normals.length; j++) {
                            const a = normals[i];
                            const b = normals[j];
                            worstDot = Math.min(
                                worstDot,
                                a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
                            );
                        }
                    }
                    if (worstDot < 0.98) discontinuousGroups++;
                    minSharedNormalDot = Math.min(minSharedNormalDot, worstDot);
                }

                return {
                    sharedPositionGroups,
                    discontinuousGroups,
                    minSharedNormalDot,
                };
            };

            const sampleNormals = (normal: any) => {
                const samples = [];
                for (const index of [0, 1000, 10000, (normal?.count || 1) - 1]) {
                    if (!normal || index < 0 || index >= normal.count) continue;
                    samples.push({
                        index,
                        x: normal.getX(index),
                        y: normal.getY(index),
                        z: normal.getZ(index),
                    });
                }
                return samples;
            };

            const measure = async (label: string) => {
                let target: any = null;
                window.needleEngineContext?.scene?.traverse?.((object: any) => {
                    if (!target && object.isMesh && object.userData?.usdPath === meshPath) {
                        target = object;
                    }
                });
                if (!target) throw new Error(`Missing Needle USD mesh at ${meshPath}`);

                const position = target.geometry?.attributes?.position;
                const normal = target.geometry?.attributes?.normal;
                const stage = await driver.GetStage();
                return {
                    label,
                    complexity: driver.GetComplexity(),
                    refineLevel: driver.GetRefineLevelFallback(),
                    selection: stage.GetPrimAtPath(rootPath).GetVariantSelection('example_material'),
                    surfaceSelection: stage.GetPrimAtPath(rootPath).GetVariantSelection('surface_geometry'),
                    positionCount: position?.count || 0,
                    normalCount: normal?.count || 0,
                    materialName: target.material?.name || '',
                    materialType: target.material?.type || '',
                    flatShading: target.material?.flatShading ?? null,
                    positionHash: hashAttribute(position),
                    normalHash: hashAttribute(normal),
                    normalSamples: sampleNormals(normal),
                    normalContinuity: measureSharedNormalContinuity(position, normal),
                };
            };

            const collectStableTimeline = async (label: string, count = 16) => {
                const states = [];
                for (let i = 0; i < count; i++) {
                    window.usdHydra.update?.(i / 60);
                    states.push(await measure(`${label}-${i}`));
                    await sleep(125);
                }
                return states;
            };

            const setVariant = async (variantSet: string, selection: string) => {
                await window.usdHydra.editStage(async (stage: any) => {
                    const root = stage.GetPrimAtPath(rootPath);
                    await root.SetVariantSelection(variantSet, selection);
                });
                await window.usdHydra.materialsReady?.();
                for (let i = 0; i < 10; i++) {
                    window.usdHydra.update?.(i / 60);
                    await sleep(50);
                }
            };

            try {
                const initial = await measure('initial-none');
                const initialTimeline = await collectStableTimeline('initial');
                await setVariant('example_material', 'uvgrid');
                const uvgrid = await measure('uvgrid');
                const uvgridTimeline = await collectStableTimeline('uvgrid');
                await setVariant('example_material', 'none');
                const noneAgain = await measure('none-again');
                const noneAgainTimeline = await collectStableTimeline('none-again');
                await setVariant('surface_geometry', 'triangulated');
                const triangulated = await measure('triangulated');
                await setVariant('surface_geometry', 'subdiv');
                const subdivAgain = await measure('subdiv-again');
                const subdivAgainTimeline = await collectStableTimeline('subdiv-again', 24);
                return {
                    repopulateCalls,
                    computeVertexNormalCalls,
                    initial,
                    uvgrid,
                    noneAgain,
                    triangulated,
                    subdivAgain,
                    timelines: [
                        ...initialTimeline,
                        ...uvgridTimeline,
                        ...noneAgainTimeline,
                        ...subdivAgainTimeline,
                    ],
                };
            } finally {
                driver.Repopulate = originalRepopulate;
                if (geometryPrototype && originalComputeVertexNormals) {
                    geometryPrototype.computeVertexNormals = originalComputeVertexNormals;
                }
            }
        });

        expect(states.repopulateCalls).toBe(0);
        expect(states.computeVertexNormalCalls).toEqual([]);
        expect(states.initial.selection).toBe('none');
        expect(states.uvgrid.selection).toBe('uvgrid');
        expect(states.noneAgain.selection).toBe('none');
        expect(states.initial.surfaceSelection).toBe('subdiv');
        expect(states.triangulated.surfaceSelection).toBe('triangulated');
        expect(states.subdivAgain.surfaceSelection).toBe('subdiv');
        expect(states.initial.refineLevel).toBe(0);
        expect(states.uvgrid.refineLevel).toBe(0);
        expect(states.noneAgain.refineLevel).toBe(0);
        expect(states.subdivAgain.refineLevel).toBe(0);
        expect(states.initial.positionCount).toBe(35028);
        expect(states.uvgrid.positionCount).toBe(states.initial.positionCount);
        expect(states.noneAgain.positionCount).toBe(states.initial.positionCount);
        expect(states.triangulated.positionCount).toBeGreaterThan(100000);
        expect(states.triangulated.positionCount).toBeLessThan(500000);
        expect(states.subdivAgain.positionCount).toBe(states.initial.positionCount);
        expect(states.initial.normalCount).toBe(states.initial.positionCount);
        expect(states.uvgrid.normalCount).toBe(states.initial.normalCount);
        expect(states.noneAgain.normalCount).toBe(states.initial.normalCount);
        expect(states.subdivAgain.normalCount).toBe(states.initial.normalCount);
        expect(states.initial.materialType).toBe('MeshPhysicalMaterial');
        expect(states.uvgrid.materialName).toBe('uvgrid');
        expect(states.noneAgain.materialType).toBe('MeshPhysicalMaterial');
        expect(states.noneAgain.materialName).not.toBe('uvgrid');
        expect(states.initial.flatShading).toBe(false);
        expect(states.noneAgain.flatShading).toBe(false);
        for (const state of [
            states.initial,
            states.uvgrid,
            states.noneAgain,
            states.subdivAgain,
            ...states.timelines,
        ]) {
            expect(state.positionCount, state.label).toBe(states.initial.positionCount);
            expect(state.normalCount, state.label).toBe(states.initial.normalCount);
            expect(state.normalHash, state.label).toBe(states.initial.normalHash);
            expect(state.normalContinuity.sharedPositionGroups).toBeGreaterThan(1000);
            expect(state.normalContinuity.discontinuousGroups).toBe(0);
            expect(state.normalContinuity.minSharedNormalDot).toBeGreaterThan(0.999);
        }
        const expectNormalSample = (
            sample: { index: number; x: number; y: number; z: number },
            expected: { index: number; x: number; y: number; z: number },
        ) => {
            expect(sample.index).toBe(expected.index);
            expect(sample.x).toBeCloseTo(expected.x, 5);
            expect(sample.y).toBeCloseTo(expected.y, 5);
            expect(sample.z).toBeCloseTo(expected.z, 5);
        };
        expectNormalSample(states.initial.normalSamples[0], {
            index: 0,
            x: 0.5775912,
            y: -0.5768680,
            z: -0.5775912,
        });
        expectNormalSample(states.initial.normalSamples[1], {
            index: 1000,
            x: -0.9085442,
            y: -0.1063413,
            z: -0.4040281,
        });
        expectNormalSample(states.initial.normalSamples[2], {
            index: 10000,
            x: 0.6413714,
            y: 0.0663425,
            z: -0.7643568,
        });
        expectNormalSample(states.initial.normalSamples[3], {
            index: 35027,
            x: 0.5773503,
            y: -0.5773503,
            z: -0.5773503,
        });
        expect(states.uvgrid.positionHash).toBe(states.initial.positionHash);
        expect(states.noneAgain.positionHash).toBe(states.initial.positionHash);
        expect(states.uvgrid.normalHash).toBe(states.initial.normalHash);
        expect(states.noneAgain.normalHash).toBe(states.initial.normalHash);
        expect(states.subdivAgain.normalHash).toBe(states.initial.normalHash);
        expect(states.uvgrid.normalSamples).toEqual(states.initial.normalSamples);
        expect(states.noneAgain.normalSamples).toEqual(states.initial.normalSamples);
        expect(states.subdivAgain.normalSamples).toEqual(states.initial.normalSamples);
        expect(webglDiagnostics).toEqual([]);
        expect(diagnostics).toEqual([]);
    });

    test('keeps UVs for subdivided meshes with normal textures', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.route('/api/script.js', route => route.fulfill({
            contentType: 'application/javascript',
            body: 'window.rybbit = { event() {}, pageview() {} };',
        }));

        const sampleUrl = `${usdWgBaseUrl}test_assets/NormalsTextureBiasAndScale/NormalsTextureBiasAndScale.usdz`;
        await page.goto(`/?file=${encodeURIComponent(sampleUrl)}&viewer=needle&waitForMaterials=1&complexity=high`);
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

        await page.goto('/?file=/test-fixtures/subdivision/catmull_clark_varying_color.usda&viewer=needle&complexity=high');
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

        await page.goto('/?file=/test-fixtures/subdivision/catmull_clark_facevarying_st.usda&viewer=needle&complexity=high');
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
        await page.route(assetExplorerApi, route => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
                models: [
                    {
                        name: 'A Beautiful Game',
                        slug: 'ABeautifulGame',
                        thumbnail: 'https://asset-explorer.needle.tools/downloads/ABeautifulGame.glb.three.webp',
                        assets: { glb: 'https://asset-explorer.needle.tools/downloads/ABeautifulGame.glb' },
                        conversions: [
                            { id: 'three-r185', label: 'three r185', usdz: 'https://asset-explorer.needle.tools/downloads/ABeautifulGame.glb.three.usdz' },
                            { id: 'needle-engine', label: 'Needle', usdz: 'https://asset-explorer.needle.tools/downloads/ABeautifulGame.glb.needle-engine.usdz' },
                        ],
                    },
                    {
                        name: 'Unindexed Converter Sample',
                        slug: 'UnindexedConverterSample',
                        thumbnail: 'https://asset-explorer.needle.tools/downloads/Unindexed.glb.three.webp',
                        assets: { glb: 'https://asset-explorer.needle.tools/downloads/Unindexed.glb' },
                        conversions: [
                            { id: 'needle-engine', label: 'Needle', usdz: 'https://asset-explorer.needle.tools/downloads/Unindexed.glb.needle-engine.usdz' },
                        ],
                    },
                ],
            }),
        }));
        await page.route(gltfSampleAssetsIndex, route => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify([
                { name: 'ABeautifulGame', label: 'A Beautiful Game', tags: ['showcase', 'core', 'video'] },
            ]),
        }));

        await page.goto('/?viewer=three');
        await page.click('.dropdown-button');

        await expect(page.locator('#sample-group-list > [data-sample-group]').nth(0)).toHaveAttribute('data-sample-group', 'gltf');
        await expect(page.locator('#sample-group-list > [data-sample-group]').nth(1)).toHaveAttribute('data-sample-group', 'usd-wg');
        await expect(page.locator('#sample-group-list > [data-sample-group]').nth(2)).toHaveAttribute('data-sample-group', 'needle');
        await expect(page.locator('#gallery-title')).toHaveText(/glTF\s+USD conversions/);
        await expect(page.locator('#gallery-subtitle')).toHaveText('Converted from glTF Sample Assets');
        await expect(page.locator('[data-sample-group="gltf"]')).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#usd-wg-group-tree')).toBeHidden();
        await expect(page.locator('#needle-group-tree')).toBeHidden();

        await page.waitForFunction(() => {
            const labels = Array.from(document.querySelectorAll('#gltf-group-tree [data-sample-group] span'))
                .map((node) => node.textContent?.trim());
            return labels[0] === 'Showcase'
                && labels.includes('Core')
                && labels.includes('Video')
                && !labels.includes('Needle')
                && !labels.includes('Three R185')
                && !labels.includes('Untagged');
        });
        const galleryMotion = await page.evaluate(() => {
            const card = document.querySelector<HTMLElement>('.gallery-card');
            if (!card) throw new Error('Missing gallery card');
            return {
                inlineDelay: card.style.animationDelay,
                animationName: getComputedStyle(card).animationName,
            };
        });
        expect(galleryMotion).toEqual({ inlineDelay: '', animationName: 'none' });

        if (!await page.locator('#sample-group-list').isVisible()) {
            await page.click('.dropdown-button');
        }
        await page.click('[data-sample-group="gltf"]');
        await expect(page.locator('#gltf-group-tree')).toBeHidden();
        await expect(page.locator('[data-sample-group="gltf"]')).toHaveAttribute('aria-expanded', 'false');
        await page.click('[data-sample-group="gltf"]');
        await expect(page.locator('#gltf-group-tree')).toBeVisible();

        await page.click('[data-sample-group="usd-wg"]');
        await expect(page.locator('#usd-wg-group-tree')).toBeVisible();
        await expect(page.locator('#gltf-group-tree')).toBeHidden();
        await expect(page.locator('#needle-group-tree')).toBeHidden();
        await page.waitForFunction(() => {
            const first = document.querySelector('#usd-wg-group-tree [data-sample-group] span');
            return first?.textContent?.trim() === 'Full Assets';
        });
        await page.waitForFunction(() => {
            const firstMeta = document.querySelector('.gallery-card .gallery-meta');
            return firstMeta?.textContent?.includes('full_assets');
        });

        await page.click('[data-sample-group="needle"]');
        await expect(page.locator('#needle-group-tree')).toBeVisible();
        await expect(page.locator('#usd-wg-group-tree')).toBeHidden();
        await page.waitForFunction(() => {
            const labels = Array.from(document.querySelectorAll('#needle-group-tree [data-sample-group]'))
                .map((node) => node.querySelector('span')?.textContent?.trim());
            return labels[0] === 'Needle Cloud'
                && labels.includes('MaterialX')
                && labels.includes('Subdivision');
        });

        await page.click('[data-sample-group="needle:subdivision"]');
        await expect(page.locator('#gallery-title')).toHaveText('Subdivision');
        await expect(page.locator('.gallery-card[data-name="Catmull-Clark Cube"]')).toHaveAttribute('href', '?file=/test-fixtures/subdivision/catmull_clark_cube.usda');
        await expect(page.locator('.gallery-card[data-name="Loop Non-Triangle Fallback"]')).toHaveAttribute('href', '?file=/test-fixtures/subdivision/loop_non_triangle_fallback.usda');

        expect(diagnostics).toEqual([]);
    });

    test('shows thumbnails for Needle Cloud and local Needle fixture samples', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await page.goto('/?viewer=three');
        await page.click('.dropdown-button');
        await page.click('[data-sample-group="needle"]');
        await page.click('[data-sample-group="needle:cloud"]');

        const kitchenThumbnail = page.locator('.gallery-card[data-name="Kitchen Set"] .gallery-thumb');
        await expect(kitchenThumbnail).toHaveAttribute('src', /screenshot\.needle\.webp$/);
        await page.waitForFunction(() => {
            const img = document.querySelector<HTMLImageElement>('.gallery-card[data-name="Kitchen Set"] .gallery-thumb');
            return !!img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
        });

        await page.click('[data-sample-group="needle:usd-concepts"]');
        const fixtureThumbnail = page.locator('.gallery-card[data-name="Custom Geomprops + USDShade"] .gallery-thumb');
        await expect(fixtureThumbnail).toHaveAttribute('src', /\/test-fixtures\/thumbnails\/usd-concepts-custom-geomprops-usdshade-usda\.png$/);
        await page.waitForFunction(() => {
            const img = document.querySelector<HTMLImageElement>('.gallery-card[data-name="Custom Geomprops + USDShade"] .gallery-thumb');
            return !!img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
        });

        expect(diagnostics).toEqual([]);
    });

    for (const viewer of ['three', 'needle'] as const) {
        test(`renders OpenUSD Gaussian particle fields through Spark in ${viewer}`, async ({ page }) => {
            test.setTimeout(60_000);
            const diagnostics = collectFatalDiagnostics(page);
            await stubAnalytics(page);
            await page.goto(`/?viewer=${viewer}&file=/test-data/gaussian-splats/chamaeleon.usdc`, {
                waitUntil: 'domcontentloaded',
            });
            if (viewer === 'needle') {
                await waitForNeedleLoaderMode(page, 'chamaeleon.usdc');
            } else {
                await waitForPublicViewerLoad(page, 'chamaeleon.usdc');
            }

            const state = await page.evaluate(viewerMode => {
                const scene = viewerMode === 'needle'
                    ? window.needleEngineContext?.scene
                    : window.usdRoot;
                const renderScene = viewerMode === 'needle'
                    ? window.needleEngineContext?.scene
                    : window.scene;
                const splats: any[] = [];
                let sparkRenderers = 0;
                renderScene?.traverse?.((object: any) => {
                    if (object.type === 'SparkRenderer' || object.userData?.usdParticleFieldRenderer) {
                        sparkRenderers++;
                    }
                });
                scene?.traverse?.((object: any) => {
                    if (object.userData?.usdTypeName === 'ParticleField3DGaussianSplat' && typeof object.getBoundingBox === 'function') {
                        splats.push(object);
                    }
                });
                const bounds = splats[0]?.getBoundingBox();
                const size = bounds?.getSize(splats[0].position.clone());
                return {
                    particleFields: window.usdHydra?.diagnostics?.().particleFields,
                    sparkRenderers,
                    splatMeshes: splats.length,
                    numSplats: splats[0]?.extSplats?.numSplats,
                    bounds: size ? [size.x, size.y, size.z] : [],
                };
            }, viewer);

            expect(state.particleFields).toBe(1);
            expect(state.sparkRenderers).toBe(1);
            expect(state.splatMeshes).toBe(1);
            expect(state.numSplats).toBe(10_000);
            expect(state.bounds).toHaveLength(3);
            expect(Math.max(...state.bounds)).toBeGreaterThan(0);

            const canvas = viewer === 'needle'
                ? page.locator('needle-engine canvas')
                : page.locator('canvas.usd-viewer-three-canvas');
            await expect(canvas).toHaveScreenshot(`gaussian-particle-field-${viewer}.png`, {
                animations: 'disabled',
                maxDiffPixelRatio: 0.02,
            });

            await page.locator('.clear-button').click();
            await page.waitForFunction(() => !window.usdHydra && !window.needleEngineContext);
            const retainedParticleObjects = await page.evaluate(() => {
                let count = 0;
                const scenes = [window.usdRoot, window.scene, document.querySelector('needle-engine')?.context?.scene];
                const visited = new Set<any>();
                for (const scene of scenes) scene?.traverse?.((object: any) => {
                    if (visited.has(object)) return;
                    visited.add(object);
                    if (object.userData?.usdTypeName === 'ParticleField3DGaussianSplat'
                        || object.userData?.usdParticleFieldRenderer) count++;
                });
                return count;
            });
            expect(retainedParticleObjects).toBe(0);
            expect(diagnostics).toEqual([]);
        });
    }

    test('applies OpenUSD particle-field array truncation and defaults', async ({ page }) => {
        const diagnostics = collectFatalDiagnostics(page);
        await stubAnalytics(page);
        await page.goto('/?viewer=three&file=/test-data/gaussian-splats/array_fallbacks.usda', {
            waitUntil: 'domcontentloaded',
        });
        await waitForPublicViewerLoad(page, 'array_fallbacks.usda');

        const fields = await page.evaluate(() => {
            const result: Record<string, any> = {};
            window.usdRoot?.traverse?.((object: any) => {
                if (typeof object.getBoundingBox !== 'function'
                    || object.userData?.usdTypeName !== 'ParticleField3DGaussianSplat') return;
                const splats = object.extSplats;
                result[object.userData.usdPath] = {
                    degree: splats.getNumSh(),
                    splats: Array.from({ length: splats.numSplats }, (_, index) => {
                        const splat = splats.getSplat(index);
                        return {
                            scale: splat.scales.toArray(),
                            quaternion: splat.quaternion.toArray(),
                            opacity: splat.opacity,
                            color: splat.color.toArray(),
                        };
                    }),
                };
            });
            return result;
        });

        const truncated = fields['/ParticleFields/Truncated'];
        expect(truncated.degree).toBe(0);
        expect(truncated.splats).toHaveLength(2);
        expectArraysClose(truncated.splats[0].scale, [0.1, 0.2, 0.3]);
        expectArraysClose(truncated.splats[1].scale, [0.4, 0.5, 0.6]);
        expectArraysClose(truncated.splats.map((splat: any) => splat.opacity), [0.25, 0.75]);

        const defaults = fields['/ParticleFields/Defaults'];
        expect(defaults.degree).toBe(0);
        expect(defaults.splats).toHaveLength(2);
        for (const splat of defaults.splats) {
            expectArraysClose(splat.scale, [1, 1, 1]);
            expectArraysClose(splat.quaternion, [0, 0, 0, 1]);
            expect(splat.opacity).toBeCloseTo(1, 5);
            expectArraysClose(splat.color, [0.5, 0.5, 0.5]);
        }
        expect(diagnostics).toEqual([]);
    });
});

function expectArraysClose(actual: number[], expected: number[]) {
    expect(actual).toHaveLength(expected.length);
    for (let index = 0; index < expected.length; index++) {
        expect(actual[index]).toBeCloseTo(expected[index], 3);
    }
}

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

function collectConsoleErrorsMatching(page: Page, patterns: RegExp[]) {
    const diagnostics: Array<{ type: string, text: string }> = [];
    page.on('console', message => {
        const text = message.text();
        if (message.type() === 'error' && patterns.some(pattern => pattern.test(text))) {
            diagnostics.push({ type: message.type(), text });
        }
    });
    page.on('pageerror', error => {
        diagnostics.push({ type: 'pageerror', text: error.stack || error.message });
    });
    return diagnostics;
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

async function stubAnalytics(page: Page) {
    await page.route('/api/script.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: 'window.rybbit = { event() {}, pageview() {} };',
    }));
}

function flattenUsdWgManifest(entry: any) {
    const assetPaths: string[] = [];
    const visit = (node: any) => {
        for (const item of node?.items || []) {
            if (item.assetPath) assetPaths.push(item.assetPath);
        }
        for (const child of node?.children || []) {
            visit(child);
        }
    };
    visit(entry);
    return assetPaths;
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

function viewerDisplayFilename(filename: string) {
    const base = filename.split('/').pop()?.split('#')[0].split('?')[0] || filename;
    const dot = base.indexOf('.');
    return dot > 0 ? base.slice(0, dot) : base;
}

async function waitForPublicViewerLoad(page: Page, filename: string) {
    await page.waitForFunction(expectedFilename => {
        const overlay = document.getElementById('loading-overlay');
        const overlayHidden = !overlay || !overlay.classList.contains('visible');
        const driver = window.driver;
        const driverAlive = Boolean(driver) && (typeof driver.isDeleted !== 'function' || !driver.isDeleted());
        const actualFilename = document.querySelector('.filename-text')?.textContent || '';
        return overlayHidden && driverAlive && actualFilename === expectedFilename;
    }, viewerDisplayFilename(filename));
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
    }, { expectedFilename: viewerDisplayFilename(filename), expectedMode: mode });
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

async function dropFixtureFile(page: Page, options: {
    path: string;
    name: string;
    target: 'window' | string;
    type?: string;
}) {
    return await page.evaluate(async ({ path, name, target, type }) => {
        const response = await fetch(`/test-fixtures/${path}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch dropped fixture ${path}: ${response.status} ${response.statusText}`);
        }
        const blob = await response.blob();
        const file = new File([blob], name, { type: type || blob.type || 'application/octet-stream' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        const element = target === 'window' ? window : document.querySelector(target);
        if (!element) throw new Error(`Drop target not found: ${target}`);
        const event = new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer,
        });
        element.dispatchEvent(event);
        return {
            defaultPrevented: event.defaultPrevented,
            itemCount: dataTransfer.items.length,
            fileCount: dataTransfer.files.length,
        };
    }, options);
}

async function dropFixtureDirectory(page: Page, options: {
    rootName: string;
    files: Array<{
        path: string;
        relativePath: string;
        type?: string;
    }>;
}) {
    return await page.evaluate(async ({ rootName, files }) => {
        const root = { name: rootName, children: new Map<string, any>() };
        for (const descriptor of files) {
            const response = await fetch(`/test-fixtures/${descriptor.path}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch dropped fixture ${descriptor.path}: ${response.status} ${response.statusText}`);
            }
            const parts = descriptor.relativePath.split('/').filter(Boolean);
            const fileName = parts.pop();
            if (!fileName) throw new Error(`Invalid dropped fixture path: ${descriptor.relativePath}`);
            let directory = root;
            for (const part of parts) {
                let child = directory.children.get(part);
                if (!child) {
                    child = { name: part, children: new Map<string, any>() };
                    directory.children.set(part, child);
                }
                directory = child;
            }
            directory.children.set(fileName, {
                name: fileName,
                file: new File([await response.blob()], fileName, {
                    type: descriptor.type || 'application/octet-stream',
                }),
            });
        }

        const toEntry = (node: any, parentPath: string): any => {
            const fullPath = `${parentPath}/${node.name}`;
            if (node.file) {
                return {
                    isFile: true,
                    isDirectory: false,
                    name: node.name,
                    fullPath,
                    file: (resolve: (file: File) => void) => resolve(node.file),
                };
            }
            const entries = Array.from(node.children.values()).map(child => toEntry(child, fullPath));
            return {
                isFile: false,
                isDirectory: true,
                name: node.name,
                fullPath,
                createReader: () => {
                    let read = false;
                    return {
                        readEntries: (resolve: (entries: any[]) => void) => {
                            resolve(read ? [] : (read = true, entries));
                        },
                    };
                },
            };
        };

        const rootEntry = toEntry(root, '');
        const event = new DragEvent('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'dataTransfer', {
            value: {
                files: [],
                items: [{ kind: 'file', webkitGetAsEntry: () => rootEntry }],
            },
        });
        window.dispatchEvent(event);
        return { defaultPrevented: event.defaultPrevented };
    }, options);
}

async function waitForDropReady(page: Page) {
    await page.waitForFunction(() => {
        return Boolean(globalThis['NEEDLE:USD:GET']) && Boolean(document.querySelector('canvas'));
    });
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
    }, viewerDisplayFilename(filename));
    await page.waitForTimeout(1000);
    return await page.evaluate(() => ({
        href: location.href,
        filename: document.querySelector('.filename-text')?.textContent || '',
        activeButton: document.querySelector('[data-viewer-mode].active')?.getAttribute('data-viewer-mode') || '',
        activeButtonText: document.querySelector('[data-viewer-mode].active')?.textContent?.trim() || '',
        elementSrc: document.querySelector('needle-engine')?.getAttribute('src') || '',
        autoplay: document.querySelector('needle-engine')?.hasAttribute('autoplay') ?? false,
        autoRotate: document.querySelector('needle-engine')?.getAttribute('auto-rotate') || '',
        contactShadows: document.querySelector('needle-engine')?.getAttribute('contactshadows') || '',
        driverAlive: Boolean(window.driver) && (typeof window.driver.isDeleted !== 'function' || !window.driver.isDeleted()),
        hasHydraHandle: Boolean(window.usdHydra),
        hasNeedleContext: Boolean(window.needleEngineContext),
        needleChildren: window.needleEngineContext?.scene?.children?.length ?? -1,
        threeCanvasDisplay: getComputedStyle(document.querySelector('.usd-viewer-three-canvas')!).display,
        needleDisplay: getComputedStyle(document.querySelector('needle-engine')!).display,
    }));
}

async function getNeedleUsdMeshNormalState(page: Page, usdPath = '/mesh') {
    return await page.evaluate(path => {
        let target: any = null;
        window.needleEngineContext?.scene?.traverse?.((object: any) => {
            if (!target && object.isMesh && object.userData?.usdPath === path) {
                target = object;
            }
        });
        if (!target) throw new Error(`Missing Needle USD mesh at ${path}`);

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
    }, usdPath);
}

async function getNeedleSceneNormalState(page: Page) {
    return await page.evaluate(() => {
        const zeroNormalMeshes: string[] = [];
        const missingNormalMeshes: string[] = [];
        const grassBlockTopFirstNormals: string[] = [];
        let meshCount = 0;

        window.needleEngineContext?.scene?.traverse?.((object: any) => {
            if (!object.isMesh || !object.geometry?.attributes?.position || !object.name) return;
            meshCount++;

            const normal = object.geometry.attributes.normal;
            if (!normal) {
                missingNormalMeshes.push(object.name);
                return;
            }

            for (let i = 0; i < normal.count; i++) {
                const x = normal.getX(i);
                const y = normal.getY(i);
                const z = normal.getZ(i);
                if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || (x * x + y * y + z * z) <= 1e-12) {
                    zeroNormalMeshes.push(object.name);
                    break;
                }
            }

            if (object.name === 'grass_block_top') {
                for (let i = 0; i < Math.min(6, normal.count); i++) {
                    grassBlockTopFirstNormals.push([
                        normal.getX(i).toFixed(3),
                        normal.getY(i).toFixed(3),
                        normal.getZ(i).toFixed(3),
                    ].join(','));
                }
            }
        });

        return {
            meshCount,
            zeroNormalMeshes,
            missingNormalMeshes,
            grassBlockTopFirstNormals,
        };
    });
}

async function waitForNeedleSceneNormalState(
    page: Page,
    predicate: (state: Awaited<ReturnType<typeof getNeedleSceneNormalState>>) => boolean,
) {
    const deadline = Date.now() + 30000;
    let lastState: Awaited<ReturnType<typeof getNeedleSceneNormalState>> | null = null;

    while (Date.now() < deadline) {
        lastState = await getNeedleSceneNormalState(page);
        if (predicate(lastState)) {
            return lastState;
        }
        await page.waitForTimeout(500);
    }

    throw new Error(`Timed out waiting for Needle scene normals; last state ${JSON.stringify(lastState)}`);
}

async function getNeedleFaceVaryingNormalMatrixState(page: Page) {
    return await page.evaluate(() => {
        const result: Record<string, {
            positionCount: number;
            normalCount: number;
            zeroNormalCount: number;
            uniqueNormals: string[];
            firstSixNormals: string[];
        }> = {};

        window.needleEngineContext?.scene?.traverse?.((object: any) => {
            const usdPath = String(object.userData?.usdPath || '');
            if (!object.isMesh || !usdPath.startsWith('/World/')) return;

            const name = usdPath.split('/').at(-1) || object.name;
            const position = object.geometry?.attributes?.position;
            const normal = object.geometry?.attributes?.normal;
            const uniqueNormals = new Set<string>();
            const firstSixNormals: string[] = [];
            let zeroNormalCount = 0;

            if (normal) {
                for (let i = 0; i < normal.count; i++) {
                    const x = normal.getX(i);
                    const y = normal.getY(i);
                    const z = normal.getZ(i);
                    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || (x * x + y * y + z * z) <= 1e-12) {
                        zeroNormalCount++;
                    }
                    const key = [
                        x.toFixed(3),
                        y.toFixed(3),
                        z.toFixed(3),
                    ].join(',');
                    uniqueNormals.add(key);
                    if (i < 6) firstSixNormals.push(key);
                }
            }

            result[name] = {
                positionCount: position?.count || 0,
                normalCount: normal?.count || 0,
                zeroNormalCount,
                uniqueNormals: Array.from(uniqueNormals).sort(),
                firstSixNormals,
            };
        });

        return result;
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
            tangentCount: attributes.tangent?.count || 0,
            vertexColors: Boolean(material?.vertexColors),
        };
    }, usdPath);
}

async function getNeedleMeshSummaries(page: Page) {
    return await page.evaluate(() => {
        const meshes: Array<{
            path: string;
            name: string;
            positionCount: number;
            normalCount: number;
            materialName: string;
            materialColor: string;
        }> = [];
        window.needleEngineContext?.scene?.traverse?.((object: any) => {
            if (!object.isMesh || !object.userData?.usdPath) return;
            const material = Array.isArray(object.material)
                ? object.material[0]
                : object.material;
            meshes.push({
                path: String(object.userData.usdPath),
                name: String(object.name || ''),
                positionCount: object.geometry?.attributes?.position?.count || 0,
                normalCount: object.geometry?.attributes?.normal?.count || 0,
                materialName: String(material?.name || ''),
                materialColor: String(material?.color?.getHexString?.() || ''),
            });
        });
        return meshes;
    });
}

async function findNeedlePrimvarAttribute(page: Page, attributeName: string) {
    return await page.evaluate(name => {
        const matches: Array<{
            path: string;
            count: number;
            itemSize: number;
            arrayType: string;
            positionCount: number;
            allFinite: boolean;
            valuesAreBoolean: boolean;
            hasOne: boolean;
            sample: number[];
        }> = [];

        window.needleEngineContext?.scene?.traverse?.((object: any) => {
            if (!object.isMesh) return;
            const attributes = object.geometry?.attributes || {};
            const attribute = attributes[name] || object.geometry?.getAttribute?.(name);
            const position = attributes.position;
            if (!attribute || !position) return;

            const values = Array.from(attribute.array || [], Number);
            matches.push({
                path: object.userData?.usdPath || object.name || '',
                count: attribute.count || 0,
                itemSize: attribute.itemSize || 0,
                arrayType: attribute.array?.constructor?.name || '',
                positionCount: position.count || 0,
                allFinite: values.every(Number.isFinite),
                valuesAreBoolean: values.every(value => value === 0 || value === 1),
                hasOne: values.includes(1),
                sample: values.slice(0, 16),
            });
        });

        if (!matches.length) {
            throw new Error(`Missing Needle primvar attribute ${name}`);
        }

        return matches.sort((a, b) => b.count - a.count)[0];
    }, attributeName);
}

async function getNeedleMeshWindingState(page: Page, usdPath: string) {
    return await page.evaluate(path => {
        let target: any = null;
        window.needleEngineContext?.scene?.traverse?.((object: any) => {
            if (!target && object.isMesh && object.userData?.usdPath === path) {
                target = object;
            }
        });
        if (!target) throw new Error(`Missing Needle USD mesh at ${path}`);

        const position = target.geometry?.attributes?.position;
        const normal = target.geometry?.attributes?.normal;
        const index = target.geometry?.index;
        if (!position || !normal) {
            throw new Error(`Missing position/normal attributes for ${path}`);
        }

        const positions = position.array;
        const normals = normal.array;
        const indices = index?.array;
        const center = { x: 0, y: 0, z: 0 };
        for (let i = 0; i < position.count; i++) {
            const offset = i * 3;
            center.x += positions[offset];
            center.y += positions[offset + 1];
            center.z += positions[offset + 2];
        }
        center.x /= position.count;
        center.y /= position.count;
        center.z /= position.count;

        const triangleCount = index ? index.count / 3 : position.count / 3;
        const sampleTarget = Math.min(5000, triangleCount);
        const step = Math.max(1, Math.floor(triangleCount / sampleTarget));
        const getIndex = (i: number) => indices ? indices[i] : i;
        let windingOut = 0;
        let windingIn = 0;
        let aligned = 0;
        let opposed = 0;
        let sampled = 0;

        for (let triangle = 0; triangle < triangleCount && sampled < sampleTarget; triangle += step, sampled++) {
            const i0 = getIndex(triangle * 3);
            const i1 = getIndex(triangle * 3 + 1);
            const i2 = getIndex(triangle * 3 + 2);
            const p0 = i0 * 3;
            const p1 = i1 * 3;
            const p2 = i2 * 3;
            const ax = positions[p0];
            const ay = positions[p0 + 1];
            const az = positions[p0 + 2];
            const bx = positions[p1];
            const by = positions[p1 + 1];
            const bz = positions[p1 + 2];
            const cx = positions[p2];
            const cy = positions[p2 + 1];
            const cz = positions[p2 + 2];
            const abx = bx - ax;
            const aby = by - ay;
            const abz = bz - az;
            const acx = cx - ax;
            const acy = cy - ay;
            const acz = cz - az;
            let fnx = aby * acz - abz * acy;
            let fny = abz * acx - abx * acz;
            let fnz = abx * acy - aby * acx;
            const faceLength = Math.hypot(fnx, fny, fnz);
            if (faceLength <= 1e-12) continue;
            fnx /= faceLength;
            fny /= faceLength;
            fnz /= faceLength;

            const nx = (normals[p0] + normals[p1] + normals[p2]) / 3;
            const ny = (normals[p0 + 1] + normals[p1 + 1] + normals[p2 + 1]) / 3;
            const nz = (normals[p0 + 2] + normals[p1 + 2] + normals[p2 + 2]) / 3;
            const normalLength = Math.hypot(nx, ny, nz);
            if (normalLength <= 1e-12) continue;

            const faceNormalDot = fnx * nx / normalLength + fny * ny / normalLength + fnz * nz / normalLength;
            if (faceNormalDot > 0.2) aligned++;
            else if (faceNormalDot < -0.2) opposed++;

            const faceCenterX = (ax + bx + cx) / 3;
            const faceCenterY = (ay + by + cy) / 3;
            const faceCenterZ = (az + bz + cz) / 3;
            const rx = faceCenterX - center.x;
            const ry = faceCenterY - center.y;
            const rz = faceCenterZ - center.z;
            const radialLength = Math.hypot(rx, ry, rz);
            if (radialLength <= 1e-12) continue;
            const radialDot = (fnx * rx + fny * ry + fnz * rz) / radialLength;
            if (radialDot > 0.05) windingOut++;
            else if (radialDot < -0.05) windingIn++;
        }

        return {
            sampled,
            windingOut,
            windingIn,
            aligned,
            opposed,
        };
    }, usdPath);
}

async function waitForNeedleMeshAttributeState(
    page: Page,
    usdPath: string,
    predicate: (state: Awaited<ReturnType<typeof getNeedleMeshAttributeState>>) => boolean,
) {
    const deadline = Date.now() + 30000;
    let lastState: Awaited<ReturnType<typeof getNeedleMeshAttributeState>> | null = null;
    let lastError: unknown = null;

    while (Date.now() < deadline) {
        try {
            lastState = await getNeedleMeshAttributeState(page, usdPath);
            if (predicate(lastState)) {
                return lastState;
            }
        } catch (error) {
            lastError = error;
        }
        await page.waitForTimeout(500);
    }

    if (lastState) {
        throw new Error(`Timed out waiting for ${usdPath}; last state ${JSON.stringify(lastState)}`);
    }
    throw lastError || new Error(`Timed out waiting for ${usdPath}`);
}

async function readOpenChessSetPawnInstances(page: Page) {
    return await page.evaluate(() => {
        const round = (value: number) => Number(value.toFixed(6));
        const entries: Array<{
            path: string;
            visible: boolean;
            isInstancedMesh: boolean;
            count: number | null;
            positionCount: number;
            matrices: number[][];
        }> = [];

        window.needleEngineContext?.scene?.traverse?.((object: any) => {
            const path = String(object.userData?.usdPath || object.name || '');
            if (!/\/ChessSet\/(Black|White)\/Pawns\//.test(path)) return;
            if (!object.isMesh && !object.isInstancedMesh) return;

            const entry = {
                path,
                visible: Boolean(object.visible),
                isInstancedMesh: Boolean(object.isInstancedMesh),
                count: object.isInstancedMesh ? Number(object.count) : null,
                positionCount: object.geometry?.attributes?.position?.count ?? 0,
                matrices: [] as number[][],
            };

            if (object.isInstancedMesh) {
                const matrix = new object.matrixWorld.constructor();
                object.updateMatrixWorld(true);
                for (let i = 0; i < object.count; i++) {
                    object.getMatrixAt(i, matrix);
                    matrix.premultiply(object.matrixWorld);
                    entry.matrices.push([
                        round(matrix.elements[12]),
                        round(matrix.elements[13]),
                        round(matrix.elements[14]),
                    ]);
                }
            }
            entries.push(entry);
        });

        const byPath = (a: { path: string; isInstancedMesh: boolean }, b: { path: string; isInstancedMesh: boolean }) =>
            a.path.localeCompare(b.path) || Number(a.isInstancedMesh) - Number(b.isInstancedMesh);
        return {
            prototypes: entries.filter(entry => !entry.isInstancedMesh).sort(byPath),
            instanced: entries.filter(entry => entry.isInstancedMesh).sort(byPath),
        };
    });
}

async function countNeedlePawnRenderComponents(page: Page) {
    return await page.evaluate(async () => {
        const context = window.needleEngineContext;
        const renderer = context?.renderer;
        const scene = context?.scene;
        const camera = context?.mainCamera;
        if (!renderer || !scene || !camera) {
            throw new Error('Needle renderer, scene, or camera is missing');
        }

        scene.traverse((object: any) => {
            const path = String(object.userData?.usdPath || object.name || '');
            if (object.isMesh || object.isInstancedMesh) {
                object.visible = path.includes('/Pawns/');
            }
        });
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix?.();
        await new Promise(requestAnimationFrame);

        renderer.render(scene, camera);
        const gl = renderer.getContext();
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        const background = [pixels[0], pixels[1], pixels[2]];
        const step = 4;
        const sampleWidth = Math.floor(width / step);
        const sampleHeight = Math.floor(height / step);
        const mask = new Uint8Array(sampleWidth * sampleHeight);
        let maskedPixels = 0;
        for (let y = 0; y < sampleHeight; y++) {
            for (let x = 0; x < sampleWidth; x++) {
                const px = Math.min(width - 1, x * step + Math.floor(step / 2));
                const py = Math.min(height - 1, y * step + Math.floor(step / 2));
                const pixelOffset = (py * width + px) * 4;
                const difference =
                    Math.abs(pixels[pixelOffset] - background[0]) +
                    Math.abs(pixels[pixelOffset + 1] - background[1]) +
                    Math.abs(pixels[pixelOffset + 2] - background[2]);
                if (difference > 45) {
                    mask[y * sampleWidth + x] = 1;
                    maskedPixels++;
                }
            }
        }

        const visited = new Uint8Array(mask.length);
        const queueX: number[] = [];
        const queueY: number[] = [];
        let components = 0;
        let largestComponent = 0;
        for (let y = 0; y < sampleHeight; y++) {
            for (let x = 0; x < sampleWidth; x++) {
                const index = y * sampleWidth + x;
                if (!mask[index] || visited[index]) continue;
                visited[index] = 1;
                queueX.length = 0;
                queueY.length = 0;
                queueX.push(x);
                queueY.push(y);
                let head = 0;
                let count = 0;
                while (head < queueX.length) {
                    const cx = queueX[head];
                    const cy = queueY[head++];
                    count++;
                    const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                    for (const [dx, dy] of neighbors) {
                        const nx = cx + dx;
                        const ny = cy + dy;
                        if (nx < 0 || nx >= sampleWidth || ny < 0 || ny >= sampleHeight) continue;
                        const neighborIndex = ny * sampleWidth + nx;
                        if (!mask[neighborIndex] || visited[neighborIndex]) continue;
                        visited[neighborIndex] = 1;
                        queueX.push(nx);
                        queueY.push(ny);
                    }
                }
                if (count > 8) {
                    components++;
                    largestComponent = Math.max(largestComponent, count);
                }
            }
        }

        return { components, maskedPixels, largestComponent };
    });
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
