import { AgXToneMapping } from 'three';
import { Fn, vec3, mat3, float } from 'three/tsl';

/**
 * Needle's AgX display transform, ported verbatim in arithmetic and matrix order
 * from @needle-tools/engine/src/engine/engine_tonemapping.ts, patchAGX().
 * Reference source SHA256: a70fb7959f84f3eedaf1be601ff58d3c09fb2a139089e1e93bb591bd98e55573.
 * Reference package: 6.0.0-canary.1783788842.warm-melon.3e41745a8.
 * The reference credits https://iolite-engine.com/blog_posts/minimal_agx_implementation.
 *
 * Input/output are linear RGB. The renderer applies its output color-space
 * conversion afterwards. This preserves Needle's 0.001 input floor and look
 * (slope 1.05, power 1.10, saturation 1.15), not Three's standard AgX look.
 */
export const needleAgxToneMapping = Fn(([color, exposure]) => {
  const inset = mat3(
    vec3(0.842479062253094, 0.0423282422610123, 0.0423756549057051),
    vec3(0.0784335999999992, 0.878468636469772, 0.0784336),
    vec3(0.0792237451477643, 0.0791661274605434, 0.879142973793104),
  );
  const outset = mat3(
    vec3(1.19687900512017, -0.0528968517574562, -0.0529716355144438),
    vec3(-0.0980208811401368, 1.15190312990417, -0.0980434501171241),
    vec3(-0.0990297440797205, -0.0989611768448433, 1.15107367264116),
  );
  const minEv = float(-12.47393), maxEv = float(4.026069);
  const encoded = inset.mul(color.mul(exposure).max(0.001)).log2().clamp(minEv, maxEv);
  const x = encoded.sub(minEv).div(maxEv.sub(minEv)).toVar();
  const x2 = x.mul(x).toVar(), x4 = x2.mul(x2).toVar();
  const contrast = x4.mul(x2).mul(15.5)
    .sub(x4.mul(x).mul(40.14)).add(x4.mul(31.96))
    .sub(x2.mul(x).mul(6.868)).add(x2.mul(0.4298))
    .add(x.mul(0.1191)).sub(0.00232).toVar();
  // Needle computes luma before applying the ASC CDL slope/power.
  const luma = contrast.dot(vec3(0.2126, 0.7152, 0.0722)).toVar();
  const look = vec3(luma).add(contrast.mul(1.05).pow(1.10).sub(luma).mul(1.15));
  return outset.mul(look).pow(2.2);
}).setLayout({
  name: 'needleAgxToneMapping', type: 'vec3',
  inputs: [{ name: 'color', type: 'vec3' }, { name: 'exposure', type: 'float' }],
});

/**
 * Register Needle AgX on one node renderer (WebGPU or its WebGL fallback).
 * Call before compiling/rendering materials or presentation pipelines. It does
 * not change exposure, selected tone mapping, output color space, or GLSL chunks.
 * Returns false for a classic WebGLRenderer, whose Needle shader patch is owned
 * by Needle Engine. Repeated registration on a node renderer is harmless.
 */
export function configureNeedleAgx(renderer) {
  const library = renderer?.library;
  if (!(library?.toneMappingNodes instanceof Map)) return false;
  // NodeLibrary.addToneMapping rejects an existing key instead of replacing it.
  library.toneMappingNodes.set(AgXToneMapping, needleAgxToneMapping);
  return true;
}
