

export type PluginContext = {
    debug?: boolean,
    getFiles: () => Array<import("../types").HydraFile>
}


export declare function addPluginForNeedleEngine(options: PluginContext): Promise<void>;
