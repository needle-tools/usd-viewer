import { threeJsRenderDelegate } from "./hydra/index.js";
import { tryDetermineFileFormat } from "./utils.js";
import {
    CameraHelper,
    Color,
    DirectionalLight,
    DirectionalLightHelper,
    HemisphereLight,
    Object3D,
    PerspectiveCamera,
    PointLight,
    PointLightHelper,
    MathUtils,
} from "three";

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

const lightTypeNames = new Set([
    "DistantLight",
    "DiskLight",
    "DomeLight",
    "RectLight",
    "SphereLight",
    "CylinderLight",
]);
const defaultScenePrimitiveLightIntensityScale = 0.01;

function vectorToArray(vector) {
    const values = [];
    const size = vector?.size?.() ?? 0;
    for (let i = 0; i < size; i++) {
        values.push(vector.get(i));
    }
    vector?.delete?.();
    return values;
}

function getAttributeValueString(prim, name) {
    const attribute = prim?.GetAttribute?.(name);
    if (!attribute?.IsValid?.()) {
        return "";
    }
    return String(attribute.GetValueString?.() ?? "");
}

function parseUsdNumber(value, fallback = 0) {
    const match = String(value ?? "").match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
    return match ? Number(match[0]) : fallback;
}

function parseUsdVector(value, fallback = [0, 0, 0]) {
    const matches = String(value ?? "").match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g);
    if (!matches || matches.length < fallback.length) {
        return [...fallback];
    }
    return fallback.map((_, index) => Number(matches[index]));
}

function getUsdNumberAttribute(prim, name, fallback = 0) {
    const value = getAttributeValueString(prim, name);
    return value ? parseUsdNumber(value, fallback) : fallback;
}

function getUsdVectorAttribute(prim, name, fallback = [0, 0, 0]) {
    const value = getAttributeValueString(prim, name);
    return value ? parseUsdVector(value, fallback) : [...fallback];
}

