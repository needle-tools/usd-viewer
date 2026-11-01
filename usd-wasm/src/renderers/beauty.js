import { RenderTarget, DepthTexture, HalfFloatType, UnsignedByteType, RenderPipeline, NoToneMapping, Vector2, Color } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { ssgi } from 'three/addons/tsl/display/SSGINode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { createBloomPresentation } from './bloom.js';

/** Surface GI is resolved before transparent objects. Volumes composite once over linear HDR color/depth. */
export function createBeauty({ renderer, scene, camera, settings }) {
  const pass = TSL.pass(scene, camera); pass.transparent = false;
  // Share one RGBA16F attachment between octahedral normals and XY velocity.
  // Four attachments stay within WebGPU's 32-byte/sample portable limit.
  const fold = xy => TSL.vec2(1).sub(xy.yx.abs()).mul(TSL.select(xy.greaterThanEqual(0), TSL.vec2(1), TSL.vec2(-1)));
  const encodeNormal = TSL.Fn(([normal]) => {
    const p = normal.xy.div(normal.abs().dot(TSL.vec3(1))).toVar();
    TSL.If(normal.z.lessThan(0), () => { p.assign(fold(p)); }); return p;
  });
  const decodeNormal = TSL.Fn(([encoded]) => {
    const n = TSL.vec3(encoded, TSL.float(1).sub(encoded.abs().dot(TSL.vec2(1)))).toVar();
    TSL.If(n.z.lessThan(0), () => { n.xy.assign(fold(n.xy)); }); return n.normalize();
  });
  pass.setMRT(TSL.mrt({ output: TSL.output, diffuseColor: TSL.diffuseColor, normalVelocity: TSL.vec4(TSL.velocity.xy, encodeNormal(TSL.normalView)), emissive: TSL.emissive }));
  const color = pass.getTextureNode('output'), diffuse = pass.getTextureNode('diffuseColor'), normalVelocity = pass.getTextureNode('normalVelocity'), depth = pass.getTextureNode('depth');
  diffuse.value.type = UnsignedByteType;
  const gi = ssgi(color, depth, TSL.sample(uv => decodeNormal(normalVelocity.sample(uv).zw)), camera);
  gi.sliceCount.value = 2; gi.stepCount.value = 8;
  // Occlusion attenuates reflected light, never light emitted by the surface.
  const emission = pass.getTextureNode('emissive').rgb;
  const shaded = color.rgb.sub(emission).mul(gi.getAONode().r).add(emission).add(diffuse.rgb.mul(gi.getGINode().rgb));
  // Avoid r185's shared texture-sample initialization inside conditional branches.
  const composite = TSL.rtt(TSL.vec4(TSL.mix(shaded, color.rgb, TSL.float(depth.greaterThanEqual(0.999999))), color.a), null, null, { type: HalfFloatType, depthBuffer: false });
  const temporal = traa(composite, depth, normalVelocity, camera);
  // Resolve silhouettes and their background together. Selecting raw background
  // pixels with jittered depth after TRAA brings the moving pixel edge back.
  // The composite already excludes background from the GI calculation.
  const resolved = TSL.rtt(temporal, null, null, {type: HalfFloatType, depthBuffer: false});
  const target = new RenderTarget(1, 1, { type: HalfFloatType, depthTexture: new DepthTexture(1, 1) });
  const opaque = new RenderPipeline(renderer, resolved); opaque.outputColorTransform = false;
  // RenderPipeline has no public material accessor in r185. Its fullscreen copy
  // must preserve the opaque depth attachment for transparent depth tests.
  opaque._quadMesh.material.depthWrite = false; opaque._quadMesh.material.depthTest = false;
  // Include transparent surfaces/volumes in bloom, after their HDR composite.
  const presentation = createBloomPresentation(renderer, TSL.texture(target.texture), settings);
  const size = new Vector2(), clear = new Color();
  const volumeDepth = TSL.texture(pass.renderTarget.depthTexture, TSL.screenUV).r, volumeColor = TSL.texture(resolved.renderTarget.texture, TSL.screenUV), volumes = new Map();
  function bindVolumeDepth() {
    const current = new Set();
    scene.traverse(object => { for (const material of [object.material].flat()) {
      if (!material?.isBoundedVolumeNodeMaterial) continue;
      current.add(material); if (volumes.has(material)) continue;
      volumes.set(material, {depth: material.opaqueDepthNode, color: material.opaqueColorNode}); material.opaqueDepthNode = volumeDepth; material.opaqueColorNode = volumeColor; material.needsUpdate = true;
    } });
    for (const [material, previous] of volumes) if (!current.has(material)) { restoreVolume(material, previous); volumes.delete(material); }
  }
  function restoreVolume(material, previous) {
    if (material.opaqueDepthNode !== volumeDepth) return;
    material.opaqueDepthNode = previous.depth; material.opaqueColorNode = previous.color; material.needsUpdate = true;
  }
  let disposed = false;
  return {
    camera,
    setSettings: values => presentation.setSettings(values),
    render() {
      if (disposed) return;
      renderer.getDrawingBufferSize(size); target.setSize(size.x, size.y); bindVolumeDepth();
      const previous = { target: renderer.getRenderTarget(), mrt: renderer.getMRT(), opaque: renderer.opaque, transparent: renderer.transparent, autoClear: renderer.autoClear, toneMapping: renderer.toneMapping, background: scene.background, aspect: camera.aspect, view: camera.view, viewValues: camera.view && {...camera.view} };
      try {
        if (!scene.background) scene.background = renderer.getClearColor(clear);
        renderer.setRenderTarget(target); renderer.setMRT(null); renderer.autoClear = false;
        renderer.toneMapping = NoToneMapping;
        opaque.render();
        renderer.copyTextureToTexture(pass.renderTarget.depthTexture, target.depthTexture);
        renderer.toneMapping = previous.toneMapping;
        renderer.setRenderTarget(target); renderer.setMRT(null); renderer.autoClear = false;
        renderer.opaque = false; renderer.transparent = true; scene.background = null;
        renderer.render(scene, camera);
        renderer.opaque = previous.opaque; renderer.transparent = previous.transparent;
        renderer.setRenderTarget(previous.target); renderer.autoClear = previous.autoClear;
        presentation.render();
      } finally {
        renderer.setRenderTarget(previous.target); renderer.setMRT(previous.mrt);
        renderer.opaque = previous.opaque; renderer.transparent = previous.transparent; renderer.autoClear = previous.autoClear;
        renderer.toneMapping = previous.toneMapping; scene.background = previous.background;
        // TRAA.setViewOffset changes PerspectiveCamera.aspect, even during its
        // first 1×1 frame. Do not leak jitter/temporary target sizes into picking,
        // framing, the host camera or a subsequent renderer mode.
        camera.aspect = previous.aspect;
        camera.view = previous.view;
        if (camera.view) Object.assign(camera.view, previous.viewValues);
        camera.updateProjectionMatrix();
      }
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const [material, previous] of volumes) restoreVolume(material, previous); volumes.clear();
      opaque.dispose(); presentation.dispose(); temporal.dispose(); gi.dispose();
      for (const node of [composite, resolved]) { node.renderTarget.dispose(); node._quadMesh.material.dispose(); }
      target.dispose(); pass.dispose();
    },
  };
}
