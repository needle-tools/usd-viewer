import { getUsdModule, loadOpenUsdBuildInfo, getOpenUsdBuildInfo, tryDetermineFileFormat,
    consoleRenderDelegate, threeJsRenderDelegate } from '@needle-tools/usd';
import { createThreeHydra } from '@needle-tools/usd/three';
import { addPluginForNeedleEngine, getHydraHandleFromNeedleEngineAsset } from '@needle-tools/usd/plugins';
import { needleUSD } from '@needle-tools/usd/vite';
import { createMaterialXVolumeMaterial, createVdbVolumeMesh } from '@needle-tools/usd/volumes';
import { readUsdPhysics, createUsdPhysics } from '@needle-tools/usd/physics';
import { inspectUsdPhysics, getUsdPhysicsLimitations } from '@needle-tools/usd/physics';
import {createUsdMechanism,createJointHelpers,mountJointControls} from '@needle-tools/usd/kinematics';
import { getUsdModule as loadRuntime } from '@needle-tools/usd/runtime';
import { createArrayEdits, type ArrayEdits } from '@needle-tools/usd/editing';
import { mountStagePanel as mountInspection, getSelectionBounds } from '@needle-tools/usd/viewer/inspect';
import { mountRepl as mountOptionalConsole } from '@needle-tools/usd/viewer/repl';
import { Scene } from 'three';

const USD = await getUsdModule();
void getUsdModule({asyncRuntime:'auto'});
void loadRuntime({asyncRuntime:'jspi', mainScriptUrlOrBlob:new Blob(['worker'])});
void loadRuntime({asyncRuntime:'asyncify'});
// @ts-expect-error Unsupported runtime selection must be rejected.
void getUsdModule({asyncRuntime:'unknown'});
const info = getOpenUsdBuildInfo(USD);
const loaded = await loadOpenUsdBuildInfo();
const scene = new Scene();
void [inspectUsdPhysics, getUsdPhysicsLimitations, createUsdMechanism, createJointHelpers, mountJointControls, loadRuntime, mountInspection, mountOptionalConsole];
const stage = await createThreeHydra({ USD, scene, complexity: 'high',
    materialXVolumeFactory: createMaterialXVolumeMaterial, usdVolumeFactory: createVdbVolumeMesh });
await stage.setComplexity('medium');
await stage.setComplexity(1.2);
// @ts-expect-error Invalid complexity must be rejected.
await stage.setComplexity({ bad: true });
await stage.setTime(24);
const selectionBounds = await getSelectionBounds(stage, [{path:'/World/Mesh/Subset'}] as const);
selectionBounds.getCenter(scene.position.clone());
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
await modes.setSettings({bloom:true,bloomStrength:0.5,bloomRadius:0.5,bloomThreshold:1});
// @ts-expect-error Bloom is a boolean, not a menu label.
await modes.setSettings({bloom:'on'});
const sampleCap: number = modes.settings.maxSamples;
// @ts-expect-error Only supported denoisers can be configured.
await modes.setSettings({denoiser:'unknown'});
void sampleCap;
// @ts-expect-error Render modes are explicit.
await modes.setMode('unknown');
modes.dispose();
void inspection;
import { mountStagePanel, mountRenderModePicker, mountDownloadButton, type DownloadSource } from '@needle-tools/usd/viewer';
import {mountDownloadButton as mountDownloadOnly, type DownloadFormat} from '@needle-tools/usd/viewer/download';
const standaloneDownload: typeof mountDownloadButton = mountDownloadOnly;
const archiveFormat: DownloadFormat = 'zip'; void [standaloneDownload, archiveFormat];
const downloadSource: DownloadSource = {handle: stage, filename:'scene.usda', formats:['zip','usdz']};
downloadSource.exportGltf=async({onProgress,signal,textureResolution})=>{const quality:'original'|'preview'=textureResolution;void quality;signal.throwIfAborted();onProgress({phase:'writing',completed:0,total:0});return new ArrayBuffer(0);};
downloadSource.share=async()=>{};
const downloadControl = mountDownloadButton({getSource:()=>downloadSource, stateKey:'my-download-format', onFormatChange(format){const selected:'zip'|'usdz'|'gltf'=format;void selected;},onProgress(value){value.completed.toFixed();value.total.toFixed();}});
downloadControl.setTextureResolution('original');const textureScope=stage.createTextureExport();textureScope.dispose();
downloadControl.setFormat('usdz'); downloadControl.refresh(); await downloadControl.download(); downloadControl.dispose();
await stage.exportUsdz({onProgress(value){const phase:'preparing'|'dependencies'|'packaging'|'reading'|'textures'|'compressing'|'complete'=value.phase;void phase;}});
// @ts-expect-error Unsupported archive format.
downloadControl.setFormat('rar');
import { createWebGpuSupport } from '@needle-tools/usd/renderers';
const support = await createWebGpuSupport();
await createThreeHydra({ USD, scene, webGpuSupport: support });
stage.setHelperSelection(['/World/Camera', '/World/Lights']);
const selectedHelpers: boolean = stage.isHelperSelected('/World/Camera');
void selectedHelpers;

