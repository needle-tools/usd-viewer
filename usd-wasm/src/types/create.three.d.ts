import { Scene } from "three"
import { HdWebSyncDriver, USD } from ".."


export declare type createThreeHydraConfig = {

    debug?: boolean,

    /**
     *  USD Module
     * @example 
     * ```javascript
     * getUsdModule({
     *  mainScriptUrlOrBlob: "/emHdBindings.js"
     * }).then(USD => { ... })
     * ```
     */
    USD: USD,

    /**
     * Optional buffer of the usdz file
     */
    buffer?: ArrayBuffer,

    url?: string,

    scene: Scene,

    /**
     * Files to be loaded into the virtual file system.
     * The first file will be loaded as the root file, others will be loaded as dependencies.
     */
    files: Array<File & { path: string }>,
}

export declare type createThreeHydraReturnType = {
    driver: HdWebSyncDriver,
    update: (dt: number) => void,
    dispose: () => void,
}

export declare class USDLoadingManager {
    static setURLModifier(callback: (url: string) => string): void;
    static urlModifier: (url: string) => string;
}

export function createThreeHydra(config: createThreeHydraConfig): Promise<createThreeHydraReturnType>