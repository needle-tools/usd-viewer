import "./emHdBindings.js";

/**
 * @type {Promise<import("..").USD> | null}
 */
let usd_module_promise = null;


/**
 * @param {undefined | import("..").GetUsdModuleOptions} opts
 */
export async function getUsdModule(opts) {

    if (usd_module_promise) {
        return usd_module_promise;
    }


    /**
     * @type {import("..").getUsdModule}
     */
    const getUsdModuleFn = globalThis["NEEDLE:USD:GET"];

    if (!getUsdModuleFn) {
        throw new Error("\"NEEDLE:USD:GET\" not found in globalThis - please modify \"emHdBindings.js\" and add: globalThis[\"NEEDLE:USD:GET\"] = getUsdModule;");
    }


    // HACK for worker import: \"Cannot use import statement outside a module\""
    // https://github.com/vitejs/vite/issues/6979

    // @ts-ignore
    const isProd = import.meta.env?.PROD ?? true;


    /**
     * We use a async import here because otherwise sveltekit vite complains about unknown file extensions (e.g. .wasm)
     */
    const bindingsPromise = await Promise.all([
        /** @ts-ignore */
        import(`./emHdBindings.js?url`),
        /** @ts-ignore */
        import(`./emHdBindings.data?url`),
        // https://v3.vitejs.dev/guide/features.html#web-workers
        // https://github.com/vitejs/vite/issues/6979
        /** @ts-ignore */
        import(`./emHdBindings.worker.js?worker&url`),
        /** @ts-ignore */
        import(`./emHdBindings.worker.js?url`),
        /** @ts-ignore */
        import(`./emHdBindings.wasm?url`),
    ]);
    const [bindings, data, workerProd, workerDev, wasm] = bindingsPromise;
    const worker = isProd ? workerProd : workerDev;
    const preloaded_data = await fetch(data.default).then(r => r.arrayBuffer());

    return usd_module_promise = getUsdModuleFn({
        mainScriptUrlOrBlob: bindings.default,// "./emHdBindings.js",
        ...opts,
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

            if (file.includes("emHdBindings.data")) {
                res = data.default;
            }
            else if (file.includes("emHdBindings.wasm")) {
                res = wasm.default;
            }
            else if (file.includes("emHdBindings.worker.js")) {
                res = worker.default;
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

            // For debugging if the data file isnt loaded or the size might be wrong
            // Make sure to clear the vite cache. See https://linear.app/needle/issue/NE-4851#comment-2a9538e3
            if (name.includes("emHdBindings.data")) {
                if (preloaded_data.byteLength !== size) {
                    throw new Error(`emHdBindings.data size mismatch: expected ${size} but got ${preloaded_data.byteLength}\n${data.default}`);
                }
            }
            return null;
        },
    });
}