import { threeJsRenderDelegate } from "./hydra/index.js";
import { tryDetermineFileFormat } from "./utils.js";


/**
 * @param {{USD:import("./types").USD, filepath:string, buffer?:ArrayBuffer, parent?:string,}} opts
 */
async function createFile(opts) {
    if (typeof opts.filepath !== "string") throw new Error("Filepath must be a string");

    let filepath = /** @type {string} */ (opts.filepath);

    let arrayBuffer = opts.buffer;
    if (!arrayBuffer) {
        const blob = await fetch(filepath);
        arrayBuffer = await blob.arrayBuffer();
    }

    // ensure that file paths are not using slashes
    /** @ts-ignore */
    filepath = filepath.replaceAll(/\\/g, "/").replaceAll("/", "_");

    const format = tryDetermineFileFormat(arrayBuffer);
    const ext = filepath.split(".").pop();
    if (ext !== "usdz" && ext !== "usd" && ext !== "usda") {
        if (format === "usdz" || format === "usd" || format === "usda") {
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


/**
 * Set up a Three.js Hydra render delegate.
 * @param {import(".").createThreeHydraConfig} config
 * @returns {Promise<import(".").createThreeHydraReturnType>}
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
            USD.FS_createDataFile(directoryForFiles + directory, fileName, new Uint8Array(await file.arrayBuffer()), true, true, true);
        }
    }

    // Capabilities of the loader.
    // This depends on the HttpAssetResolver implementation and the virtual file system.
    const allowFetchWebUrls = true;
    const allowFetchLocalFiles = false;

    // Which file we actually load as root file depends:
    // - when an array of files is provided, we use the first one;
    // - when a URL is provided, we use that;
    // - when a blob is provided, we create a file from that blob and sanitize the filename.
    let file = "";
    if (config.files?.length) {
        file = directoryForFiles + config.files[0].path;
    }
    else if (config.url) {
        const isBlob = config.url.startsWith("blob");
        const isWebUrl = config.url.startsWith("http");
        if (isBlob) {
            file = await createFile({USD, filepath: config.url, buffer });
        }
        else if ((allowFetchWebUrls && isWebUrl) || allowFetchLocalFiles) {
            file = config.url;
        }
        else {
            file = await createFile({USD, filepath: config.url, buffer });
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

    const renderInterface = new threeJsRenderDelegate(file, delegateConfig);

    if (debug) console.log("RENDER INTERFACE", renderInterface);

    driverOrPromise = new config.USD.HdWebSyncDriver(renderInterface, file);
    if (driverOrPromise instanceof Promise) {
        driverOrPromise = await driverOrPromise;
    }

    const driver = /** @type {import(".").HdWebSyncDriver} */ (driverOrPromise);

    if (debug) console.log("DRIVER", driver);

    let stage = driver.GetStage();

    /** Draw once */
    driver.Draw();

    /** Support for Y and Z up-axis in the root USD file */
    delegateConfig.usdRoot.rotation.x = String.fromCharCode(stage.GetUpAxis()) === 'z' ? -Math.PI / 2 : 0;

    let time = 0;

    if (debug) console.log("STAGE", stage);

    return {
        driver: /** @type {import(".").HdWebSyncDriver} */ (driverOrPromise),
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
            let timecode = time * stage.GetTimeCodesPerSecond();
            timecode = timecode % (stage.GetEndTimeCode() - stage.GetStartTimeCode());
            driver.SetTime(timecode);
            driver.Draw();
        },
        /**
         * Dipoose the Three Hydra delegate.
         * This does *not* clear the threejs scene but only dispose the USD delegate and loaded files
         */
        dispose: () => {
            if (debug) console.warn("Disposing Three Hydra");
            driverOrPromise = null;

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
                        // console.log("unlinking folder", fullPath);
                        config.USD.FS_rmdir(path + fileName);
                    }
                    else {
                        // console.log("unlinking", fullPath);
                        unlinkedFiles.add(fullPath);
                        config.USD.FS_unlink(fullPath);
                    }
                }
            }

            function rmRootDir(rootDir) {
                const allFiles = config.USD.FS_analyzePath(rootDir).object;
                if (allFiles)
                    unlinkFiles(allFiles, rootDir);
            }

            rmRootDir(directoryForFiles);
            rmRootDir("1/"); // HTTPAssetResolver puts files into a series of folders named "/1/1/1/1" to allow for parent traversal
            
            if (!unlinkedFiles.has(file))
                config.USD.FS_unlink(file);
            driver.delete();
            if (debug) console.warn("Disposed Three Hydra");
        },
    }
}