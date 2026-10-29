import { RenderTarget, DepthTexture, HalfFloatType, UnsignedByteType, RenderPipeline, NoToneMapping, Vector2, Color } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { ssgi } from 'three/addons/tsl/display/SSGINode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';

/** Surface GI is resolved before transparent objects. Volumes composite once over linear HDR color/depth. */
export function createBeauty({ renderer, scene, camera }) {
  const pass = TSL.pass(scene, camera); pass.transparent = false;
  pass.setMRT(TSL.mrt({ output: TSL.output, diffuseColor: TSL.diffuseColor, normal: TSL.packNormalToRGB(TSL.normalView), velocity: TSL.velocity }));
  const color = pass.getTextureNode('output'), diffuse = pass.getTextureNode('diffuseColor'), normal = pass.getTextureNode('normal'), depth = pass.getTextureNode('depth');
  diffuse.value.type = normal.value.type = UnsignedByteType;
  const gi = ssgi(color, depth, TSL.sample(uv => TSL.unpackRGBToNormal(normal.sample(uv))), camera);
  gi.sliceCount.value = 2; gi.stepCount.value = 8;
  const shaded = color.rgb.mul(gi.getAONode().r).add(diffuse.rgb.mul(gi.getGINode().rgb));
  // Avoid r185's shared texture-sample initialization inside conditional branches.
  const composite = TSL.rtt(TSL.vec4(TSL.mix(shaded, color.rgb, TSL.float(depth.greaterThanEqual(0.999999))), color.a), null, null, { type: HalfFloatType, depthBuffer: false });
  const temporal = traa(composite, depth, pass.getTextureNode('velocity'), camera);
  const resolved = TSL.rtt(TSL.Fn(() => {
    const aa = temporal.getTextureNode().sample(TSL.screenUV).toVar();
    const raw = composite.sample(TSL.screenUV).toVar();
    const z = depth.sample(TSL.screenUV).toVar();
    return TSL.mix(aa, raw, TSL.float(z.greaterThanEqual(0.999999)));
  })(), null, null, {type: HalfFloatType, depthBuffer: false});
  const target = new RenderTarget(1, 1, { type: HalfFloatType, depthTexture: new DepthTexture(1, 1) });
  const opaque = new RenderPipeline(renderer, resolved); opaque.outputColorTransform = false;
  // RenderPipeline has no public material accessor in r185. Its fullscreen copy
  // must preserve the opaque depth attachment for transparent depth tests.
  opaque._quadMesh.material.depthWrite = false; opaque._quadMesh.material.depthTest = false;
  const presentation = new RenderPipeline(renderer, TSL.texture(target.texture));
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
    render() {
      if (disposed) return;
      renderer.getDrawingBufferSize(size); target.setSize(size.x, size.y); bindVolumeDepth();
      const previous = { target: renderer.getRenderTarget(), mrt: renderer.getMRT(), opaque: renderer.opaque, transparent: renderer.transparent, autoClear: renderer.autoClear, toneMapping: renderer.toneMapping, background: scene.background };
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
