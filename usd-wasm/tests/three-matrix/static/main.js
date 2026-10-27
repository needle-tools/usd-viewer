const config = window.__USD_THREE_MATRIX_CONFIG__;
const errors = [];
const warnings = [];
const originalError = console.error.bind(console);
const originalWarn = console.warn.bind(console);

window.__USD_THREE_MATRIX_ERRORS__ = errors;
window.__USD_THREE_MATRIX_WARNINGS__ = warnings;
setPhase("boot");

console.warn = (...args) => {
    warnings.push(args.map(value => typeof value === "string" ? value : value?.message || String(value)).join(" "));
    originalWarn(...args);
};

console.error = (...args) => {
    warnings.push(args.map(value => typeof value === "string" ? value : value?.message || String(value)).join(" "));
    originalError(...args);
};

window.addEventListener("error", event => {
    errors.push(event.message || String(event.error || event));
});
window.addEventListener("unhandledrejection", event => {
    errors.push(event.reason?.message || String(event.reason || event));
});

try {
    setPhase("import-three");
    const THREE = await import("three");
    setPhase("create-renderer");
    const rendererResult = await createRenderer(THREE);
    const renderer = rendererResult.renderer;
    if (!renderer) {
        exposeUnsupported(rendererResult.unsupportedReason || "Renderer mode is not available in this Three runtime or browser.");
    }
    else {
        const backendType = getRendererBackendType(renderer);
        if (config.rendererMode === "webgpu" && !backendType.startsWith("webgpu")) {
            renderer?.dispose?.();
            exposeUnsupported(`WebGPU native initialized with ${backendType} backend.`);
        }
        else {
            setPhase("ready");
            window.__USD_THREE_MATRIX__ = {
                status: "ready",
                rendererMode: config.rendererMode,
                rendererClass: renderer.constructor?.name ?? null,
                backendType,
                runSuite: () => runSuite(THREE, renderer),
            };
        }
    }
}
catch (error) {
    setPhase("load-error");
    window.__USD_THREE_MATRIX_ERROR__ = error?.stack || error?.message || String(error);
}

function setPhase(phase) {
    window.__USD_THREE_MATRIX_PHASE__ = phase;
}

async function createRenderer(THREE) {
    const canvas = document.getElementById("c");
    if (config.rendererMode === "webgl") {
        return { renderer: new THREE.WebGLRenderer({ canvas, antialias: false }) };
    }

    if (!config.webgpuConfigured) return { renderer: null };
    if (config.rendererMode === "webgpu-force-webgl2" && !config.forceWebGLSupported) return { renderer: null };
    if (config.rendererMode === "webgpu" && !navigator.gpu) {
        return { renderer: null, unsupportedReason: "navigator.gpu is not available." };
    }

    try {
        const WebGPURenderer = await getWebGPURenderer(THREE);
        if (!WebGPURenderer) return { renderer: null };
        const renderer = new WebGPURenderer({
            canvas,
            antialias: false,
            forceWebGL: config.rendererMode === "webgpu-force-webgl2",
        });
        await renderer.init?.();
        return { renderer };
    }
    catch (error) {
        return {
            renderer: null,
            unsupportedReason: error?.message || String(error),
        };
    }
}

async function getWebGPURenderer(THREE) {
    if (THREE.WebGPURenderer) return THREE.WebGPURenderer;
    const module = await import("three/webgpu");
    return module.WebGPURenderer || module.default || null;
}

function getRendererBackendType(renderer) {
    if (renderer.isWebGLRenderer === true) return "webgl";
    if (renderer.isWebGPURenderer === true) {
        const backend = renderer.backend;
        if (backend?.isWebGLBackend === true) return "webgl";
        if (backend?.isWebGPUBackend === true) return "webgpu";
        return backend?.constructor?.name ? `webgpu:${backend.constructor.name}` : "webgpu";
    }
    if (renderer.constructor?.name === "WebGPURenderer") {
        const backend = renderer.backend;
        if (backend?.constructor?.name?.includes("WebGL")) return "webgl";
        return backend?.constructor?.name ? `webgpu:${backend.constructor.name}` : "webgpu";
    }
    return renderer.constructor?.name || "unknown";
}

