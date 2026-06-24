
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

declare type USD = {
    FS_createDataFile: (parent: string, filepath: string, data: Uint8Array, canRead: boolean, canWrite: boolean, canOwn: boolean) => FSNode,
    FS_createPath: (parent: string, path: string, canRead: boolean, canWrite: boolean) => FSNode,
    FS_unlink: (path: string) => void,
    FS_readdir: (path: string) => string[],
    FS_rmdir: (path: string) => void,
    FS_analyzePath: (path: string) => FSNode,
    CreateStage: (path: string) => USDStage,
    OpenStage: (path: string) => USDStage,
    ReleaseStage: (stage: USDStage) => boolean,
    CreateUsdzPackage: (assetPath: string, usdzPath: string) => boolean,
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

declare type USDLayer = {
    GetIdentifier(): string,
    GetDisplayName(): string,
    ExportToString(): string,
    Export(path: string): boolean,
    Save(): boolean,
}

declare type USDPrim = {
    IsValid(): boolean,
    GetName(): string,
    GetPath(): string,
    GetTypeName(): string,
    IsActive(): boolean,
    SetActive(active: boolean): boolean,
    IsDefined(): boolean,
    IsLoaded(): boolean,
    GetParent(): USDPrim,
    GetChildren(): USDPrimVector,
    GetPropertyNames(): StringVector,
    GetAttribute(name: string): USDAttribute,
    CreateAttribute(name: string, typeName: string, custom: boolean): USDAttribute,
    GetRelationship(name: string): USDRelationship,
    AddVariant(variantSetName: string, variantName: string): boolean,
    SetVariantSelection(variantSetName: string, variantName: string): boolean,
    GetVariantSelection(variantSetName: string): string,
    ClearVariantSelection(variantSetName: string): boolean,
    BlockVariantSelection(variantSetName: string): boolean,
    GetVariantNames(variantSetName: string): StringVector,
    DefinePrimInVariant(variantSetName: string, variantName: string, path: string, typeName: string): USDPrim,
}

declare type USDAttribute = {
    IsValid(): boolean,
    GetName(): string,
    GetPath(): string,
    GetTypeName(): string,
    GetValueString(): string,
    GetValueStringAtTime(timeCode: number): string,
    SetBool(value: boolean, timeCode: number): boolean,
    SetInt(value: number, timeCode: number): boolean,
    SetFloat(value: number, timeCode: number): boolean,
    SetDouble(value: number, timeCode: number): boolean,
    SetString(value: string, timeCode: number): boolean,
    SetToken(value: string, timeCode: number): boolean,
    SetColor3f(r: number, g: number, b: number, timeCode: number): boolean,
}

declare type USDRelationship = {
    IsValid(): boolean,
    GetName(): string,
    GetPath(): string,
    GetTargets(): StringVector,
}

declare type USDStage = {
    GetRootLayer(): USDLayer,
    GetPseudoRoot(): USDPrim,
    GetPrimAtPath(path: string): USDPrim,
    DefinePrim(path: string, typeName: string): USDPrim,
    Traverse(): USDPrimVector,
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
    SetTime(timecode: number): void,
    GetTime(): number,
    Draw(): void,

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

export type USDRoot = {}
