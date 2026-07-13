import { Object3D, Texture, WebGLRenderer } from 'three';
import { HdWebSyncDriver, USD } from './bindings';

export class hydraDelegate { }






export const consoleRenderDelegate: hydraDelegate = {}






export type threeJsRenderDelegateConfig = {
    driver: () => HdWebSyncDriver,
    USD?: USD,
    usdRoot: Object3D,
    renderScene?: Object3D,
    scenePrimitiveRoot?: Object3D,
    renderer?: WebGLRenderer,
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
