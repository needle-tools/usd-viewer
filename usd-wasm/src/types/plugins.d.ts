

export type PluginContext = {
    debug?: boolean,
    getFiles: () => Array<import("../types").HydraFile>
}


export declare function addPluginForNeedleEngine(options: PluginContext): Promise<(() => void)>;

export declare function getHydraHandleFromNeedleEngineAsset(asset: unknown): import("../types").NeedleThreeHydraHandle | null;
