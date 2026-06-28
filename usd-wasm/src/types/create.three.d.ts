import { Object3D } from "three"
import { HdWebSyncDriver, USD, USDStage } from ".."

export declare type HydraFile = File & { path: string };

export declare type NeedleThreeHydraStageMetadata = {
    upAxis: string,
    startTimeCode: number,
    endTimeCode: number,
    timeCodesPerSecond: number,
}

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

    /**
     * USD geometry purposes to include in the Hydra render pass.
     * Defaults to ["default", "render"].
     */
    includedPurposes?: Array<"default" | "render" | "proxy" | "guide" | string>,

    /**
     * Add Three.js helper objects for USD cameras and lights.
     * The cameras and lights themselves are created through Hydra Sprim sync either way.
     */
    showScenePrimitiveHelpers?: boolean,

    /**
     * Add Three.js CameraHelper objects for USD Camera prims.
     */
    showCameraHelpers?: boolean,

    /**
     * Add Three.js light helper objects for USD light prims.
     */
    showLightHelpers?: boolean,

    /**
     * Preview scale used when applying USD Lux intensity values to Three lights.
     * Defaults to 0.01. USD intensity and exposure are still authored values; this
     * only controls the helper/demo Three light brightness.
     */
    scenePrimitiveLightIntensityScale?: number,

    /**
     * Include asynchronous material generation and texture assignment in ready().
     * Defaults to false so stage loading and first draw are not blocked by materials.
     * Call handle.materialsReady() when you need an explicit material barrier.
     */
    waitForMaterials?: boolean,
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
    /** Set the current USD stage time code and redraw.
     */
    setTime: (timeCode: number) => Promise<void>,
    /** Return the current USD stage time code used by Hydra.
     */
    getTime: () => number,
    /** Enable or disable automatic playback in update().
     */
    setPlaying: (playing: boolean) => void,
    /** Return whether update() is currently advancing stage time.
     */
    isPlaying: () => boolean,
    /** Redraw the current USD stage after imperative stage edits.
     */
    refresh: () => Promise<void>,
    /** Change the visible USD geometry purposes for the current Hydra view.
     */
    setIncludedPurposes: (includedPurposes: Array<"default" | "render" | "proxy" | "guide" | string>) => Promise<void>,
    /** Rebuild Hydra population for the current USD stage after composition edits.
     */
    repopulate: () => Promise<void>,
    /** Run an imperative USD stage edit after the current draw settles, then repopulate and redraw.
     */
    editStage: <T>(callback: (stage: USDStage, driver: HdWebSyncDriver) => T | Promise<T>) => Promise<T | undefined>,
    /** Resolves after the initial Hydra draw has settled.
     * If createThreeHydra was called with waitForMaterials, also waits for
     * asynchronous material generation and texture assignment.
     */
    ready: () => Promise<void>,
    /** Resolves when asynchronous material generation and texture assignment have settled.
     */
    materialsReady: () => Promise<void>,
    /** Returns lightweight delegate diagnostics for smoke tests and debugging.
     */
    diagnostics: () => Record<string, unknown>,
    /** Returns root-stage metadata captured before the first Hydra draw.
     */
    stageMetadata: () => NeedleThreeHydraStageMetadata,
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
