const config = window.__USD_NEEDLE_ENGINE_MATRIX_CONFIG__;
const errors = [];
const warnings = [];
const originalError = console.error.bind(console);
const originalWarn = console.warn.bind(console);

window.__USD_NEEDLE_ENGINE_MATRIX_ERRORS__ = errors;
setPhase("boot");

console.warn = (...args) => {
    warnings.push(args.map(formatConsoleValue).join(" "));
    originalWarn(...args);
};

console.error = (...args) => {
    warnings.push(args.map(formatConsoleValue).join(" "));
    originalError(...args);
};

window.addEventListener("error", event => {
    errors.push(event.message || String(event.error || event));
});
window.addEventListener("unhandledrejection", event => {
    errors.push(event.reason?.message || String(event.reason || event));
});

try {
    setPhase("import-runtime");
    const [NEEDLE, THREE, usd, usdThree, usdPlugins] = await Promise.all([
        import("@needle-tools/engine"),
        import("three"),
        import("@needle-tools/usd"),
        import("@needle-tools/usd/three"),
        import("@needle-tools/usd/plugins"),
    ]);
    const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");

    setPhase("load-usd-module");
    const USD = await usd.getUsdModule({
        debug: false,
        setStatus: status => setPhase(`usd-status:${status}`),
    });

    setPhase("create-hydra");
    const scene = new THREE.Scene();
    const usdRoot = new THREE.Object3D();
    scene.add(usdRoot);
    const buffer = await fetch(config.fixtureUrl).then(response => {
        if (!response.ok) throw new Error(`Failed to fetch fixture: ${response.status} ${response.url}`);
        return response.arrayBuffer();
    });
    const handle = await usdThree.createThreeHydra({
        debug: false,
        USD,
        buffer,
        url: config.fixtureUrl,
        scene: usdRoot,
    });

    setPhase("update");
    handle?.update?.(0);
    await handle?.materialsReady?.();
    handle?.update?.(0);

    const sceneStats = collectSceneStats(usdRoot);
    const buildInfo = usd.getOpenUsdBuildInfo(USD);
    handle?.dispose?.();

    setPhase("needle-plugin-load");
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    document.body.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    const pluginContext = new NEEDLE.Context({
        name: "usd-needle-plugin-matrix",
        domElement: canvas,
        renderer,
    });
    await pluginContext.create({ files: [] });
    const removeUsdPlugin = await usdPlugins.addPluginForNeedleEngine({
        debug: false,
        getFiles: () => [],
    });
    const pluginModel = await NEEDLE.loadAsset(config.fixtureUrl, { context: pluginContext });
    const pluginHydraHandle = usdPlugins.getHydraHandleFromNeedleEngineAsset(pluginModel);
    for (let i = 0; i < 4; i++) {
        pluginContext.update(i / 60, null);
    }
    const pluginRoot = pluginModel?.scene ?? pluginModel?.root ?? pluginModel ?? pluginContext.scene;
    const pluginStats = collectSceneStats(pluginRoot);
    removeUsdPlugin();
    renderer.dispose();
    canvas.remove();

    setPhase("complete");
    window.__USD_NEEDLE_ENGINE_MATRIX__ = {
        status: "ready",
        runtimeShape: config.runtimeShape,
        runtimeVersion: config.runtimeVersion,
        threeRevision: THREE.REVISION,
        engineExports: inspectExports(NEEDLE, [
            "Context",
            "GameObject",
            "Behaviour",
            "serializable",
        ]),
        addonExports: {
            OrbitControls: typeof OrbitControls,
        },
        usdExports: {
            getUsdModule: typeof usd.getUsdModule,
            createThreeHydra: typeof usdThree.createThreeHydra,
            addPluginForNeedleEngine: typeof usdPlugins.addPluginForNeedleEngine,
            getHydraHandleFromNeedleEngineAsset: typeof usdPlugins.getHydraHandleFromNeedleEngineAsset,
            hdWebSyncDriver: typeof USD.HdWebSyncDriver,
            stageGetUpAxis: typeof USD.Stage?.prototype?.GetUpAxis,
        },
        openusd: buildInfo.openusd.version,
        modules: buildInfo.modules,
        sceneStats,
        pluginStats,
        pluginHydraHandle: {
            available: Boolean(pluginHydraHandle),
            update: typeof pluginHydraHandle?.update,
            dispose: typeof pluginHydraHandle?.dispose,
        },
        diagnostics: {
            errors: [...errors],
            warnings: [...warnings],
        },
    };
}
catch (error) {
    setPhase("error");
    window.__USD_NEEDLE_ENGINE_MATRIX_ERROR__ = error?.stack || error?.message || String(error);
}

function setPhase(phase) {
    window.__USD_NEEDLE_ENGINE_MATRIX_PHASE__ = phase;
}

function formatConsoleValue(value) {
    return typeof value === "string" ? value : value?.message || String(value);
}

function inspectExports(module, names) {
    const result = {};
    for (const name of names) {
        result[name] = typeof module[name];
    }
    return result;
}

function collectSceneStats(root) {
    const stats = {
        objects: 0,
        meshes: 0,
        geometriesWithPosition: 0,
        materials: 0,
        materialTextures: 0,
    };
    root.traverse(object => {
        stats.objects++;
        if (object.isMesh || object.isInstancedMesh) {
            stats.meshes++;
            if (object.geometry?.attributes?.position?.count > 0) stats.geometriesWithPosition++;
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                if (!material) continue;
                stats.materials++;
                for (const value of Object.values(material)) {
                    if (value?.isTexture) stats.materialTextures++;
                }
            }
        }
    });
    return stats;
}
