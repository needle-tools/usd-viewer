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

    const { usdz, buffer, USD } = config;

    const file = await createFile({
        USD,
        filepath: usdz,
        buffer
    });


    if (Array.isArray(config.files)) {
        for (const file of config.files) {
            console.log("Loading file", file);
            
            await createFile({
                USD,
                filepath: file.path,
                buffer: await file.arrayBuffer()
            });
        }
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
            config.USD.FS_unlink(file);
            driver.delete();
            if (debug) console.warn("Disposed Three Hydra");
        },
    }
}