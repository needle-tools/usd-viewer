import { threeJsRenderDelegate } from "./hydra/index.js";
import { tryDetermineFileFormat } from "./utils.js";
import { Object3D } from "three";

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
 * @returns {Promise<T>}
 */
async function waitMaybeAsync(value) {
    return await value;
}

/**
 * @param {Promise<unknown>} promise
 * @param {string} label
 * @param {number} timeoutMs
 */
function withTimeout(promise, label, timeoutMs = 15000) {
    let timeout = 0;
    const timeoutPromise = new Promise((resolve) => {
        timeout = setTimeout(() => {
            console.warn(`${label} is still pending after ${timeoutMs}ms.`);
            resolve(undefined);
        }, timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function disposeObjectTree(root) {
    if (!root) return;
    root.traverse?.((object) => {
        object.geometry?.dispose?.();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
            material?.dispose?.();
        }
    });
    root.parent?.remove(root);
}

/**
 * @param {{USD:import("./types").USD, filepath:string, buffer?:ArrayBuffer, parent?:string,}} opts
 */
async function createFile(opts) {
    if (typeof opts.filepath !== "string") throw new Error("Filepath must be a string");

    let filepath = /** @type {string} */ (opts.filepath);
    let parent = opts.parent || "";

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

    if (parent) {
        parent = parent.replaceAll(/\\/g, "/");
        if (parent.startsWith("/")) parent = parent.slice(1);
        if (!parent.endsWith("/")) parent += "/";
        opts.USD.FS_createPath("", parent, true, true);
    }

    // Put a simple USDZ file into the virtual file system so USD can access it
    // Create a file in the virtual file system
    opts.USD.FS_createDataFile(parent, filepath, new Uint8Array(arrayBuffer), true, true, true);
    return parent + filepath;
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
    const loadedFilePaths = [];

    // We're loading all provided files into the virtual file system.
    // Potentially, we could also resolve dropped files on the fly and load them only when needed,
    // but this requires HTTPAssetResolver changes
    if (Array.isArray(config.files)) {
        for (const file of config.files) {
            let fileName = file.name;
            let directory = "";
            if (file.path) {
                const parts = file.path.split('/');
                if (parts.length > 1) {
                    fileName = parts.pop() || fileName;
                    directory = file.path.substring(0, file.path.length - fileName.length);
                }
            }

            USD.FS_createPath("", directoryForFiles + directory, true, true);
            const fileBuffer = await file.arrayBuffer();
            const bytes = new Uint8Array(fileBuffer);
            USD.FS_createDataFile(directoryForFiles + directory, fileName, bytes, true, true, true);
            if (file.path) {
                loadedFilePaths.push(directoryForFiles + file.path);
                loadedFilePaths.push(file.path);
            }
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
        file = "/" + directoryForFiles + config.files[0].path;
    }
    else if (config.url) {
        if (buffer) {
            file = await createFile({ USD, filepath: config.url, buffer, parent: directoryForFiles });
            if (!file.startsWith("/")) file = "/" + file;
        }
        else {
            const resolvedUrl = toBrowserFetchableUrl(config.url);
            const isBlob = resolvedUrl.startsWith("blob");
            const isWebUrl = resolvedUrl.startsWith("http");
            if (isBlob || isUsdPackageUrl(resolvedUrl)) {
                file = await createFile({ USD, filepath: resolvedUrl });
            }
            else if ((allowFetchWebUrls && isWebUrl) || allowFetchLocalFiles) {
                file = resolvedUrl;
            }
            else {
                file = await createFile({ USD, filepath: resolvedUrl });
            }
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

    const scenePrimitiveRoot = new Object3D();
    scenePrimitiveRoot.name = "__usd_scene_primitives";
    scenePrimitiveRoot.userData.usdScenePrimitiveRoot = true;
    config.scene.add(scenePrimitiveRoot);

    /**
     * @type {import(".").threeJsRenderDelegateConfig}
     */
    const delegateConfig = {
        usdRoot: config.scene,
        scenePrimitiveRoot,
        scenePrimitiveLightIntensityScale: config.scenePrimitiveLightIntensityScale,
        showScenePrimitiveHelpers: config.showScenePrimitiveHelpers,
        showCameraHelpers: config.showCameraHelpers,
        showLightHelpers: config.showLightHelpers,
        paths: loadedFilePaths,
        USD,
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

    if (typeof driver.SetIncludedPurposes === "function") {
        driver.SetIncludedPurposes(config.includedPurposes ?? ["default", "render"]);
    }

    if (debug) console.log("DRIVER", driver);

    let disposed = false;
    let drawInFlight = false;
    let editInFlight = false;
    let drawPromise = Promise.resolve();
    let activeDrawPromise = Promise.resolve();
    const draw = (force = false) => {
        if (disposed || drawInFlight || driver.isDeleted() || (editInFlight && !force)) {
            return drawPromise;
        }

        try {
            const result = driver.Draw();
            if (isPromiseLike(result)) {
                drawInFlight = true;
                activeDrawPromise = result
                    .catch((error) => console.error("Hydra draw failed", error))
                    .finally(() => drawInFlight = false);
                drawPromise = withTimeout(activeDrawPromise, "Hydra draw");
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

    const stage = await waitMaybeAsync(driver.GetStage());
    const requireStageMethod = (name) => {
        if (!stage || typeof stage[name] !== "function") {
            throw new Error(`OpenUSD stage API is missing ${name}; cannot read stage metadata`);
        }
        return stage[name].bind(stage);
    };
    const getStageUpAxis = requireStageMethod("GetUpAxis");
    const getStageStartTimeCode = requireStageMethod("GetStartTimeCode");
    const getStageEndTimeCode = requireStageMethod("GetEndTimeCode");
    const getStageTimeCodesPerSecond = requireStageMethod("GetTimeCodesPerSecond");
    /** Support for Y and Z up-axis in the root USD file */
    let stageUpAxis = 0;
    let stageStartTimeCode = 0;
    let stageEndTimeCode = 0;
    let stageTimeCodesPerSecond = 24;
    const normalizeUpAxisToken = (axis) => {
        if (typeof axis === "number" && Number.isFinite(axis)) {
            return String.fromCharCode(axis).toLowerCase();
        }
        if (typeof axis === "string" && axis.length > 0) {
            return axis[0].toLowerCase();
        }
        return "y";
    };
    const applyStageMetadata = (metadata) => {
        const stageUpAxisToken = normalizeUpAxisToken(metadata.upAxis);
        stageUpAxis = stageUpAxisToken.charCodeAt(0);
        stageStartTimeCode = Number.isFinite(metadata.startTimeCode) ? metadata.startTimeCode : 0;
        stageEndTimeCode = Number.isFinite(metadata.endTimeCode) ? metadata.endTimeCode : stageStartTimeCode;
        stageTimeCodesPerSecond = metadata.timeCodesPerSecond > 0 ? metadata.timeCodesPerSecond : 24;
        delegateConfig.usdRoot.rotation.x = stageUpAxisToken === 'z' ? -Math.PI / 2 : 0;
        delegateConfig.usdRoot.updateMatrixWorld(true);
    };
    const readStageMetadata = () => {
        if (disposed || driver.isDeleted()) {
            return {
                upAxis: stageUpAxis,
                startTimeCode: stageStartTimeCode,
                endTimeCode: stageEndTimeCode,
                timeCodesPerSecond: stageTimeCodesPerSecond,
            };
        }
        return {
            upAxis: getStageUpAxis(),
            startTimeCode: getStageStartTimeCode(),
            endTimeCode: getStageEndTimeCode(),
            timeCodesPerSecond: getStageTimeCodesPerSecond(),
        };
    };
    applyStageMetadata(readStageMetadata());

    /** Draw once, after stage metadata has been applied to the root scene. */
    const initialDrawPromise = draw();
    const readyPromise = config.waitForMaterials
        ? initialDrawPromise.then(() => renderInterface.waitForMaterialsReady())
        : initialDrawPromise;

    let time = 0;
    let currentTimeCode = stageStartTimeCode;
    let playing = true;

    const stageDuration = () => stageEndTimeCode - stageStartTimeCode;

    const clampStageTimeCode = (timeCode) => {
        if (!Number.isFinite(timeCode)) return stageStartTimeCode;
        const duration = stageDuration();
        if (duration <= 0) return stageStartTimeCode;
        return Math.min(stageEndTimeCode, Math.max(stageStartTimeCode, timeCode));
    };

    const setHydraTime = (timeCode) => {
        currentTimeCode = clampStageTimeCode(timeCode);
        time = stageTimeCodesPerSecond > 0
            ? (currentTimeCode - stageStartTimeCode) / stageTimeCodesPerSecond
            : 0;
        driver.SetTime(currentTimeCode);
    };

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
        ready: () => readyPromise,
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
            if (playing) {
                time += dt;
                const startTimeCode = stageStartTimeCode;
                const duration = stageDuration();
                let timecode = startTimeCode + time * stageTimeCodesPerSecond;
                if (duration > 0) {
                    timecode = startTimeCode + ((timecode - startTimeCode) % duration);
                    currentTimeCode = timecode;
                    driver.SetTime(timecode);
                }
            }
            draw();
        },
        setTime: async (timeCode) => {
            if (disposed || driver.isDeleted()) {
                return Promise.resolve();
            }
            await drawPromise;
            setHydraTime(timeCode);
            return draw(true);
        },
        getTime: () => currentTimeCode,
        setPlaying: (value) => {
            playing = Boolean(value);
        },
        isPlaying: () => playing,
        refresh: () => draw(),
        setIncludedPurposes: async (includedPurposes) => {
            if (disposed || driver.isDeleted() || typeof driver.SetIncludedPurposes !== "function") {
                return Promise.resolve();
            }
            await drawPromise;
            driver.SetIncludedPurposes(includedPurposes);
            return draw(true);
        },
        editStage: async (callback) => {
            if (disposed || driver.isDeleted()) {
                return undefined;
            }
            await drawPromise;
            if (drawInFlight) {
                console.warn("Skipping USD stage edit while Hydra draw is still pending.");
                return undefined;
            }
            if (disposed || driver.isDeleted()) {
                return undefined;
            }
            const stage = await waitMaybeAsync(driver.GetStage());
            editInFlight = true;
            try {
                const result = await callback(stage, driver);
                if (disposed || driver.isDeleted()) {
                    return result;
                }
                await withTimeout(waitMaybeAsync(driver.Repopulate()), "Hydra repopulate");
                editInFlight = false;
                await draw(true);
                return result;
            }
            finally {
                editInFlight = false;
            }
        },
        repopulate: async () => {
            if (disposed || driver.isDeleted()) {
                return Promise.resolve();
            }
            await withTimeout(waitMaybeAsync(driver.Repopulate()), "Hydra repopulate");
            return draw();
        },
        materialsReady: () => renderInterface.waitForMaterialsReady(),
        diagnostics: () => renderInterface.getDiagnostics(),
        stageMetadata: () => {
            applyStageMetadata(readStageMetadata());
            return {
                upAxis: String.fromCharCode(stageUpAxis),
                startTimeCode: stageStartTimeCode,
                endTimeCode: stageEndTimeCode,
                timeCodesPerSecond: stageTimeCodesPerSecond,
            };
        },
        /**
         * Dispose the Three Hydra delegate.
         * This does *not* clear the threejs scene but only dispose the USD delegate and loaded files
         */
        dispose: async () => {
            if (disposed) return;
            disposed = true;
            if (debug) console.warn("Disposing Three Hydra");

            const cleanup = async () => {
                await renderInterface.waitForMaterialsReady().catch(() => {});
                renderInterface.dispose();
                disposeObjectTree(scenePrimitiveRoot);

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

                if (!driver.isDeleted()) {
                    driver.delete();
                }
                driverOrPromise = null;
            };

            if (drawInFlight) {
                console.warn("Waiting for pending Hydra draw before USD cleanup.");
            }
            await drawPromise.catch(() => {});
            await cleanup();

            if (debug) console.warn("Disposed Three Hydra");
        },
    }
}
