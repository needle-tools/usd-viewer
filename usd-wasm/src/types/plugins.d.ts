

export type PluginContext = {
    debug?: boolean,
    /**
     * Include asynchronous material generation and texture assignment in the
     * Hydra handle's ready() promise. Defaults to false.
     */
    waitForMaterials?: boolean,
    /**
     * Hydra fallback refinement level for subdivision surfaces.
     * Defaults to OpenUSD's low-complexity behavior, 0.
     */
    refineLevel?: number,
    getFiles: () => Array<import("../types").HydraFile>
}


export declare function addPluginForNeedleEngine(options: PluginContext): Promise<(() => void)>;

export declare function getHydraHandleFromNeedleEngineAsset(asset: unknown): import("../types").NeedleThreeHydraHandle | null;
