import {DataTexture, DataUtils, HalfFloatType, NoColorSpace, RGBAFormat, Source, SRGBColorSpace, Texture, UnsignedByteType} from 'three';
import {readTextureSamples} from '../hydra/textureChannels.js';
import {decodeEncodedTexture, getEncodedImage, transformEncodedNormal} from '../hydra/encodedTexture.js';

const colorMaps = new Set(['map', 'emissiveMap', 'specularColorMap', 'sheenColorMap']);
const toSrgb = c => c <= .0031308 ? 12.92 * c : 1.055 * Math.max(0, c) ** (1 / 2.4) - .055;
const toLinear = c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;

export function useGltfTextureTransforms(writer) {
	const apply = writer.applyTextureTransform;
	writer.applyTextureTransform = function (definition, texture) {
		apply.call(this, definition, texture);
		const transform = definition.extensions?.KHR_texture_transform;
		// Three's rotation field turns UVs clockwise. glTF uses counter-clockwise
		// rotation; retain the render texture's fields and convert at serialization.
		if (transform && texture.rotation !== 0) transform.rotation = -texture.rotation;
	};
}

export function useEncodedGltfImages(writer, transformPng) {
 const images = new WeakMap();
 const budget = 256 * 1024 * 1024;
 let queuedBytes = 0;
 const running = new Set();
 const encode = async (entry, bytes) => {
  while (running.size && queuedBytes + bytes > budget) await Promise.race(running);
  queuedBytes += bytes;
  const task = Promise.resolve().then(() => transformPng(entry.blob, entry.transform));
  running.add(task);
  try { return await task; }
  finally { queuedBytes -= bytes; running.delete(task); }
 };
 const processImage = writer.processImage;
 writer.processImage = function (image, format, flipY, mimeType) {
  const entry = getEncodedImage(image);
  if (!entry) return processImage.call(this, image, format, flipY, mimeType);
  if (images.has(image)) return images.get(image);
  const definition = {mimeType: 'image/png'};
  const index = (writer.json.images ||= []).push(definition) - 1;
  images.set(image, index);
  const transform = entry.transform;
  const wideSamples = entry.original?.bitDepth === 16;
  const encoded = transform && (wideSamples || transform.flipRows || transform.flipRed || transform.flipGreen)
   ? encode(entry, image.width * image.height * (wideSamples ? 8 : 4)) : Promise.resolve(entry.blob);
  writer.pending.push(encoded.then(blob => {
   if (blob?.type !== 'image/png' || !blob.size) throw new TypeError('The PNG transform must return an encoded PNG Blob.');
   return writer.processBufferViewImage(blob);
  }).then(bufferView => { definition.bufferView = bufferView; }));
  return index;
 };
 const apply = writer.applyTextureTransform;
 writer.applyTextureTransform = function (definition, texture) {
  apply.call(this, definition, texture);
  const entry = getEncodedImage(texture.image);
  if (!entry || entry.transform || !texture.flipY) return;
  // Reflect the sampling transform to compensate for retaining the source rows.
  const extensions = definition.extensions ||= {};
  const transform = extensions.KHR_texture_transform ||= {};
  const [x, y] = transform.offset ?? [0, 0], [u, v] = transform.scale ?? [1, 1];
  transform.offset = [x, 1 - y];
  transform.scale = [u, -v];
  if (transform.rotation) transform.rotation = -transform.rotation;
  writer.extensionsUsed.KHR_texture_transform = true;
  writer.extensionsRequired.KHR_texture_transform = true;
 };
}

export function cachePackedTextures(writer) {
 const method=typeof writer.buildMetalRoughTextureAsync==='function'?'buildMetalRoughTextureAsync':typeof writer.buildMetalRoughTexture==='function'?'buildMetalRoughTexture':null;
 const canvases=new WeakMap();
 const drawable=(texture,opaque=false)=>{
  if(!texture?.image?.data)return texture;
  let copies=canvases.get(texture);if(!copies)canvases.set(texture,copies=new Map());
  if(copies.has(opaque))return copies.get(opaque);
  const {width,height,data}=texture.image;
  const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,height):document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const pixels=new Uint8ClampedArray(data);
  // Normal-map alpha is unused. Keep channel values when canvas processing
  // premultiplies alpha, including sign inversions of an empty UDIM cell.
  if(opaque)for(let index=3;index<pixels.length;index+=4)pixels[index]=255;
  canvas.getContext('2d').putImageData(new ImageData(pixels,width,height),0,0);
  const copy=new Texture().copy(texture);copy.source=new Source(canvas);copies.set(opaque,copy);return copy;
 };
 const normalMethod=['buildNormalMapTextureAsync','buildNormalMapTexture'].find(name=>typeof writer[name]==='function');
 if(normalMethod){
  const normal=writer[normalMethod];
  writer[normalMethod]=(texture,flipRed,flipGreen,...args)=>{
   const encoded = getEncodedImage(texture.image);
   if (encoded?.transform) return transformEncodedNormal(texture, {flipRed, flipGreen});
   if (encoded) return decodeEncodedTexture(texture).then(value=>normal.call(writer,drawable(value,true),flipRed,flipGreen,...args));
   return normal.call(writer,drawable(texture,true),flipRed,flipGreen,...args);
  };
 }
 if(!method)return;
 const build=writer[method],pairs=new Map();
 writer[method]=(...args)=>{
  const [metalness,roughness]=args;let values=pairs.get(metalness);
  if(metalness===roughness)return build.apply(writer,args);
  if(!values)pairs.set(metalness,values=new Map());
  // Three's packing path uses drawImage, including for pixel-backed maps.
  if(!values.has(roughness)){
   const inputs=[metalness,roughness];
   const packed=(a,b)=>build.call(writer,drawable(a),drawable(b),...args.slice(2));
   values.set(roughness,inputs.some(texture=>getEncodedImage(texture?.image))
    ? Promise.all(inputs.map(texture=>texture&&decodeEncodedTexture(texture))).then(([a,b])=>packed(a,b))
    : packed(metalness,roughness));
  }
  return values.get(roughness);
 };
}

