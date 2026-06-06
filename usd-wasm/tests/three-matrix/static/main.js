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
    setPhase("suite-create-scene");
    const scene = new THREE.Scene();
    const usdRoot = new THREE.Object3D();
    scene.add(usdRoot);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 3);
    camera.updateMatrixWorld();

    setPhase("suite-create-three-hydra");
    const handle = await createThreeHydra({
        debug: false,
        USD,
        url: config.fixtureUrl,
        scene: usdRoot,
    });
    setPhase("suite-hydra-update");
    handle?.update?.(0);
    setPhase("suite-render");
    renderer.render(scene, camera);
    setPhase("suite-raf");
    await new Promise(resolve => requestAnimationFrame(resolve));

    const handleMethods = {
        update: typeof handle?.update,
        dispose: typeof handle?.dispose,
    };
    handle?.dispose?.();
    renderer.dispose?.();

    setPhase("suite-complete");
    return {
        threeRevision: THREE.REVISION,
        renderer: {
            className: renderer.constructor?.name ?? null,
            backendType: getRendererBackendType(renderer),
            rendered: true,
        },
        usd: {
            moduleReady: Boolean(USD),
            childCount: usdRoot.children.length,
            handleMethods,
        },
        diagnostics: {
            errors: [...errors],
            warnings: [...warnings],
        },
    };
}
