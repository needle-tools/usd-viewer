import { threeJsRenderDelegate } from "./hydra";


/**
 * Set up a Three.js Hydra render delegate.
 * @param {import(".").createThreeHydraConfig} config
 * @returns {Promise<import(".").createThreeHydraReturnType>}
 */
export async function createThreeHydra(config) {

    const filepath = config.usdz;

    // Put a simple USDZ file into the virtual file system so USD can access it
    const blob = await fetch(filepath);
    const arrayBuffer = await blob.arrayBuffer();
    // Create a file in the virtual file system
    config.USD.FS_createDataFile("", filepath, new Uint8Array(arrayBuffer), true, true, true);

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

    /**
     * Draw at least once
     */
    driver.Draw();

    const stage = driver.GetStage();
    let time = 0;

    return {
        driver: /** @type {import(".").HdWebSyncDriver} */ (driverOrPromise),
        update: (dt) => {
            time += dt;
            let timecode = time * stage.GetTimeCodesPerSecond();
            timecode = timecode % (stage.GetEndTimeCode() - stage.GetStartTimeCode());
            driver.SetTime(timecode)
            driver.Draw()
        }
    }
}