function exposeUnsupported(reason) {
    window.__USD_THREE_MATRIX__ = {
        status: "unsupported",
        rendererMode: config.rendererMode,
        backendType: "unsupported",
        unsupportedReason: reason,
    };
}

async function runSuite(THREE, renderer) {
    setPhase("suite-imports");
    const [{ createThreeHydra }, { getUsdModule }] = await Promise.all([
        import(config.createThreeUrl),
        import(config.getUsdModuleUrl),
    ]);
    setPhase("suite-get-usd-module");
    const USD = await getUsdModule({
        debug: false,
        setStatus: status => setPhase(`suite-usd-status:${status}`),
    });
    const bindingApi = {
        hdWebSyncDriver: typeof USD.HdWebSyncDriver,
        getStage: typeof USD.HdWebSyncDriver?.prototype?.GetStage,
        repopulate: typeof USD.HdWebSyncDriver?.prototype?.Repopulate,
        setIncludedPurposes: typeof USD.HdWebSyncDriver?.prototype?.SetIncludedPurposes,
        fsCreateDataFile: typeof USD.FS_createDataFile,
        fsCreatePath: typeof USD.FS_createPath,
        fsAnalyzePath: typeof USD.FS_analyzePath,
        fsReaddir: typeof USD.FS_readdir,
        fsRmdir: typeof USD.FS_rmdir,
        fsUnlink: typeof USD.FS_unlink,
        readyThen: typeof USD.ready?.then,
    };
    setPhase("suite-create-scene");
    const scene = new THREE.Scene();
    const usdRoot = new THREE.Object3D();
    scene.add(usdRoot);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 3);
    camera.updateMatrixWorld();

    setPhase("suite-fetch-fixture");
    const hydraFixture = await loadHydraFixture(config);

    setPhase("suite-create-three-hydra");
    const handle = await createThreeHydra({
        debug: false,
        USD,
        ...hydraFixture,
        complexity: config.fixtureComplexity || undefined,
        scene: usdRoot,
        showScenePrimitiveHelpers: true,
    });
    setPhase("suite-hydra-update");
    await handle?.ready?.();
    const playbackState = collectPlaybackState(handle);
    handle?.update?.(0);
    setPhase("suite-materials-ready");
    await handle?.materialsReady?.();
    setPhase("suite-render");
    handle?.update?.(0);
    renderer.render(scene, camera);
    setPhase("suite-raf");
    await new Promise(resolve => requestAnimationFrame(resolve));
    await waitForExpectedSceneState(usdRoot, config, time => {
        handle?.update?.(time);
        renderer.render(scene, camera);
    });

    const handleMethods = {
        update: typeof handle?.update,
        repopulate: typeof handle?.repopulate,
        setIncludedPurposes: typeof handle?.setIncludedPurposes,
        materialsReady: typeof handle?.materialsReady,
        dispose: typeof handle?.dispose,
    };
    const fixtureChecks = await runFixtureChecks(handle, usdRoot, config, async () => {
        await waitForExpectedSceneState(usdRoot, config, time => {
            handle?.update?.(time);
            renderer.render(scene, camera);
        });
    });
    const childCount = usdRoot.children.length;
    const sceneStats = collectSceneStats(usdRoot);

    setPhase("suite-before-dispose");
    await waitForHydraIdleFrames(handle, renderer, scene, camera);
    handle?.dispose?.();
    await new Promise(resolve => setTimeout(resolve, 50));
    renderer.dispose?.();

    setPhase("suite-complete");
    return {
        fixture: {
            name: config.fixtureName,
            url: config.fixtureUrl,
            source: config.fixtureSource,
        },
        threeRevision: THREE.REVISION,
        renderer: {
            className: renderer.constructor?.name ?? null,
            backendType: getRendererBackendType(renderer),
            rendered: true,
        },
        usd: {
            moduleReady: Boolean(USD),
            bindingApi,
            childCount,
            sceneStats,
            fixtureChecks,
            handleMethods,
            playbackState,
            hydraDiagnostics: handle?.diagnostics?.() ?? null,
        },
        diagnostics: {
            errors: [...errors],
            warnings: [...warnings],
        },
    };
}

