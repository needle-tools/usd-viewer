import { RenderPipeline } from 'three/webgpu';
import { vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

/** Bloom operates on scene-linear HDR, before the renderer's display transform. */
export function createBloomPresentation(renderer, input, settings) {
  const glow = bloom(input);
  const combined = vec4(input.rgb.add(glow.rgb), input.a);
  const pipeline = new RenderPipeline(renderer, input);
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
    render: () => pipeline.render(),
    setSettings,
    dispose() { pipeline.dispose(); glow.dispose(); },
  };
}
