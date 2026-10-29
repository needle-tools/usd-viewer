import { createGaussianSplatGeometry, writeCovariance, SH_C0 } from '../vendor/gaussian/utils/GaussianSplatUtils.js';
import { GaussianSplat } from '../vendor/gaussian/objects/GaussianSplat.js';

/** USD supplies linear scales, XYZW quaternions and interleaved RGB SH coefficients. */
export function createGaussianParticleField(data) {
  const count = data.positions.length / 3;
  const covariances = new Float32Array(count * 6), colors = new Float32Array(count * 4);
  const stride = (data.degree + 1) ** 2 * 3;
  for (let i = 0; i < count; i++) {
    const p = i * 3, q = i * 4, base = i * stride;
    writeCovariance(covariances, i * 6,
      data.scales.length ? data.scales[p] : 1, data.scales.length ? data.scales[p + 1] : 1, data.scales.length ? data.scales[p + 2] : 1,
      data.orientations.length ? data.orientations[q] : 0, data.orientations.length ? data.orientations[q + 1] : 0,
      data.orientations.length ? data.orientations[q + 2] : 0, data.orientations.length ? data.orientations[q + 3] : 1);
    colors[q] = 0.5 + SH_C0 * data.coefficients[base];
    colors[q + 1] = 0.5 + SH_C0 * data.coefficients[base + 1];
    colors[q + 2] = 0.5 + SH_C0 * data.coefficients[base + 2];
    colors[q + 3] = data.opacities.length ? data.opacities[i] : 1;
  }
  const geometry = createGaussianSplatGeometry(data.positions, covariances, colors);
  // Preserve USD HDR and signed SH coefficients instead of the file loader's byte encoding.
  geometry.userData.usdSphericalHarmonics = { degree: data.degree, coefficients: data.coefficients };
  const mesh = new GaussianSplat(geometry);
  mesh.userData.usdGaussianData = data;
  mesh.getBoundingBox = () => { mesh.computeBoundingBox(); return mesh.boundingBox.clone(); };
  return mesh;
}