function collectPlaybackState(handle) {
    const before = handle?.getTime?.();
    const defaultPlaying = handle?.isPlaying?.();
    handle?.update?.(1.25);
    const afterStaticUpdate = handle?.getTime?.();
    handle?.setPlaying?.(false);
    return {
        before,
        defaultPlaying,
        afterStaticUpdate,
        finalPlaying: handle?.isPlaying?.(),
    };
}

async function runFixtureChecks(handle, usdRoot, config, waitForScene) {
    const checks = {};
    if (!handle?.driver?.GetStage) return checks;

    if (config.fixtureName === "local-binding-override-variants-usda") {
        checks.beforeMaterialVariant = collectMeshMaterialState(usdRoot);
        const editPromise = handle.editStage(stage => {
            const world = stage.GetPrimAtPath("/World");
            return world.SetVariantSelection("material", "metal");
        });
        checks.materialVariantTransition = await observeVisibleMeshCountsDuring(editPromise, usdRoot);
        await handle.materialsReady();
        handle.update?.(0);
        await waitForScene();
        checks.afterMaterialVariant = collectMeshMaterialState(usdRoot);
    }

    if (config.fixtureName === "local-nested-variants-usda") {
        const stage = handle.driver.GetStage();
        const world = stage.GetPrimAtPath("/World");
        checks.beforeNestedVariant = collectMeshMaterialState(usdRoot);
        world.SetVariantSelection("shape", "cube");
        await handle.repopulate();
        await handle.materialsReady();
        handle.update?.(0);
        await waitForScene();
        checks.afterShapeVariant = collectMeshMaterialState(usdRoot);

        const shape = stage.GetPrimAtPath("/World/Shape");
        shape.SetVariantSelection("finish", "cool");
        await handle.repopulate();
        await handle.materialsReady();
        handle.update?.(0);
        await waitForScene();
        checks.afterFinishVariant = collectMeshMaterialState(usdRoot);
    }

    if (config.fixtureName === "local-cesium-man") {
        checks.cesiumTexture = collectMeshMaterialState(usdRoot);
    }

    if (
        config.fixtureName === "local-materialx-texture-noise-usda" ||
        config.fixtureName === "local-materialx-procedural-brick-usda"
    ) {
        checks.materialXTextures = collectMeshMaterialState(usdRoot);
        checks.materialXPanelGeometry = collectMeshGeometryState(usdRoot);
    }

    if (config.fixtureName === "local-preview-separate-metal-rough-usda") {
        checks.separateMetalRoughTextures = collectMeshMaterialState(usdRoot);
    }

    if (config.fixtureName === "local-catmull-clark-subdivision-usda") {
        checks.subdivision = collectMeshGeometryState(usdRoot);
    }

    if (config.fixtureName === "local-unmaterialed-empty-subset-usda") {
        checks.unmaterialedEmptySubset = {
            materials: collectMeshMaterialState(usdRoot),
            geometry: collectMeshGeometryState(usdRoot),
        };
    }

    if (config.fixtureName === "local-native-instances-usda") {
        checks.nativeInstances = {
            meshState: collectMeshMaterialState(usdRoot),
            worldState: collectMeshWorldState(usdRoot),
            stageTypes: collectStagePrimTypes(handle.driver.GetStage(), [
                "/Prototype/Shape",
                "/World/InstanceA",
                "/World/InstanceB",
            ]),
        };
    }

    if (config.fixtureName === "local-point-instancer-usda") {
        checks.pointInstancer = {
            geometryState: collectMeshGeometryState(usdRoot),
            meshState: collectMeshMaterialState(usdRoot),
            worldState: collectMeshWorldState(usdRoot),
            stageTypes: collectStagePrimTypes(handle.driver.GetStage(), [
                "/World/Scatter",
                "/World/Scatter/Prototypes/CubeProto",
                "/World/Scatter/Prototypes/SphereProto",
            ]),
        };
    }

    if (config.fixtureName === "local-reference-override-usda") {
        checks.referenceOverride = {
            meshState: collectMeshMaterialState(usdRoot),
            geometryState: collectMeshGeometryState(usdRoot),
            stageTypes: collectStagePrimTypes(handle.driver.GetStage(), [
                "/World/Referenced",
                "/World/Referenced/Shape",
            ]),
        };
    }

    if (config.fixtureName === "local-inherits-specializes-usda") {
        checks.inheritsSpecializes = {
            meshState: collectMeshMaterialState(usdRoot),
            stageTypes: collectStagePrimTypes(handle.driver.GetStage(), [
                "/World/InheritedCube/Shape",
                "/World/SpecializedBall/Shape",
            ]),
        };
    }

    if (config.fixtureName === "local-collection-binding-usda") {
        checks.collectionBinding = collectMeshMaterialState(usdRoot);
    }

    if (config.fixtureName === "local-visibility-purpose-usda") {
        checks.visibilityPurpose = {
            meshState: collectMeshMaterialState(usdRoot),
            authoredState: collectStageAttributeValues(handle.driver.GetStage(), {
                "/World/VisibleRender": ["visibility", "purpose"],
                "/World/InvisibleGuide": ["visibility", "purpose"],
            }),
        };
    }

    if (config.fixtureName === "local-purpose-render-intent-usda") {
        checks.purposeRenderIntent = {
            meshState: collectMeshMaterialState(usdRoot),
            authoredState: collectStageAttributeValues(handle.driver.GetStage(), {
                "/World/DefaultPurpose": ["purpose"],
                "/World/RenderPurpose": ["purpose"],
                "/World/ProxyPurpose": ["purpose"],
                "/World/GuidePurpose": ["purpose"],
            }),
        };
        await handle.setIncludedPurposes?.(["default", "render", "proxy", "guide"]);
        await handle.materialsReady?.();
        handle.update?.(0);
        await waitForScene();
        checks.purposeRenderIntent.afterAllPurposes = collectMeshMaterialState(usdRoot);
    }

    if (config.fixtureName === "local-camera-light-usda") {
        checks.cameraLight = {
            meshState: collectMeshMaterialState(usdRoot),
            scenePrimitives: collectScenePrimitiveState(usdRoot),
            stageTypes: collectStagePrimTypes(handle.driver.GetStage(), [
                "/World/ShotCam",
                "/World/KeyLight",
                "/World/SunLight",
                "/World/SkyLight",
                "/World/ApiLight",
                "/World/LitCube",
            ]),
        };
    }

    if (config.fixtureName === "local-time-samples-usda") {
        handle.setPlaying?.(false);
        await handle.setTime?.(1);
        const before = collectMeshWorldState(usdRoot);
        await handle.setTime?.(24);
        await new Promise(resolve => requestAnimationFrame(resolve));
        const after = collectMeshWorldState(usdRoot);
        checks.timeSamples = {
            before,
            after,
            stageMetadata: handle.stageMetadata?.() ?? null,
        };
    }

    if (config.fixtureName === "local-usdz-nested-material") {
        checks.usdzNestedMaterial = {
            meshState: collectMeshMaterialState(usdRoot),
            geometryState: collectMeshGeometryState(usdRoot),
            stageTypes: collectStagePrimTypes(handle.driver.GetStage(), [
                "/World/NestedTexturedPanel",
                "/World/Looks/NestedTextured",
            ]),
        };
    }

    return checks;
}

