import { mountStagePanel } from './usd/viewer/inspect.js';
import {mountAssetInfo} from './viewer-asset-info.js';
export async function mountUsdSuite(options) {
  const context = window.needleEngineContext;
  const originalCamera = context?.mainCamera;
  const needleControls = new Map();
  let info;
  context?.scene.traverse(object => {
    for (const component of object.userData.components || []) {
      const controls = component.controls;
      if (controls?.object?.isCamera) needleControls.set(controls, controls.enabled);
    }
  });
  const panel = await mountStagePanel({ ...options, onStage(stageInfo) {
    options.onStage?.(stageInfo); if(stageInfo)void info?.refresh();
  }, onVariantChange(path, setName, value) {
    const url = new URL(location.href); url.searchParams.set('stageVariant', [path, setName, value].join('|')); history.replaceState({}, '', url);
  }, setCamera(camera) {
    window.usdRenderCamera = camera === options.camera ? undefined : camera;
    if (context) context.mainCamera = camera === options.camera ? originalCamera : camera;
    for (const [controls, enabled] of needleControls) controls.enabled = camera === options.camera ? enabled : false;
  } });
  info = options.containers?.properties
    ? mountAssetInfo(options.containers.properties, options.sourceUrl, options) : null;
  panel.refreshInfoFiles=()=>info?.refreshFiles();
  const dispose = panel.dispose;
  panel.dispose = () => {info?.dispose(); dispose();};
  return panel;
}
