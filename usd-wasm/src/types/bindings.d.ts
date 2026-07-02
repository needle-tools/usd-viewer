
declare type FSNode = {
    contents: ArrayLike,
    id: number,
    mode: number,
    name: string,
    timestamp: number,
    isFolder: boolean,
    isDevice: boolean,
    read: boolean,
    write: boolean,
}

declare type MaybePromise<T> = T | Promise<T>

declare type USD = {
    FS_createDataFile: (parent: string, filepath: string, data: Uint8Array, canRead: boolean, canWrite: boolean, canOwn: boolean) => FSNode,
    FS_createPath: (parent: string, path: string, canRead: boolean, canWrite: boolean) => FSNode,
    FS_unlink: (path: string) => void,
    FS_readdir: (path: string) => string[],
    FS_rmdir: (path: string) => void,
    FS_analyzePath: (path: string) => FSNode,
    CreateStage: (path: string) => USDStage,
    OpenStage: (path: string) => MaybePromise<USDStage>,
    ReleaseStage: (stage: USDStage) => boolean,
    CreateUsdzPackage: (assetPath: string, usdzPath: string) => MaybePromise<boolean>,
    GetBuildInfoJson: () => string,
    ReadFile: (path: string) => Uint8Array,
    HdWebSyncDriver: new (delegate: hydraDelegate, filepath: string) => HdWebSyncDriver,
    flushPendingDeletes: () => void,
    ready: Promise<any>,
    debug: boolean;
    calledRun: boolean;
    stderr: any;
    stdin: any;
    stdout: any;
};

export type OpenUsdBuildInfo = {
    schema: 1,
    openusd: {
        version: string,
        pxrVersion: number,
        gitSha: string,
        gitDirty: boolean,
    },
    toolchain: {
        emscripten: string,
        cxxCompiler: string,
        cmakeBuildType: string,
    },
    modules: {
        usdImaging: boolean,
        hydraBridge: boolean,
        materialX: boolean,
        openSubdiv: boolean,
        usdDraco: boolean,
        usdGltf: boolean,
        usdGltfDraco: boolean,
    },
    dependencies: {
        openSubdiv: {
            version: string,
        },
        materialX: {
            prefix: string,
            gitSha: string,
            gitDirty: boolean,
        },
        usdGltf: {
            prefix: string,
            gitSha: string,
            gitDirty: boolean,
            draco: boolean,
        },
        emsdk: {
            gitSha: string,
            gitDirty: boolean,
        },
    },
}

// Generated in OpenUSD from pxr/usdImaging/hdEmscripten/bindgen/core-bindings.json.
// Keep this core USD surface in sync with the generated usd-core-bindings.d.ts.
declare type IntVector = {
    size(): number,
    get(index: number): number,
    delete(): void,
}

declare type DoubleVector = {
    size(): number,
    get(index: number): number,
    delete(): void,
}

declare type StringVector = {
    size(): number,
    get(index: number): string,
    delete(): void,
}

declare type USDPrimVector = {
    size(): number,
    get(index: number): USDPrim,
    delete(): void,
}

declare type USDAttributeVector = {
    size(): number,
    get(index: number): USDAttribute,
    delete(): void,
}

declare type USDRelationshipVector = {
    size(): number,
    get(index: number): USDRelationship,
    delete(): void,
}

declare type USDLayerOffset = {
    offset: number,
    scale: number,
    isIdentity: boolean,
}

declare type USDLayerInfo = {
    identifier: string,
    displayName: string,
    realPath: string,
}

declare type USDSpecStackEntry = {
    path: string,
    layer: USDLayerInfo,
    layerOffset?: USDLayerOffset,
    metadata: Record<string, string>,
    specifier?: string,
    typeName?: string,
    name?: string,
}

declare type USDSpecStack = USDSpecStackEntry[]

declare type USDResolveInfo = {
    source: "None" | "Fallback" | "Default" | "TimeSamples" | "ValueClips" | "Spline" | "Unknown",
    hasAuthoredValueOpinion: boolean,
    hasAuthoredValue: boolean,
    valueIsBlocked: boolean,
    valueSourceMightBeTimeVarying: boolean,
    hasNextWeakerInfo: boolean,
}

declare type USDPcpNode = {
    arcType?: string,
    path?: string,
    pathAtIntroduction?: string,
    layerStackIdentifier?: string,
    children?: USDPcpNode[],
}

declare type USDPrimIndex = {
    isValid: boolean,
    rootNode?: USDPcpNode,
}

