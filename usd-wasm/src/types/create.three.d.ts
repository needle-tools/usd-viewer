import { Object3D } from "three"
import { HdWebSyncDriver, USD, USDStage } from ".."

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
    files?: Array<HydraFile>,
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
    /** Redraw the current USD stage after imperative stage edits.
     */
    refresh: () => Promise<void>,
    /** Rebuild Hydra population for the current USD stage after composition edits.
     */
    repopulate: () => Promise<void>,
    /** Run an imperative USD stage edit after the current draw settles, then repopulate and redraw.
     */
    editStage: <T>(callback: (stage: USDStage, driver: HdWebSyncDriver) => T | Promise<T>) => Promise<T | undefined>,
    /** Resolves after the initial Hydra draw has settled.
     */
    ready: () => Promise<void>,
    /** Resolves when asynchronous material generation and texture assignment have settled.
     */
    materialsReady: () => Promise<void>,
    /** Returns lightweight delegate diagnostics for smoke tests and debugging.
     */
    diagnostics: () => Record<string, unknown>,
    /** Dispose the Three Hydra delegate.
     */
    dispose: () => Promise<void>,
}

export declare class USDLoadingManager {
    static setURLModifier(callback: (url: string) => string): void;
    static urlModifier: (url: string) => string;
}

/**
 * Creates a new three.js hydra handle.
 */
export function createThreeHydra(config: createThreeHydraConfig): Promise<NeedleThreeHydraHandle>
