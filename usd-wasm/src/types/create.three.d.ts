import { Scene } from "three"
import { HdWebSyncDriver, USD } from ".."

export declare type HydraFile = File & { path: string };

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

    /**
     * The scene to be loaded as the root of the USD stage.
     */
    scene: Object3D,

    /**
     * Files to be loaded into the virtual file system.
     * The first file will be loaded as the root file, others will be loaded as dependencies.
     */
    files: Array<HydraFile>,
}

/**
 * Use the hydra handle to update the usd scene periodically.
 */
export declare type NeedleThreeHydraHandle = {
    /** The hydra driver
    */
    driver: HdWebSyncDriver,
    /** Call update periodically to update the usd scene.
     * @param dt The delta time since the last update.
     */
    update: (dt: number) => void,
    /** Call this to update the usd scene immediately.
     * @param dt The delta time since the last update.
     */
    dispose: () => void,
}

export declare class USDLoadingManager {
    static setURLModifier(callback: (url: string) => string): void;
    static urlModifier: (url: string) => string;
}

/**
 * Creates a new three.js hydra handle.
 */
export function createThreeHydra(config: createThreeHydraConfig): Promise<NeedleThreeHydraHandle>