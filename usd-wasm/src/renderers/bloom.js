import { Color, RenderPipeline } from 'three/webgpu';
import { select, uniform, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

/** Bloom operates on scene-linear HDR, before the renderer's display transform. */
export function createBloomPresentation(renderer, input, settings, { depth, backdropCoverage, outputColorTransform = true }) {
  const clearColor = uniform(new Color());
  let glowInput;
  if (backdropCoverage) {
    // TRAA mixes backdrop radiance into silhouette pixels in proportion to coverage.
    const backdropLight = clearColor.mul(backdropCoverage).min(input.rgb.max(0));
    glowInput = vec4(input.rgb.sub(backdropLight), input.a);
  } else {
    // Basic has no subpixel history. Depth and color identify untouched pixels
    // without dropping transparent objects that leave depth unchanged.
    const clearDepth = renderer.reversedDepthBuffer ? 0 : 1;
    const tolerance = clearColor.abs().mul(0.002).max(0.00001);
    const unchanged = input.rgb.sub(clearColor).abs().lessThanEqual(tolerance).all();
    glowInput = select(depth.equal(clearDepth).and(unchanged), vec4(0), input);
  }
  const glow = bloom(glowInput);
  const combined = vec4(input.rgb.add(glow.rgb), input.a);
  const pipeline = new RenderPipeline(renderer, input);
  pipeline.outputColorTransform = outputColorTransform;
  let enabled = false;
  function setSettings(values) {
    glow.strength.value = values.bloomStrength;
    glow.radius.value = values.bloomRadius;
    glow.threshold.value = values.bloomThreshold;
    if (enabled !== values.bloom) {
      enabled = values.bloom;
      pipeline.outputNode = enabled ? combined : input;
      pipeline.needsUpdate = true;
    }
  }
  setSettings(settings);
  return {
    render(background) {
      if (background) clearColor.value.copy(background);
      else clearColor.value.setRGB(0, 0, 0);
      pipeline.render();
    },
    setSettings,
    dispose() { pipeline.dispose(); glow.dispose(); },
  };
}
