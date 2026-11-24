import { RenderTarget, DepthTexture, HalfFloatType, UnsignedByteType, RenderPipeline, NoBlending, NoToneMapping, Vector2, Color, REVISION } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { ssgi } from 'three/addons/tsl/display/SSGINode.js';
import { traa as legacyTraa } from '../vendor/traa/TRAANode.js';
import { traa as runtimeTraa } from 'three/addons/tsl/display/TRAANode.js';
// Use patched Needle r185/r186 addons and r187's matching camera hooks.
// Earlier runtimes still require the bundled r185 border fix.
const needle185 = /^185\.2-alpha\.(\d+)$/.exec(REVISION);
const needle186 = /^186\.[12](?:-alpha\.\d+)?$/.test(REVISION);
const traa = Number.parseInt(REVISION, 10) >= 187 || needle186 || needle185 && Number(needle185[1]) >= 9 ? runtimeTraa : legacyTraa;
import { createBloomPresentation } from './bloom.js';

/** Surface GI is resolved before transparent objects. Volumes composite once over linear HDR color/depth. */
export function createBeauty({ renderer, scene, camera, settings, outputColorTransform = true }) {
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
  const backdrop = TSL.float(depth.greaterThanEqual(0.999999));
  const flatBackdrop = TSL.uniform(false);
  const coverage = color.a.mul(backdrop.mul(TSL.float(flatBackdrop)).oneMinus());
  const lit = TSL.vec4(TSL.mix(shaded, color.rgb, backdrop), coverage);
  const composite = TSL.rtt(lit, null, null, { type: HalfFloatType, depthBuffer: false });
  const temporal = traa(composite, depth, normalVelocity, camera);
  // Keep coverage through the resolve. The transmission pass sees opaque color.
  temporal._resolveMaterial.blending = NoBlending;
  // Resolve silhouettes and their background together. Selecting raw background
  // pixels with jittered depth after TRAA brings the moving pixel edge back.
  // The composite already excludes background from the GI calculation.
  const resolved = TSL.rtt(temporal, null, null, {type: HalfFloatType, depthBuffer: false});
  const target = new RenderTarget(1, 1, { type: HalfFloatType, depthTexture: new DepthTexture(1, 1) });
  const opaque = new RenderPipeline(renderer, TSL.vec4(resolved.rgb, TSL.select(flatBackdrop, 1, resolved.a))); opaque.outputColorTransform = false;
  // RenderPipeline has no public material accessor in r185. Its fullscreen copy
  // must preserve the opaque depth attachment for transparent depth tests.
  opaque._quadMesh.material.depthWrite = false; opaque._quadMesh.material.depthTest = false;
  // Include transparent surfaces/volumes in bloom, after their HDR composite.
  const presentation = createBloomPresentation(renderer, TSL.texture(target.texture), settings, {
    backdropCoverage: resolved.a.oneMinus(), outputColorTransform,
  });
  const size = new Vector2(), clear = new Color(), previousClear = new Color();
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
  let transparentContext, hostContext, hostContextVersion;
  return {
    camera,
    // Native Hydra presentation retains scene-linear HDR and its depth AOV.
    // The host owns the display transform and selection/picking presentation.
    get depthTexture() { return target.depthTexture; },
    reset() { temporal._historyRenderTarget.setSize(1, 1); },
    setSettings: values => presentation.setSettings(values),
    render() {
      if (disposed) return;
      renderer.getDrawingBufferSize(size); target.setSize(size.x, size.y);
      // TRAA queries its RTT input extent before the lazy RTT draw on the first
      // frame. Supply real dimensions so that first frame can seed history.
      composite.setSize(size.x, size.y); resolved.setSize(size.x, size.y);
      bindVolumeDepth();
      const previous = { target: renderer.getRenderTarget(), mrt: renderer.getMRT(), opaque: renderer.opaque, transparent: renderer.transparent, autoClear: renderer.autoClear, toneMapping: renderer.toneMapping, context: renderer.contextNode, background: scene.background, backgroundNode: scene.backgroundNode, aspect: camera.aspect, view: camera.view, viewValues: camera.view && {...camera.view} };
      flatBackdrop.value = !scene.background && !scene.backgroundNode;
      try {
        if (flatBackdrop.value) {
          renderer.getClearColor(clear);
          if (!clear.equals(previousClear)) {
            temporal._historyRenderTarget.setSize(1, 1);
            previousClear.copy(clear);
          }
          scene.background = clear;
        }
        renderer.setRenderTarget(target); renderer.setMRT(null); renderer.autoClear = false;
        renderer.toneMapping = NoToneMapping;
        opaque.render();
        renderer.copyTextureToTexture(pass.renderTarget.depthTexture, target.depthTexture);
        renderer.toneMapping = previous.toneMapping;
        renderer.setRenderTarget(target); renderer.setMRT(null); renderer.autoClear = false;
        renderer.opaque = false; renderer.transparent = true; scene.background = null; scene.backgroundNode = null;
        // This pass samples its own framebuffer for refraction. Give its shader
        // bindings a separate context from direct rendering and other cameras.
        if (hostContext !== previous.context || hostContextVersion !== previous.context.version) {
          hostContext = previous.context;
          hostContextVersion = hostContext.version;
          transparentContext = TSL.context(hostContext.value);
        }
        renderer.contextNode = transparentContext;
        renderer.render(scene, camera);
        renderer.contextNode = previous.context;
        renderer.opaque = previous.opaque; renderer.transparent = previous.transparent;
        renderer.setRenderTarget(previous.target); renderer.autoClear = previous.autoClear;
        presentation.render(flatBackdrop.value ? clear : null);
      } finally {
        renderer.setRenderTarget(previous.target); renderer.setMRT(previous.mrt);
        renderer.contextNode = previous.context;
        renderer.opaque = previous.opaque; renderer.transparent = previous.transparent; renderer.autoClear = previous.autoClear;
        renderer.toneMapping = previous.toneMapping; scene.background = previous.background; scene.backgroundNode = previous.backgroundNode;
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