function applyUsdXformOps(prim, object) {
    const translate = getUsdVectorAttribute(prim, "xformOp:translate", [0, 0, 0]);
    object.position.set(translate[0], translate[1], translate[2]);

    const rotate = getUsdVectorAttribute(prim, "xformOp:rotateXYZ", [0, 0, 0]);
    object.rotation.set(
        MathUtils.degToRad(rotate[0]),
        MathUtils.degToRad(rotate[1]),
        MathUtils.degToRad(rotate[2]),
        "XYZ",
    );

    const scale = getUsdVectorAttribute(prim, "xformOp:scale", [1, 1, 1]);
    object.scale.set(scale[0], scale[1], scale[2]);
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

function clearObjectChildren(root) {
    for (const child of [...root.children]) {
        disposeObjectTree(child);
    }
}

function createUsdCameraObject(prim, config) {
    const focalLength = getUsdNumberAttribute(prim, "focalLength", 50);
    const verticalAperture = getUsdNumberAttribute(prim, "verticalAperture", 20.955);
    const horizontalAperture = getUsdNumberAttribute(prim, "horizontalAperture", 20.955);
    const fov = MathUtils.radToDeg(2 * Math.atan((verticalAperture * 0.5) / focalLength));
    const aspect = horizontalAperture > 0 && verticalAperture > 0 ? horizontalAperture / verticalAperture : 1;
    const camera = new PerspectiveCamera(fov, aspect, 0.01, 100000);
    camera.name = prim.GetName?.() || "UsdCamera";
    camera.userData.usdPath = prim.GetPath?.() || "";
    camera.userData.usdTypeName = "Camera";
    applyUsdXformOps(prim, camera);
    return camera;
}

function getThreeLightIntensity(prim, config) {
    const intensity = getUsdNumberAttribute(prim, "inputs:intensity", 1);
    const exposure = getUsdNumberAttribute(prim, "inputs:exposure", 0);
    const scale = config.scenePrimitiveLightIntensityScale ?? defaultScenePrimitiveLightIntensityScale;
    return intensity * Math.pow(2, exposure) * scale;
}

function createUsdLightObject(prim, config) {
    const typeName = prim.GetTypeName?.() || "";
    const intensity = getThreeLightIntensity(prim, config);
    const colorValue = getUsdVectorAttribute(prim, "inputs:color", [1, 1, 1]);
    const color = new Color(colorValue[0], colorValue[1], colorValue[2]);
    let light;

    if (typeName === "DistantLight") {
        light = new DirectionalLight(color, intensity);
    } else if (typeName === "DomeLight") {
        light = new HemisphereLight(color, new Color(0.2, 0.2, 0.2), intensity);
    } else {
        light = new PointLight(color, intensity);
    }

    light.name = prim.GetName?.() || typeName || "UsdLight";
    light.userData.usdPath = prim.GetPath?.() || "";
    light.userData.usdTypeName = typeName;
    applyUsdXformOps(prim, light);

    return light;
}

function createUsdScenePrimitiveHelpers(object, prim, config) {
    const helpers = [];
    if (object.isCamera && (config.showCameraHelpers || config.showScenePrimitiveHelpers)) {
        const helper = new CameraHelper(object);
        helper.name = `${object.name}Helper`;
        helper.userData.usdHelperFor = object.userData.usdPath;
        helpers.push(helper);
    }

    if (object.isLight && (config.showLightHelpers || config.showScenePrimitiveHelpers)) {
        const color = object.color || new Color(1, 1, 1);
        let helper = null;
        if (object.isDirectionalLight) {
            helper = new DirectionalLightHelper(object, 0.5, color);
        } else if (object.isPointLight) {
            helper = new PointLightHelper(object, getUsdNumberAttribute(prim, "inputs:radius", 0.25), color);
        }
        if (helper) {
            helper.name = `${object.name}Helper`;
            helper.userData.usdHelperFor = object.userData.usdPath;
            helpers.push(helper);
        }
    }

    return helpers;
}

async function syncUsdScenePrimitives(driver, root, config) {
    if (!driver?.GetStage || !root) {
        return;
    }

    const stage = await waitMaybeAsync(driver.GetStage());
    const prims = vectorToArray(stage?.TraverseAll?.());
    clearObjectChildren(root);

    for (const prim of prims) {
        if (!prim?.IsValid?.()) continue;
        const typeName = prim.GetTypeName?.() || "";
        let object = null;
        if (typeName === "Camera") {
            object = createUsdCameraObject(prim, config);
        } else if (lightTypeNames.has(typeName)) {
            object = createUsdLightObject(prim, config);
        }
        if (object) {
            root.add(object);
            for (const helper of createUsdScenePrimitiveHelpers(object, prim, config)) {
                root.add(helper);
            }
        }
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
    const loadedFilePaths = [];

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
        paths: loadedFilePaths,
        USD,
        driver: () => /** @type {import(".").HdWebSyncDriver} */(driverOrPromise),
    };
    const scenePrimitiveRoot = new Object3D();
    scenePrimitiveRoot.name = "__usd_scene_primitives";
    scenePrimitiveRoot.userData.usdScenePrimitiveRoot = true;
    delegateConfig.usdRoot.add(scenePrimitiveRoot);

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

    /** Support for Y and Z up-axis in the root USD file */
    let stageUpAxis = await waitMaybeAsync(driver.GetStageUpAxis());
    let stageStartTimeCode = await waitMaybeAsync(driver.GetStageStartTimeCode());
    let stageEndTimeCode = await waitMaybeAsync(driver.GetStageEndTimeCode());
    let stageTimeCodesPerSecond = await waitMaybeAsync(driver.GetStageTimeCodesPerSecond());
    const stageUpAxisToken = String.fromCharCode(stageUpAxis).toLowerCase();
    stageUpAxis = stageUpAxisToken.charCodeAt(0);
    delegateConfig.usdRoot.rotation.x = stageUpAxisToken === 'z' ? -Math.PI / 2 : 0;
    delegateConfig.usdRoot.updateMatrixWorld(true);
    await syncUsdScenePrimitives(driver, scenePrimitiveRoot, config);

    /** Draw once, after stage metadata has been applied to the root scene. */
    const initialDrawPromise = draw();

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
                await syncUsdScenePrimitives(driver, scenePrimitiveRoot, config);
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
            await syncUsdScenePrimitives(driver, scenePrimitiveRoot, config);
            return draw();
        },
        materialsReady: () => renderInterface.waitForMaterialsReady(),
        diagnostics: () => renderInterface.getDiagnostics(),
        stageMetadata: () => ({
            upAxis: String.fromCharCode(stageUpAxis),
            startTimeCode: stageStartTimeCode,
            endTimeCode: stageEndTimeCode,
            timeCodesPerSecond: stageTimeCodesPerSecond,
        }),
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
                console.warn("Deferring USD cleanup while Hydra draw is still pending.");
                activeDrawPromise.finally(cleanup).catch((error) => console.error("Deferred USD cleanup failed", error));
                return;
            }

            await drawPromise.catch(() => {});
            await cleanup();

            if (debug) console.warn("Disposed Three Hydra");
        },
    }
}
