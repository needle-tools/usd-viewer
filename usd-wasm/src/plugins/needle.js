import { Loader, Object3D } from "three";
import { createThreeHydra, getUsdModule } from "../index.js";



/** @type {import("../types").addPluginForNeedleEngine} */
export async function addPluginForNeedleEngine(options) {
    return import("@needle-tools/engine")
        .then(NEEDLE => {
            console.debug("🐉 Adding USDZ plugin to Needle Engine");
            onAddNeedlePlugin(NEEDLE, options)
        })
}


/**
 * @param {typeof import("@needle-tools/engine")} NEEDLE
 * @param {import("../types").PluginContext} opts
 */
function onAddNeedlePlugin(NEEDLE, opts) {

    class NeedleUSDZHHandler extends NEEDLE.Behaviour {
        constructor() {
            super();
            /**
             * @type {import("..").NeedleThreeHydraHandle | null}
             */
            this.handle = null;
            this.root = new Object3D();
        }

        update() {
            if (this.handle) {
                this.handle.update(this.context.time.deltaTime);
            }
        }
        onDestroy() {
            if (this.handle) {
                this.handle.dispose();
                this.handle = null;
            }
        }
    }


    /**
     * Needle USDZ Loader
     * @extends {Loader<Object3D>}
     */
    class NeedleUSDZLoader extends Loader {

        /**
         * the usd module promise - initialized when the first loader is created
         * @type {Promise<import("../types").USD> | null}
         * @private
         * @static
         */
        static usdModule = null;

        // LOADER IMPL:

        /**
         * @param {NeedleUSDZHHandler} comp
         */
        constructor(comp) {
            super();
            this.comp = comp;
        }

        /**
         * @type {Loader<Object3D>["loadAsync"]}
         */
        async loadAsync(url, onProgress) {

            const debug = opts.debug || false;;

            onProgress?.(new ProgressEvent("load", { lengthComputable: false, loaded: 0, total: 0 }));

            // Get the files immediately (don't wait for the USD module to be loaded)
            const files = opts.getFiles();

            NeedleUSDZLoader.usdModule ??= getUsdModule({
                debug
                // setURLModifier: USDLoadingManager.urlModifier,
            }).then(res => {
                console.debug("🐉 USD HYDRA IS READY");
                return res;
            })
            const usd = await NeedleUSDZLoader.usdModule;

            onProgress?.(new ProgressEvent("load", { lengthComputable: true, loaded: .5, total: 1 }));

            // Load hydra
            const handle = await createThreeHydra({
                debug,
                USD: usd,
                scene: this.comp.root,
                url: url,
                files: files,
            });
            this.comp.handle = handle;

            onProgress?.(new ProgressEvent("load", { lengthComputable: true, loaded: 1, total: 1 }));

            return this.comp.root;
        }

        parse() {
            console.error("🐉 USDZ LOADER PARSE CALLED: Not implemented");
            return this.comp.root;
        }
    }





    const removeFiletype = NEEDLE.NeedleEngineModelLoader.onDetermineModelMimetype(cb => {

        if (cb.contentType === "application/vnd.usd") {
            return "model/vnd.usd";
        }
        const ext = cb.url.split('.').pop()?.toLowerCase();
        switch (ext) {
            case "usdz":
                return "model/vnd.usdz+zip"
            case "usda":
                return "model/vnd.usda"
            case "usdc":
                return "model/vnd.usdc"
            case "usd":
                return "model/vnd.usd"
        }
        return null;
    });

    const handlers = new Array();
    const removeCustomLoader = NEEDLE.NeedleEngineModelLoader.onCreateCustomModelLoader(cb => {
        if (cb.mimetype.startsWith("model/vnd.usd")) {
            const handler = new NeedleUSDZHHandler();
            handlers.push(handler);
            NEEDLE.addComponent(cb.context.scene, handler);
            return new NeedleUSDZLoader(handler);
        }
        return null;
    });


    return () => {
        removeFiletype();
        removeCustomLoader();
        for (const handler of handlers) {
            handler.destroy();
        }
        handlers.length = 0;
    }

}