async function loadHydraFixture(config) {
    if (Array.isArray(config.fixtureFiles) && config.fixtureFiles.length) {
        const files = [];
        for (const fixtureFile of config.fixtureFiles) {
            const response = await fetch(fixtureFile.url);
            if (!response.ok) {
                throw new Error(`Failed to fetch fixture file ${fixtureFile.url}: ${response.status} ${response.statusText}`);
            }
            const buffer = await response.arrayBuffer();
            const path = fixtureFile.path;
            const name = path.split('/').pop() || path;
            files.push({
                name,
                path,
                arrayBuffer: async () => buffer,
            });
        }
        return { files };
    }

    const fixtureResponse = await fetch(config.fixtureUrl);
    if (!fixtureResponse.ok) {
        throw new Error(`Failed to fetch fixture ${config.fixtureUrl}: ${fixtureResponse.status} ${fixtureResponse.statusText}`);
    }
    const fixtureBuffer = await fixtureResponse.arrayBuffer();
    return {
        url: `matrix-fixtures/${config.fixtureName}.usdz`,
        buffer: fixtureBuffer,
    };
}

function collectSceneStats(root) {
    const stats = {
        objects: 0,
        meshes: 0,
        instancedMeshes: 0,
        cameras: 0,
        lights: 0,
        helpers: 0,
        geometriesWithPosition: 0,
        materials: 0,
        materialXMaterials: 0,
        meshPhysicalMaterials: 0,
        materialTextures: 0,
        namedMaterials: [],
        textureNames: [],
    };

    root.traverse?.(object => {
        stats.objects++;
        if (object.isCamera) stats.cameras++;
        if (object.isLight) stats.lights++;
        if (object.type?.includes?.("Helper")) stats.helpers++;
        if (isUsdScenePrimitiveDescendant(object)) return;
        if (!object.isMesh) return;
        stats.meshes++;
        if (object.isInstancedMesh) stats.instancedMeshes++;
        if (getPositionAttribute(object.geometry)?.count > 0) {
            stats.geometriesWithPosition++;
        }
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
            if (!material) continue;
            stats.materials++;
            if (material.constructor?.name === "MaterialXMaterial") stats.materialXMaterials++;
            if (material.isMeshPhysicalMaterial) stats.meshPhysicalMaterials++;
            if (material.name && stats.namedMaterials.length < 20) stats.namedMaterials.push(material.name);
            for (const texture of collectMaterialTextures(material)) {
                stats.materialTextures++;
                if (texture.name && stats.textureNames.length < 20) stats.textureNames.push(texture.name);
            }
        }
    });

    return stats;
}

