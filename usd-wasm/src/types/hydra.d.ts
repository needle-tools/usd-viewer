import { Material, Object3D, Texture, WebGLRenderer } from 'three';
import { HdWebSyncDriver, USD } from './bindings';

/** Node renderer capabilities used by bounded MaterialX volumes. */
export type HydraRenderer = WebGLRenderer | {
    readonly isWebGPURenderer: boolean,
    readonly samples: number,
};

export type MaterialXVolumeFactory = (xml: string, target: string | number, options: {
    renderer?: HydraRenderer,
    getTexture?: (url: string) => Texture | null | Promise<Texture | null>,
}) => Promise<Material>;

export class hydraDelegate { }






export const consoleRenderDelegate: hydraDelegate = {}






export type threeJsRenderDelegateConfig = {
    driver: () => HdWebSyncDriver,
    USD?: USD,
    usdRoot: Object3D,
    renderScene?: Object3D,
    scenePrimitiveRoot?: Object3D,
    renderer?: HydraRenderer,
    /** Opt in with createMaterialXVolumeMaterial from @needle-tools/usd/volumes. */
    materialXVolumeFactory?: MaterialXVolumeFactory,
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
export class threeJsRenderDelegate extends hydraDelegate {
    constructor(path: string, config: threeJsRenderDelegateConfig)
}
