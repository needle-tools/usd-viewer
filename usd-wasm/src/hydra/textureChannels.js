import { DataUtils, FloatType, HalfFloatType, RedFormat, RGFormat, RGBAFormat } from 'three';

// RGBFormat's serialized value is stable, but its export is absent in some
// supported three.js releases. Keep reading legacy RGB data without requiring it.
const RGBFormat = 1022;

// Channel conversion operates on encoded samples. Color-space decoding belongs
// to the renderer and must never be applied to alpha, normal, or scalar data here.
function readTextureSamples(image, options) {
  let pixels = image?.data;
  let canvas;
  let context;
  let imageData;
  if (!pixels && image?.width && image?.height && typeof document !== 'undefined') {
    canvas = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    imageData = context.getImageData(0, 0, image.width, image.height);
    pixels = imageData.data;
  }
  const count = image?.width * image?.height;
  const components = canvas ? 4 : { [RedFormat]: 1, [RGFormat]: 2, [RGBFormat]: 3, [RGBAFormat]: 4 }[options.format ?? RGBAFormat];
  if (!pixels || !components || pixels.length !== count * components) {
    throw new Error('Unsupported USD texture channel layout.');
  }
  return { pixels, canvas, context, imageData, count, components };
}

export function remapTextureSamples(image, channel, target, transform, options = {}) {
  const { pixels, canvas, context, imageData, count, components } = readTextureSamples(image, options);
  const half = options.type === HalfFloatType && !canvas;
  const maximum = pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray ? 255
    : pixels instanceof Uint16Array && !half ? 65535 : 1;
  const decode = half ? DataUtils.fromHalfFloat : value => value / maximum;
  const encode = half ? DataUtils.toHalfFloat : value => value * maximum;
  const output = new pixels.constructor(count * 4);
  const index = { r: 0, g: 1, b: 2, a: 3 }[channel];
  for (let pixel = 0; pixel < count; pixel++) {
    const i = pixel * 4, source = pixel * components;
    for (let component = 0; component < 4; component++) {
      output[i + component] = component < components ? pixels[source + component] : encode(component === 3 ? 1 : 0);
    }
    const r = decode(output[i]), g = decode(output[i + 1]), b = decode(output[i + 2]);
    let sample = channel === 'one' ? 1 : index !== undefined ? decode(output[i + index])
      : channel === 'maximum' ? Math.max(r, g, b)
      : channel === 'luminance' ? 0.2126 * r + 0.7152 * g + 0.0722 * b : (r + g + b) / 3;
    sample = sample * (transform?.scale ?? 1) + (transform?.bias ?? 0);
    // Only the remapped scalar slot is bounded. Other channels, including HDR
    // color samples, retain their original bit pattern and dynamic range.
    output[i + target] = encode(Math.max(0, Math.min(1, sample)));
  }
  if (canvas) {
    imageData.data.set(output);
    context.putImageData(imageData, 0, 0);
    return canvas;
  }
  return { ...image, data: output };
}

// Preview normal inputs consume signed values. Three decodes normal maps with
// 2*x-1, so encode (sample*scale+bias+1)/2 without clipping the signed result.
export function remapNormalTextureSamples(image, scale, bias, options = {}) {
  const { pixels, canvas, context, imageData, count, components } = readTextureSamples(image, options);
  const half = options.type === HalfFloatType && !canvas;
  const integer = pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray || (pixels instanceof Uint16Array && !half);
  const maximum = pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray ? 255 : integer ? 65535 : 1;
  const decode = half ? DataUtils.fromHalfFloat : value => value / maximum;
  const samples = new Float32Array(count * 4);
  let promote = false;
  for (let pixel = 0; pixel < count; pixel++) {
    for (let component = 0; component < 4; component++) {
      const value = component < components ? decode(pixels[pixel * components + component]) : component === 3 ? 1 : 0;
      const mapped = component < 3 ? (value * scale[component] + bias[component] + 1) / 2 : value;
      samples[pixel * 4 + component] = mapped;
      if ((integer && (mapped < 0 || mapped > 1)) || (half && Math.abs(mapped) > 65504)) promote = true;
    }
  }
  if (promote) return { image: { width: image.width, height: image.height, data: samples }, type: FloatType };
  const output = new pixels.constructor(count * 4);
  for (let i = 0; i < output.length; i++) {
    output[i] = half ? DataUtils.toHalfFloat(samples[i]) : integer ? Math.round(samples[i] * maximum) : samples[i];
  }
  if (canvas) {
    imageData.data.set(output);
    context.putImageData(imageData, 0, 0);
    return { image: canvas, type: options.type };
  }
  return { image: { ...image, data: output }, type: options.type };
}
