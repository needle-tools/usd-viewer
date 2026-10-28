/** Detect the format from the first bytes of a USD file. */
export declare function tryDetermineFileFormat(buffer: ArrayBuffer): 'usdz' | 'usd' | 'usda' | 'usdc' | 'unknown';
