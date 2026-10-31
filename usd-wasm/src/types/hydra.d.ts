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

/** Optional support from @needle-tools/usd/renderers; keeps modern Three modules out of the base loader. */
export interface WebGpuSupport {
    SurfaceMaterial: new () => Material;
    /** Initialize area-light lookup tables before a scene containing rect/disk emitters is rendered. */
    prepareAreaLights?(): Promise<void>;
    createParticleField?(data: {
      positions: Float32Array; orientations: Float32Array; scales: Float32Array; opacities: Float32Array;
      degree: number; coefficients: Float32Array; projectionModeHint: string; sortingModeHint: string;
    }): Promise<Object3D & { dispose(): void }>;
    createMaterialXMaterial: MaterialXVolumeFactory;
    configurePreviewPrimvars(material: Material): void;
    configureStrokeMaterial?(material: Material): void;
}
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
    includedPurposes?: string[],
    renderScene?: Object3D,
    scenePrimitiveRoot?: Object3D,
    renderer?: HydraRenderer,
    webGpuSupport?: WebGpuSupport,
    /** Opt in with createMaterialXVolumeMaterial from @needle-tools/usd/volumes. */
    materialXVolumeFactory?: MaterialXVolumeFactory,
    usdVolumeFactory?: UsdVolumeFactory,
    requestRender?: () => void,
    showScenePrimitiveHelpers?: boolean,
    showCameraHelpers?: boolean,
    showLightHelpers?: boolean,
    /** Overall light multiplier after UsdLux unit conversion. Legacy default 0.01; use 1 for authored luminance. Dome environments use their authored intensity independently. */
    scenePrimitiveLightIntensityScale?: number,
    /** Self-hosted Three Basis decoder directory, with trailing slash. Required for KTX2 with Three r160; modern Three defaults to its bundled decoder assets. */
    ktx2TranscoderPath?: string,
    rootFile?: string,
    /** Paths for resolving textures */
    paths?: string[],
    /** @deprecated */
    envMap?: Texture,
}
export declare class threeJsRenderDelegate implements hydraDelegate {
    constructor(config: threeJsRenderDelegateConfig);
    setIncludedPurposes(purposes: string[]): void;
    isRenderTagIncluded(tag?: string): boolean;
    createRPrim(typeId: string, id: string, instancerId: unknown): object;
    createSPrim(typeId: string, id: string): object | undefined;
    CommitResources(): void;
}
