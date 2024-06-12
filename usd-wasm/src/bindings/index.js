import "./emHdBindings.js";

// See https://github.com/dimforge/rapier.js/blob/master/rapier-compat/src3d/init.ts#L11

// @ts-ignore
// import mainScripUrl from "./emHdBindings.js?url";

// // @ts-ignore
// import wasmUrl from "./emHdBindings.wasm?url";

// // @ts-ignore
// import workerUrl from "./emHdBindings.worker.js?url";

// // @ts-ignore
// import dataUrl from "./emHdBindings.data?url";


/**
 * @param {undefined | import("..").GetUsdModuleOptions} opts
 */
export async function getUsdModule(opts) {

    /**
     * @type {import("..").getUsdModule}
     */
    const getUsdModuleFn = globalThis["NEEDLE:USD:GET"];

    if (!getUsdModuleFn) {
        throw new Error("\"NEEDLE:USD:GET\" not found in globalThis - please modify \" + emHdBindings.js + \" to expose this function in the globalThis object");
    }


    // HACK for worker import: \"Cannot use import statement outside a module\""
    // https://github.com/vitejs/vite/issues/6979

    // @ts-ignore
    const isProd = import.meta.env.PROD;


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


    // const wasm = await fetch(wasmUrl).then(r => r.arrayBuffer());
    // const data = await fetch(dataUrl).then(r => r.arrayBuffer());

    return getUsdModuleFn({
        mainScriptUrlOrBlob: bindings.default,// "./emHdBindings.js",
        setStatus: (status) => {
            console.log("USD STATUS", status);
        },
        ...opts,
        locateFile: (file) => {
            if (opts?.debug === true) console.warn("LOCATE FILE:", file)

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
            // if (name.includes("emHdBindings.data")) {
            //     if (data.byteLength !== size) {
            //         throw new Error(`emHdBindings.data size mismatch: expected ${size}, got ${data.byteLength}\n${dataUrl}`);
            //     }
            //     return data;
            // }
            return null;
        },
    });
}