async function observeVisibleMeshCountsDuring(operation, root) {
    let done = false;
    const counts = [];
    const visibleDefaultMaterialCounts = [];
    const wrapped = Promise.resolve(operation).finally(() => {
        done = true;
    });

    while (!done) {
        const state = collectMeshMaterialState(root);
        counts.push(state.visibleMeshCount);
        visibleDefaultMaterialCounts.push(state.visibleDefaultMaterialCount);
        await new Promise(resolve => requestAnimationFrame(resolve));
    }

    await wrapped;
    const state = collectMeshMaterialState(root);
    counts.push(state.visibleMeshCount);
    visibleDefaultMaterialCounts.push(state.visibleDefaultMaterialCount);
    return {
        counts,
        visibleDefaultMaterialCounts,
        minVisibleMeshCount: Math.min(...counts),
        maxVisibleDefaultMaterialCount: Math.max(...visibleDefaultMaterialCounts),
    };
}

function collectMeshMaterialState(root) {
    const meshes = [];
    root.traverse?.(object => {
        if (isUsdScenePrimitiveDescendant(object)) return;
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        meshes.push({
            name: object.name || "",
            visible: Boolean(object.visible),
            instanced: Boolean(object.isInstancedMesh),
            instanceCount: object.isInstancedMesh ? object.count : 0,
            materialArray: Array.isArray(object.material),
            renderTag: object.userData?.usdRenderTag || "",
            materials: materials.filter(Boolean).map(material => ({
                name: material.name || "",
                color: material.color?.getHexString?.() || null,
                metalness: material.metalness ?? null,
                roughness: material.roughness ?? null,
                hasMap: Boolean(material.map),
                hasRoughnessMap: Boolean(material.roughnessMap),
                hasMetalnessMap: Boolean(material.metalnessMap),
                hasAoMap: Boolean(material.aoMap),
                roughnessMapName: material.roughnessMap?.name || "",
                metalnessMapName: material.metalnessMap?.name || "",
                aoMapName: material.aoMap?.name || "",
                roughnessAndMetalnessShareMap: Boolean(material.roughnessMap && material.roughnessMap === material.metalnessMap),
                occlusionRoughnessMetalnessShareMap: Boolean(material.aoMap && material.roughnessMap && material.metalnessMap && material.aoMap === material.roughnessMap && material.roughnessMap === material.metalnessMap),
                textureCount: collectMaterialTextures(material).length,
            })),
        });
    });
    return {
        meshCount: meshes.length,
        visibleMeshCount: meshes.filter(mesh => mesh.visible).length,
        meshes,
        materialNames: meshes.flatMap(mesh => mesh.materials.map(material => material.name)),
        visibleMaterialNames: meshes.filter(mesh => mesh.visible).flatMap(mesh => mesh.materials.map(material => material.name)),
        visibleDefaultMaterialCount: meshes
            .filter(mesh => mesh.visible)
            .flatMap(mesh => mesh.materials)
            .filter(material => material.name === "DefaultMaterial").length,
        texturedMaterialCount: meshes.flatMap(mesh => mesh.materials).filter(material => material.hasMap).length,
        visibleTexturedMaterialCount: meshes.filter(mesh => mesh.visible).flatMap(mesh => mesh.materials).filter(material => material.hasMap).length,
        textureCount: meshes.flatMap(mesh => mesh.materials).reduce((count, material) => count + material.textureCount, 0),
    };
}

