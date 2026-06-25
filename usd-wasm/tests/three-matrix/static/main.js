const config = window.__USD_THREE_MATRIX_CONFIG__;
const errors = [];
const warnings = [];
const originalWarn = console.warn.bind(console);

window.__USD_THREE_MATRIX_ERRORS__ = errors;
window.__USD_THREE_MATRIX_WARNINGS__ = warnings;
setPhase("boot");

console.warn = (...args) => {
    warnings.push(args.map(value => typeof value === "string" ? value : value?.message || String(value)).join(" "));
    originalWarn(...args);
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
        scene: usdRoot,
    });
    setPhase("suite-hydra-update");
    handle?.update?.(0);
    setPhase("suite-materials-ready");
    await handle?.materialsReady?.();
    setPhase("suite-render");
    handle?.update?.(0);
    renderer.render(scene, camera);
    setPhase("suite-raf");
    await new Promise(resolve => requestAnimationFrame(resolve));

    const handleMethods = {
        update: typeof handle?.update,
        repopulate: typeof handle?.repopulate,
        materialsReady: typeof handle?.materialsReady,
        dispose: typeof handle?.dispose,
    };
    const fixtureChecks = await runFixtureChecks(handle, usdRoot, config);
    const childCount = usdRoot.children.length;
    const sceneStats = collectSceneStats(usdRoot);

    handle?.dispose?.();
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
            hydraDiagnostics: handle?.diagnostics?.() ?? null,
        },
        diagnostics: {
            errors: [...errors],
            warnings: [...warnings],
        },
    };
}

async function runFixtureChecks(handle, usdRoot, config) {
    const checks = {};
    if (!handle?.driver?.GetStage) return checks;

    if (config.fixtureName === "local-binding-override-variants-usda") {
        const stage = handle.driver.GetStage();
        const world = stage.GetPrimAtPath("/World");
        checks.beforeMaterialVariant = collectMeshMaterialState(usdRoot);
        world.SetVariantSelection("material", "metal");
        await handle.repopulate();
        await handle.materialsReady();
        handle.update?.(0);
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
        checks.afterShapeVariant = collectMeshMaterialState(usdRoot);

        const shape = stage.GetPrimAtPath("/World/Shape");
        shape.SetVariantSelection("finish", "cool");
        await handle.repopulate();
        await handle.materialsReady();
        handle.update?.(0);
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
    }

    if (config.fixtureName === "local-catmull-clark-subdivision-usda") {
        checks.subdivision = collectMeshGeometryState(usdRoot);
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
        if (!object.isMesh) return;
        stats.meshes++;
        if (object.geometry?.attributes?.position?.count > 0) {
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

function collectMeshMaterialState(root) {
    const meshes = [];
    root.traverse?.(object => {
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        meshes.push({
            name: object.name || "",
            materials: materials.filter(Boolean).map(material => ({
                name: material.name || "",
                color: material.color?.getHexString?.() || null,
                metalness: material.metalness ?? null,
                roughness: material.roughness ?? null,
                hasMap: Boolean(material.map),
                textureCount: collectMaterialTextures(material).length,
            })),
        });
    });
    return {
        meshCount: meshes.length,
        meshes,
        materialNames: meshes.flatMap(mesh => mesh.materials.map(material => material.name)),
        texturedMaterialCount: meshes.flatMap(mesh => mesh.materials).filter(material => material.hasMap).length,
        textureCount: meshes.flatMap(mesh => mesh.materials).reduce((count, material) => count + material.textureCount, 0),
    };
}

function collectMeshGeometryState(root) {
    const meshes = [];
    root.traverse?.(object => {
        if (!object.isMesh) return;
        meshes.push({
            name: object.name || "",
            positionCount: object.geometry?.attributes?.position?.count ?? 0,
            indexCount: object.geometry?.index?.count ?? 0,
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
