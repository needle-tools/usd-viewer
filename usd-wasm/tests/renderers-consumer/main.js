import { getUsdModule } from '@needle-tools/usd';
import { createThreeHydra } from '@needle-tools/usd/three';
import { createWebGpuSupport, configureNeedleAgx, configureNeedleAgxDisplay } from '@needle-tools/usd/renderers';
import { mountStagePanel, mountRenderModePicker, mountRepl, createSelection } from '@needle-tools/usd/viewer';
import { mountDownloadButton } from '@needle-tools/usd/viewer/download';
import { setPrimActive, setPrimVisible, setVariant } from '@needle-tools/usd/scene';
import { Scene, Group, PerspectiveCamera, WebGPURenderer, AgXToneMapping, Color, AmbientLight } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const renderer = new WebGPURenderer({ antialias: false }); await renderer.init();
await configureNeedleAgx(renderer);
renderer.setSize(640, 480); renderer.toneMapping = AgXToneMapping; renderer.setClearColor(new Color(0xf0f4ef), 1); renderer.shadowMap.enabled = true;
document.body.append(renderer.domElement);
const scene = new Scene(), root = new Group(); scene.add(root);
const camera = new PerspectiveCamera(35, 640 / 480, 0.01, 1000); camera.position.set(5, 4, 8);
const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, 0.5, 0); controls.update();
const USD = await getUsdModule();
const handle = await createThreeHydra({ USD, scene: root, renderScene: scene, renderer, url: '/scene.usda', scenePrimitiveLightIntensityScale: 0.1, webGpuSupport: await createWebGpuSupport() });
await handle.ready(); await handle.materialsReady();
let status;
const picker = await mountRenderModePicker({ renderer, scene, camera, controls, settings: {maxSamples:32,bounces:4,denoiser:null,gkDenoiser:null}, onStatus(info){status=info;}, configurePathTracer: configureNeedleAgxDisplay, loadPathTracer: () => import('@meimu/mutracer'), loadGkPathTracer: () => import('three-gpu-pathtracer/webgpu'), loadDenoiser:()=>import('oidn-webgpu'), denoiserWeightsBaseUrl:'/weights/' });
let activeCamera = camera;
const stage = handle.driver.GetStage();
const panel = await mountStagePanel({ handle, stage, scene, camera, controls, setCamera(value) { activeCamera = value; } });
const replHost = document.createElement('section'); replHost.style.cssText='height:180px;width:640px;max-width:100%';document.body.append(replHost);
let current = true, stopped = false, renderFrame;
const repl = mountRepl({container:replHost,getContext:()=>current?{USD,stage,handle,panel,selection:panel.selection,follow:target=>panel.navigate(target)}:null,edit:callback=>panel.edit(callback)});
const selection = createSelection();
const downloadHost = document.createElement('div'); downloadHost.style.cssText='position:fixed;top:8px;left:8px;z-index:100';document.body.append(downloadHost);
const exportProgress = [];
const downloads = mountDownloadButton({container:downloadHost,getSource:()=>current?{handle,filename:'scene.usda'}:null,stateKey:'packed-download-format',onProgress:value=>exportProgress.push(value)});
let maskHandle, maskRoot;
window.packed = { USD, renderer, modes: picker.modes, handle, panel, repl, selection, camera, controls, downloads, exportProgress, setPrimActive, setPrimVisible, get status(){return status;},
  async cutout(value) {
    if (!maskHandle) {
      await picker.modes.setMode('basic');panel.dispose();await handle.dispose();scene.remove(root);
      maskRoot=new Group();scene.add(maskRoot);maskRoot.add(new AmbientLight(0xffffff,2));
      maskHandle=await createThreeHydra({USD,scene:maskRoot,renderScene:scene,renderer,url:'/mdl/mdl-opacity-mask.usda',webGpuSupport:await createWebGpuSupport()});
      await maskHandle.ready();
    }
    await setVariant(maskHandle,'/World/Looks/MDL','effect',value);await maskHandle.materialsReady();
    await renderer.compileAsync(scene,activeCamera);
    const values=[];maskRoot.traverse(object=>{if(object.isMesh&&object.material.userData.usdMdlApproximation)values.push({alphaTest:object.material.alphaTest,sideCopy:!!object.material.userData.usdHydraSideCloneOf});});
    return values;
  },
  async dispose(){
    current=false;stopped=true;cancelAnimationFrame(renderFrame);
    // The consumer owns scene membership and GPU submissions. Remove the
    // textured stage and flush its last frame before releasing loader textures.
    scene.remove(root);if(maskRoot)scene.remove(maskRoot);
    await renderer.compileAsync(scene,activeCamera);renderer.render(scene,activeCamera);await renderer.backend.device?.queue.onSubmittedWorkDone();
    downloads.dispose();downloadHost.remove();repl.dispose();panel.dispose();picker.modes.dispose();await maskHandle?.dispose();await handle.dispose();controls.dispose();renderer.dispose();
  }
};
function render() { if(stopped)return;picker.modes.render(activeCamera);renderFrame=requestAnimationFrame(render); } render();
