import { Color, SRGBColorSpace, DataTexture, DataUtils, EquirectangularReflectionMapping, FloatType, HalfFloatType,
    LinearSRGBColorSpace, LinearFilter, RepeatWrapping, Quaternion, Vector3, RGBAFormat } from 'three';

const environments = new WeakMap();
// USD/Storm longitude is atan2(z,x)/(2*pi) + 1/4; Three uses +1/2.
// Compose this local basis after the authored transform, for both illumination
// and camera backgrounds. The panorama's latitude convention is handled by flipY.
const domeBasis = new Quaternion().setFromAxisAngle(new Vector3(0,1,0), -Math.PI/2);

export function getDomeRotation(object, target) {
    object.updateWorldMatrix(true, false);
    return target.setFromQuaternion(object.getWorldQuaternion(new Quaternion()).multiply(domeBasis));
}

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
            getDomeRotation(entry.object, scene.environmentRotation);
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
    // DataTexture defaults to nearest filtering. The visible dome must sample
    // the decoded panorama smoothly, including across the longitude seam.
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.wrapS = RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
}
