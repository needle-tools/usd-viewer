import { Color } from 'three/webgpu';
import { pass } from 'three/tsl';
import { createBloomPresentation } from './bloom.js';

/** Basic incurs an HDR offscreen pass only while bloom is enabled. */
export function createBasic({ renderer, scene, camera, settings, outputColorTransform = true }) {
  const scenePass = pass(scene, camera);
  const depth = scenePass.getTextureNode('depth').r, clear = new Color();
  const presentation = createBloomPresentation(renderer, scenePass.getTextureNode('output'), settings, { depth, outputColorTransform });
  return {
    camera,
    render: () => presentation.render(!scene.background && !scene.backgroundNode ? renderer.getClearColor(clear) : null),
    setSettings: values => presentation.setSettings(values),
    dispose() { presentation.dispose(); scenePass.dispose(); },
  };
}