// three.js material texture properties. Read through these names, not Object.keys:
// hosts such as Needle Engine keep the values in renamed backing fields behind
// accessors, and the slot name decides how each texture is encoded.
const textureSlots = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap',
 'bumpMap', 'displacementMap', 'lightMap', 'specularMap', 'specularColorMap', 'specularIntensityMap',
 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap', 'sheenRoughnessMap',
 'transmissionMap', 'thicknessMap', 'iridescenceMap', 'iridescenceThicknessMap', 'anisotropyMap', 'gradientMap', 'matcap'];

/** A material's textures as [slot, texture] pairs, keyed by three.js slot name.
 * @param {object} material
 * @param {{includeEnvironment?: boolean}} [options]
 * @returns {Array<[string, import('three').Texture]>} */
export function materialTextures(material, {includeEnvironment = false} = {}) {
 const slots = includeEnvironment ? [...textureSlots, 'envMap'] : textureSlots;
 return slots.map(slot => [slot, material[slot]]).filter(([, texture]) => texture?.isTexture);
}

/** Share identical sampled images, including ORM maps cloned into separate
 * roughness/metalness slots. This lets Three retain their existing packing. */
export function textureCanonicalizer() {
 const images=new WeakMap();
 return texture=>{
  const image=texture.image;if(!image||typeof image!=='object')return texture;
  const properties=['name','colorSpace','type','format','flipY','channel','wrapS','wrapT','magFilter','minFilter','anisotropy','matrixAutoUpdate','offset','repeat','rotation','center','matrix','userData'];
  let key;try{key=JSON.stringify(properties.map(name=>texture[name]?.toArray?.()??texture[name]));}catch{return texture;}
  let variants=images.get(image);if(!variants)images.set(image,variants=new Map());
  if(!variants.has(key))variants.set(key,texture);
  return variants.get(key);
 };
}

// glTF fixes texture encoding by material slot. Three's exporter serializes
// pixels as stored, so bake any differing transfer function before writing PNG.
export function portableTexture(texture, slot) {
 const image = texture.image;
 if (!image?.width || !image?.height || texture.isCompressedTexture) return texture;
 const srgb = texture.colorSpace === SRGBColorSpace, color = colorMaps.has(slot);
 if (srgb === color && (!texture.isDataTexture || texture.type === UnsignedByteType && texture.format === RGBAFormat)) return texture;
 const {pixels, count, components, canvas} = readTextureSamples(image, texture);
 const half = texture.type === HalfFloatType && !canvas;
 const maximum = pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray ? 255 : pixels instanceof Uint16Array && !half ? 65535 : 1;
 const decode = half ? DataUtils.fromHalfFloat : value => value / maximum;
 const transfer = srgb === color ? value => value : color ? toSrgb : toLinear;
 const data = new Uint8Array(count * 4);
 for (let pixel = 0; pixel < count; pixel++) for (let component = 0; component < 4; component++) {
  const value = component < components ? decode(pixels[pixel * components + component]) : component === 3 ? 1 : 0;
  data[pixel * 4 + component] = Math.round(Math.max(0, Math.min(1, component === 3 ? value : transfer(value))) * 255);
 }
 // GLTFExporter writes DataTexture pixels with putImageData, which ignores its flipY
 // transform. Store a flipped texture bottom row first instead: it renders the same
 // and exports in the orientation an unbaked flipY texture would.
 if (texture.flipY) {
  const row = image.width * 4, swap = new Uint8Array(row);
  for (let top = 0, bottom = image.height - 1; top < bottom; top++, bottom--) {
   swap.set(data.subarray(top * row, top * row + row));
   data.copyWithin(top * row, bottom * row, bottom * row + row);
   data.set(swap, bottom * row);
  }
 }
 const copy = new DataTexture(); copy.copy(texture);
 copy.source = new Source({data, width: image.width, height: image.height});
 copy.flipY = false;
 copy.format = RGBAFormat; copy.type = UnsignedByteType; copy.colorSpace = color ? SRGBColorSpace : NoColorSpace;
 copy.needsUpdate = true;
 return copy;
}

export async function prepareGltfTexture(texture, slot, resolution, transformPng) {
 const encoded = getEncodedImage(texture.image);
 if (!encoded) return portableTexture(texture, slot);
 const needsPixels = (texture.colorSpace === SRGBColorSpace) !== colorMaps.has(slot) || resolution === 'preview';
 if (!needsPixels && slot === 'normalMap' && transformPng) return transformEncodedNormal(texture);
 if (needsPixels || encoded.bitDepth === 16 || (slot === 'normalMap' && texture.flipY)) {
  texture = await decodeEncodedTexture(texture);
 }
 return portableTexture(texture, slot);
}
