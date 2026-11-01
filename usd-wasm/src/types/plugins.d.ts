

export type PluginContext = {
    debug?: boolean,
    /**
     * Include asynchronous material generation and texture assignment in the
     * Hydra handle's ready() promise and Needle Engine loader completion.
     * Otherwise geometry and authored constants appear first, with textures
     * updating the same materials as they arrive.
     * Defaults to false.
     */
    waitForMaterials?: boolean,
    onAssetFetchProgress?: import("./create.three.js").createThreeHydraConfig["onAssetFetchProgress"],
    maxTextureSize?: number,
    getMaxTextureSize?: (url:string) => number | undefined,
    resolveTextureUrl?: import("./create.three.js").createThreeHydraConfig["resolveTextureUrl"],
    /**
     * OpenUSD refinement complexity for subdivision surfaces; see
     * createThreeHydraConfig.complexity (includes "adaptive"). Defaults to "low" (1.0).
     */
    complexity?: import("./create.three.js").createThreeHydraConfig["complexity"],
    /**
     * Start USD timeline playback after loading. Defaults to false; applications
     * such as viewers should opt in when they want autoplay behavior.
     */
    autoPlay?: boolean,
    getFiles: () => Array<import("./create.three.js").HydraFile>,
    scenePrimitiveLightIntensityScale?: number,
    /** Self-hosted Three Basis decoder directory, with trailing slash. Required for KTX2 with Three r160; modern Three defaults to its bundled decoder assets. */
    ktx2TranscoderPath?: string,
    /** Read the current source's light preview scale for every load. */
    getScenePrimitiveLightIntensityScale?: (url: string) => number | undefined,
    getComplexity?: (url: string) => import("./create.three.js").createThreeHydraConfig["complexity"] | undefined,
}


export declare function addPluginForNeedleEngine(options: PluginContext): Promise<(() => void)>;

export declare function getHydraHandleFromNeedleEngineAsset(asset: unknown): import("./create.three.js").NeedleThreeHydraHandle | null;
