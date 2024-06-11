import { getUsdModule as _getUsdModule } from "./emHdBindings.js";

// import base64 from "base64-js";

// See https://github.com/dimforge/rapier.js/blob/master/rapier-compat/src3d/init.ts#L11
// @ts-ignore
// import wasmUrl from "./emHdBindings.wasm?url";
// // @ts-ignore
// import dataUrl from "./emHdBindings.data?url";

/**
 * @param {undefined | { mainScriptUrlOrBlob?: string | Blob, wasmBinary?:Buffer, locateFile?: (file:string) => string }} opts
 */
export async function getUsdModule(opts) {


    // const baseurl = new URL(wasmUrl, import.meta.url).href;
    // console.log(baseurl);

    // const wasm = await fetch(wasmUrl).then(res => res.arrayBuffer());
    // const data = await fetch(dataUrl).then(res => res.arrayBuffer());



    // const wasmBuffer = await base64.toByteArray(wasmUrl).buffer

    // const blob = new Blob([`
    //     importScripts("./emHdBindings.js");
    //     `,
    // ], { type: "application/javascript" });
    // console.log(blob);

    return _getUsdModule({
        mainScriptUrlOrBlob: "./emHdBindings.js",
        // wasmBinary: wasm,
        // locateFile: (file) => {
        //     console.log(file)
        //     return "http://localhost:5174/@fs/C:/git/usd-viewer/usd-wasm/src/bindings/" + file;
        // },
        // getPreloadedPackage(name, size) {
        //     console.log("PRELOAD", name, size, data)
        //     return data;
        // },
        ...opts,
    });
}