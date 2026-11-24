import {Source, Texture} from 'three';

const encodedImages = new WeakMap();

// Only formats whose pixel layout can be determined without a decoder belong here.
export function createEncodedPng(bytes, encoding, decode) {
 const bitDepth = encoding?.bitDepth;
 if ((bitDepth !== 8 && bitDepth !== 16) || bytes.length < 33) return null;
 const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
 if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) return null;
 const width = view.getUint32(16), height = view.getUint32(20);
 if (!width || !height) return null;
 const image = {width, height};
 const blob = new Blob([bytes], {type: 'image/png'});
 encodedImages.set(image, {blob, bitDepth, decode});
 return new Texture(image);
}

export function getEncodedImage(image) {
 return encodedImages.get(image);
}

export function transformEncodedNormal(texture, transform) {
 const {width, height} = texture.image;
 const source = encodedImages.get(texture.image);
 const original = source.original ?? source;
 const flipRows = texture.flipY, {flipRed = false, flipGreen = false} = transform ?? {};
 const key = `${flipRows}:${flipRed}:${flipGreen}`;
 const variants = original.variants ??= new Map();
 if (!variants.has(key)) {
  const image = {width, height};
  encodedImages.set(image, {blob: original.blob, original, transform: {flipRows, flipRed, flipGreen}});
  variants.set(key, new Source(image));
 }
 const copy = texture.clone();
 copy.source = variants.get(key);
 return copy;
}

export async function decodeEncodedTexture(texture) {
 const encoded = encodedImages.get(texture.image);
 if (!encoded) return texture;
 const entry = encoded.original ?? encoded;
 entry.decoded ??= entry.decode(entry.blob).then(image => new Source(image));
 const copy = texture.clone();
 copy.source = await entry.decoded;
 return copy;
}
