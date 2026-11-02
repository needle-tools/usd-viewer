import type { hydraDelegate } from './hydra.js';

declare type FSNode = {
    contents: ArrayLike<number>,
    id: number,
    mode: number,
    name: string,
    timestamp: number,
    isFolder: boolean,
    isDevice: boolean,
    read: boolean,
    write: boolean,
}

declare type SdfPathConstructor = {
    new(path?: string): SdfPath,
    AbsoluteRootPath(): SdfPath,
}

declare type GfVec3Constructor<T> = {
    new(): T,
    new(value: number): T,
    new(x: number, y: number, z: number): T,
}

declare type GfMatrix4dConstructor = {
    new(): GfMatrix4d,
    new(value: number): GfMatrix4d,
    Identity(): GfMatrix4d,
}

declare type UsdSchemaConstructor<T> = {
    new(): T,
    new(prim: USDPrim): T,
    Define(stage: USDStage, path: string): T,
    Get(stage: USDStage, path: string): T,
}

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
    SdfPath: SdfPathConstructor,
    GfVec3f: GfVec3Constructor<GfVec3f>,
    GfVec3d: GfVec3Constructor<GfVec3d>,
    GfMatrix4d: GfMatrix4dConstructor,
    VectorInt: new() => IntVector,
    VectorFloat: new() => FloatVector,
    VectorDouble: new() => DoubleVector,
    VectorString: new() => StringVector,
    VectorVec3f: new() => GfVec3fVector,
    VectorVec3d: new() => GfVec3dVector,
    UsdGeomXform: UsdSchemaConstructor<UsdGeomXform>,
    UsdGeomScope: UsdSchemaConstructor<UsdGeomScope>,
    UsdGeomSphere: UsdSchemaConstructor<UsdGeomSphere>,
    UsdGeomCube: UsdSchemaConstructor<UsdGeomCube>,
    UsdGeomMesh: UsdSchemaConstructor<UsdGeomMesh>,
    UsdGeomCamera: UsdSchemaConstructor<UsdGeomCamera>,
    UsdGeomXformOp: new(attr: USDAttribute, isInverseOp: boolean) => UsdGeomXformOp,
    UsdGeomXformCommonAPI: new(prim: USDPrim) => UsdGeomXformCommonAPI,
    UsdShadeMaterial: UsdSchemaConstructor<UsdShadeMaterial>,
    UsdShadeShader: UsdSchemaConstructor<UsdShadeShader>,
    UsdShadeInput: new(attr: USDAttribute) => UsdShadeInput,
    UsdShadeOutput: new(attr: USDAttribute) => UsdShadeOutput,
    UsdShadeMaterialBindingAPI: new(prim: USDPrim) => UsdShadeMaterialBindingAPI,
    HdWebSyncDriver: new (delegate: hydraDelegate, filepath: string) => HdWebSyncDriver,
    /** Asynchronous driver creation, available in the JSPI runtime. */
    CreateHdWebSyncDriver?: (delegate: hydraDelegate, filepath: string) => Promise<HdWebSyncDriver>,
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
        /** SHA-256 of the complete source patch when built from a dirty checkout. */
        sourcePatchSha256?: string,
    },
    toolchain: {
        emscripten: string,
        cxxCompiler: string,
        cmakeBuildType: string,
        /** Absent in older runtime metadata. */
        asyncRuntime?: 'ASYNCIFY' | 'JSPI',
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
declare type MaybePromise<T> = T | Promise<T>

/** @internal Low-level Emscripten std::vector wrapper, not a USD authoring API. */
declare type EmbindVector<T> = {
    size(): number,
    get(index: number): T,
    /** @internal C++ std::vector append hook exposed by embind. */
    push_back(value: T): void,
    delete(): void,
}

declare type IntVector = EmbindVector<number>

declare type FloatVector = EmbindVector<number>

declare type DoubleVector = EmbindVector<number>

declare type StringVector = EmbindVector<string>

declare type GfVec3fVector = EmbindVector<GfVec3f>

declare type GfVec3dVector = EmbindVector<GfVec3d>

declare type USDPrimVector = EmbindVector<USDPrim>

declare type USDAttributeVector = EmbindVector<USDAttribute>

declare type USDRelationshipVector = EmbindVector<USDRelationship>

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
    metadataValues: Record<string, unknown>,
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

declare type SdfPath = {
    AppendChild(childName: string): SdfPath,
    AppendProperty(propertyName: string): SdfPath,
    GetString(): string,
    GetAsString(): string,
    IsAbsolutePath(): boolean,
    delete(): void,
}

declare type GfVec3f = { GetString(): string, delete(): void }
declare type GfVec3d = { GetString(): string, delete(): void }
declare type GfMatrix4d = {
    SetTranslate(value: GfVec3d): GfMatrix4d,
    GetString(): string,
    delete(): void,
}

declare type UsdGeomXformOp = {
    GetAttr(): USDAttribute,
    IsDefined(): boolean,
    GetOpName(): string,
    GetTypeName(): string,
    Set(value: unknown, timeCode: number): boolean,
    Get(timeCode: number): MaybePromise<string>,
    GetValue(timeCode: number): MaybePromise<unknown>,
    delete(): void,
}

declare type UsdShadeInput = {
    GetAttr(): USDAttribute,
    GetFullName(): string,
    GetBaseName(): string,
    GetPrim(): USDPrim,
    GetTypeName(): string,
    Set(value: unknown, timeCode: number): boolean,
    ConnectToSource(output: UsdShadeOutput): boolean,
    ConnectToSourcePath(path: string): boolean,
    delete(): void,
}

declare type UsdShadeOutput = {
    GetAttr(): USDAttribute,
    GetFullName(): string,
    GetBaseName(): string,
    GetPrim(): USDPrim,
    GetTypeName(): string,
    Set(value: unknown, timeCode: number): boolean,
    ConnectToSource(output: UsdShadeOutput): boolean,
    ConnectToSourcePath(path: string): boolean,
    delete(): void,
}

declare type UsdShadeMaterialBindingAPI = { Bind(material: UsdShadeMaterial): boolean, delete(): void }

declare type UsdGeomXformCommonAPI = {
    SetTranslate(value: GfVec3d, timeCode: number): boolean,
    SetRotate(value: GfVec3f, timeCode: number): boolean,
    SetScale(value: GfVec3f, timeCode: number): boolean,
    delete(): void,
}

declare type USDEditTarget = {
    IsValid(): boolean,
    delete(): void,
}

declare type USDLayer = {
    GetIdentifier(): string,
    GetDisplayName(): string,
    GetRealPath(): string,
    ExportToString(): string,
    Export(path: string): boolean,
    Save(): boolean,
    GetSubLayerPaths(): string[],
    SetSubLayerPaths(paths: string[]): MaybePromise<void>,
    delete(): void,
}

declare type USDAttribute = {
    IsValid(): boolean,
    GetName(): string,
    GetPath(): string,
    GetTypeName(): string,
    GetAllMetadata(): Record<string, string>,
    GetAllMetadataValues(): Record<string, unknown>,
    GetMetadata(key: string): unknown,
    GetMetadataByDictKey(key: string, keyPath: string): unknown,
    SetMetadataByDictKey(key: string, keyPath: string, value: unknown, typeName: string): boolean,
    ClearMetadata(key: string): boolean,
    ClearMetadataByDictKey(key: string, keyPath: string): boolean,
    GetMetadataString(key: string): string,
    HasAuthoredMetadata(key: string): boolean,
    GetValueString(): MaybePromise<string>,
    GetValueStringAtTime(timeCode: number): MaybePromise<string>,
    GetConnections(): StringVector,
    GetResolveInfo(timeCode: number): MaybePromise<USDResolveInfo>,
    HasAuthoredValue(): boolean,
    HasAuthoredValueOpinion(): boolean,
    GetNumTimeSamples(): MaybePromise<number>,
    GetTimeSamples(): MaybePromise<DoubleVector>,
    GetPropertyStack(timeCode: number): MaybePromise<USDSpecStack>,
    GetPropertyStackWithLayerOffsets(timeCode: number): MaybePromise<USDSpecStack>,
    SetBool(value: boolean, timeCode: number): boolean,
    SetInt(value: number, timeCode: number): boolean,
    SetFloat(value: number, timeCode: number): boolean,
    SetDouble(value: number, timeCode: number): boolean,
    SetString(value: string, timeCode: number): boolean,
    SetToken(value: string, timeCode: number): boolean,
    Set(value: unknown, timeCode: number): boolean,
    AddConnection(path: string): boolean,
    SetColor3f(r: number, g: number, b: number, timeCode: number): boolean,
    SetVec3f(x: number, y: number, z: number, timeCode: number): boolean,
    SetVec3d(x: number, y: number, z: number, timeCode: number): boolean,
    SetMatrix4d(m00: number, m01: number, m02: number, m03: number, m10: number, m11: number, m12: number, m13: number, m20: number, m21: number, m22: number, m23: number, m30: number, m31: number, m32: number, m33: number, timeCode: number): boolean,
    SetMetadata(key: string, value: unknown): boolean,
    Get(timeCode: number): MaybePromise<unknown>,
}

declare type USDRelationship = {
    IsValid(): boolean,
    GetName(): string,
    GetPath(): string,
    GetAllMetadata(): Record<string, string>,
    GetAllMetadataValues(): Record<string, unknown>,
    GetMetadata(key: string): unknown,
    GetMetadataByDictKey(key: string, keyPath: string): unknown,
    SetMetadataByDictKey(key: string, keyPath: string, value: unknown, typeName: string): boolean,
    ClearMetadata(key: string): boolean,
    ClearMetadataByDictKey(key: string, keyPath: string): boolean,
    GetMetadataString(key: string): string,
    HasAuthoredMetadata(key: string): boolean,
    GetPropertyStack(timeCode: number): USDSpecStack,
    GetPropertyStackWithLayerOffsets(timeCode: number): USDSpecStack,
    GetTargets(): StringVector,
    AddTarget(path: string): boolean,
    ClearTargets(removeSpec: boolean): boolean,
    SetMetadata(key: string, value: unknown): boolean,
}

declare type USDPrim = {
    IsValid(): boolean,
    GetName(): string,
    GetPath(): string,
    GetTypeName(): string,
    GetDisplayName(): string,
    GetAllMetadata(): Record<string, string>,
    GetAllMetadataValues(): Record<string, unknown>,
    GetMetadata(key: string): unknown,
    GetMetadataByDictKey(key: string, keyPath: string): unknown,
    SetMetadataByDictKey(key: string, keyPath: string, value: unknown, typeName: string): MaybePromise<boolean>,
    ClearMetadata(key: string): MaybePromise<boolean>,
    ClearMetadataByDictKey(key: string, keyPath: string): MaybePromise<boolean>,
    GetMetadataString(key: string): string,
    HasAuthoredMetadata(key: string): boolean,
    GetSpecifier(): string,
    IsActive(): boolean,
    SetActive(active: boolean): MaybePromise<boolean>,
    ApplyAPI(schemaIdentifier: string): boolean,
    IsDefined(): boolean,
    IsAbstract(): boolean,
    IsInstanceable(): boolean,
    GetPrototype(): USDPrim,
    GetPrimInPrototype(): USDPrim,
    GetInstances(): USDPrimVector,
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
    AddPayload(assetPath: string, primPath: string): MaybePromise<boolean>,
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
    ClearVariantSelection(variantSetName: string): MaybePromise<boolean>,
    BlockVariantSelection(variantSetName: string): MaybePromise<boolean>,
    GetVariantSetNames(): StringVector,
    GetVariantNames(variantSetName: string): StringVector,
    DefinePrimInVariant(variantSetName: string, variantName: string, path: string, typeName: string): MaybePromise<USDPrim>,
    SetMetadata(key: string, value: unknown): MaybePromise<boolean>,
    AddReference(assetPath: string, primPath: string): MaybePromise<boolean>,
    SetInstanceable(instanceable: boolean): MaybePromise<boolean>,
    GetVariantEditTarget(variantSetName: string): USDEditTarget,
}

declare type USDStage = {
    OpenLayerStage(identifier: string): MaybePromise<USDStage | null>,
    GetRootLayer(): USDLayer,
    GetPseudoRoot(): USDPrim,
    GetPrimAtPath(path: string): USDPrim,
    DefinePrim(path: string, typeName: string): USDPrim,
    Traverse(): USDPrimVector,
    GetPrototypes(): USDPrimVector,
    TraversePrototypes(expandedPrototypes: string[] | null): USDPrimVector,
    GetAnimationTimeRange(): MaybePromise<{start:number;end:number} | null>,
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
    Export(path: string): MaybePromise<boolean>,
    ExportToString(): MaybePromise<string>,
    GetEditTarget(): USDEditTarget,
    SetEditTarget(target: USDEditTarget): void,
}

declare type UsdGeomXform = {
    IsValid(): boolean,
    GetPrim(): USDPrim,
    GetPath(): SdfPath,
    AddTranslateOp(): UsdGeomXformOp,
    AddRotateXYZOp(): UsdGeomXformOp,
    AddScaleOp(): UsdGeomXformOp,
    AddTransformOp(): UsdGeomXformOp,
    delete(): void,
}

declare type UsdGeomScope = {
    IsValid(): boolean,
    GetPrim(): USDPrim,
    GetPath(): SdfPath,
    delete(): void,
}

declare type UsdGeomSphere = {
    IsValid(): boolean,
    GetPrim(): USDPrim,
    GetPath(): SdfPath,
    GetRadiusAttr(): USDAttribute,
    CreateRadiusAttr(defaultValue: unknown, writeSparsely: boolean): USDAttribute,
    GetDisplayColorAttr(): USDAttribute,
    CreateDisplayColorAttr(defaultValue: unknown, writeSparsely: boolean): USDAttribute,
    GetPurposeAttr(): USDAttribute,
    CreatePurposeAttr(defaultValue: unknown, writeSparsely: boolean): USDAttribute,
    AddTranslateOp(): UsdGeomXformOp,
    AddRotateXYZOp(): UsdGeomXformOp,
    AddScaleOp(): UsdGeomXformOp,
    AddTransformOp(): UsdGeomXformOp,
    MakeVisible(): void,
    MakeInvisible(): void,
    delete(): void,
}

declare type UsdGeomCube = {
    IsValid(): boolean,
    GetPrim(): USDPrim,
    GetPath(): SdfPath,
    GetSizeAttr(): USDAttribute,
    CreateSizeAttr(defaultValue: unknown, writeSparsely: boolean): USDAttribute,
    GetDisplayColorAttr(): USDAttribute,
    CreateDisplayColorAttr(defaultValue: unknown, writeSparsely: boolean): USDAttribute,
    GetPurposeAttr(): USDAttribute,
    CreatePurposeAttr(defaultValue: unknown, writeSparsely: boolean): USDAttribute,
    AddTranslateOp(): UsdGeomXformOp,
    AddRotateXYZOp(): UsdGeomXformOp,
    AddScaleOp(): UsdGeomXformOp,
    AddTransformOp(): UsdGeomXformOp,
    MakeVisible(): void,
    MakeInvisible(): void,
    delete(): void,
}

declare type UsdGeomMesh = {
    IsValid(): boolean,
    GetPrim(): USDPrim,
    GetPath(): SdfPath,
    GetPointsAttr(): USDAttribute,
    CreatePointsAttr(defaultValue: unknown, writeSparsely: boolean): USDAttribute,
    GetFaceVertexCountsAttr(): USDAttribute,
    CreateFaceVertexCountsAttr(defaultValue: unknown, writeSparsely: boolean): USDAttribute,
    GetFaceVertexIndicesAttr(): USDAttribute,
    CreateFaceVertexIndicesAttr(defaultValue: unknown, writeSparsely: boolean): USDAttribute,
    GetDisplayColorAttr(): USDAttribute,
    CreateDisplayColorAttr(defaultValue: unknown, writeSparsely: boolean): USDAttribute,
    GetPurposeAttr(): USDAttribute,
    CreatePurposeAttr(defaultValue: unknown, writeSparsely: boolean): USDAttribute,
    AddTranslateOp(): UsdGeomXformOp,
    AddRotateXYZOp(): UsdGeomXformOp,
    AddScaleOp(): UsdGeomXformOp,
    AddTransformOp(): UsdGeomXformOp,
    MakeVisible(): void,
    MakeInvisible(): void,
    delete(): void,
}

declare type UsdGeomCamera = {
    IsValid(): boolean,
    GetPrim(): USDPrim,
    GetPath(): SdfPath,
    GetFocalLengthAttr(): USDAttribute,
    CreateFocalLengthAttr(defaultValue: unknown, writeSparsely: boolean): USDAttribute,
    GetFocusDistanceAttr(): USDAttribute,
    CreateFocusDistanceAttr(defaultValue: unknown, writeSparsely: boolean): USDAttribute,
    AddTranslateOp(): UsdGeomXformOp,
    AddRotateXYZOp(): UsdGeomXformOp,
    AddScaleOp(): UsdGeomXformOp,
    AddTransformOp(): UsdGeomXformOp,
    MakeVisible(): void,
    MakeInvisible(): void,
    delete(): void,
}

declare type UsdShadeMaterial = {
    IsValid(): boolean,
    GetPrim(): USDPrim,
    GetPath(): SdfPath,
    CreateSurfaceOutput(renderContext: string): UsdShadeOutput,
    delete(): void,
}

declare type UsdShadeShader = {
    IsValid(): boolean,
    GetPrim(): USDPrim,
    GetPath(): SdfPath,
    GetIdAttr(): USDAttribute,
    CreateIdAttr(defaultValue: unknown, writeSparsely: boolean): USDAttribute,
    CreateInput(name: string, typeName: string): UsdShadeInput,
    CreateOutput(name: string, typeName: string): UsdShadeOutput,
    delete(): void,
}

declare function CreateStage(path: string): USDStage
declare function OpenStage(path: string): MaybePromise<USDStage>
declare function ReleaseStage(stage: USDStage): boolean
declare function CreateUsdzPackage(assetPath: string, usdzPath: string): MaybePromise<boolean>
declare function ReadFile(path: string): Uint8Array

declare type HdWebSyncDriver = {
    getFile: (path: string, cb: (loadedFile: ArrayBufferLike) => void) => MaybePromise<void>,
    resolveAssetUrl: (path: string) => string,
    HasStage(): boolean,
    ResolvePick(renderPath: string, instanceIndex: number): MaybePromise<{path: string; instances: {path: string; index: number; id?: string}[]} | null>,
    ResolveSelection(renderPath: string, count: number, selections: readonly {path: string; instances?: readonly {path: string; index: number; id?: string}[]}[]): MaybePromise<number[] | null>,
    HasScopedHttpCache?(): boolean,
    GetStage(): USDStage,
    /** Read-only composed UsdPhysics descriptors, serialized as JSON. */
    GetPhysicsSceneJson(): MaybePromise<string>,
    GetPhysicsSceneMetadataJson(): MaybePromise<string>,
    GetPhysicsMeshBuffers(path:string): MaybePromise<{points:Float32Array;indices:Int32Array}>,
    GetStageUpAxis(): number,
    GetStageStartTimeCode(): number,
    GetStageEndTimeCode(): number,
    GetStageTimeCodesPerSecond(): number,
    SetIncludedPurposes(includedPurposes: string[]): void,
    GetRefineLevelFallback(): number,
    SetRefineLevelFallback(level: number): void,
    GetComplexity(): number,
    SetComplexity(complexity: number): void,
    /** Whether refined meshes use Bfr limit-surface tessellation. */
    GetAdaptiveSubdivision(): boolean,
    SetAdaptiveSubdivision(enabled: boolean): void,
    SetTime(timecode: number): void,
    GetTime(): number,
    Draw(): MaybePromise<void>,
    DrawAsync(resolve: () => void, reject: (error: string) => void): boolean,
    ExportUsdzAsync(directory: string, resolve: () => void, reject: (error: string) => void,
        progress: (phase: string, completed: number, total: number) => void): boolean,
    StartDraw(): boolean,
    IsDrawPending(): boolean,
    ConsumeDrawError(): string,
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
    /** Defaults to Asyncify for binding compatibility. Auto opts into JSPI when supported. The first call selects the shared runtime. */
    asyncRuntime?: "auto" | "jspi" | "asyncify",
    /** Override the selected runtime's worker script URL or Blob. */
    mainScriptUrlOrBlob?: string | Blob,
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
