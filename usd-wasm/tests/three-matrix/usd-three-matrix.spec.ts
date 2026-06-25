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
                materialTextures: number;
                namedMaterials: string[];
                textureNames: string[];
            };
            handleMethods: Record<string, string>;
            fixtureChecks: Record<string, any>;
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
    expect(suite.usd.bindingApi.repopulate).toBe('function');
    expect(suite.usd.bindingApi.setIncludedPurposes).toBe('function');
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
    expect(suite.usd.handleMethods.repopulate).toBe('function');
    expect(suite.usd.handleMethods.setIncludedPurposes).toBe('function');
    expect(suite.usd.handleMethods.materialsReady).toBe('function');
    assertFixtureChecks(matrixPage.fixtureName, suite.usd.fixtureChecks);
    if (
        matrixPage.fixtureName === 'local-materialx-texture-noise-usda' ||
        matrixPage.fixtureName === 'local-materialx-procedural-brick-usda'
    ) {
        expect(suite.diagnostics.warnings.filter(warning => warning.includes('Failed to load texture'))).toEqual([]);
    }
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

function assertFixtureChecks(fixtureName: string, checks: Record<string, any>) {
    if (fixtureName === 'local-binding-override-variants-usda') {
        expect(checks.beforeMaterialVariant.meshCount).toBe(1);
        expect(checks.afterMaterialVariant.meshCount).toBe(1);
        expect(checks.afterMaterialVariant.materialNames).toContain('Metal');
        expect(checks.afterMaterialVariant.meshes[0].materials[0].metalness).toBe(1);
    }

    if (fixtureName === 'local-nested-variants-usda') {
        expect(checks.beforeNestedVariant.meshCount).toBe(1);
        expect(checks.afterShapeVariant.meshCount).toBe(1);
        expect(checks.afterFinishVariant.meshCount).toBe(1);
        expect(checks.afterShapeVariant.materialNames).toContain('Warm');
        expect(checks.afterFinishVariant.materialNames).toContain('Cool');
    }

    if (fixtureName === 'local-cesium-man') {
        expect(checks.cesiumTexture.meshCount).toBeGreaterThan(0);
        expect(checks.cesiumTexture.texturedMaterialCount).toBeGreaterThan(0);
    }

    if (
        fixtureName === 'local-materialx-texture-noise-usda' ||
        fixtureName === 'local-materialx-procedural-brick-usda'
    ) {
        expect(checks.materialXTextures.meshCount).toBeGreaterThan(0);
        expect(checks.materialXTextures.textureCount).toBeGreaterThan(0);
        expect(checks.materialXPanelGeometry.meshCount).toBe(1);
        expect(checks.materialXPanelGeometry.maxPositionCount).toBeLessThanOrEqual(8);
    }

    if (fixtureName === 'local-catmull-clark-subdivision-usda') {
        expect(checks.subdivision.meshCount).toBe(1);
        expect(checks.subdivision.maxPositionCount).toBeGreaterThan(8);
        expect(checks.subdivision.maxAbsBound).toBeLessThan(0.95);
    }

    if (fixtureName === 'local-native-instances-usda') {
        expect(checks.nativeInstances.stageTypes['/Prototype/Shape'].typeName).toBe('Cube');
        expect(checks.nativeInstances.stageTypes['/World/InstanceA'].valid).toBe(true);
        expect(checks.nativeInstances.stageTypes['/World/InstanceB'].valid).toBe(true);
        expect(checks.nativeInstances.meshState.visibleMeshCount).toBe(1);
        expect(checks.nativeInstances.meshState.meshes.filter((mesh: any) => mesh.visible)[0].instanced).toBe(true);
        expect(checks.nativeInstances.meshState.meshes.filter((mesh: any) => mesh.visible)[0].instanceCount).toBe(2);
        expect(checks.nativeInstances.worldState.visibleMeshCount).toBe(2);
        expect(checks.nativeInstances.worldState.visibleXPositions).toEqual([-0.65, 0.65]);
        expect(checks.nativeInstances.meshState.materialNames).toContain('InstanceGreen');
    }

    if (fixtureName === 'local-point-instancer-usda') {
        expect(checks.pointInstancer.stageTypes['/World/Scatter'].typeName).toBe('PointInstancer');
        expect(checks.pointInstancer.stageTypes['/World/Scatter/Prototypes/CubeProto'].typeName).toBe('Cube');
        expect(checks.pointInstancer.stageTypes['/World/Scatter/Prototypes/SphereProto'].typeName).toBe('Sphere');
        expect(checks.pointInstancer.geometryState.meshCount).toBeGreaterThan(0);
        expect(checks.pointInstancer.geometryState.maxPositionCount).toBeGreaterThan(0);
        expect(checks.pointInstancer.meshState.visibleMeshCount).toBe(2);
        expect(checks.pointInstancer.meshState.meshes.filter((mesh: any) => mesh.visible).every((mesh: any) => mesh.instanced)).toBe(true);
        expect(checks.pointInstancer.worldState.visibleMeshCount).toBe(3);
        expect(checks.pointInstancer.worldState.visibleXPositions).toEqual([-0.7, 0, 0.7]);
    }

    if (fixtureName === 'local-reference-override-usda') {
        expect(checks.referenceOverride.stageTypes['/World/Referenced'].valid).toBe(true);
        expect(checks.referenceOverride.stageTypes['/World/Referenced/Shape'].typeName).toBe('Cube');
        expect(checks.referenceOverride.meshState.meshCount).toBe(1);
        expect(checks.referenceOverride.meshState.materialNames).toContain('OverrideBlue');
        expect(checks.referenceOverride.geometryState.maxAbsBound).toBeGreaterThan(0.6);
    }

    if (fixtureName === 'local-inherits-specializes-usda') {
        expect(checks.inheritsSpecializes.stageTypes['/World/InheritedCube/Shape'].typeName).toBe('Cube');
        expect(checks.inheritsSpecializes.stageTypes['/World/SpecializedBall/Shape'].typeName).toBe('Sphere');
        expect(checks.inheritsSpecializes.meshState.meshCount).toBe(2);
        expect(checks.inheritsSpecializes.meshState.materialNames).toContain('ClassWarm');
        expect(checks.inheritsSpecializes.meshState.materialNames).toContain('SpecialCool');
    }

    if (fixtureName === 'local-collection-binding-usda') {
        expect(checks.collectionBinding.meshCount).toBe(2);
        expect(checks.collectionBinding.materialNames).toContain('CollectionGold');
        expect(checks.collectionBinding.meshes.every((mesh: any) =>
            mesh.materials.some((material: any) => material.name === 'CollectionGold'))).toBe(true);
    }

    if (fixtureName === 'local-visibility-purpose-usda') {
        expect(checks.visibilityPurpose.authoredState['/World/VisibleRender'].visibility).toBe('inherited');
        expect(checks.visibilityPurpose.authoredState['/World/InvisibleGuide'].visibility).toBe('invisible');
        expect(checks.visibilityPurpose.authoredState['/World/InvisibleGuide'].purpose).toBe('guide');
        expect(checks.visibilityPurpose.meshState.visibleMeshCount).toBe(1);
        expect(checks.visibilityPurpose.meshState.visibleMaterialNames).toContain('VisibleMat');
        expect(checks.visibilityPurpose.meshState.visibleMaterialNames).not.toContain('HiddenMat');
    }

    if (fixtureName === 'local-purpose-render-intent-usda') {
        expect(checks.purposeRenderIntent.authoredState['/World/DefaultPurpose'].purpose).toBe('default');
        expect(checks.purposeRenderIntent.authoredState['/World/RenderPurpose'].purpose).toBe('render');
        expect(checks.purposeRenderIntent.authoredState['/World/ProxyPurpose'].purpose).toBe('proxy');
        expect(checks.purposeRenderIntent.authoredState['/World/GuidePurpose'].purpose).toBe('guide');
        expect(checks.purposeRenderIntent.meshState.visibleMeshCount).toBe(2);
        expect(checks.purposeRenderIntent.meshState.visibleMaterialNames).toContain('DefaultMat');
        expect(checks.purposeRenderIntent.meshState.visibleMaterialNames).toContain('RenderMat');
        expect(checks.purposeRenderIntent.meshState.visibleMaterialNames).not.toContain('ProxyMat');
        expect(checks.purposeRenderIntent.meshState.visibleMaterialNames).not.toContain('GuideMat');
        expect(checks.purposeRenderIntent.afterAllPurposes.visibleMeshCount).toBe(4);
        expect(checks.purposeRenderIntent.afterAllPurposes.visibleMaterialNames).toContain('ProxyMat');
        expect(checks.purposeRenderIntent.afterAllPurposes.visibleMaterialNames).toContain('GuideMat');
    }

    if (fixtureName === 'local-camera-light-usda') {
        expect(checks.cameraLight.stageTypes['/World/ShotCam'].typeName).toBe('Camera');
        expect(checks.cameraLight.stageTypes['/World/KeyLight'].typeName).toBe('SphereLight');
        expect(checks.cameraLight.stageTypes['/World/LitCube'].typeName).toBe('Cube');
        expect(checks.cameraLight.meshState.meshCount).toBe(1);
        expect(checks.cameraLight.meshState.materialNames).toContain('Neutral');
        expect(checks.cameraLight.scenePrimitives.cameras.map((camera: any) => camera.name)).toContain('ShotCam');
        expect(checks.cameraLight.scenePrimitives.lights.map((light: any) => light.name)).toContain('KeyLight');
        expect(checks.cameraLight.scenePrimitives.lights.find((light: any) => light.name === 'KeyLight').intensity).toBeCloseTo(4.5);
        expect(checks.cameraLight.scenePrimitives.helpers.length).toBeGreaterThanOrEqual(2);
    }

    if (fixtureName === 'local-time-samples-usda') {
        expect(checks.timeSamples.stageMetadata.startTimeCode).toBe(1);
        expect(checks.timeSamples.stageMetadata.endTimeCode).toBe(48);
        expect(checks.timeSamples.before.meshCount).toBe(1);
        expect(checks.timeSamples.after.meshCount).toBe(1);
        expect(checks.timeSamples.before.meshes[0].worldPosition[0]).not.toBeCloseTo(
            checks.timeSamples.after.meshes[0].worldPosition[0],
            2,
        );
    }

    if (fixtureName === 'local-usdz-nested-material') {
        expect(checks.usdzNestedMaterial.stageTypes['/World/NestedTexturedPanel'].typeName).toBe('Mesh');
        expect(checks.usdzNestedMaterial.stageTypes['/World/Looks/NestedTextured'].typeName).toBe('Material');
        expect(checks.usdzNestedMaterial.meshState.visibleMeshCount).toBe(1);
        expect(checks.usdzNestedMaterial.meshState.visibleTexturedMaterialCount).toBeGreaterThan(0);
        expect(checks.usdzNestedMaterial.geometryState.maxPositionCount).toBe(6);
    }
}
