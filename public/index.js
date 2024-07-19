import { Vector3, Box3, PerspectiveCamera, Scene, Color, AmbientLight, Group, PointLight, WebGLRenderer, SRGBColorSpace, AgXToneMapping, NeutralToneMapping, VSMShadowMap, PMREMGenerator, EquirectangularReflectionMapping } from 'three';
import { ThreeRenderDelegateInterface } from "./usd/hydra/ThreeJsRenderDelegate.js"
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import './usd/bindings/emHdBindings.js';

const getUsdModule = globalThis["NEEDLE:USD:GET"];

export function init(options = {
  hdrPath: 'environments/neutral.hdr'
}) {

// wait for document
document.addEventListener("DOMContentLoaded", function() {

let scene;
let defaultTexture;
let USD;

const debugFileHandling = false;

let params = (new URL(document.location)).searchParams;
let name = params.get("name");

let filename = params.get("file") || ""; // || 'https://cdn.glitch.global/bee386a1-31e6-4710-8850-a1d5b7026a09/speeder.usdz'; // default file
let messageLog = document.querySelector("#message-log");
let currentDisplayFilename = "";

function setFilenameText(__filename) {
  var _filename = __filename.split('/').pop().split('#')[0].split('?')[0];
  /** @type {HTMLElement | null} */
  const _el = document.querySelector(".filename");
  if (_el) _el.innerText = _filename;
  currentDisplayFilename = _filename;
}
  
if (filename) {
  /** @type {HTMLElement | null} */
  const el = document.querySelector("#container");
  if (el) el.classList.add("have-custom-file");
  // get filename from URL
  setFilenameText(filename);
}  
  
function updateUrl() {

  // Workaround for CORS issues: 
  // rewrite GitHub links in the form https://github.com/usd-wg/assets/blob/main/full_assets/ElephantWithMonochord/SoC-ElephantWithMonochord.usdc
  // to the raw version https://raw.githubusercontent.com/usd-wg/assets/main/full_assets/ElephantWithMonochord/SoC-ElephantWithMonochord.usdc
  if (filename.includes("github.com")) {
    filename = filename.replace("github.com", "raw.githubusercontent.com");
    filename = filename.replace("/blob/", "/");
  }
  
  // set quick look link
  let indexOfQuery = filename.indexOf('?');
  let url = filename;
  if (indexOfQuery >= 0)
    url = url.substring(0, indexOfQuery);

  /** @type {HTMLLinkElement | null} */
  const quickLookLink = document.querySelector("a#quick-look-link");
  if (quickLookLink) quickLookLink.href = url;
  
  const currentUrl = new URL(window.location.href);
  // set the file query parameter
  currentUrl.searchParams.set("file", filename);
  window.history.pushState({}, filename, currentUrl);
}

if (messageLog) messageLog.textContent = "Initializing...";
const initPromise = init();

console.log("Loading USD Module...");
if (messageLog) messageLog.textContent = "Loading USD Module – this can take a moment...";
updateUrl();
try {
  Promise.all([getUsdModule({
    mainScriptUrlOrBlob: "./emHdBindings.js",
    locateFile: (file) => {
      return "/usd/bindings/" + file;
    },
  }), initPromise]).then(async ([Usd]) => {
    USD = Usd;
    if (messageLog) messageLog.textContent = "Loading done";
    animate();
    if (filename) {
      console.log("Loading File...");
      if (messageLog) messageLog.textContent = "Loading File " + filename;

      clearStage();
      const urlPath = (new URL(document.location)).searchParams.get("file").split('?')[0];
      await loadUsdFile(undefined, filename, urlPath, true);
    }
  });
}
catch (error) {
  if(error.toString().indexOf("SharedArrayBuffer") >= 0) {
    let err = "Your current browser doesn't support SharedArrayBuffer which is required for USD.";
    console.log(error, err);
    if (messageLog) messageLog.textContent = err;
  }
  else {
    let err = "Your current browser doesn't support USD-for-web. Error during initialization: " + error;
    console.log(err);
    if (messageLog) messageLog.textContent = err;
  }
}

var currentRootFileName = undefined;
var timeout = 40;
var endTimeCode = 1;
var ready = false;

const usdzExportBtn = document.getElementById('export-usdz');
if (usdzExportBtn) usdzExportBtn.addEventListener('click', () => {
  alert("usdz");
});

const gltfExportBtn = document.getElementById('export-gltf');
if (gltfExportBtn) gltfExportBtn.addEventListener('click', (evt) => {
  const exporter = new GLTFExporter();
  console.log("EXPORTING GLTF", window.usdRoot);
  exporter.parse( window.usdRoot, function ( gltf ) {
    const blob = new Blob([gltf], {type: 'application/octet-stream'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    let filename = currentDisplayFilename;
    // strip extension, strip path
    filename = filename.split('/').pop()?.split('.')[0].split('?')[0] || "export";
    a.download = filename + ".glb";
    a.click();
    URL.revokeObjectURL(url);
  },
  function (error) {
    console.error(error);
  },
  { 
    binary: true,
    // not possible right now since USD controls animation bindings,
    // it's not a three.js clip
    animations: [
      // window.usdRoot.animations[0]
    ]
  });
  evt.preventDefault();
});

function getAllLoadedFiles(){
  const filePaths = [];

  getAllLoadedFilePaths("/", filePaths);

  return filePaths;
}

function getAllLoadedFilePaths(currentPath, paths) {
  const files = USD.FS_readdir(currentPath);
  for (const file of files) {
    // skip self and parent
    if (file === "." || file === "..") continue;
    const newPath = currentPath + file + "/";
    const data = USD.FS_analyzePath(currentPath + file + "/");
    if (data.object.node_ops.readdir) {
      // default directories we're not interested in
      if (newPath == "/dev/" || newPath == "/proc/" || newPath== "/home/" || newPath== "/tmp/" || newPath== "/usd/") continue;
      getAllLoadedFilePaths(newPath, paths);
    }
    else {
      paths.push(data.path);
    }
  }
}

function clearStage() {

  var allFilePaths = getAllLoadedFiles();
  console.log("Clearing stage.", allFilePaths)

  for (const file of allFilePaths) {
    USD.FS_unlink(file, true);
  }

  window.usdRoot.clear();
}

function addPath(root, path) {
    const files = USD.FS_readdir(path);
    for (const file of files) {
      // skip self and parent
      if (file === "." || file === "..") continue;
      const newPath = path + file + "/";
      const data = USD.FS_analyzePath(path + file + "/");
      if (data.object.node_ops.readdir) {
        // default directories we're not interested in
        if (newPath == "/dev/" || newPath == "/proc/" || newPath== "/home/" || newPath== "/tmp/" || newPath== "/usd/") continue;
        root[file] = {};
        addPath(root[file], newPath);
      }
      else {
        root[file] = data;
      }
    }
}

async function loadUsdFile(directory, filename, path, isRootFile = true) {
  setFilenameText(filename);
  if (debugFileHandling) console.warn("loading " + path, isRootFile, directory, filename);
  ready = false;

  // should be loaded last
  if (!isRootFile) return;

  let driver = null;
  const delegateConfig = {
    usdRoot: window.usdRoot,
    paths: new Array(),
    driver: () => (driver),
};

  const renderInterface = window.renderInterface = new ThreeRenderDelegateInterface(delegateConfig);
  driver = new USD.HdWebSyncDriver(renderInterface, path);
  if (driver instanceof Promise) {
    driver = await driver;
  }
  window.driver = driver;
  window.driver.Draw();
  messageLog.textContent = "";

  let stage = window.driver.GetStage();
  if (stage instanceof Promise) {
    stage = await stage;
    stage = window.driver.GetStage();
  }
  window.usdStage = stage
  if (stage.GetEndTimeCode){
    endTimeCode = stage.GetEndTimeCode();
    timeout = 1000 / stage.GetTimeCodesPerSecond();
  }

  // if up axis is z, rotate, otherwise make sure rotation is 0, in case we rotated in the past and need to undo it
  window.usdRoot.rotation.x = String.fromCharCode(stage.GetUpAxis()) === 'z' ? -Math.PI / 2 : 0;

  fitCameraToSelection(window.camera, window._controls, [window.usdRoot]);
  console.log("Loading done. Scene: ", window.usdRoot);

  const defaultPrimName = window.usdStage.GetRootLayer().GetDefaultPrim();
  document.getElementById('defaultPrim').textContent = defaultPrimName;

  const defaultPrim = window.usdStage.GetPrimAtPath("/" + defaultPrimName);

  const variantSets = defaultPrim.GetVariantSets();
  const topVariantSet = variantSets.get(0);

  const variantInfo = document.getElementById('variantInfo');
  if (topVariantSet) {
    variantInfo.classList.remove('hidden');
    document.getElementById('variantSet').textContent = topVariantSet;

    const variantOptionsSelect = document.getElementById('variantOptions');
    variantOptionsSelect.innerHTML = '';

    const variantOptions = defaultPrim.GetVariantSetOptions(topVariantSet);
    for(let i = 0; i < variantOptions.size(); i++) {
      const option = document.createElement('option');
      option.value = variantOptions.get(i);
      option.textContent = variantOptions.get(i);
      variantOptionsSelect.appendChild(option);
    }

    variantOptionsSelect.value = defaultPrim.GetVariantSelection(topVariantSet);

    variantOptionsSelect.addEventListener('change', async function () {
      window.usdRoot.clear();
      const selectedVariant = this.value;
      await defaultPrim.SetVariant(topVariantSet, selectedVariant);
    });
  }
  else {
    variantInfo.classList.add('hidden');
  }

  ready = true;
  try {
    console.log("Currently Exposed API", {
      "Stage": Object.getPrototypeOf(stage),
      "Layer": Object.getPrototypeOf(stage.GetRootLayer()),
      "Prim": Object.getPrototypeOf(stage.GetPrimAtPath("/")),
    });
  } catch(e) {
    console.warn("Couldn't log state root layer / root prim", e, stage, Object.getPrototypeOf(stage));
  }

  // TODO show file hierarchy in sidebar
  // better: object has "content" that contains child files, no multiple
  // calls to analyzePath necessary
  // TODO USDZ is resolved internally in Usd, if we want to make that useful
  // we need to unpack on the fly so that the directory can be traversed
  // OR we traverse the USD data directly, but that means we can't edit stuff.
  // So when content in a USDZ is changed > update the USDZ file and then reload
  // This might be recursive (USDZ in USDZ in USDZ)
  const root = {};
  addPath(root, "/");
  console.log("File system", root, USD.FS_analyzePath("/"));
}

// from https://discourse.threejs.org/t/camera-zoom-to-fit-object/936/24
function fitCameraToSelection(camera, controls, selection, fitOffset = 1.5) {
  const size = new Vector3();
  const center = new Vector3();
  const box = new Box3();
  
  box.makeEmpty();
  for(const object of selection) {
    box.expandByObject(object);
  }

  box.getSize(size);
  box.getCenter(center );

  if (Number.isNaN(size.x) || Number.isNaN(size.y) || Number.isNaN(size.z) || 
      Number.isNaN(center.x) || Number.isNaN(center.y) || Number.isNaN(center.z)) {
    console.warn("Fit Camera failed: NaN values found, some objects may not have any mesh data.", selection, size);
    if (controls) 
      controls.update();
    return;
  }

  if (!controls) {
    console.warn("No camera controls object found, something went wrong.");
    return;
  }

  const maxSize = Math.max(size.x, size.y, size.z);
  const fitHeightDistance = maxSize / (2 * Math.atan(Math.PI * camera.fov / 360));
  const fitWidthDistance = fitHeightDistance / camera.aspect;
  const distance = fitOffset * Math.max(fitHeightDistance, fitWidthDistance);

  if (distance == 0) {
    console.warn("Fit Camera failed: distance is 0, some objects may not have any mesh data.");
    return;
  }

  camera.position.z = params.get('cameraZ') || 7;
  camera.position.y = params.get('cameraY') || 7;
  camera.position.x = params.get('cameraX') || 0;

  const direction = controls.target.clone()
    .sub(camera.position)
    .normalize()
    .multiplyScalar(distance);

  controls.maxDistance = distance * 10;
  controls.target.copy(center);

  camera.near = distance / 100;
  camera.far = distance * 100;

  camera.updateProjectionMatrix();

  camera.position.copy(controls.target).sub(direction);
  controls.update();

  console.log("Fitting camera to selection", {
    size,
    center,
    maxSize,
    distance,
    near: camera.near,
    far: camera.far,
  });
}

async function init() {
  const camera = window.camera = new PerspectiveCamera( 27, window.innerWidth / window.innerHeight, 1, 3500 );
  camera.position.z = params.get('cameraZ') || 7;
  camera.position.y = params.get('cameraY') || 7;
  camera.position.x = params.get('cameraX') || 0;

  const scene = window.scene = new Scene();
  // scene.background = new Color(0xffffff);
  

  /*
  scene.add( new AmbientLight( 0x111111 ) );
  */
  const usdRoot = window.usdRoot = new Group();
  usdRoot.name = "USD Root";
  scene.add(usdRoot);

  /*
  let pointLight = new PointLight( 0xff8888 );
  pointLight.position.set( -30, 20, 220 );
  pointLight.castShadow = true;
  pointLight.shadow.camera.near = 8;
  pointLight.shadow.camera.far = 1000;
  pointLight.shadow.mapSize.width = 1024;
  pointLight.shadow.mapSize.height = 1024;
  pointLight.shadow.bias = - 0.002;

  pointLight.shadow.radius = 4;
  pointLight.shadow.samples = 8;
  scene.add( pointLight );
  */

  const renderer = window.renderer = new WebGLRenderer( { antialias: true, alpha: true } );
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.outputColorSpace = SRGBColorSpace;
  // renderer.toneMapping = AgXToneMapping;
  // renderer.toneMappingExposure = 1;
  renderer.toneMapping = NeutralToneMapping;
  console.log("tonemapping", renderer.toneMapping)
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = VSMShadowMap;
  renderer.setClearColor( 0x000000, 0 ); // the default

  const envMapPromise = new Promise(resolve => {
    const pmremGenerator = new PMREMGenerator(renderer);
            pmremGenerator.compileCubemapShader();
            
    new RGBELoader().load(options.hdrPath, (texture) => {
      const hdrRenderTarget = pmremGenerator.fromEquirectangular(texture);

      texture.mapping = EquirectangularReflectionMapping;
      texture.needsUpdate = true;
      scene.environment = hdrRenderTarget.texture;
      resolve();
    }, undefined, (err) => {
        console.error('An error occurred loading the HDR environment map.', err);
        resolve();
    });
  });

  document.body.appendChild( renderer.domElement );
  const controls = window._controls = new OrbitControls( camera, renderer.domElement );
  controls.enableDamping = true;
  controls.dampingFactor = 0.2;
  controls.update();

  window.addEventListener( 'resize', onWindowResize );
  
  renderer.domElement.addEventListener("drop", dropHandler);
  renderer.domElement.addEventListener("dragover", dragOverHandler);

  // attach to link click handlers so that we don't have to reload the entire page
  const fileLoadingLinks = document.querySelectorAll("a.file");
  for(let link of fileLoadingLinks) {
    link.addEventListener('click', async function(event) {
      event.preventDefault();
      
      let params = new Map();
      try {
        params = (new URL(event.target.href)).searchParams;
      }
      catch {}
      filename = params.get("file");
      
      if (params.get('cameraZ') !== undefined) camera.position.z = params.get('cameraZ');
      if (params.get('cameraY') !== undefined) camera.position.y = params.get('cameraY');
      if (params.get('cameraX') !== undefined) camera.position.x = params.get('cameraX');
      window._controls.update();
      
      // clear existing objects
      if (filename !== undefined) {
        // clearStage();  
        setFilenameText("");
      }
      
      const el = document.querySelector("#container");
      el.classList.remove("have-custom-file");
      
      clearStage();

      if (filename) {
        el.classList.add("have-custom-file");
        messageLog.textContent = "Downloading File " + filename + "...";
        updateUrl();
        // get just the filename, no paths
        const parts = filename.split('/');
        filename = parts[parts.length - 1];
        const urlPath = (new URL(document.location)).searchParams.get("file").split('?')[0];
        await loadUsdFile(undefined, filename, urlPath, true);
      }
    });
  }
  
  render();
  
  return envMapPromise;
}

// A little helper. Press space to pause/enable rendering. Useful when looking at animated scenes.
let stop = false;
document.body.onkeyup = function(e){
  if(e.keyCode == 32){
    stop = !stop;
  }
}

async function animate() {
  
  if (stop) {
    requestAnimationFrame( animate.bind(null, timeout, endTimeCode) );
    return;
  }

  window._controls.update();
  let secs = new Date().getTime() / 1000;
  await new Promise(resolve => setTimeout(resolve, 10));
  const time = secs * (1000 / timeout) % endTimeCode;
  if (window.driver && window.driver.SetTime && window.driver.Draw && ready) {
    window.driver.SetTime(time);
    await window.driver.Draw();
    await render();
  }
  requestAnimationFrame( animate.bind(null, timeout, endTimeCode) );
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
}

async function render() {
  const time = Date.now() * 0.001;
  if (window.renderer.render && window.scene){
    await window.renderer.render( window.scene, window.camera );
  }
}

async function loadFile(fileOrHandle, isRootFile = true, fullPath = undefined) {
  let file = undefined;
  try {
    if(fileOrHandle.getFile !== undefined) {
      file = await fileOrHandle.getFile();
    }
    else
      file = fileOrHandle;

    var reader = new FileReader();
    const loadingPromise = new Promise((resolve, reject) => {
      reader.onloadend = resolve;
      reader.onerror = reject;
    });
    reader.onload = function(event) {
      let fileName = file.name;
      let directory = "/";
      if (fullPath !== undefined) {
        fileName = fullPath.split('/').pop();
        directory = fullPath.substring(0, fullPath.length - fileName.length);
        if (debugFileHandling) console.warn("directory", directory, "fileName", fileName);
      }
      Usd.FS_createPath("", directory, true, true);
      Usd.FS_createDataFile(directory, fileName, new Uint8Array(event.target.result), true, true, true);

      loadUsdFile(directory, fileName, fullPath, isRootFile);
    };
    reader.readAsArrayBuffer(file);
    await loadingPromise;
  }
  catch(ex) {
    console.warn("Error loading file", fileOrHandle, ex);
  }
}

function testAndLoadFile(file) {
  let ext = file.name.split('.').pop();
  if (debugFileHandling) console.log(file.name + ", " + file.size + ", " + ext);
  if(ext == 'usd' || ext == 'usdz' || ext == 'usda' || ext == 'usdc') {
    clearStage();
    loadFile(file);
  }
}

/**
 * @param {FileSystemDirectoryEntry} directory
 */
async function readDirectory(directory) {
  let entries = [];

  let getAllDirectoryEntries = async (dirReader) => {
    let entries = [];
    let readEntries = async () => {
      let result = await new Promise((resolve, reject) => dirReader.readEntries(resolve, reject));
      if (result.length === 0)
        return entries;
      else
        return entries.concat(result, await readEntries());
    }
    return await readEntries();
  }

  /**
   * @param {FileSystemDirectoryReader} dirReader
   * @param {FileSystemDirectoryEntry} directory
   * @returns {Promise<number>}
   */
  let getEntries = async (directory) => {
    let dirReader = directory.createReader();
    await new Promise(async (resolve, reject) => {
      // Call the reader.readEntries() until no more results are returned.

        const results = await getAllDirectoryEntries(dirReader);

        if (results.length) {
          // entries = entries.concat(results);
          for (let entry of results) {
            if (entry.isDirectory) {
              const foundFiles = await getEntries(entry);
              if (foundFiles === 100)
                console.warn("Found more than 100 files in directory", entry);
            }
            else {
              entries.push(entry);
            }
          }
        }
        resolve(results.length);
    });
  };

  await getEntries(directory);
  return entries;
}

/**
 * @param {FileSystemEntry[]} entries
 */
async function handleFilesystemEntries(entries) {
  /** @type {FileSystemEntry[]} */
  const allFiles = [];
  const fileIgnoreList = [
    '.gitignore',
    'README.md',
    '.DS_Store',
  ]
  const dirIgnoreList = [
    '.git',
    'node_modules',
  ]

  for (let entry of entries) {
    if (debugFileHandling) console.log("file entry", entry)
    if (entry.isFile) {
      if (debugFileHandling) console.log("single file", entry);
      if (fileIgnoreList.includes(entry.name)) {
        continue;
      }
      allFiles.push(entry);
    }
    else if (entry.isDirectory) {
      if (dirIgnoreList.includes(entry.name)) {
        continue;
      }
      const files = await readDirectory(entry);
      if (debugFileHandling) console.log("all files", files);
      for (const file of files) {
        if (fileIgnoreList.includes(file.name)) {
          continue;
        }
        allFiles.push(file);
      }
    }
  }

  // clear current set of files
  clearStage();

  // determine which of these is likely the root file
  let rootFileCandidates = [];
  let usdaCandidates = [];
  
  // sort so shorter paths come first
  allFiles.sort((a, b) => {
    const diff = a.fullPath.split('/').length - b.fullPath.split('/').length;
    if (diff !== 0) return diff;
    return a.fullPath.localeCompare(b.fullPath);
  });

  // console.log("path candidates", allFiles);

  for (const file of allFiles) {
    if (debugFileHandling) console.log(file);
    // fullPath should only contain one slash, and should contain a valid USD extension
    let ext = file.name.split('.').pop();
    if(ext == 'usd' || ext == 'usdz' || ext == 'usda' || ext == 'usdc') {
      rootFileCandidates.push(file);
    }
    if(ext == 'usda') {
      usdaCandidates.push(file);
    }
  }

  let rootFile = undefined;

  // if there's multiple, use the first usda
  if (rootFileCandidates.length > 1) {
    if (usdaCandidates.length > 0) {
      rootFile = usdaCandidates[0];
    }
    else {
      rootFile = rootFileCandidates[0];
    }
  }
  else {
    // find the first usda file
    for (const file of allFiles) {
      let ext = file.name.split('.').pop();
      if(ext == 'usda' || ext == 'usdc' || ext == 'usdz' || ext == 'usd') {
        rootFile = file;
        break;
      }
    }
  }

  if (!rootFile && allFiles.length > 0) {
    // use first file
    rootFile = allFiles[0];
  }

  // TODO if there are still multiple candidates we should ask the user which one to use
  console.log("Assuming this is the root file: " + rootFile?.name); // + ". Total: " + allFiles.length, allFiles.map(f => f.fullPath).join('\n'));

  // remove the root file from the list of all files, we load it last
  if (rootFile) {
    allFiles.splice(allFiles.indexOf(rootFile), 1);
  }

  async function getFile(fileEntry) {
    try {
      return new Promise((resolve, reject) => fileEntry.file(resolve, reject));
    } catch (err) {
      console.log(err);
    }
  }

  // Sort so that USD files come last and all references are already there.
  // As long as the root file is the last one this actually shouldn't matter
  allFiles.sort((a, b) => {
    let extA = a.name.split('.').pop();
    let extB = b.name.split('.').pop();
    if (extA == 'usd' || extA == 'usdz' || extA == 'usda' || extA == 'usdc') return 1;
    if (extB == 'usd' || extB == 'usdz' || extB == 'usda' || extB == 'usdc') return -1;
    return 0;
  });

  console.log("All files", allFiles);

  return;

  // load all files into memory
  for (const file of allFiles) {
    if (debugFileHandling) console.log("loading file ", file)
    await loadFile(await getFile(file), false, file.fullPath);
  }

  // THEN load the root file if it's a supported format

  if (rootFile) {
    const isSupportedFormat = ['usd', 'usdz', 'usda', 'usdc'].includes(rootFile.name.split('.').pop());
    if (!isSupportedFormat)
      console.error("Not a supported file format: ", rootFile.name);
    else
     loadFile(await getFile(rootFile), true, rootFile.fullPath);
  }
}

/**
 * @param {DragEvent} ev
 */
function dropHandler(ev) {
  if (debugFileHandling) console.log('File(s) dropped', ev.dataTransfer.items, ev.dataTransfer.files);

  // Prevent default behavior (Prevent file from being opened)
  ev.preventDefault();

  if (ev.dataTransfer.items)
  {
    /** @type {FileSystemEntry[]} */
    const allEntries = [];

    let haveGetAsEntry = false;
    if (ev.dataTransfer.items.length > 0)
      haveGetAsEntry = ("getAsEntry" in ev.dataTransfer.items[0]) || ("webkitGetAsEntry" in ev.dataTransfer.items[0]);

    if (haveGetAsEntry) {
      for (var i = 0; i < ev.dataTransfer.items.length; i++)
      {
        let item = ev.dataTransfer.items[i];
        /** @type {FileSystemEntry} */
        let entry = ("getAsEntry" in item) ? item.getAsEntry() : item.webkitGetAsEntry();
        allEntries.push(entry);
      }
      handleFilesystemEntries(allEntries);
      return;
    }

    for (var i = 0; i < ev.dataTransfer.items.length; i++)
    {
      let item = ev.dataTransfer.items[i];
      
      // API when there's no "getAsEntry" support
      console.log(item.kind, item, entry);
      if (item.kind === 'file')
      {
        var file = item.getAsFile();
        testAndLoadFile(file);
      }
      // could also be a directory
      else if (item.kind === 'directory')
      {
        var dirReader = item.createReader();
        dirReader.readEntries(function(entries) {
          for (var i = 0; i < entries.length; i++) {
            console.log(entries[i].name);
            var entry = entries[i];
            if (entry.isFile) {
              entry.file(function(file) {
                testAndLoadFile(file);
              });
            }
          }
        });
      }
    }
  } else {
    for (var i = 0; i < ev.dataTransfer.files.length; i++) {
      let file = ev.dataTransfer.files[i];
      testAndLoadFile(file);
    }
  }
}

function dragOverHandler(ev) {
  ev.preventDefault();
}
});
};