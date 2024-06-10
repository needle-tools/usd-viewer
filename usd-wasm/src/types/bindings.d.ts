

declare type USD = {
    FS_createDataFile: (str: string, filepath: string, data: Uint8Array, b1: boolean, b2: boolean, b3: boolean) => void,
    HdWebSyncDriver: new (delegate: hydraDelegate, filepath: string) => HdWebSyncDriver,
};

declare type USDStage = {
    GetStartTimeCode(): number,
    GetEndTimeCode(): number,
    GetTimeCodesPerSecond(): number,
}

declare type HdWebSyncDriver = {
    getFile: (path: string, cb: (loadedFile: ArrayBufferLike) => void) => void,
    GetStage: () => USDStage,
    SetTime(timecode: number): void,
    GetTime(): number,
    Draw(): void,
}

/**
 * Loads the USD Module.
 * @example
 * ```javascript
 * getUsdModule({ mainScriptUrlOrBlob: "/emHdBindings.js" }).then(USD => { ... })
 * ```
 */
export function getUsdModule(opts?: { mainScriptUrlOrBlob?: string }): Promise<USD>;

export type USDRoot = {}