declare type USDCompositionArc = {
    arcType: string,
    targetLayer: USDLayerInfo,
    targetPrimPath: string,
    introducingLayer: USDLayerInfo,
    introducingPrimPath: string,
    isImplicit: boolean,
    isAncestral: boolean,
    hasSpecs: boolean,
    isIntroducedInRootLayerStack: boolean,
    isIntroducedInRootLayerPrimSpec: boolean,
}

declare type USDObjectsChangedNotice = {
    resyncedPaths: string[],
    changedInfoOnlyPaths: string[],
    resolvedAssetPathsResyncedPaths: string[],
    changedFields: Record<string, string[]>,
}

declare type USDLayer = {
    GetIdentifier(): string,
    GetDisplayName(): string,
    GetRealPath(): string,
    ExportToString(): string,
    Export(path: string): boolean,
    Save(): boolean,
}

declare type USDAttribute = {
    IsValid(): boolean,
    GetName(): string,
    GetPath(): string,
    GetTypeName(): string,
    GetAllMetadata(): Record<string, string>,
    GetMetadataString(key: string): string,
    HasAuthoredMetadata(key: string): boolean,
    GetValueString(): string,
    GetValueStringAtTime(timeCode: number): string,
    GetConnections(): StringVector,
    GetResolveInfo(timeCode: number): USDResolveInfo,
    HasAuthoredValue(): boolean,
    HasAuthoredValueOpinion(): boolean,
    GetNumTimeSamples(): number,
    GetTimeSamples(): DoubleVector,
    GetPropertyStack(timeCode: number): USDSpecStack,
    GetPropertyStackWithLayerOffsets(timeCode: number): USDSpecStack,
    SetBool(value: boolean, timeCode: number): boolean,
    SetInt(value: number, timeCode: number): boolean,
    SetFloat(value: number, timeCode: number): boolean,
    SetDouble(value: number, timeCode: number): boolean,
    SetString(value: string, timeCode: number): boolean,
    SetToken(value: string, timeCode: number): boolean,
    AddConnection(path: string): boolean,
    SetColor3f(r: number, g: number, b: number, timeCode: number): boolean,
    SetVec3f(x: number, y: number, z: number, timeCode: number): boolean,
    SetVec3d(x: number, y: number, z: number, timeCode: number): boolean,
    SetMatrix4d(m00: number, m01: number, m02: number, m03: number, m10: number, m11: number, m12: number, m13: number, m20: number, m21: number, m22: number, m23: number, m30: number, m31: number, m32: number, m33: number, timeCode: number): boolean,
}

declare type USDRelationship = {
    IsValid(): boolean,
    GetName(): string,
    GetPath(): string,
    GetAllMetadata(): Record<string, string>,
    GetMetadataString(key: string): string,
    HasAuthoredMetadata(key: string): boolean,
    GetPropertyStack(timeCode: number): USDSpecStack,
    GetPropertyStackWithLayerOffsets(timeCode: number): USDSpecStack,
    GetTargets(): StringVector,
    AddTarget(path: string): boolean,
    ClearTargets(removeSpec: boolean): boolean,
}

declare type USDPrim = {
    IsValid(): boolean,
    GetName(): string,
    GetPath(): string,
    GetTypeName(): string,
    GetDisplayName(): string,
    GetAllMetadata(): Record<string, string>,
    GetMetadataString(key: string): string,
    HasAuthoredMetadata(key: string): boolean,
    GetSpecifier(): string,
    IsActive(): boolean,
    SetActive(active: boolean): boolean,
    ApplyAPI(schemaIdentifier: string): boolean,
    IsDefined(): boolean,
    IsAbstract(): boolean,
    IsInstance(): boolean,
    IsInPrototype(): boolean,
    IsPrototype(): boolean,
    IsLoaded(): boolean,
    HasAuthoredPayloads(): boolean,
    HasAuthoredReferences(): boolean,
    HasAuthoredInherits(): boolean,
    HasAuthoredSpecializes(): boolean,
    HasAuthoredInstanceable(): boolean,
    Load(): MaybePromise<void>,
    Unload(): MaybePromise<void>,
    AddPayload(assetPath: string, primPath: string): boolean,
    GetParent(): USDPrim,
    GetChildren(): USDPrimVector,
    GetAttributes(): USDAttributeVector,
    GetRelationships(): USDRelationshipVector,
    GetPropertyNames(): StringVector,
    GetPrimStack(): USDSpecStack,
    GetPrimStackWithLayerOffsets(): USDSpecStack,
    GetPrimIndex(): USDPrimIndex,
    GetCompositionArcs(): USDCompositionArc[],
    GetAttribute(name: string): USDAttribute,
    CreateAttribute(name: string, typeName: string, custom: boolean): USDAttribute,
    GetRelationship(name: string): USDRelationship,
    CreateRelationship(name: string, custom: boolean): USDRelationship,
    AddVariant(variantSetName: string, variantName: string): boolean,
    SetVariantSelection(variantSetName: string, variantName: string): MaybePromise<boolean>,
    GetVariantSelection(variantSetName: string): string,
    ClearVariantSelection(variantSetName: string): boolean,
    BlockVariantSelection(variantSetName: string): boolean,
    GetVariantSetNames(): StringVector,
    GetVariantNames(variantSetName: string): StringVector,
    DefinePrimInVariant(variantSetName: string, variantName: string, path: string, typeName: string): USDPrim,
}

