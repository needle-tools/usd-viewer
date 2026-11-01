import { Object3D } from "three"
import { HydraRenderer, WebGpuSupport, MaterialXVolumeFactory, UsdVolumeFactory } from "./hydra.js"
import { HdWebSyncDriver, USD, USDStage } from "./bindings.js"

export declare type HydraFile = File & { path: string };

export type UsdExportProgress = {
    phase: 'preparing' | 'dependencies' | 'packaging' | 'reading' | 'compressing' | 'complete';
    /** Per-phase work, not a fabricated overall percentage. Zero total is indeterminate. */
    completed: number;
    total: number;
};
export type UsdExportOptions = { onProgress?: (progress: UsdExportProgress) => void };

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

    /** Host render scene. Defaults to scene. */
    renderScene?: Object3D,

    /**
     * Host renderer used by integrations that need access outside the normal
     * Object3D render path. Gaussian splats require WebGLRenderer; bounded
     * MaterialX volumes require WebGPURenderer with antialias: false.
     */
    renderer?: HydraRenderer,
    /** Create with createWebGpuSupport from @needle-tools/usd/renderers for WebGPURenderer surfaces. */
    webGpuSupport?: WebGpuSupport,

    /** Optional bounded-volume support from @needle-tools/usd/volumes. Requires a compatible node renderer. */
    materialXVolumeFactory?: MaterialXVolumeFactory,
    /** Optional OpenVDB field renderer from @needle-tools/usd/volumes. */
    usdVolumeFactory?: UsdVolumeFactory,

    /** Called when an asynchronous render integration needs another frame. */
    requestRender?: () => void,
    /** Report HTTP texture transfers, including indeterminate downloads. */
    onAssetFetchProgress?: (progress: {url:string, state:string, loaded:number, total:number, error?:string}) => void,
    /** Choose a texture URL before downloading it, e.g. a catalog's published resolution variants. */
    resolveTextureUrl?: (url:string) => string | Promise<string>,
    /** Optional raster texture size cap. Originals are preserved by default; HDR/data/compressed textures retain their decoder format. */
    maxTextureSize?: number,

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
     * OpenUSD refinement complexity for subdivision surfaces.
     * Accepts OpenUSD's standard names ("low", "medium", "high", "veryhigh")
     * or a numeric UsdImagingGL complexity value for uniform refinement.
     * "adaptive" evaluates the exact limit surface with per-edge,
     * curvature-driven (camera-independent) tessellation, crack-free across
     * faces and bounded by the "veryhigh" triangle count. Defaults to "low" (1.0).
     */
    complexity?: "low" | "medium" | "high" | "veryhigh" | "very-high" | "adaptive" | number,

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
    /** Self-hosted Three Basis decoder directory, with trailing slash. Required for KTX2 with Three r160; modern Three defaults to its bundled decoder assets. */
    ktx2TranscoderPath?: string,

    /**
     * Include asynchronous material generation and texture assignment in ready().
     * Defaults to false so stage loading and first draw are not blocked by materials.
     * Call handle.materialsReady() when you need an explicit material barrier.
     */
    waitForMaterials?: boolean,

    /**
     * Start advancing USD stage time from update().
     * Defaults to false for static viewers. Animated viewers can opt in here
     * or call handle.setPlaying(true).
     */
    autoPlay?: boolean,
}

/**
 * Use the hydra handle to update the usd scene periodically.
 */
export declare type NeedleThreeHydraHandle = {
    /** Public root-relative file paths; use with readStageAsset/readStageLayer. */
    sourcePaths: import('./sources.js').StageSourcePaths,
    /** Rendered stage root, including the stage up-axis transform. */
    readonly scene: Object3D,
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
    /** Changes after synchronized edits, explicit refresh or population changes. */
    readonly revision: number,
    /** Stage time represented by the last completed Hydra draw. */
    readonly renderedTime: number,
    /** Resolve a raycast's Hydra path and rendered instance index into authored USD identity. */
    resolvePick(renderPath: string, instanceIndex?: number): Promise<{path: string; instances: {path: string; index: number; id?: string}[]} | null>,
    /** Resolve selected authored subtrees/instance contexts to indices in one rendered mesh. */
    resolveSelection(renderPath: string, count: number, selections: readonly {path: string; instances?: readonly {path: string; index: number; id?: string}[]}[]): Promise<number[] | null>,
    /** Change the visible USD geometry purposes for the current Hydra view.
     */
    setIncludedPurposes: (includedPurposes: Array<"default" | "render" | "proxy" | "guide" | string>) => Promise<void>,
    /** Set the OpenUSD imaging complexity for subdivision refinement and redraw.
     */
    setComplexity: (complexity: createThreeHydraConfig["complexity"]) => Promise<void>,
    /** Rebuild Hydra population for the current USD stage after composition edits.
     */
    repopulate: () => Promise<void>,
    /** Run an imperative USD stage edit after the current draw settles, then redraw.
     * USD object-change notices and Hydra dirty/resync processing drive the update.
     */
    editStage: <T>(callback: (stage: USDStage, driver: HdWebSyncDriver) => T | Promise<T>) => Promise<T | undefined>,
    /** Inspect after pending native draws and stage operations, pausing animation
     * until the callback settles. Does not refresh or change the scene revision.
     * The callback must not author or enqueue another handle operation, and must
     * not retain native wrappers. Rejects if the stage closes before completion. */
    readStage: <T>(callback: (stage: USDStage, driver: HdWebSyncDriver) => T | Promise<T>) => Promise<T>,
    /** Resolves after the initial Hydra draw has settled.
     * If createThreeHydra was called with waitForMaterials, also waits for
     * asynchronous material generation and texture assignment.
     */
    ready: () => Promise<void>,
    /** Self-contained USDZ with authored layers, variants, animation and unsaved
     * root/layer edits. Serialized after pending editStage operations. */
    exportUsdz(options?: UsdExportOptions): Promise<Uint8Array>,
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
