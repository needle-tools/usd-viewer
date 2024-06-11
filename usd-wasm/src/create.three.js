import { threeJsRenderDelegate } from "./hydra/index.js";


/**
 * @param {{USD:import("./types").USD, filepath:string, buffer?:ArrayBuffer, parent?:string,}} opts
 */
async function createFile(opts) {
    if (typeof opts.filepath !== "string") throw new Error("Filepath must be a string");

    let filepath = /** @type {string & { replaceAll:Function }} */ (opts.filepath);

    let arrayBuffer = opts.buffer;
    if (!arrayBuffer) {
        const blob = await fetch(filepath);
        arrayBuffer = await blob.arrayBuffer();
    }

    // ensure that file paths are not using slashes
    filepath = filepath.replaceAll(/\\/g, "/").replaceAll("/", "_");


    // Put a simple USDZ file into the virtual file system so USD can access it
    // Create a file in the virtual file system
    opts.USD.FS_createDataFile("", filepath, new Uint8Array(arrayBuffer), true, true, true);
}


/**
 * Set up a Three.js Hydra render delegate.
 * @param {import(".").createThreeHydraConfig} config
 * @returns {Promise<import(".").createThreeHydraReturnType>}
 */
export async function createThreeHydra(config) {
    const debug = config.debug || false;

    if (debug) console.log("USD", config.USD);

    const { usdz: filepath, buffer, USD } = config;

    await createFile({
        USD,
        filepath,
        buffer
    });


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

    const renderInterface = new threeJsRenderDelegate(filepath, delegateConfig);

    driverOrPromise = new config.USD.HdWebSyncDriver(renderInterface, filepath);
    if (driverOrPromise instanceof Promise) {
        driverOrPromise = await driverOrPromise;
    }

    const driver = /** @type {import(".").HdWebSyncDriver} */ (driverOrPromise);

    if (debug) console.log(driver);

    /**
     * Draw at least once
     */
    driver.Draw();


    const stage = driver.GetStage();
    let time = 0;

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
            config.USD.FS_unlink(filepath);
            driver.delete();
            if (debug) console.warn("Disposed Three Hydra");
        },
    }
}