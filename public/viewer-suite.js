import { mountStagePanel } from './usd/viewer/inspect.js';
export async function mountUsdSuite(options) {
  const context = window.needleEngineContext;
  const originalCamera = context?.mainCamera;
  const needleControls = new Map();
  context?.scene.traverse(object => {
    for (const component of object.userData.components || []) {
      const controls = component.controls;
      if (controls?.object?.isCamera) needleControls.set(controls, controls.enabled);
    }
  });
  return mountStagePanel({ ...options, onVariantChange(path, setName, value) {
    const url = new URL(location.href); url.searchParams.set('stageVariant', [path, setName, value].join('|')); history.replaceState({}, '', url);
  }, setCamera(camera) {
    window.usdRenderCamera = camera === options.camera ? undefined : camera;
    if (context) context.mainCamera = camera === options.camera ? originalCamera : camera;
    for (const [controls, enabled] of needleControls) controls.enabled = camera === options.camera ? enabled : false;
  } });
}
