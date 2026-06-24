import { threeJsRenderDelegate } from "./hydra/index.js";
import { tryDetermineFileFormat } from "./utils.js";

/**
 * @param {string} url
 */
function toBrowserFetchableUrl(url) {
    if (url.startsWith("https://github.com/") || url.startsWith("http://github.com/")) {
        url = url.replace("github.com", "raw.githubusercontent.com");
        url = url.replace("/blob/", "/");
    }

    if (url.startsWith("http") || url.startsWith("blob")) {
        return url;
    }

    if (globalThis.location?.href) {
        return new URL(url, globalThis.location.href).href;
    }

    return url;
}

/**
 * @param {unknown} value
 * @returns {value is Promise<unknown>}
 */
function isPromiseLike(value) {
    return !!value && typeof value === "object" && "then" in value;
}

/**
 * @param {string} url
 */
function isUsdPackageUrl(url) {
    const path = url.split(/[?#]/, 1)[0].toLowerCase();
    return path.endsWith(".usdz");
}

/**
 * @template T
 * @param {T | Promise<T>} value
 * @param {(value: T) => void} assign
 * @param {string} label
 */
function assignMaybeAsync(value, assign, label) {
    if (isPromiseLike(value)) {
        value.then(assign).catch((error) => console.error(`Failed to read ${label}`, error));
    }
    else {
        assign(/** @type {T} */ (value));
    }
}

/**
 * @param {{USD:import("./types").USD, filepath:string, buffer?:ArrayBuffer, parent?:string,}} opts
 */
async function createFile(opts) {
    if (typeof opts.filepath !== "string") throw new Error("Filepath must be a string");

    let filepath = /** @type {string} */ (opts.filepath);

    let arrayBuffer = opts.buffer;
    if (!arrayBuffer) {
        const response = await fetch(filepath);
        if (!response.ok) {
            throw new Error(`Failed to fetch USD file ${filepath}: ${response.status} ${response.statusText}`);
        }
        arrayBuffer = await response.arrayBuffer();
    }

    // ensure that file paths are not using slashes
    /** @ts-ignore */
    filepath = filepath.replaceAll(/\\/g, "/").replaceAll("/", "_");

    const format = tryDetermineFileFormat(arrayBuffer);
    const ext = filepath.split(".").pop();
    if (ext !== "usdz" && ext !== "usd" && ext !== "usda" && ext !== "usdc") {
        if (format === "usdz" || format === "usd" || format === "usda" || format === "usdc") {
            filepath += "." + format;
        } else {
            console.warn("Unknown file format - assuming .usdz");
            filepath += ".usdz";
        }
    }
    else if (format !== ext) {
        console.warn("File extension does not match file format", { ext, format });
    }

    // Put a simple USDZ file into the virtual file system so USD can access it
    // Create a file in the virtual file system
    opts.USD.FS_createDataFile("", filepath, new Uint8Array(arrayBuffer), true, true, true);
    return filepath;
}

export class USDLoadingManager {
    static urlModifier = null;
    static setURLModifier(urlModifier) {
        USDLoadingManager.urlModifier = urlModifier;
    }
}

/**
 * Set up a Three.js Hydra render delegate.
 * @param {import(".").createThreeHydraConfig} config
 * @returns {Promise<import(".").NeedleThreeHydraHandle>}
 */
export async function createThreeHydra(config) {
    const debug = config.debug || false;

    config.USD.debug = debug;

    if (debug) console.log("USD", config.USD);

    await config.USD.ready.catch(console.error);

    const { buffer, USD } = config;

    // Some common directory is needed so that we don't get clashes with root-level files
    // and directories in the virtual file system
    const directoryForFiles = "needle/";

    // We're loading all provided files into the virtual file system.
    // Potentially, we could also resolve dropped files on the fly and load them only when needed,
    // but this requires HTTPAssetResolver changes
    if (Array.isArray(config.files)) {
        for (const file of config.files) {
            let fileName = file.name;
            let directory = "/";
            if (file.path) {
                const parts = file.path.split('/');
                if (parts.length > 1) {
                    fileName = parts.pop() || fileName;
                    directory = file.path.substring(0, file.path.length - fileName.length);
                }
            }

            USD.FS_createPath("", directoryForFiles + directory, true, true);
            const fileBuffer = await file.arrayBuffer();
            USD.FS_createDataFile(directoryForFiles + directory, fileName, new Uint8Array(fileBuffer), true, true, true);
        }
    }

    // Capabilities of the loader.
    // This depends on the HttpAssetResolver implementation and the virtual file system.
    const allowFetchWebUrls = true;
    const allowFetchLocalFiles = true;

    // Which file we actually load as root file depends:
    // - when an array of files is provided, we use the first one;
    // - when a URL is provided, we use that;
    // - when a blob is provided, we create a file from that blob and sanitize the filename.
    let file = "";
    if (config.files?.length) {
        file = directoryForFiles + config.files[0].path;
    }
    else if (config.url) {
        const resolvedUrl = toBrowserFetchableUrl(config.url);
        const isBlob = resolvedUrl.startsWith("blob");
        const isWebUrl = resolvedUrl.startsWith("http");
        if (buffer || isBlob || isUsdPackageUrl(resolvedUrl)) {
            file = await createFile({ USD, filepath: resolvedUrl, buffer });
        }
        else if ((allowFetchWebUrls && isWebUrl) || allowFetchLocalFiles) {
            file = resolvedUrl;
        }
        else {
            file = await createFile({ USD, filepath: resolvedUrl, buffer });
        }
    }

    // Log the virtual file system, composed of a hierarchy of FSNode objects
    if (debug) {
        console.log("VIRTUAL FILESYSTEM", USD.FS_analyzePath("/"));
        console.log("MAIN FILE", file);
    }

    /**
     * @type {null | import(".").HdWebSyncDriver | Promise<import(".").HdWebSyncDriver>}
     */
    let driverOrPromise = null;

    /**
     * @type {import(".").threeJsRenderDelegateConfig}
     */
    const delegateConfig = {
        usdRoot: config.scene,
        paths: new Array(),
        driver: () => /** @type {import(".").HdWebSyncDriver} */(driverOrPromise),
    };

    const renderInterface = new threeJsRenderDelegate(delegateConfig);

    if (debug) console.log("RENDER INTERFACE", renderInterface);

    driverOrPromise = new config.USD.HdWebSyncDriver(renderInterface, file);
    if (driverOrPromise instanceof Promise) {
        driverOrPromise = await driverOrPromise;
    }

    const driver = /** @type {import(".").HdWebSyncDriver} */ (driverOrPromise);
    if (typeof driver.HasStage === "function" && !driver.HasStage()) {
        driver.delete();
        throw new Error(`Failed to open USD stage: ${file}`);
    }

    if (debug) console.log("DRIVER", driver);

    let drawInFlight = false;
    let drawPromise = Promise.resolve();
    const draw = () => {
        if (drawInFlight || driver.isDeleted()) {
            return drawPromise;
        }

        try {
            const result = driver.Draw();
            if (isPromiseLike(result)) {
                drawInFlight = true;
                drawPromise = result.catch((error) => console.error("Hydra draw failed", error)).finally(() => {
                    drawInFlight = false;
                });
            }
            else {
                drawPromise = Promise.resolve();
            }
        }
        catch (error) {
            console.error("Hydra draw failed", error);
            drawPromise = Promise.resolve();
        }

        return drawPromise;
    };

    /** Draw once */
    const initialDrawPromise = draw();

    /** Support for Y and Z up-axis in the root USD file */
    let stageUpAxis = "y".charCodeAt(0);
    let stageStartTimeCode = 0;
    let stageEndTimeCode = 0;
    let stageTimeCodesPerSecond = 24;

    assignMaybeAsync(driver.GetStageUpAxis(), (value) => {
        stageUpAxis = value;
        delegateConfig.usdRoot.rotation.x = String.fromCharCode(stageUpAxis) === 'z' ? -Math.PI / 2 : 0;
    }, "stage up axis");
    assignMaybeAsync(driver.GetStageStartTimeCode(), (value) => stageStartTimeCode = value, "stage start time");
    assignMaybeAsync(driver.GetStageEndTimeCode(), (value) => stageEndTimeCode = value, "stage end time");
    assignMaybeAsync(driver.GetStageTimeCodesPerSecond(), (value) => stageTimeCodesPerSecond = value, "stage time codes per second");

    let time = 0;

    if (debug) {
        console.log("STAGE", {
            upAxis: String.fromCharCode(stageUpAxis),
            startTimeCode: stageStartTimeCode,
            endTimeCode: stageEndTimeCode,
            timeCodesPerSecond: stageTimeCodesPerSecond,
        });
        console.log("VIRTUAL FILESYSTEM", USD.FS_analyzePath("/"));
    }

    return {
        driver: /** @type {import(".").HdWebSyncDriver} */ (driverOrPromise),
        ready: () => initialDrawPromise,
        update: (dt) => {
            // ensure we're not dead
            if (driver.isDeleted()) {
                if (debug) {
                    if (config["debug:delete"] === undefined)
                        console.error("Called update for three hydra after it was deleted!");
                    config["debug:delete"] = true;
                }
                return;
            }
            time += dt;
            const startTimeCode = stageStartTimeCode;
            const endTimeCode = stageEndTimeCode;
            const duration = endTimeCode - startTimeCode;
            let timecode = startTimeCode + time * stageTimeCodesPerSecond;
            if (duration > 0) {
                timecode = startTimeCode + ((timecode - startTimeCode) % duration);
                driver.SetTime(timecode);
            }
            draw();
        },
        materialsReady: () => renderInterface.waitForMaterialsReady(),
        diagnostics: () => renderInterface.getDiagnostics(),
        /**
         * Dipoose the Three Hydra delegate.
         * This does *not* clear the threejs scene but only dispose the USD delegate and loaded files
         */
        dispose: () => {
            if (debug) console.warn("Disposing Three Hydra");

            // Unlink all generated files and folders in the virtual file system.
            const unlinkedFiles = new Set();
            function unlinkFiles(dir, path) {
                for (const fileName of Object.keys(dir.contents)) {
                    const file = dir.contents[fileName];
                    if (file.isFolder) {
                        unlinkFiles(file, path + fileName + "/");
                    }
                    const fullPath = path + fileName;
                    if (file.isFolder) {
                        if (debug) console.log("unlinking folder", fullPath);
                        try {
                            config.USD.FS_rmdir(path + fileName);
                        }
                        catch (e) {
                            if (debug) console.debug("Error unlinking folder", fullPath, e);
                        }
                    }
                    else {
                        if (debug) console.log("unlinking", fullPath);
                        unlinkedFiles.add(fullPath);
                        try {
                            config.USD.FS_unlink(fullPath);
                        }
                        catch (e) {
                            if (debug) console.debug("Error unlinking", fullPath, e);
                        }
                    }
                }
            }

            function rmRootDir(rootDir) {
                const allFiles = config.USD.FS_analyzePath(rootDir).object;
                if (allFiles)
                    unlinkFiles(allFiles, rootDir);
            }

            rmRootDir("/" + directoryForFiles);
            rmRootDir("/1/"); // HTTPAssetResolver puts files into a series of folders named "/1/1/1/1" to allow for parent traversal

            if (!unlinkedFiles.has(file)) {
                if (debug) console.warn("Unlinking main file", file);
                let fileToUnlink = file;
                if (fileToUnlink.startsWith("http"))
                    fileToUnlink = "/" + fileToUnlink.replace("://", ":/");
                if (config.USD.FS_analyzePath(fileToUnlink)?.exists) {
                    try {
                        config.USD.FS_unlink(fileToUnlink);
                    } catch (e) {
                        if (debug) console.debug("Error unlinking main file", fileToUnlink, e);
                    }
                }
            }

            driver.delete();
            driverOrPromise = null;

            if (debug) console.warn("Disposed Three Hydra");
        },
    }
}