declare type USDStage = {
    GetRootLayer(): USDLayer,
    GetPseudoRoot(): USDPrim,
    GetPrimAtPath(path: string): USDPrim,
    DefinePrim(path: string, typeName: string): USDPrim,
    Traverse(): USDPrimVector,
    TraverseAll(): USDPrimVector,
    GetLayerStack(includeSessionLayers: boolean): USDLayerInfo[],
    GetUsedLayers(includeClipLayers: boolean): USDLayerInfo[],
    GetCompositionErrors(): string[],
    RegisterObjectsChanged(callback: (notice: USDObjectsChangedNotice) => void): number,
    RevokeObjectsChanged(listenerId: number): boolean,
    GetStartTimeCode(): number,
    GetEndTimeCode(): number,
    GetTimeCodesPerSecond(): number,
    SetStartTimeCode(timeCode: number): void,
    SetEndTimeCode(timeCode: number): void,
    SetTimeCodesPerSecond(timeCodesPerSecond: number): void,
    GetUpAxis(): number,
    SetUpAxis(upAxis: string): boolean,
    Export(path: string): boolean,
    ExportToString(): string,
}

declare type HdWebSyncDriver = {
    getFile: (path: string, cb: (loadedFile: ArrayBufferLike) => void) => void,
    HasStage(): boolean,
    GetStage(): USDStage,
    GetStageUpAxis(): number,
    GetStageStartTimeCode(): number,
    GetStageEndTimeCode(): number,
    GetStageTimeCodesPerSecond(): number,
    SetIncludedPurposes(includedPurposes: string[]): void,
    SetTime(timecode: number): void,
    GetTime(): number,
    Draw(): MaybePromise<void>,
    Repopulate(): MaybePromise<void>,

    /** ??? */
    clone(): HdWebSyncDriver,
    /** ??? */
    delete(): void,
    /** ??? */
    deleteLater(): void,
    isDeleted(): boolean,
    /** ??? */
    isAliasOf(): boolean,
}

export type GetUsdModuleOptions = {
    debug?: boolean,
    mainScriptUrlOrBlob?: string,
    wasmBinary?: ArrayBufferLike,
    locateFile?: (path: string) => string,
    getPreloadedPackage?: (file: string, size: number) => ArrayBuffer | null,
    setStatus?: (status: string) => void,
    onDownloadProgress?: (downloaded: number, total: number) => void,
    onAssetFetchProgress?: (progress: {
        url: string,
        state: "start" | "progress" | "done" | "error" | string,
        loaded: number,
        total: number,
        active: number,
        loadedTotal: number,
        totalBytes: number,
        error?: string,
    }) => void,
    /** Returns a transferable object that can be resolved to an ArrayBuffer, 
     *  or an URL that can be fetched to get an ArrayBuffer.
    */
    urlModifier?: (url: string) =>
        Promise<
            ArrayBuffer | File | FileSystemFileHandle | FileSystemFileEntry | string
        > | ArrayBuffer | File | FileSystemFileHandle | FileSystemFileEntry | string,
}

/**
 * Loads the USD Module.
 * @example
 * ```javascript
 * getUsdModule({ mainScriptUrlOrBlob: "/emHdBindings.js" }).then(USD => { ... })
 * ```
 */
export function getUsdModule(opts?: GetUsdModuleOptions): Promise<USD>;
export function getOpenUsdBuildInfo(USD: USD): OpenUsdBuildInfo;
export function loadOpenUsdBuildInfo(opts?: GetUsdModuleOptions): Promise<OpenUsdBuildInfo>;

export type USDRoot = {}
