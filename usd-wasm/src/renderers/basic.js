import { pass } from 'three/tsl';
import { createBloomPresentation } from './bloom.js';

/** Basic incurs an HDR offscreen pass only while bloom is enabled. */
export function createBasic({ renderer, scene, camera, settings, outputColorTransform = true }) {
  const scenePass = pass(scene, camera);
  const presentation = createBloomPresentation(renderer, scenePass.getTextureNode('output'), settings, { outputColorTransform });
  return {
    camera,
    render: () => presentation.render(),
    setSettings: values => presentation.setSettings(values),
    dispose() { presentation.dispose(); scenePass.dispose(); },
  };
}
