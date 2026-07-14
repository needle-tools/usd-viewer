#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const TYPE_READERS = {
  char: [1, "getInt8"],
  uchar: [1, "getUint8"],
  short: [2, "getInt16"],
  ushort: [2, "getUint16"],
  int: [4, "getInt32"],
  uint: [4, "getUint32"],
  float: [4, "getFloat32"],
  double: [8, "getFloat64"],
};

// A 180-degree Z rotation is diagonal in OpenUSD's real SH basis.
const SH_Z_180_SIGNS = [
  1,
  -1, 1, -1,
  1, -1, 1, -1, 1,
  -1, 1, -1, 1, -1, 1, -1,
];

function rotatePositionZ180([x, y, z]) {
  return [-x, -y, z];
}

function rotateQuaternionZ180([w, x, y, z]) {
  // Pre-multiply by the world-space quaternion (0, 0, 0, 1).
  return [-z, -y, x, w];
}

function rotateShCoefficientZ180(index, coefficient) {
  const sign = SH_Z_180_SIGNS[index];
  if (sign === undefined) {
    throw new Error(`Unsupported spherical harmonics coefficient index: ${index}`);
  }
  return coefficient.map(value => sign * value);
}

function usage() {
  console.error("Usage: convert-3dgs-ply-to-usda.mjs [--rotate-z-180] input.ply output.usda");
  process.exit(1);
}

function formatNumber(value) {
  if (!Number.isFinite(value)) throw new Error(`Non-finite value: ${value}`);
  if (Math.abs(value) < 1e-12) return "0";
  return Number(value.toPrecision(9)).toString();
}

function formatTuple(values) {
  return `(${values.map(formatNumber).join(", ")})`;
}

function formatArray(values, indent = "        ") {
  return values.map(value => `${indent}${value}`).join(",\n");
}

function parseHeader(bytes) {
  const marker = new TextEncoder().encode("end_header");
  let headerEnd = -1;
  outer: for (let offset = 0; offset <= bytes.length - marker.length; offset++) {
    for (let i = 0; i < marker.length; i++) {
      if (bytes[offset + i] !== marker[i]) continue outer;
    }
    headerEnd = offset + marker.length;
    if (bytes[headerEnd] === 13) headerEnd++;
    if (bytes[headerEnd] === 10) headerEnd++;
    break;
  }
  if (headerEnd < 0) throw new Error("PLY header has no end_header marker");

  const lines = new TextDecoder().decode(bytes.subarray(0, headerEnd)).trim().split(/\r?\n/);
  if (lines[0] !== "ply") throw new Error("Not a PLY file");

  let littleEndian = false;
  let vertexCount = 0;
  let currentElement = "";
  const properties = [];
  for (const line of lines.slice(1)) {
    const fields = line.trim().split(/\s+/);
    if (fields[0] === "format") {
      if (fields[1] !== "binary_little_endian" || fields[2] !== "1.0") {
        throw new Error(`Unsupported PLY format: ${fields.slice(1).join(" ")}`);
      }
      littleEndian = true;
    } else if (fields[0] === "element") {
      currentElement = fields[1];
      if (currentElement === "vertex") vertexCount = Number(fields[2]);
    } else if (fields[0] === "property" && currentElement === "vertex") {
      if (fields[1] === "list") throw new Error("List-valued vertex properties are unsupported");
      if (!TYPE_READERS[fields[1]]) throw new Error(`Unsupported PLY property type: ${fields[1]}`);
      properties.push({ type: fields[1], name: fields[2] });
    }
  }
  if (!littleEndian || !vertexCount || !properties.length) throw new Error("Incomplete PLY vertex header");
  return { headerEnd, vertexCount, properties };
}

