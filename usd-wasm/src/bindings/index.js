import { getUsdModule as _getUsdModule } from "./emHdBindings";

/**
 * @param {undefined | { mainScriptUrlOrBlob: string }} opts
 */
export function getUsdModule(opts) {
    return _getUsdModule({
        mainScriptUrlOrBlob: "/emHdBindings.js",
        ...opts,
    });
}