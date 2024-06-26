import { Scene } from "three"
import { HdWebSyncDriver, USD } from ".."


export declare type createThreeHydraConfig = {

    debug?: boolean,

    /**
     *  USD Module
     * @example 
     * ```javascript
     * getUsdModule({
     *  mainScriptUrlOrBlob: "/emHdBindings.js"
     * }).then(USD => { ... })
     * ```
     */
    USD: USD,

    /**
     * path to the usdz file
     */
    usdz: string,
    /**
     * Optional buffer of the usdz file
     */
    buffer?: ArrayBuffer,

    scene: Scene,

}

export declare type createThreeHydraReturnType = {
    driver: HdWebSyncDriver,
    update: (dt: number) => void,
    dispose: () => void,
}


export function createThreeHydra(config: createThreeHydraConfig): Promise<createThreeHydraReturnType>