function ellipsoidRadius(scales, quaternion) {
  let [w, x, y, z] = quaternion;
  const length = Math.hypot(w, x, y, z) || 1;
  [w, x, y, z] = [w / length, x / length, y / length, z / length];
  const matrix = [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
  return [0, 1, 2].map(row => 3 * Math.hypot(
    matrix[row * 3] * scales[0],
    matrix[row * 3 + 1] * scales[1],
    matrix[row * 3 + 2] * scales[2],
  ));
}

async function main() {
  const args = process.argv.slice(2);
  const rotateZ180 = args.includes("--rotate-z-180");
  const positionalArgs = args.filter(arg => arg !== "--rotate-z-180");
  if (positionalArgs.length !== 2 || args.some(arg => arg.startsWith("--") && arg !== "--rotate-z-180")) {
    usage();
  }
  const [inputPath, outputPath] = positionalArgs;

  const input = await readFile(inputPath);
  const bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  const { headerEnd, vertexCount, properties } = parseHeader(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset + headerEnd, bytes.byteLength - headerEnd);
  const required = ["x", "y", "z", "f_dc_0", "f_dc_1", "f_dc_2", "opacity",
    "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"];
  const propertyNames = new Set(properties.map(property => property.name));
  for (const name of required) {
    if (!propertyNames.has(name)) throw new Error(`Missing required 3DGS property: ${name}`);
  }

  const restNames = [...propertyNames]
    .filter(name => /^f_rest_\d+$/.test(name))
    .sort((a, b) => Number(a.slice(7)) - Number(b.slice(7)));
  const shDegree = restNames.length === 45 ? 3 : restNames.length === 24 ? 2 : restNames.length === 9 ? 1 : 0;
  if (restNames.length && shDegree === 0) {
    throw new Error(`Unsupported spherical harmonics property count: ${restNames.length}`);
  }

  const positions = [];
  const orientations = [];
  const scales = [];
  const opacities = [];
  const coefficients = [];
  const extentMin = [Infinity, Infinity, Infinity];
  const extentMax = [-Infinity, -Infinity, -Infinity];
  let offset = 0;

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
    const item = {};
    for (const property of properties) {
      const [size, reader] = TYPE_READERS[property.type];
      item[property.name] = view[reader](offset, true);
      offset += size;
    }

    const sourcePosition = [item.x, item.y, item.z];
    const position = rotateZ180 ? rotatePositionZ180(sourcePosition) : sourcePosition;
    const scale = [Math.exp(item.scale_0), Math.exp(item.scale_1), Math.exp(item.scale_2)];
    const sourceQuaternion = [item.rot_0, item.rot_1, item.rot_2, item.rot_3];
    const quaternion = rotateZ180 ? rotateQuaternionZ180(sourceQuaternion) : sourceQuaternion;
    const opacity = 1 / (1 + Math.exp(-item.opacity));
    const radius = ellipsoidRadius(scale, quaternion);
    for (let axis = 0; axis < 3; axis++) {
      extentMin[axis] = Math.min(extentMin[axis], position[axis] - radius[axis]);
      extentMax[axis] = Math.max(extentMax[axis], position[axis] + radius[axis]);
    }

    positions.push(formatTuple(position));
    orientations.push(formatTuple(quaternion));
    scales.push(formatTuple(scale));
    opacities.push(formatNumber(opacity));
    const dcCoefficient = [item.f_dc_0, item.f_dc_1, item.f_dc_2];
    coefficients.push(formatTuple(rotateZ180
      ? rotateShCoefficientZ180(0, dcCoefficient)
      : dcCoefficient));
    const coefficientsPerChannel = restNames.length / 3;
    for (let coefficient = 0; coefficient < coefficientsPerChannel; coefficient++) {
      const shCoefficient = [
        item[`f_rest_${coefficient}`],
        item[`f_rest_${coefficient + coefficientsPerChannel}`],
        item[`f_rest_${coefficient + 2 * coefficientsPerChannel}`],
      ];
      coefficients.push(formatTuple(rotateZ180
        ? rotateShCoefficientZ180(coefficient + 1, shCoefficient)
        : shCoefficient));
    }
  }

  const sourceName = basename(inputPath);
  const coordinateCorrectionMetadata = rotateZ180
    ? '\n        string sourceCoordinateCorrection = "rotateZ(180deg), baked into particle data"'
    : "";
  const usda = `#usda 1.0
(
    customLayerData = {
        string sourceAsset = "${sourceName.replaceAll('"', '\\"')}"${coordinateCorrectionMetadata}
    }
    defaultPrim = "Chamaeleon"
    metersPerUnit = 1
    upAxis = "Y"
)

def ParticleField3DGaussianSplat "Chamaeleon"
{
    float3[] extent = [${formatTuple(extentMin)}, ${formatTuple(extentMax)}]
    point3f[] positions = [
${formatArray(positions)}
    ]
    quatf[] orientations = [
${formatArray(orientations)}
    ]
    float3[] scales = [
${formatArray(scales)}
    ]
    float[] opacities = [
${formatArray(opacities)}
    ]
    uniform int radiance:sphericalHarmonicsDegree = ${shDegree}
    float3[] radiance:sphericalHarmonicsCoefficients = [
${formatArray(coefficients)}
    ]
    uniform token projectionModeHint = "perspective"
    uniform token sortingModeHint = "zDepth"
}
`;

  await writeFile(outputPath, usda);
  console.log(`Wrote ${vertexCount} splats (SH degree ${shDegree}) to ${outputPath}`);
}

await main();
