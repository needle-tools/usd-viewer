

/**
 * @param {ArrayBuffer} buffer
 * @returns {"usdz" | "usd" | "usda" | "unknown"}
 */
export function tryDetermineFileFormat(buffer) {

    const bytes = new Uint8Array(buffer, 0, 16);

    // USDZ
    if (bytes[0] == 80 && bytes[1] == 75 && bytes[2] == 3 && bytes[3] == 4) {
        return "usdz";
    }
    // USD
    if (bytes[0] == 80 && bytes[1] == 88 && bytes[2] == 82 && bytes[3] == 45 && bytes[4] == 85 && bytes[5] == 83 && bytes[6] == 68 && bytes[7] == 67) {
        return "usd";
    }
    // if (bytes[0] == 117 && bytes[1] == 115 && bytes[2] == 100 && bytes[3] == 97) {
    //     return "usda";
    // }

    return "unknown";
}