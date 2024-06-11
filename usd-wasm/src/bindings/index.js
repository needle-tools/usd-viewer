import "./emHdBindings.js";

// import base64 from "base64-js";

// See https://github.com/dimforge/rapier.js/blob/master/rapier-compat/src3d/init.ts#L11

// @ts-ignore
import mainScripUrl from "./emHdBindings.js?url";

// @ts-ignore
import wasmUrl from "./emHdBindings.wasm?url";

// @ts-ignore
import workerUrl from "./emHdBindings.worker.js?url";

// @ts-ignore
import dataUrl from "./emHdBindings.data?url";


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

    // const module = await import(`./emHdBindings.js?url`)
    // console.log("EMHDBINDINGS", module);


    // const wasm = await fetch(wasmUrl).then(r => r.arrayBuffer());
    // const data = await fetch(dataUrl).then(r => r.arrayBuffer());

    return getUsdModuleFn({
        mainScriptUrlOrBlob: mainScripUrl,// "./emHdBindings.js",
        ...opts,
        locateFile: (file) => {
            const userResult = opts?.locateFile?.(file);
            if (userResult) {
                return userResult;
            }
            if (file.includes("emHdBindings.wasm")) {
                return wasmUrl;
            }
            if (file.includes("emHdBindings.worker.js")) {
                return workerUrl;
            }
            if (file.includes("emHdBindings.data")) {
                return dataUrl;
            }
            return file;
        },
        // getPreloadedPackage(name, size) {
        //     // const res = opts?.getPreloadedPackage?.(name, size);
        //     // if (res) return res;

        //     // if (name === "emHdBindings.data") {
        //     //     return data;
        //     // }
        //     return null;
        // },
    });
}