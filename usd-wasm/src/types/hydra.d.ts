import { Material, Object3D, Texture, WebGLRenderer } from 'three';
import { HdWebSyncDriver, USD } from './bindings.js';

/** Node renderer capabilities used by bounded MaterialX volumes. */
export type HydraRenderer = WebGLRenderer | {
    readonly isWebGPURenderer: boolean,
    readonly samples: number,
};

export type MaterialXVolumeFactory = (xml: string, target: string | number, options: {
    renderer?: HydraRenderer,
    getTexture?: (url: string) => Texture | null | Promise<Texture | null>,
}) => Promise<Material>;

export type UsdVolumeField = { name: string, fieldName: string, filePath: string, resolvedPath?: string, resolvedUrl?: string };
export type UsdVolumeFactory = (state: { fields: UsdVolumeField[] }, options: {
    renderer?: HydraRenderer,
    readFile: (field: UsdVolumeField) => Promise<ArrayBuffer>,
}) => Promise<Object3D>;

export interface hydraDelegate {
    createRPrim(typeId: string, id: string, instancerId: unknown): object;
    createSPrim(typeId: string, id: string): object | undefined;
    CommitResources(): void;
}






export declare const consoleRenderDelegate: hydraDelegate;






export type threeJsRenderDelegateConfig = {
    driver: () => HdWebSyncDriver,
    USD?: USD,
    usdRoot: Object3D,
    renderScene?: Object3D,
    scenePrimitiveRoot?: Object3D,
    renderer?: HydraRenderer,
    /** Opt in with createMaterialXVolumeMaterial from @needle-tools/usd/volumes. */
    materialXVolumeFactory?: MaterialXVolumeFactory,
    usdVolumeFactory?: UsdVolumeFactory,
    requestRender?: () => void,
    showScenePrimitiveHelpers?: boolean,
    showCameraHelpers?: boolean,
    showLightHelpers?: boolean,
    scenePrimitiveLightIntensityScale?: number,
    rootFile?: string,
    /** Paths for resolving textures */
    paths?: string[],
    /** @deprecated */
    envMap?: Texture,
}
export declare class threeJsRenderDelegate implements hydraDelegate {
    constructor(config: threeJsRenderDelegateConfig);
    createRPrim(typeId: string, id: string, instancerId: unknown): object;
    createSPrim(typeId: string, id: string): object | undefined;
    CommitResources(): void;
}
