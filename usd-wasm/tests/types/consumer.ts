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
