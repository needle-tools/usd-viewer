const dimension = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : fallback;

/** Convert UsdLux luminance to the units of Three's area/point/directional lights.
 * Area normalization follows usdLux/schema.usda (surface area, not projected area).
 * Disk and cylinder geometry remain raster approximations; sphere/cylinder point
 * lights cannot reproduce near-field lighting or finite-source soft shadows.
 */
export function lightIntensity(state, typeId, shaped) {
  const m = state.transform;
  const scale = m?.length === 16 ? [0, 4, 8].map(i => Math.hypot(m[i], m[i+1], m[i+2])) : [1,1,1];
  const radius = dimension(state.radius, 0.5);
  const width = dimension(state.width, 1) * scale[0];
  const height = dimension(state.height, 1) * scale[1];
  let factor = 1, area = 1, resultWidth = width, resultHeight = height;
  if (typeId === 'rectLight') {
    area = width * height;
    // Shaped rectangles use a spot approximation; convert radiance to candela.
    if (shaped) factor = area;
  } else if (typeId === 'diskLight') {
    area = Math.PI * radius * radius * scale[0] * scale[1];
    resultWidth = 2 * radius * scale[0]; resultHeight = 2 * radius * scale[1];
    // The LTC rectangle encloses the disk. Preserve its total emitted power.
    factor = shaped ? area : Math.PI / 4;
  } else if (typeId === 'sphereLight') {
    // Geometric-mean scale is an approximation for nonuniformly scaled spheres.
    const r = radius * Math.cbrt(scale[0] * scale[1] * scale[2]);
    factor = Math.PI * r * r;
    area = 4 * factor;
  } else if (typeId === 'cylinderLight') {
    const r = radius * Math.sqrt(scale[1] * scale[2]);
    const length = dimension(state.length, 1) * scale[0];
    area = 2 * Math.PI * r * length;
    // Isotropic point approximation preserving total power of the open cylinder.
    factor = area / 4;
  } else if (typeId === 'distantLight') {
    const halfAngle = Math.min(Math.PI, dimension(state.angle, 0.53) * Math.PI / 360);
    factor = halfAngle === 0 ? 1 : Math.PI * (halfAngle <= Math.PI / 2 ? Math.sin(halfAngle) ** 2 : 2 - Math.sin(halfAngle) ** 2);
    area = factor;
  }
  if (state.normalize && area > 0) factor /= area;
  return { intensity: dimension(state.intensity, 0) * factor, width: resultWidth, height: resultHeight };
}
