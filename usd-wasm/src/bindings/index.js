/**
 * @type {Promise<import("..").USD> | null}
 */
let usd_module_promise = null;

/**
 * @type {Promise<import("..").getUsdModule> | null}
 */
let node_get_usd_module_promise = null;

function isNodeRuntime() {
    return !!globalThis.process?.versions?.node && globalThis.process?.type !== "renderer";
}

async function getNodeUsdModuleFn() {
    if (node_get_usd_module_promise) {
        return node_get_usd_module_promise;
    }

    node_get_usd_module_promise = (async () => {
        const [
            { createRequire },
            { readFile, writeFile, mkdtemp },
            { dirname, join },
            { tmpdir },
            { fileURLToPath },
        ] = await Promise.all([
            import(/* @vite-ignore */ "node:module"),
            import(/* @vite-ignore */ "node:fs/promises"),
            import(/* @vite-ignore */ "node:path"),
            import(/* @vite-ignore */ "node:os"),
            import(/* @vite-ignore */ "node:url"),
        ]);

        const sourcePath = fileURLToPath(new URL("./emHdBindings.js", import.meta.url));
        const tempDir = await mkdtemp(join(tmpdir(), "needle-usd-bindings-"));
        const cjsPath = join(tempDir, "emHdBindings.cjs");
        await writeFile(cjsPath, await readFile(sourcePath));

        const require = createRequire(import.meta.url);
        const getUsdModuleFn = require(cjsPath);
        getUsdModuleFn.__needleUsdBindingsDir = dirname(sourcePath);
        return getUsdModuleFn;
    })();

    return node_get_usd_module_promise;
}

async function ensureBrowserBindingsImported() {
    if (globalThis["NEEDLE:USD:GET"]) {
        return;
    }
    await import("./emHdBindings.js");
}


/**
 * @param {undefined | import("..").GetUsdModuleOptions} opts
 */
export async function getUsdModule(opts) {

    if (usd_module_promise) {
        return usd_module_promise;
    }


    if (isNodeRuntime()) {
        const [
            { join },
            getUsdModuleFn,
        ] = await Promise.all([
            import(/* @vite-ignore */ "node:path"),
            getNodeUsdModuleFn(),
        ]);

        return usd_module_promise = getUsdModuleFn({
            ...opts,
            locateFile: (file) => {
                const userResult = opts?.locateFile?.(file);
                if (userResult) {
                    return userResult;
                }
                return join(getUsdModuleFn.__needleUsdBindingsDir, file);
            },
        });
    }

    await ensureBrowserBindingsImported();

    /**
     * @type {import("..").getUsdModule}
     */
    const getUsdModuleFn = globalThis["NEEDLE:USD:GET"];
    if (!getUsdModuleFn) {
        throw new Error("\"NEEDLE:USD:GET\" not found in globalThis - please modify \"emHdBindings.js\" and add: globalThis[\"NEEDLE:USD:GET\"] = getUsdModule;");
    }

    /**
     * We use a async import here because otherwise sveltekit vite complains about unknown file extensions (e.g. .wasm)
     */
    const bindingsPromise = await Promise.all([
        /** @ts-ignore */
        import(`./emHdBindings.js?url`),
        /** @ts-ignore */
        import(`./emHdBindings.wasm?url`),
    ]);
    const [bindings, wasm] = bindingsPromise;
    const assetFetches = new Map();

    /**
     * @param {{ url?: string, state?: string, loaded?: number, total?: number, error?: string }} detail
     */
    function handleAssetFetchProgress(detail) {
        const url = detail.url ?? "";
        if (url) {
            if (detail.state === "done" || detail.state === "error") {
                assetFetches.delete(url);
            }
            else {
                assetFetches.set(url, detail);
            }
        }

        let loaded = 0;
        let total = 0;
        for (const entry of assetFetches.values()) {
            const entryLoaded = entry.loaded ?? 0;
            loaded += entryLoaded;
            total += Math.max(entry.total ?? 0, entryLoaded);
        }

        const payload = {
            url,
            state: detail.state ?? "progress",
            loaded: detail.loaded ?? 0,
            total: detail.total ?? 0,
            error: detail.error,
            active: assetFetches.size,
            loadedTotal: loaded,
            totalBytes: total,
        };

        opts?.onAssetFetchProgress?.(payload);
    }

    return usd_module_promise = getUsdModuleFn({
        mainScriptUrlOrBlob: bindings.default,// "./emHdBindings.js",
        ...opts,
        onAssetFetchProgress: handleAssetFetchProgress,
        setStatus: (status) => {
            // TODO: would be nice to have a progress event
            // for now we parse the log 'Downloading data... (219516/849069)'
            if (opts?.onDownloadProgress && status.includes("Downloading data...")) {
                const start = status.indexOf("(");
                const end = status.indexOf("/");
                const start2 = status.indexOf("/", end);
                const end2 = status.indexOf(")", start2);
                const startNum = parseInt(status.substring(start + 1, end));
                const endNum = parseInt(status.substring(end + 1, end2));
                opts.onDownloadProgress(startNum, endNum);
            }
            if (opts?.setStatus) opts.setStatus(status);
            else console.debug("🧊 USD STATUS", status);
        },
        locateFile: (file) => {
            // if (opts?.debug === true) console.warn("LOCATE FILE:", file)

            const userResult = opts?.locateFile?.(file);
            if (userResult) {
                return userResult;
            }

            /** resolved filepath */
            let res = null;

            if (file.includes("emHdBindings.wasm")) {
                res = wasm.default;
            }
            // if (url?.startsWith("data:text/javascript;base64")) {
            //     // we're client side and Buffer and atob are not available
            //     // so we need to convert the base64 to a blob
            //     const base64 = url.split(",")[1];
            //     const binary = atob(base64);
            //     const bytes = new Uint8Array(binary.length);
            //     for (let i = 0; i < binary.length; i++) {
            //         bytes[i] = binary.charCodeAt(i);
            //     }

            // }

            return res ?? file;
        },
        getPreloadedPackage(name, size) {
            const userResult = opts?.getPreloadedPackage?.(name, size);
            if (userResult) return userResult;
            return null;
        },
    });
}

/**
 * @param {import("..").USD} USD
 * @returns {import("..").OpenUsdBuildInfo}
 */
export function getOpenUsdBuildInfo(USD) {
    return JSON.parse(USD.GetBuildInfoJson());
}

/**
 * @param {undefined | import("..").GetUsdModuleOptions} opts
 * @returns {Promise<import("..").OpenUsdBuildInfo>}
 */
export async function loadOpenUsdBuildInfo(opts) {
    return getOpenUsdBuildInfo(await getUsdModule(opts));
}
