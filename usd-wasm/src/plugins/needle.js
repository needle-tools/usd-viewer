import { Loader, Object3D } from "three";
import { createThreeHydra, getUsdModule } from "../index.js";

const hydraHandlesByRoot = new WeakMap();

/**
 * Return the Hydra handle created by the Needle Engine USD plugin for a loaded asset.
 * The argument can be the value returned by `NEEDLE.loadAsset(...)` or any Object3D
 * within that loaded hierarchy.
 *
 * @param {unknown} asset
 * @returns {import("..").NeedleThreeHydraHandle | null}
 */
export function getHydraHandleFromNeedleEngineAsset(asset) {
    const root = findObject3D(asset);
    if (!root) return null;

    let handle = hydraHandlesByRoot.get(root) || null;
    if (handle) return handle;

    root.traverse?.((object) => {
        handle ??= hydraHandlesByRoot.get(object) || null;
    });
    return handle;
}

/**
 * @param {unknown} value
 * @returns {Object3D | null}
 */
function findObject3D(value) {
    if (!value) return null;
    if (value instanceof Object3D || value.isObject3D === true) return value;
    return findObject3D(value.scene) || findObject3D(value.root);
}


/** @type {import("../types").addPluginForNeedleEngine} */
export async function addPluginForNeedleEngine(options) {
    if (options.debug) console.debug("🐉 Adding USDZ plugin to Needle Engine");
    return import("@needle-tools/engine").then(module => {
        return onAddNeedlePlugin(module, options);
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
                void this.handle.dispose();
                this.handle = null;
            }
            hydraHandlesByRoot.delete(this.root);
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
                if (debug) console.debug("🐉 USD HYDRA IS READY");
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
                autoPlay: true,
                waitForMaterials: opts.waitForMaterials,
                complexity: opts.complexity,
            });
            this.comp.handle = handle;
            hydraHandlesByRoot.set(this.comp.root, handle);

            await handle.ready();
            await handle.materialsReady();

            if (debug) console.debug("Loaded", this.comp);

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