function collectMeshGeometryState(root) {
    const meshes = [];
    root.traverse?.(object => {
        if (isUsdScenePrimitiveDescendant(object)) return;
        if (!object.isMesh) return;
        meshes.push({
            name: object.name || "",
            positionCount: getPositionAttribute(object.geometry)?.count ?? 0,
            indexCount: object.geometry?.index?.count ?? 0,
            groupCount: object.geometry?.groups?.length ?? 0,
            bounds: object.geometry?.boundingBox ? {
                min: object.geometry.boundingBox.min.toArray(),
                max: object.geometry.boundingBox.max.toArray(),
            } : null,
        });
    });
    return {
        meshCount: meshes.length,
        meshes,
        maxPositionCount: Math.max(0, ...meshes.map(mesh => mesh.positionCount)),
        maxAbsBound: Math.max(
            0,
            ...meshes.flatMap(mesh => mesh.bounds ? [...mesh.bounds.min, ...mesh.bounds.max].map(Math.abs) : []),
        ),
    };
}

function collectMeshWorldState(root) {
    root.updateMatrixWorld?.(true);
    const meshes = [];
    root.traverse?.(object => {
        if (isUsdScenePrimitiveDescendant(object)) return;
        if (!object.isMesh) return;
        if (object.isInstancedMesh) {
            const matrixArray = object.instanceMatrix?.array ?? [];
            for (let i = 0; i < object.count; i++) {
                const offset = i * 16;
                meshes.push({
                    name: `${object.name || ""}#${i}`,
                    visible: Boolean(object.visible),
                    instanced: true,
                    worldPosition: [
                        matrixArray[offset + 12] ?? 0,
                        matrixArray[offset + 13] ?? 0,
                        matrixArray[offset + 14] ?? 0,
                    ],
                });
            }
            return;
        }
        const elements = object.matrixWorld?.elements ?? [];
        meshes.push({
            name: object.name || "",
            visible: Boolean(object.visible),
            instanced: false,
            worldPosition: [elements[12] ?? 0, elements[13] ?? 0, elements[14] ?? 0],
        });
    });
    const visibleMeshes = meshes.filter(mesh => mesh.visible);
    return {
        meshCount: meshes.length,
        visibleMeshCount: visibleMeshes.length,
        meshes,
        visibleMaxAbsX: Math.max(0, ...visibleMeshes.map(mesh => Math.abs(mesh.worldPosition[0]))),
        visibleXPositions: visibleMeshes.map(mesh => Number(mesh.worldPosition[0].toFixed(3))).sort((a, b) => a - b),
    };
}

async function waitForExpectedSceneState(root, config, update) {
    const start = performance.now();
    let stats = collectSceneStats(root);
    while (!isExpectedSceneStateReady(root, stats, config) && performance.now() - start < 30_000) {
        await new Promise(resolve => setTimeout(resolve, 50));
        update?.(0);
        stats = collectSceneStats(root);
    }
    return stats;
}

