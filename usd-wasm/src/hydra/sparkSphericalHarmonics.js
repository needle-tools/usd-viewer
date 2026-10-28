// Spark's extended SH texture format: three unsigned 8-bit magnitudes,
// three sign bits, and a shared 5-bit exponent biased by 15.
// Keep this adapter independent of Spark 2.1's encoder, which rounds the
// exponent down (clipping mantissas) and strides degree-2 RGB triples by five.
export function encodeSparkShRgb(r, g, b) {
  const maximum = Math.max(Math.abs(r), Math.abs(g), Math.abs(b));
  if (maximum === 0) return 0;
  const exponent = Math.max(0, Math.min(31, Math.ceil(Math.log2(maximum)) + 15));
  const scale = 255 / 2 ** (exponent - 15);
  const byte = value => Math.min(255, Math.round(Math.abs(value) * scale));
  return (byte(r) | byte(g) << 8 | byte(b) << 16
    | (r < 0 ? 1 : 0) << 24 | (g < 0 ? 1 : 0) << 25
    | (b < 0 ? 1 : 0) << 26 | exponent << 27) >>> 0;
}

export function packSparkSphericalHarmonics(extra, index, coefficients, base, degree) {
  const offset = index * 4;
  const coefficient = number => {
    const start = base + number * 3;
    return encodeSparkShRgb(coefficients[start], coefficients[start + 1], coefficients[start + 2]);
  };
  if (degree >= 1) for (let k = 1; k <= 3; k++) extra.sh1[offset + k - 1] = coefficient(k);
  if (degree >= 2) {
    extra.sh1[offset + 3] = coefficient(4);
    for (let k = 5; k <= 8; k++) extra.sh2[offset + k - 5] = coefficient(k);
  }
  if (degree >= 3) {
    for (let k = 9; k <= 12; k++) extra.sh3a[offset + k - 9] = coefficient(k);
    for (let k = 13; k <= 15; k++) extra.sh3b[offset + k - 13] = coefficient(k);
  }
}
