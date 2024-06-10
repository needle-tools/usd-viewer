import { Scene } from "three"
import { HdWebSyncDriver, USD } from ".."


export declare type createThreeHydraConfig = {

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

    scene: Scene,

}

export declare type createThreeHydraReturnType = {
    driver: HdWebSyncDriver,
    update: (dt: number) => void,
}


export function createThreeHydra(config: createThreeHydraConfig): Promise<createThreeHydraReturnType>