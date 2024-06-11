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
        throw new Error("\"NEEDLE:USD:GET\" not found in globalThis");
    }

    /**
     * We use a async import here because otherwise sveltekit vite complains about unknown file extensions (e.g. .wasm)
     */
    const bindingsPromise = await Promise.all([
        /** @ts-ignore */
        import(`./emHdBindings.js?url`),
        /** @ts-ignore */
        import(`./emHdBindings.data?url`),
        /** @ts-ignore */
        import(`./emHdBindings.worker.js?url`),
        /** @ts-ignore */
        import(`./emHdBindings.wasm?url`),
    ]);
    const [bindings, data, worker, wasm] = bindingsPromise;

    // const module = await import(`./emHdBindings.js?url`)
    // console.log("EMHDBINDINGS", module);


    // const wasm = await fetch(wasmUrl).then(r => r.arrayBuffer());
    // const data = await fetch(dataUrl).then(r => r.arrayBuffer());

    return getUsdModuleFn({
        mainScriptUrlOrBlob: bindings.default,// "./emHdBindings.js",
        setStatus: (status) => {
            console.warn("STATUS", status);
        },
        ...opts,
        locateFile: (file) => {
            const userResult = opts?.locateFile?.(file);
            if (userResult) {
                return userResult;
            }
            if (opts?.debug === true) console.warn("LOCATE FILE:", file)
            if (file.includes("emHdBindings.data")) {
                return data.default;
            }
            if (file.includes("emHdBindings.wasm")) {
                return wasm.default;
                // return wasmUrl;
            }
            if (file.includes("emHdBindings.worker.js")) {
                return worker.default;
                // return workerUrl;
            }
            return file;
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