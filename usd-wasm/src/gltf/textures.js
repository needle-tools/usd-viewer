import {DataTexture, DataUtils, HalfFloatType, NoColorSpace, RGBAFormat, Source, SRGBColorSpace, Texture, UnsignedByteType} from 'three';
import {readTextureSamples} from '../hydra/textureChannels.js';

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
  writer[normalMethod]=(texture,...args)=>normal.call(writer,drawable(texture,true),...args);
 }
 if(!method)return;
 const build=writer[method],pairs=new Map();
 writer[method]=(...args)=>{
  const [metalness,roughness]=args;let values=pairs.get(metalness);
  if(metalness===roughness)return build.apply(writer,args);
  if(!values)pairs.set(metalness,values=new Map());
  // Three's packing path uses drawImage, including for pixel-backed maps.
  if(!values.has(roughness))values.set(roughness,build.call(writer,drawable(metalness),drawable(roughness),...args.slice(2)));
  return values.get(roughness);
 };
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
 const copy = new DataTexture(); copy.copy(texture);
 copy.source = new Source({data, width: image.width, height: image.height});
 copy.format = RGBAFormat; copy.type = UnsignedByteType; copy.colorSpace = color ? SRGBColorSpace : NoColorSpace;
 copy.needsUpdate = true;
 return copy;
}