const stagePanel = await mountStagePanel({ handle: stage, stage: stage.driver.GetStage(), scene, camera: new PerspectiveCamera(), controls: { enabled: true }, onVariantChange(path, setName, value) { void [path, setName, value]; } });
stagePanel.dispose();
void mountRenderModePicker;

import '@needle-tools/usd/viewer/style.css';

// Low-level authoring stays typed in installed consumers as well as the REPL.
const authored=USD.CreateStage('/tmp/typed-authoring.usda');
const root=authored.DefinePrim('/World','Xform');
await root.AddReference('asset.usda','/Asset');
await root.SetInstanceable(true);
await root.SetMetadata('kind','component');
const rotations=root.CreateAttribute('rotations','quatf[]',true);
rotations.Set([[1,0,0,0]],Number.NaN);
rotations.SetMetadata('interpolation','vertex');
await authored.GetRootLayer().SetSubLayerPaths(['looks.usda','layout.usda']);
const paths:string[]=authored.GetRootLayer().GetSubLayerPaths();
const previousTarget=authored.GetEditTarget();
const variantTarget=root.GetVariantEditTarget('look');
if(variantTarget.IsValid())authored.SetEditTarget(variantTarget);
authored.SetEditTarget(previousTarget);variantTarget.delete();previousTarget.delete();
void paths;

const typedRotations: unknown = rotations.Get(Number.NaN); void typedRotations;

const layerView=await authored.OpenLayerStage(authored.GetRootLayer().GetIdentifier());
if(layerView)USD.ReleaseStage(layerView);

const edits: ArrayEdits = createArrayEdits({usd:USD,stage:authored,edit:action=>stage.editStage(action),isCurrent:()=>true});
await edits.apply(authored.GetRootLayer().GetIdentifier(),{property:{primPath:'/World',name:'rotations',type:'quatf[]',time:NaN}},'',[[1,0,0,0]]);
await edits.undo(); await edits.redo(); edits.dispose();
await stage.readStage(current=>current.GetRootLayer().ExportToString());
import { readStageAsset, readStageLayer, stageLayers, stageVariants, hasAuthoredUsdLights, stageResources, createStageSourcePaths } from '@needle-tools/usd/scene';
const sourcePath: string = stage.sourcePaths.path('/some/resolver/path');
const sourceIdentity: string = stage.sourcePaths.resolve(sourcePath);
const texturePaths: string[] = stageResources(scene, stage.sourcePaths);
void [sourceIdentity, texturePaths, createStageSourcePaths('/project/root.usda').resolve('../geo/mesh.usda')];
const layerText: string = await readStageLayer(stage,USD,'scene.usda',{allowUncomposed:true});
const resource: Uint8Array = await readStageAsset(stage,USD,'texture.png',{signal:new AbortController().signal});
void [layerText,resource,stageLayers(authored),stageVariants(authored),hasAuthoredUsdLights(scene,authored)];
import * as runtimeOnly from '@needle-tools/usd/runtime';
// Native constructors belong to the initialized module, not the JS loader entry.
// @ts-expect-error Runtime loader does not export a native CreateStage function.
runtimeOnly.CreateStage('/stage.usda');
import * as packageApi from '@needle-tools/usd';
// @ts-expect-error The package root also exposes native authoring through USD only.
packageApi.CreateStage('/stage.usda');
import './gltf-consumer.js';
void downloadControl.share;
