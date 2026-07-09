

export type PluginContext = {
    debug?: boolean,
    /**
     * Include asynchronous material generation and texture assignment in the
     * Hydra handle's ready() promise. Needle Engine loader completion always
     * waits for materials so engine autofit and loadfinished consumers see a
     * presentable scene.
     * Defaults to false.
     */
    waitForMaterials?: boolean,
    /**
     * OpenUSD refinement complexity for subdivision surfaces.
     * Accepts OpenUSD's standard names ("low", "medium", "high", "veryhigh")
     * or a numeric UsdImagingGL complexity value. Defaults to "low" (1.0).
     */
    complexity?: "low" | "medium" | "high" | "veryhigh" | number,
    getFiles: () => Array<import("../types").HydraFile>
}


export declare function addPluginForNeedleEngine(options: PluginContext): Promise<(() => void)>;

export declare function getHydraHandleFromNeedleEngineAsset(asset: unknown): import("../types").NeedleThreeHydraHandle | null;
