import { Color, SRGBColorSpace, DataTexture, DataUtils, EquirectangularReflectionMapping, FloatType, HalfFloatType,
    LinearSRGBColorSpace, Quaternion, RGBAFormat } from 'three';

const environments = new WeakMap();

// A scene can contain several independently owned USD handles. Keep dome
// ownership separate from the host environment, and restore it on removal.
export function updateDomeEnvironment(owner, scene, texture, state, object) {
    if (!scene?.isScene) return;
    let record = environments.get(scene);
    if (!record) {
        record = { entries: new Map(), baseline: {
            texture: scene.environment, intensity: scene.environmentIntensity,
            rotation: scene.environmentRotation?.clone(),
        } };
        environments.set(scene, record);
    }
    record.entries.set(owner, { texture, state, object });
    apply(scene, record);
}

function apply(scene, record) {
    const entry = [...record.entries.values()].reverse().find(entry => entry.state.visible !== false && entry.texture);
    scene.environment = entry?.texture || record.baseline.texture;
    if ('environmentIntensity' in scene) scene.environmentIntensity = entry ? Number(entry.state.intensity ?? 1) : record.baseline.intensity;
    if (scene.environmentRotation) {
        if (entry) {
            entry.object.updateWorldMatrix(true, false);
            scene.environmentRotation.setFromQuaternion(entry.object.getWorldQuaternion(new Quaternion()));
        } else if (record.baseline.rotation) scene.environmentRotation.copy(record.baseline.rotation);
    }
}

export function removeDomeEnvironment(owner, scene) {
    const record = environments.get(scene);
    if (!record) return;
    record.entries.delete(owner);
    apply(scene, record);
    if (!record.entries.size) environments.delete(scene);
}

export function createDomeTexture(source, color) {
    // Own the tinted texture; never alter resolver-cached image data shared by
    // materials or another handle. RGBE/EXR loaders supply linear texels.
    let image = source?.image;
    let srgb = source?.colorSpace === SRGBColorSpace;
    if (image && !image.data && typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d', {willReadFrequently:true});
        context.drawImage(image, 0, 0);
        image = context.getImageData(0, 0, canvas.width, canvas.height);
        srgb = true;
    }
    const texel = new Color();
    let data, width, height;
    if (image?.data) {
        width = image.width; height = image.height;
        const channels = image.data.length / (width * height);
        data = new Float32Array(width * height * 4);
        for (let pixel = 0; pixel < width * height; pixel++) {
            for (let component = 0; component < 3; component++) {
                const value = image.data[pixel * channels + component];
                const linear = source.type === HalfFloatType ? DataUtils.fromHalfFloat(value)
                    : image.data instanceof Uint8Array || image.data instanceof Uint8ClampedArray ? value / 255 : value;
                data[pixel * 4 + component] = linear;
            }
            if (srgb) {
                texel.setRGB(data[pixel*4], data[pixel*4+1], data[pixel*4+2], SRGBColorSpace);
                data[pixel*4] = texel.r; data[pixel*4+1] = texel.g; data[pixel*4+2] = texel.b;
            }
            for (let component = 0; component < 3; component++) data[pixel*4+component] *= color[component];
            data[pixel * 4 + 3] = 1;
        }
    } else if (source) {
        throw new Error('USD dome lighting requires a decoded image');
    } else {
        // WebGL PMREM needs at least a 16-pixel cube face (64-pixel equirectangular width).
        // Smaller constant maps lose specular illumination in its minimum LOD.
        width = 64; height = 32; data = new Float32Array(width * height * 4);
        for (let pixel = 0; pixel < width * height; pixel++) data.set([...color, 1], pixel * 4);
    }
    const texture = new DataTexture(data, width, height, RGBAFormat, FloatType);
    texture.mapping = EquirectangularReflectionMapping;
    texture.colorSpace = LinearSRGBColorSpace;
    texture.flipY = source?.flipY ?? false;
    texture.needsUpdate = true;
    return texture;
}
