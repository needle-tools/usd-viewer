let webGlPreparation;

/** The LTC tables are only needed once an area emitter enters the scene. */
export function prepareWebGlAreaLights() {
    return webGlPreparation ??= import('three/addons/lights/RectAreaLightUniformsLib.js')
        .then(({ RectAreaLightUniformsLib }) => { RectAreaLightUniformsLib.init(); });
}
