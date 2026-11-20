import { DataUtils, HalfFloatType, RGBAFormat } from 'three';
import { readTextureSamples } from './textureChannels.js';

// Color spaces by MaterialX and OpenUSD (Gf) name, decoded to linear Rec.709, the
// renderer's working space. Transfer functions and matrices follow MaterialX
// libraries/cmlib and the aliases in MaterialXGenShader/DefaultColorManagementSystem.cpp.

// cmlib matrix33 values, as MaterialX lists them (for row vectors).
const CMLIB = {
  p3: [1.224940176281, -0.04205695470969, -0.01963755459033, -0.2249401762806, 1.042056954710, -0.07863604555063, 0, 0, 1.098273600141],
  ap1: [1.705050992658, -0.130256417507, -0.024003356805, -0.621792120657, 1.140804736575, -0.128968976065, -0.083258872001, -0.010548319068, 1.15297233287],
  ap0: [2.521686186744, -0.276479914230, -0.015378064966, -1.134130988240, 1.372719087668, -0.152975335867, -0.387555198504, -0.096239173438, 1.16835340083],
  rec2020: [1.660491002108, -0.124550474522, -0.018150763355, -0.587641138788, 1.132899897126, -0.100578898008, -0.072849863320, -0.008349422604, 1.11872966136],
  adobergb: [1.39835574, 0, 0, -0.398355744, 1, -0.0429289893, 0, 0, 1.04292899],
  xyz: [3.240969941905, -0.969243636281, 0.055630079697, -1.53738317757, 1.875967501508, -0.203976958889, -0.498610760293, 0.041555057407, 1.056971514243],
};
// Row-major, for column vectors: linear Rec.709 = M * rgb.
const GAMUT = Object.fromEntries(Object.entries(CMLIB).map(([name, m]) => [name, [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]]));

const SPACES = {};
const define = (names, transfer, gamut = null) => { for (const name of names) SPACES[name.toLowerCase()] = { transfer, matrix: gamut && GAMUT[gamut] }; };
define(['srgb_texture', 'srgb_rec709_scene', 'srgb'], 'srgb');
define(['lin_rec709', 'lin_rec709_scene', 'raw', 'data', 'none', 'linear'], 'linear');
// OpenUSD: the color space is not known; values are used as authored.
define(['unknown', 'identity'], 'linear');
define(['g18_rec709', 'g18_rec709_scene', 'gamma18'], 1.8);
define(['g22_rec709', 'g22_rec709_scene', 'gamma22'], 2.2);
define(['rec709_display', 'g24_rec709_scene', 'gamma24'], 2.4);
define(['acescg', 'lin_ap1', 'lin_ap1_scene'], 'linear', 'ap1');
define(['g22_ap1', 'g22_ap1_scene'], 2.2, 'ap1');
define(['srgb_ap1_scene'], 'srgb', 'ap1');
define(['srgb_displayp3', 'srgb_p3d65_scene'], 'srgb', 'p3');
define(['lin_displayp3', 'lin_p3d65_scene'], 'linear', 'p3');
define(['lin_adobergb', 'lin_adobergb_scene'], 'linear', 'adobergb');
define(['adobergb', 'g22_adobergb_scene'], 563 / 256, 'adobergb');
define(['lin_ap0_scene'], 'linear', 'ap0');
define(['lin_rec2020_scene'], 'linear', 'rec2020');
define(['lin_ciexyzd65_scene'], 'linear', 'xyz');

/** @returns {{transfer: 'srgb' | 'linear' | number, matrix: number[] | null} | null} */
export function resolveColorSpace(name) {
  return name ? SPACES[String(name).split('::').pop().toLowerCase()] || null : null;
}

const srgbToLinear = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const linearToSrgb = c => c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;

function decoder(space) {
  const { transfer, matrix } = space;
  const decode = transfer === 'srgb' ? srgbToLinear : transfer === 'linear' ? c => c : c => Math.max(c, 0) ** transfer;
  return (r, g, b) => {
    r = decode(r); g = decode(g); b = decode(b);
    if (!matrix) return [r, g, b];
    return [matrix[0] * r + matrix[1] * g + matrix[2] * b, matrix[3] * r + matrix[4] * g + matrix[5] * b, matrix[6] * r + matrix[7] * g + matrix[8] * b];
  };
}

/** Converts a color value authored in `name` to linear Rec.709. Unknown names leave it unchanged. */
export function colorToLinearRec709(rgb, name) {
  const space = resolveColorSpace(name);
  return space ? decoder(space)(rgb[0], rgb[1], rgb[2]) : rgb;
}

/**
 * Converts a texture image from `space` to linear Rec.709. Eight-bit images come back
 * sRGB-encoded (decode as SRGBColorSpace); float images come back linear. Values outside
 * Rec.709 are clamped in the 8-bit case. Returns null for images that cannot be read.
 */
export function convertTextureColorSpace(image, space, options = {}) {
  let samples;
  try { samples = readTextureSamples(image, options); } catch { return null; }
  const { pixels, canvas, context, imageData, count, components } = samples;
  const half = options.type === HalfFloatType && !canvas;
  const eightBit = pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray;
  const maximum = eightBit ? 255 : pixels instanceof Uint16Array && !half ? 65535 : 1;
  const read = half ? DataUtils.fromHalfFloat : value => value / maximum;
  const write = eightBit ? value => Math.round(Math.max(0, Math.min(1, linearToSrgb(Math.max(0, value)))) * 255)
    : half ? DataUtils.toHalfFloat : value => value * maximum;
  const decode = decoder(space);
  const output = new pixels.constructor(pixels.length);
  output.set(pixels);
  if (components >= 3) {
    for (let pixel = 0; pixel < count; pixel++) {
      const i = pixel * components;
      const linear = decode(read(pixels[i]), read(pixels[i + 1]), read(pixels[i + 2]));
      output[i] = write(linear[0]); output[i + 1] = write(linear[1]); output[i + 2] = write(linear[2]);
    }
  } else {
    // Gray: the transfer function applies; a gamut matrix has no meaning without color.
    const transferOnly = decoder({ transfer: space.transfer, matrix: null });
    for (let pixel = 0; pixel < count; pixel++) {
      const i = pixel * components;
      output[i] = write(transferOnly(read(pixels[i]), 0, 0)[0]);
    }
  }
  if (canvas) {
    imageData.data.set(output);
    context.putImageData(imageData, 0, 0);
    return { image: canvas, encoding: 'srgb' };
  }
  return { image: { ...image, data: output }, encoding: eightBit ? 'srgb' : 'linear', format: options.format ?? RGBAFormat };
}

