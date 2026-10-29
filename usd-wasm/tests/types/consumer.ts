import { getUsdModule, loadOpenUsdBuildInfo, getOpenUsdBuildInfo, tryDetermineFileFormat,
    consoleRenderDelegate, threeJsRenderDelegate } from '@needle-tools/usd';
import { createThreeHydra } from '@needle-tools/usd/three';
import { addPluginForNeedleEngine, getHydraHandleFromNeedleEngineAsset } from '@needle-tools/usd/plugins';
import { needleUSD } from '@needle-tools/usd/vite';
import { createMaterialXVolumeMaterial, createVdbVolumeMesh } from '@needle-tools/usd/volumes';
import { readUsdPhysics, createUsdPhysics } from '@needle-tools/usd/physics';
import { Scene } from 'three';

const USD = await getUsdModule();
const info = getOpenUsdBuildInfo(USD);
const loaded = await loadOpenUsdBuildInfo();
const scene = new Scene();
const stage = await createThreeHydra({ USD, scene, complexity: 'high',
    materialXVolumeFactory: createMaterialXVolumeMaterial, usdVolumeFactory: createVdbVolumeMesh });
await stage.setComplexity('medium');
await stage.setComplexity(1.2);
// @ts-expect-error Invalid complexity must be rejected.
await stage.setComplexity({ bad: true });
await stage.setTime(24);
const snapshot = await readUsdPhysics(stage);
const driver = new USD.HdWebSyncDriver(consoleRenderDelegate, 'scene.usda');
const config = { driver: () => driver, USD, usdRoot: scene };
new threeJsRenderDelegate(config);
// @ts-expect-error The delegate accepts one config argument, not a path and config.
new threeJsRenderDelegate('scene.usda', config);
const dispose = await addPluginForNeedleEngine({ getFiles: () => [], complexity: 'high' });
dispose();
getHydraHandleFromNeedleEngineAsset({});
needleUSD();
const format: 'usd' | 'usda' | 'usdc' | 'usdz' | 'unknown' = tryDetermineFileFormat(new ArrayBuffer(16));
void [info, loaded, snapshot, createUsdPhysics, format];

import { inspectStage, inspectPrim, setVariant, setPayloadLoaded, stageCameras } from '@needle-tools/usd/scene';
import { createRenderModes, configureNeedleAgx, configureNeedleAgxDisplay, type RenderModes } from '@needle-tools/usd/renderers';
import { WebGLRenderer, PerspectiveCamera } from 'three';
const inspection = inspectStage(await stage.driver.GetStage());
inspectPrim(await stage.driver.GetStage(), '/World', 24);
await setVariant(stage, '/World', 'look', 'red');
await setPayloadLoaded(stage, '/World/Payload', true);
stageCameras(scene);
await configureNeedleAgx(new WebGLRenderer());
const modes: RenderModes = await createRenderModes({ renderer: new WebGLRenderer(), scene, camera: new PerspectiveCamera(), configurePathTracer: configureNeedleAgxDisplay, onStatus(status) { status.samples.toFixed(); } });
await modes.setMode('beauty');
await modes.setSettings({maxSamples:256,bounces:4,denoiser:null});
const sampleCap: number = modes.settings.maxSamples;
// @ts-expect-error Only supported denoisers can be configured.
await modes.setSettings({denoiser:'unknown'});
void sampleCap;
// @ts-expect-error Render modes are explicit.
await modes.setMode('unknown');
modes.dispose();
void inspection;
import { mountStagePanel, mountRenderModePicker } from '@needle-tools/usd/viewer';
import { createWebGpuSupport } from '@needle-tools/usd/renderers';
const support = await createWebGpuSupport();
await createThreeHydra({ USD, scene, webGpuSupport: support });
const stagePanel = await mountStagePanel({ handle: stage, stage: stage.driver.GetStage(), scene, camera: new PerspectiveCamera(), controls: { enabled: true }, onVariantChange(path, setName, value) { void [path, setName, value]; } });
stagePanel.dispose();
void mountRenderModePicker;

import '@needle-tools/usd/viewer/style.css';
