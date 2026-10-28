// Some USD packages retain a source-document suffix after flattening an image.
// Prefer signatures over the authored extension when resource bytes are available.
export function textureFileType(extension, data) {
  const bytes = ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : data instanceof ArrayBuffer ? new Uint8Array(data) : null;
  if (bytes) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) return 'image/png';
    if ([0x76, 0x2f, 0x31, 0x01].every((value, index) => bytes[index] === value)) return 'image/x-exr';
  }
  return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', exr: 'image/x-exr', tga: 'image/tga' }[extension];
}
