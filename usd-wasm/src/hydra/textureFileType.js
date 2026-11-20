// Some USD packages retain a source-document suffix after flattening an image.
// Prefer signatures over the authored extension when resource bytes are available.
export function textureFileType(extension, data) {
  const bytes = ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : data instanceof ArrayBuffer ? new Uint8Array(data) : null;
  if (bytes) {
    if (bytes[0]===0x52&&bytes[1]===0x49&&bytes[2]===0x46&&bytes[3]===0x46&&bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50)return 'image/webp';
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) return 'image/png';
    if ([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) return 'image/ktx2';
    if ([0x76, 0x2f, 0x31, 0x01].every((value, index) => bytes[index] === value)) return 'image/x-exr';
    if (bytes[0] === 0x23 && bytes[1] === 0x3f && bytes[2] === 0x52 && bytes[3] === 0x41) return 'image/vnd.radiance';
  }
  return { webp:'image/webp', ktx2: 'image/ktx2', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', exr: 'image/x-exr', tga: 'image/tga', hdr: 'image/vnd.radiance' }[extension];
}

// Bit depth and channel count from an image file's header, for UsdUVTexture's
// sourceColorSpace "auto" rule. Null when the format or header is not recognized.
export function imageEncoding(filetype, data) {
  const bytes = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : data instanceof ArrayBuffer ? new Uint8Array(data) : null;
  if (!bytes) return null;
  if (filetype === 'image/png' && bytes.length >= 26) {
    // IHDR: bit depth at 24, color type at 25 (0 gray, 2 RGB, 3 palette, 4 gray+alpha, 6 RGBA).
    const channels = { 0: 1, 2: 3, 3: 3, 4: 2, 6: 4 }[bytes[25]];
    return channels ? { bitDepth: bytes[25] === 3 ? 8 : bytes[24], channels, float: false, srgb: pngSrgbMetadata(bytes) } : null;
  }
  if (filetype === 'image/jpeg') {
    for (let i = 2; i + 9 < bytes.length;) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      const length = (bytes[i + 2] << 8) | bytes[i + 3];
      // SOF0-SOF15 except DHT (C4), JPG (C8) and DAC (CC): precision, height, width, components.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { bitDepth: bytes[i + 4], channels: bytes[i + 9], float: false };
      i += 2 + length;
    }
    return null;
  }
  if (filetype === 'image/tga' && bytes.length >= 18) {
    const type = bytes[2] & ~8, depth = bytes[16];
    if (type === 3) return { bitDepth: 8, channels: depth === 16 ? 2 : 1, float: false };
    if (type === 1 || type === 2) return { bitDepth: 8, channels: depth === 32 ? 4 : 3, float: false };
    return null;
  }
  if (filetype === 'image/ktx2') return { ktx2: true, topFirst: ktx2TopFirst(bytes) };
  if (filetype === 'image/webp') return { bitDepth: 8, channels: 4, float: false };
  if (filetype === 'image/x-exr' || filetype === 'image/vnd.radiance') return { bitDepth: 32, channels: 4, float: true };
  return null;
}

// UsdUVTexture "auto" first checks the file's own gamma/color space metadata. For PNG:
// an sRGB chunk, or an iCCP profile named sRGB, is sRGB; a gAMA chunk of 1/2.2 is sRGB
// and any other gamma is not. Returns true, false, or undefined when there is none.
// Other ICC profiles are not interpreted.
function pngSrgbMetadata(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let gamma;
  for (let offset = 8; offset + 8 <= bytes.length;) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const data = offset + 8;
    if (type === 'IDAT' || type === 'IEND') break;
    if (type === 'sRGB') return true;
    if (type === 'iCCP') {
      let end = data;
      while (end < data + Math.min(length, 80) && bytes[end] !== 0) end++;
      const name = String.fromCharCode(...bytes.subarray(data, end)).toLowerCase();
      if (name.includes('srgb')) return true;
    }
    if (type === 'gAMA' && length === 4) gamma = view.getUint32(data) / 100000;
    offset = data + length + 4;
  }
  if (gamma === undefined) return undefined;
  return Math.abs(gamma - 1 / 2.2) < 0.01;
}

// Browsers color-manage decoded images that carry gamma or ICC metadata. WebGL uploads
// them without that conversion, but WebGPU's copyExternalImageToTexture applies it. Color
// spaces are resolved from USD and the auto rule instead, so remove the metadata before
// decoding: PNG gAMA, cHRM, iCCP and sRGB chunks, and JPEG ICC profiles (APP2).
// Returns the input unchanged when there is nothing to remove.
export function stripImageColorMetadata(filetype, data) {
  const bytes = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
  if (!bytes) return data;
  const keep = [];
  let removed = false;
  if (filetype === 'image/png' && bytes.length > 8) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    keep.push([0, 8]);
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset);
      const end = offset + 12 + length;
      if (end > bytes.length) return data;
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      if (['gAMA', 'cHRM', 'iCCP', 'sRGB'].includes(type)) removed = true;
      else keep.push([offset, end]);
      offset = end;
      if (type === 'IEND') break;
    }
  } else if (filetype === 'image/jpeg' && bytes.length > 4) {
    keep.push([0, 2]);
    let offset = 2;
    while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1];
      if (marker === 0xda) break; // Start of scan: the rest is image data.
      const end = offset + 2 + ((bytes[offset + 2] << 8) | bytes[offset + 3]);
      const icc = marker === 0xe2 && String.fromCharCode(...bytes.subarray(offset + 4, offset + 15)) === 'ICC_PROFILE';
      if (icc) removed = true;
      else keep.push([offset, end]);
      offset = end;
    }
    keep.push([offset, bytes.length]);
  } else {
    return data;
  }
  if (!removed) return data;
  const output = new Uint8Array(keep.reduce((size, [start, end]) => size + end - start, 0));
  let position = 0;
  for (const [start, end] of keep) { output.set(bytes.subarray(start, end), position); position += end - start; }
  return output;
}

// KTX2 KTXorientation: "rd" stores the top row first, "ru" the bottom row first.
// Without the key, KTX2 images are top-first ("rd").
function ktx2TopFirst(bytes) {
  if (bytes.length < 80) return true;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kvdOffset = view.getUint32(56, true), kvdLength = view.getUint32(60, true);
  for (let offset = kvdOffset; offset + 4 <= kvdOffset + kvdLength && offset + 4 <= bytes.length;) {
    const length = view.getUint32(offset, true);
    const entry = bytes.subarray(offset + 4, offset + 4 + length);
    const separator = entry.indexOf(0);
    const key = String.fromCharCode(...entry.subarray(0, separator));
    if (key === 'KTXorientation') {
      const value = String.fromCharCode(...entry.subarray(separator + 1)).replace(/\0+$/, '');
      return value[1] !== 'u';
    }
    offset += 4 + length + ((4 - (length % 4)) % 4);
  }
  return true;
}

// Reverses the row order of uncompressed texel data, in place.
export function flipRows(data, width, height) {
  if (!data || !width || !height) return;
  const rowLength = data.length / height;
  if (!Number.isInteger(rowLength)) return;
  const row = new data.constructor(rowLength);
  for (let top = 0, bottom = height - 1; top < bottom; top++, bottom--) {
    row.set(data.subarray(top * rowLength, (top + 1) * rowLength));
    data.copyWithin(top * rowLength, bottom * rowLength, (bottom + 1) * rowLength);
    data.set(row, bottom * rowLength);
  }
}