function isExpectedSceneStateReady(root, stats, config) {
    if (!config.fixtureExpectedRenderable) {
        return true;
    }
    if (stats.meshes === 0 || stats.geometriesWithPosition === 0) {
        return false;
    }
    if (config.fixtureExpectedMaterialXMaterials > 0 && stats.materialXMaterials < config.fixtureExpectedMaterialXMaterials) {
        return false;
    }
    if (config.fixtureName === "local-catmull-clark-subdivision-usda" && collectMeshGeometryState(root).maxPositionCount <= 36) {
        return false;
    }
    if (config.fixtureName === "local-native-instances-usda") {
        const meshState = collectMeshMaterialState(root);
        const visibleInstancedMesh = meshState.meshes.find(mesh => mesh.visible && mesh.instanced);
        return Boolean(visibleInstancedMesh && visibleInstancedMesh.instanceCount === 2);
    }
    if (config.fixtureName === "local-point-instancer-usda") {
        const meshState = collectMeshMaterialState(root);
        const visibleMeshes = meshState.meshes.filter(mesh => mesh.visible);
        return visibleMeshes.length === 2 && visibleMeshes.every(mesh => mesh.instanced);
    }
    return true;
}

async function waitForHydraIdleFrames(handle, renderer, scene, camera) {
    for (let i = 0; i < 3; i++) {
        handle?.update?.(0);
        renderer.render(scene, camera);
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}

function getPositionAttribute(geometry) {
    return geometry?.attributes?.position || geometry?.getAttribute?.("position") || null;
}

function isUsdScenePrimitiveDescendant(object) {
    for (let current = object; current; current = current.parent) {
        if (current.userData?.usdScenePrimitiveRoot) {
            return true;
        }
    }
    return false;
}

function collectScenePrimitiveState(root) {
    root.updateMatrixWorld?.(true);
    const cameras = [];
    const lights = [];
    const helpers = [];
    root.traverse?.(object => {
        const elements = object.matrixWorld?.elements ?? [];
        const entry = {
            name: object.name || "",
            type: object.type || "",
            usdPath: object.userData?.usdPath || "",
            usdTypeName: object.userData?.usdTypeName || "",
            worldPosition: [elements[12] ?? 0, elements[13] ?? 0, elements[14] ?? 0],
        };
        if (object.isCamera) cameras.push(entry);
        if (object.isLight) lights.push({
            ...entry,
            intensity: object.intensity ?? null,
            color: object.color?.getHexString?.() ?? null,
        });
        if (object.type?.includes?.("Helper")) helpers.push(entry);
    });
    return { cameras, lights, helpers };
}

function collectStagePrimTypes(stage, paths) {
    const types = {};
    for (const path of paths) {
        const prim = stage.GetPrimAtPath(path);
        types[path] = {
            valid: Boolean(prim?.IsValid?.()),
            typeName: prim?.IsValid?.() ? prim.GetTypeName() : "",
        };
    }
    return types;
}

function collectStageAttributeValues(stage, primAttributeMap) {
    const values = {};
    for (const [path, attributes] of Object.entries(primAttributeMap)) {
        const prim = stage.GetPrimAtPath(path);
        values[path] = {};
        for (const attributeName of attributes) {
            const attribute = prim?.IsValid?.() ? prim.GetAttribute(attributeName) : null;
            values[path][attributeName] = attribute?.IsValid?.() ? attribute.GetValueString() : "";
        }
    }
    return values;
}

function collectMaterialTextures(material) {
    const textures = [];
    const seen = new Set();
    const visit = (value, depth) => {
        if (!value || typeof value !== "object" || seen.has(value) || depth > 5) return;
        seen.add(value);
        if (value.isTexture) {
            textures.push(value);
            return;
        }
        if (value.value && typeof value.value === "object") visit(value.value, depth + 1);
        if (value.uniforms && typeof value.uniforms === "object") {
            for (const uniform of Object.values(value.uniforms)) visit(uniform, depth + 1);
        }
        if (depth < 2) {
            for (const entry of Object.values(value)) visit(entry, depth + 1);
        }
    };
    visit(material, 0);
    return textures;
}
