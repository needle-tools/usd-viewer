import { Vector3, Box3, PerspectiveCamera, Scene, Color, AmbientLight, Group, PointLight, WebGLRenderer, SRGBColorSpace, AgXToneMapping, NeutralToneMapping, VSMShadowMap, PMREMGenerator, EquirectangularReflectionMapping } from 'three';
import { ThreeRenderDelegateInterface } from "./usd/hydra/ThreeJsRenderDelegate.js"
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { track, trackError } from './analytics.js';
import { testAssetLibrary, fixtureUrl as testFixtureUrl } from '/test-fixtures/test-asset-library.js';
import './usd/bindings/emHdBindings.js';

const getUsdModule = globalThis["NEEDLE:USD:GET"];

// About dialog functionality - runs when module is loaded
document.addEventListener("DOMContentLoaded", function() {
  const aboutLink = document.getElementById('about-link');
  const aboutDialog = document.getElementById('about-dialog');
  const dialogCloseBtn = document.getElementById('dialog-close-btn');

  function openAboutDialog() {
    if (aboutDialog) {
      aboutDialog.style.display = 'block';
    }
  }

  function closeAboutDialog() {
    if (aboutDialog) {
      aboutDialog.style.display = 'none';
    }
  }

  if (aboutLink) {
    aboutLink.addEventListener('click', function(event) {
      event.preventDefault();
      track('open_about');
      openAboutDialog();
    });
  }

  if (dialogCloseBtn) {
    dialogCloseBtn.addEventListener('click', closeAboutDialog);
  }

  // Close dialog when clicking outside of it
  if (aboutDialog) {
    aboutDialog.addEventListener('click', function(event) {
      if (event.target === aboutDialog) {
        closeAboutDialog();
      }
    });
  }
  
  // Console output redirection to message log (warnings and errors only)
  const messageLog = document.getElementById('message-log');
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info
  };
  
  function addToMessageLog(message, type = 'log') {
    if (messageLog) {
      const timestamp = new Date().toLocaleTimeString();
      const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : type === 'info' ? 'ℹ️' : '📝';
      const logEntry = `[${timestamp}] ${prefix} ${message}`;
      
      // Add new message
      const currentText = messageLog.textContent;
      if (currentText === "Waiting for initialization to start...") {
        messageLog.textContent = logEntry;
      } else {
        messageLog.textContent = currentText + '\n' + logEntry;
      }
      
      // Auto-scroll to bottom
      messageLog.scrollTop = messageLog.scrollHeight;
      
      // Keep only last 50 lines to prevent memory issues
      const lines = messageLog.textContent.split('\n');
      if (lines.length > 50) {
        messageLog.textContent = lines.slice(-50).join('\n');
      }
    }
  }
  
  // Clear console log function
  window.clearMessageLog = function() {
    const messageLog = document.getElementById('message-log');
    if (messageLog) {
      messageLog.textContent = '';
    }
  }
  
  // Add clear button functionality
  const clearLogBtn = document.getElementById('clear-log-btn');
  if (clearLogBtn) {
    clearLogBtn.addEventListener('click', window.clearMessageLog);
  }

  // Loading-state helper: toggles the footer spinner. Pass { lockClear: true }
  // while the USD module loads to disable the log "Clear" button so the loading
  // messages stay put; file loads reuse the spinner but leave Clear enabled.
  const loadingSpinner = document.getElementById('loading-spinner');
  window.setViewerLoading = function(isLoading, { lockClear = false } = {}) {
    if (loadingSpinner) loadingSpinner.hidden = !isLoading;
    if (clearLogBtn) clearLogBtn.disabled = isLoading && lockClear;
  };

  // Centered "Loading <filename>" overlay shown while a file is loading.
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingOverlayFilename = document.getElementById('loading-overlay-filename');
  window.showLoadingOverlay = function(name) {
    if (!loadingOverlay) return;
    const display = String(name || '').split('/').pop().split('#')[0].split('?')[0] || 'file';
    if (loadingOverlayFilename) {
      loadingOverlayFilename.textContent = display;
      loadingOverlayFilename.title = display;
    }
    loadingOverlay.classList.add('visible');
  };
  window.hideLoadingOverlay = function() {
    if (loadingOverlay) loadingOverlay.classList.remove('visible');
  };

  // Cancel genuinely stops loading: the USD WASM driver has no abort API, so the
  // only reliable way to interrupt an in-flight load is to reload into the empty
  // (no-file) state.
  const loadingCancelBtn = document.getElementById('loading-cancel-btn');
  if (loadingCancelBtn) {
    loadingCancelBtn.addEventListener('click', function() {
      window.location.href = '?file=';
    });
  }

  // Surface otherwise-silent errors (uncaught exceptions, unhandled promise
  // rejections from the un-awaited load calls) in the footer terminal log.
  window.addEventListener('error', function(event) {
    if (!event || !event.message) return; // ignore resource-load errors without a message
    addToMessageLog(event.message, 'error');
    // Catch-all for uncaught errors not already reported with context above.
    trackError('uncaught', event.error || event.message);
    window.setViewerLoading(false);
    if (window.hideLoadingOverlay) window.hideLoadingOverlay();
  });
  window.addEventListener('unhandledrejection', function(event) {
    const reason = event && event.reason;
    addToMessageLog(reason && reason.stack ? reason.stack : String(reason), 'error');
    // Catch-all: load failures with file context are reported in loadUsdFile and
    // so are caught there (never reaching here); this covers everything else.
    trackError('unhandledrejection', reason);
    window.setViewerLoading(false);
    if (window.hideLoadingOverlay) window.hideLoadingOverlay();
  });

  // Override console methods - only warnings and errors
  console.warn = function(...args) {
    originalConsole.warn.apply(console, args);
    addToMessageLog(args.join(' '), 'warn');
  };
  
  console.error = function(...args) {
    originalConsole.error.apply(console, args);
    addToMessageLog(args.join(' '), 'error');
  };
  
  // Keep original log and info methods unchanged
  // console.log and console.info will only appear in browser dev console
});

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

// "?debug_menu_items" reveals menu items hidden by default (e.g. dead-link samples)
if (params.has("debug_menu_items")) document.body.classList.add("show-debug-menu");

let filename = params.get("file") || ""; // || 'https://cdn.glitch.global/bee386a1-31e6-4710-8850-a1d5b7026a09/speeder.usdz'; // default file
let messageLog = document.querySelector("#message-log");
let currentDisplayFilename = "";
const testFixtureBaseUrl = testFixtureUrl("");

// Lowercase file extension from a name or URL, with any query/hash stripped.
// Used only for analytics — extensions are not sensitive (unlike names/paths).
function extOf(name) {
  return String(name || "").split("#")[0].split("?")[0].split(".").pop().toLowerCase();
}

// Basename truncated for analytics: directory segments stripped, only the last
// 40 chars kept (so the extension survives). Filenames in a pro 3D tool are low
// sensitivity, but stripping paths + truncating keeps long/identifying paths
// out. Caveat: a name can still contain personal data (e.g. "personnel_scan") —
// an accepted, documented low risk for this tool. Returns "" for empty input.
function safeName(name) {
  const base = String(name || "").split("/").pop().split("\\").pop();
  return base.length > 40 ? base.slice(-40) : base;
}

function setFilenameText(__filename) {
  var _filename = __filename.split('/').pop().split('#')[0].split('?')[0];
  /** @type {HTMLElement | null} */
  const _el = document.querySelector(".filename-text");
  if (_el) _el.innerText = _filename;
  currentDisplayFilename = _filename;
}

function catalogAssetForUrlPath(urlPath) {
  if (!urlPath || !urlPath.startsWith(testFixtureBaseUrl)) return undefined;
  const root = decodeURIComponent(urlPath.substring(testFixtureBaseUrl.length));
  return testAssetLibrary.find(asset => asset.root === root);
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
if (window.setViewerLoading) window.setViewerLoading(true, { lockClear: true });
const initPromise = init();

console.log("Loading USD Module...");
if (messageLog) messageLog.textContent = "Loading USD Module – this can take a moment...";
if (window.setViewerLoading) window.setViewerLoading(true, { lockClear: true });
updateUrl();
try {
  Promise.all([getUsdModule({
    mainScriptUrlOrBlob: "/usd/bindings/emHdBindings.js",
    locateFile: (file) => {
      return "/usd/bindings/" + file;
    },
  }), initPromise]).then(async ([Usd]) => {
    USD = Usd;
    if (window.setViewerLoading) window.setViewerLoading(false);
    if (messageLog) messageLog.innerHTML = '<svg class="log-icon notranslate" translate="no" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Loading done. Drop a USD file and its dependencies to view it, or select a sample above.';
    animate();
    if (filename) {
      console.log("Loading File...");
      if (messageLog) messageLog.textContent = "Loading File " + filename;
      if (window.setViewerLoading) window.setViewerLoading(true);

      // Privacy-safe: send only the file type and the source host — never the
      // full URL, which can carry signed-link tokens or private asset ids.
      let host = "";
      try { host = new URL(filename).hostname; } catch { /* relative/odd URL */ }
      track('load_url', { method: 'url', type: extOf(filename), host });

      clearStage();
      const urlPath = (new URL(document.location)).searchParams.get("file").split('?')[0];
      const catalogAsset = catalogAssetForUrlPath(urlPath);
      if (catalogAsset?.files?.length) {
        await loadCatalogAssetBundle(catalogAsset, filename);
      } else {
        await loadUsdFile(undefined, filename, urlPath, true);
      }
    }
  }).catch((error) => {
    // Async rejections aren't caught by the surrounding try/catch — surface them.
    if (window.setViewerLoading) window.setViewerLoading(false);
    const err = "Failed to load the USD module: " + error;
    console.error(err);
    trackError('usd_module_init', error);
  });
}
catch (error) {
  if (window.setViewerLoading) window.setViewerLoading(false);
  if(error.toString().indexOf("SharedArrayBuffer") >= 0) {
    let err = "Your current browser doesn't support SharedArrayBuffer which is required for USD.";
    console.log(error, err);
    if (messageLog) messageLog.textContent = err;
    trackError('unsupported_browser', error, { reason: 'SharedArrayBuffer' });
  }
  else {
    let err = "Your current browser doesn't support USD-for-web. Error during initialization: " + error;
    console.log(err);
    if (messageLog) messageLog.textContent = err;
    trackError('init', error);
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

// In-browser glTF export (binary .glb) of the currently loaded scene.
function doGltfExport() {
  const exporter = new GLTFExporter();
  console.log("EXPORTING GLTF", window.usdRoot);
  try {
    exporter.parse( window.usdRoot, function ( gltf ) {
      const blob = new Blob([gltf], {type: 'application/octet-stream'});
      // Completed export: full source name + the exported glb size in bytes.
      track('export_gltf', { file: currentDisplayFilename || undefined, bytes: blob.size });
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
      // Async export failure (GLTFExporter's error callback).
      console.error(error);
      trackError('export_gltf', error);
    },
    {
      binary: true,
      // not possible right now since USD controls animation bindings,
      // it's not a three.js clip
      animations: [
        // window.usdRoot.animations[0]
      ]
    });
  } catch (error) {
    // parse() can also throw synchronously (before the error callback runs) —
    // report that too so a failed export is never silent.
    console.error("glTF export failed:", error);
    trackError('export_gltf', error);
  }
}

// "Export glTF" opens a dialog that points users to Needle Cloud for a
// production-ready conversion, while still offering the quick in-browser export.
const gltfExportBtn = document.getElementById('export-gltf');
const exportDialog = document.getElementById('export-dialog');
const exportDialogCloseBtn = document.getElementById('export-dialog-close-btn');
const exportDownloadDirectBtn = document.getElementById('export-download-direct');
const exportCloudCta = document.getElementById('export-cloud-cta');

// Did the user act (Cloud or download) this time? Lets us report closing the
// dialog as a dismissal — opened the export prompt but chose neither.
let exportDialogResolved = false;
// First hover per open, per button — learns which CTA drew interest without
// firing on every mouse pass.
let exportHovered = {};

function openExportDialog() {
  exportDialogResolved = false;
  exportHovered = {};
  track('open_export_dialog', { file: currentDisplayFilename || undefined });
  if (exportDialog) exportDialog.style.display = 'block';
}

function closeExportDialog(via) {
  if (exportDialog) exportDialog.style.display = 'none';
  if (!exportDialogResolved) {
    // Opened the prompt, then closed it without choosing Cloud or downloading.
    // `via` distinguishes the X button from clicking the backdrop.
    track('export_dialog_dismissed', { via: via || 'unknown' });
  }
}

function trackExportHover(button) {
  if (exportHovered[button]) return;
  exportHovered[button] = true;
  track('export_hover', { button });
}

if (gltfExportBtn) gltfExportBtn.addEventListener('click', (evt) => {
  evt.preventDefault();
  openExportDialog();
});
if (exportDialogCloseBtn) exportDialogCloseBtn.addEventListener('click', () => closeExportDialog('close_button'));
if (exportDialog) exportDialog.addEventListener('click', (event) => {
  if (event.target === exportDialog) closeExportDialog('backdrop');
});
if (exportCloudCta) {
  exportCloudCta.addEventListener('mouseenter', () => trackExportHover('cloud'));
  exportCloudCta.addEventListener('click', () => {
    // Opens Needle Cloud in a new tab (normal link); record the conversion + close.
    exportDialogResolved = true;
    track('export_cloud_cta', { file: currentDisplayFilename || undefined });
    closeExportDialog('cloud');
  });
}
if (exportDownloadDirectBtn) {
  exportDownloadDirectBtn.addEventListener('mouseenter', () => trackExportHover('download'));
  exportDownloadDirectBtn.addEventListener('click', () => {
    exportDialogResolved = true;
    track('export_download_direct', { file: currentDisplayFilename || undefined });
    closeExportDialog('download');
    doGltfExport();
  });
}

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
  
  // Clear console output when stage is cleared
  if (window.clearMessageLog) {
    window.clearMessageLog();
  }
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

  // A file is now loaded — hide the drop hint (covers drag-drop, which otherwise
  // never sets this) and show the centered loading overlay.
  const containerEl = document.querySelector("#container");
  if (containerEl) containerEl.classList.add("have-custom-file");
  if (window.showLoadingOverlay) window.showLoadingOverlay(filename);

  try {
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
  let drawResult = window.driver.Draw();
  if (drawResult instanceof Promise) {
    await drawResult;
  }
  if (window.setViewerLoading) window.setViewerLoading(false);
  if (window.hideLoadingOverlay) window.hideLoadingOverlay();
  messageLog.textContent = "";

  let stage = window.driver.GetStage();
  if (stage instanceof Promise) {
    stage = await stage;
  }
  if (!stage) {
    throw new Error("USD did not create a stage for " + (path || filename));
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
  } catch (err) {
    // A USD parse/render failure here is otherwise un-awaited, so it would only
    // reach the footer log via the global handler — never Rybbit. Report it with
    // the file context so these crashes are actually visible in analytics.
    console.error("Failed to load USD file:", err);
    trackError('usd_load', err, { type: extOf(filename), name: safeName(filename) });
    if (window.setViewerLoading) window.setViewerLoading(false);
    if (window.hideLoadingOverlay) window.hideLoadingOverlay();
    ready = false;
  }
}

async function fetchCatalogFile(path) {
  const url = testFixtureUrl(path);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch " + url + ": " + response.status + " " + response.statusText);
  }
  const blob = await response.blob();
  const name = path.split('/').pop() || path;
  return new File([blob], name);
}

async function loadCatalogAssetBundle(asset, displayName) {
  const rootPath = asset.root;
  const allPaths = Array.from(new Set([...(asset.files || []), rootPath]));
  const dependencyPaths = allPaths.filter(path => path !== rootPath);
  const rootIndex = allPaths.indexOf(rootPath);
  const totalFiles = dependencyPaths.length + 1;

  try {
    for (let i = 0; i < dependencyPaths.length; i++) {
      const path = dependencyPaths[i];
      if (messageLog) messageLog.textContent = "Downloading " + asset.label + " dependency " + (i + 1) + " / " + totalFiles + "...";
      const file = await fetchCatalogFile(path);
      await loadFile(file, false, path);
    }

    if (messageLog) messageLog.textContent = "Opening " + asset.label + "...";
    const rootFile = await fetchCatalogFile(rootPath);
    await loadFile(rootFile, true, rootPath);

    track('load_test_asset_bundle', {
      file: testFixtureUrl(rootPath),
      label: displayName || asset.label,
      files: totalFiles,
      rootIndex,
    });
  } catch (err) {
    console.error("Failed to load test asset bundle:", err);
    trackError('load_test_asset_bundle', err, { name: safeName(rootPath), files: totalFiles });
    if (window.setViewerLoading) window.setViewerLoading(false);
    if (window.hideLoadingOverlay) window.hideLoadingOverlay();
    ready = false;
  }
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

  // Highlight the centered drop hint while a file is dragged over the window.
  // Use an enter/leave depth counter so child elements don't cause flicker.
  let dragDepth = 0;
  const setDragActive = (active) => document.body.classList.toggle("drag-active", active);
  window.addEventListener("dragenter", (ev) => {
    if (!ev.dataTransfer || Array.from(ev.dataTransfer.types).indexOf("Files") === -1) return;
    dragDepth++;
    setDragActive(true);
  });
  window.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setDragActive(false);
  });
  window.addEventListener("dragover", (ev) => ev.preventDefault());
  const endDrag = () => { dragDepth = 0; setDragActive(false); };
  window.addEventListener("drop", endDrag);
  window.addEventListener("dragend", endDrag);

  // ---- Sample Library flyout, populated at runtime from the Needle Asset
  // Explorer. Lives as the second column of the dropdown mega-menu and loads on
  // first hover. The static menu links remain a fallback if the fetch fails. ----
  const ASSET_EXPLORER_API = 'https://asset-explorer.needle.tools/api/models.json';
  const dropdownEl = document.querySelector('.dropdown');
  const dropdownMenu = document.querySelector('.dropdown-menu');
  const galleryGrid = document.getElementById('gallery-grid');
  const galleryStatus = document.getElementById('gallery-status');
  const converterToggle = document.getElementById('converter-toggle');

  let galleryFetchStarted = false; // guards against duplicate fetches
  let selectedConverter = 'three'; // three | blender | omniverse

  function setGalleryStatus(text, isError = false) {
    if (!galleryStatus) return;
    galleryStatus.hidden = !text;
    galleryStatus.textContent = text || '';
    galleryStatus.classList.toggle('error', isError);
  }

  // Build a "N textures · M anims · K ext" line from the model metadata.
  function galleryMetaLine(model) {
    const info = model.info || {};
    const bits = [];
    if (info.textures) bits.push(info.textures + (info.textures === 1 ? ' texture' : ' textures'));
    if (info.animations) bits.push(info.animations + (info.animations === 1 ? ' anim' : ' anims'));
    if (Array.isArray(model.extensions) && model.extensions.length) bits.push(model.extensions.length + ' ext');
    return bits.join(' · ');
  }

  // Re-point every card to the currently selected converter variant. Cards keep
  // each available variant URL in their dataset, so the toggle never refetches.
  function applyConverter() {
    if (!galleryGrid) return;
    for (const card of galleryGrid.querySelectorAll('.gallery-card')) {
      const url = card.dataset[selectedConverter] || card.dataset.three || card.dataset.blender || card.dataset.omniverse;
      if (url) card.setAttribute('href', '?file=' + url);
    }
  }

  function buildGalleryCards(models) {
    if (!galleryGrid) return;
    galleryGrid.textContent = '';
    for (const model of models) {
      const usdz = (model.assets && model.assets.usdz) || {};
      const url = usdz[selectedConverter] || usdz.three || usdz.blender || usdz.omniverse;
      if (!url) continue; // skip models with no USDZ conversion at all

      // Cards are "a.file" so they reuse the delegated URL-load handler below.
      const card = document.createElement('a');
      card.className = 'file gallery-card';
      card.href = '?file=' + url;
      card.dataset.name = model.name || model.slug || 'Model';
      if (usdz.three) card.dataset.three = usdz.three;
      if (usdz.blender) card.dataset.blender = usdz.blender;
      if (usdz.omniverse) card.dataset.omniverse = usdz.omniverse;

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'gallery-thumb-wrap';
      if (model.thumbnail) {
        const img = document.createElement('img');
        img.className = 'gallery-thumb';
        img.loading = 'lazy';
        // COEP: require-corp blocks no-cors cross-origin images; load via CORS
        // (the API host sends Access-Control-Allow-Origin: *).
        img.crossOrigin = 'anonymous';
        img.alt = card.dataset.name;
        img.src = model.thumbnail;
        thumbWrap.appendChild(img);
      }
      card.appendChild(thumbWrap);

      const body = document.createElement('div');
      body.className = 'gallery-card-body';
      const name = document.createElement('span');
      name.className = 'gallery-name';
      name.textContent = card.dataset.name;
      body.appendChild(name);
      const meta = galleryMetaLine(model);
      if (meta) {
        const metaEl = document.createElement('span');
        metaEl.className = 'gallery-meta';
        metaEl.textContent = meta;
        body.appendChild(metaEl);
      }
      card.appendChild(body);

      galleryGrid.appendChild(card);
    }
  }

  function addOpenUsdTestAssets() {
    if (!dropdownMenu) return;
    const grouped = new Map();
    for (const asset of testAssetLibrary) {
      const assets = grouped.get(asset.group) || [];
      assets.push(asset);
      grouped.set(asset.group, assets);
    }

    for (const [group, assets] of grouped) {
      const section = document.createElement('div');
      section.className = 'dropdown-section openusd-test-assets';
      const heading = document.createElement('h4');
      heading.textContent = group;
      section.appendChild(heading);

      for (const asset of assets) {
        const link = document.createElement('a');
        link.className = 'file';
        link.href = '?file=' + testFixtureUrl(asset.root);
        link.dataset.name = asset.label;
        link.dataset.testAssetRoot = asset.root;
        if (asset.files) link.dataset.testAssetFiles = JSON.stringify(asset.files);
        link.textContent = asset.label;
        section.appendChild(link);
      }
      dropdownMenu.appendChild(section);
    }
  }

  addOpenUsdTestAssets();

  async function loadGalleryModels() {
    if (galleryFetchStarted) return; // fetch once, then reuse the cards
    galleryFetchStarted = true;
    setGalleryStatus('Loading sample models…');
    try {
      const res = await fetch(ASSET_EXPLORER_API);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const models = Array.isArray(data.models) ? data.models : [];
      if (!models.length) {
        setGalleryStatus('No sample models available right now.', true);
        return;
      }
      buildGalleryCards(models);
      setGalleryStatus('');
    } catch (err) {
      // Don't swallow: surface to the user and analytics. The static dropdown
      // links remain usable as a fallback.
      galleryFetchStarted = false; // allow a retry on next open
      setGalleryStatus('Couldn’t load sample models. Use the dropdown links instead.', true);
      trackError('gallery_fetch', err, { api: ASSET_EXPLORER_API });
    }
  }

  // Menu open/close is JS-driven (class .menu-open) so the close can be delayed.
  let menuCloseTimer = null;
  let menuOpenedAt = 0;
  function menuOpen() {
    if (menuCloseTimer) { clearTimeout(menuCloseTimer); menuCloseTimer = null; }
    if (!dropdownEl) return;
    const wasOpen = dropdownEl.classList.contains('menu-open');
    dropdownEl.classList.add('menu-open');
    if (!wasOpen) menuOpenedAt = performance.now();
    loadGalleryModels();
    if (!menuOpen.tracked) { menuOpen.tracked = true; track('open_gallery'); }
  }
  function menuClose() {
    if (menuCloseTimer) { clearTimeout(menuCloseTimer); menuCloseTimer = null; }
    if (dropdownEl) dropdownEl.classList.remove('menu-open');
  }
  // Close after a 300ms grace so a brief cursor excursion (or just-loaded a
  // sample) doesn't yank the menu away instantly.
  function menuScheduleClose() {
    if (menuCloseTimer) clearTimeout(menuCloseTimer);
    menuCloseTimer = setTimeout(menuClose, 300);
  }

  if (dropdownEl) {
    // Real mouse pointers: open on enter, close 300ms after leaving. Touch/pen
    // are ignored here (pointerType !== 'mouse') so the synthetic hover a tap
    // generates doesn't open the menu only for the tap-click to toggle it back
    // shut — which made the first tap do nothing and only the second one work.
    dropdownEl.addEventListener('pointerenter', function(e) {
      if (e.pointerType === 'mouse') menuOpen();
    });
    dropdownEl.addEventListener('pointerleave', function(e) {
      if (e.pointerType === 'mouse') menuScheduleClose();
    });
    dropdownEl.addEventListener('focusin', menuOpen);

    // Tap/click the button toggles the menu — the open path on touch, and a
    // toggle on pointer devices.
    const dropdownButton = dropdownEl.querySelector('.dropdown-button');
    if (dropdownButton) {
      dropdownButton.addEventListener('click', function(e) {
        e.preventDefault();
        if (dropdownEl.classList.contains('menu-open')) {
          // If it only just opened (a hover/pointerenter opened it as part of
          // this same gesture), keep it open — don't let the click toggle it
          // shut, which made the first tap appear to do nothing. A click after
          // the grace is a deliberate close.
          if (performance.now() - menuOpenedAt < 400) return;
          menuClose();
        } else {
          menuOpen();
        }
      });
    }
    // Tap/click anywhere outside the dropdown closes an open menu.
    document.addEventListener('click', function(e) {
      if (!dropdownEl.classList.contains('menu-open')) return;
      if (dropdownEl.contains(e.target)) return; // inside the trigger or the menu
      menuClose();
    });
  }
  if (converterToggle) {
    converterToggle.addEventListener('click', function(event) {
      const btn = event.target.closest('button[data-converter]');
      if (!btn) return;
      selectedConverter = btn.dataset.converter;
      for (const b of converterToggle.querySelectorAll('button')) {
        b.classList.toggle('active', b === btn);
      }
      applyConverter();
      track('gallery_select_converter', { converter: selectedConverter });
    });
  }

  // Load handler for our curated "a.file" links: the dropdown samples, the Clear
  // button, and the runtime-populated gallery cards. Delegated from the body so
  // dynamically-added cards are covered without re-binding.
  async function loadFromFileLink(link) {
    let params = new Map();
    try {
      params = (new URL(link.href)).searchParams;
    }
    catch {}
    filename = params.get("file");

    // Distinguish loading a sample from clicking "Clear" (empty file).
    if (filename) {
      // Samples are our own curated links (not user content), so the full
      // name/URL is safe and useful here — unlike user drops.
      const label = (link.dataset.name || link.textContent || '').trim();
      track('load_sample', { file: filename, label });
    } else {
      track('clear_model');
    }

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
      if (window.setViewerLoading) window.setViewerLoading(true);
      updateUrl();
      const urlPath = (new URL(document.location)).searchParams.get("file").split('?')[0];
      const catalogAsset = catalogAssetForUrlPath(urlPath);
      if (catalogAsset?.files?.length) {
        await loadCatalogAssetBundle(catalogAsset, filename);
        return;
      }
      // get just the filename, no paths
      const parts = filename.split('/');
      filename = parts[parts.length - 1];
      await loadUsdFile(undefined, filename, urlPath, true);
    } else {
      // Clear the URL when no file is selected (Clear button clicked)
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete("file");
      window.history.pushState({}, "USD Viewer", currentUrl);
    }
  }

  // Single delegated listener so that we don't have to reload the entire page,
  // and so gallery cards added after init are handled too.
  document.body.addEventListener('click', function(event) {
    const link = event.target.closest && event.target.closest('a.file');
    if (!link) return;
    event.preventDefault();
    // Highlight the active gallery card, then close the menu after a 300ms grace
    // (not instantly) so the choice registers visually before it disappears.
    if (link.classList.contains('gallery-card')) {
      if (galleryGrid) {
        for (const c of galleryGrid.querySelectorAll('.gallery-card.active')) c.classList.remove('active');
        link.classList.add('active');
      }
      menuScheduleClose();
    }
    loadFromFileLink(link);
  });
  
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
    window.driver.Draw();
    render();
  }
  requestAnimationFrame( animate.bind(null, timeout, endTimeCode) );
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
}

function render() {
  const time = Date.now() * 0.001;
  if (window.renderer.render && window.scene){
    window.renderer.render( window.scene, window.camera );
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

    const loadingPromise = new Promise((resolve, reject) => {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = async function(event) {
        let fileName = file.name;
        let directory = "/";
        if (fullPath !== undefined) {
          fileName = fullPath.split('/').pop();
          directory = fullPath.substring(0, fullPath.length - fileName.length);
          if (debugFileHandling) console.warn("directory", directory, "fileName", fileName);
        }
        USD.FS_createPath("", directory, true, true);
        USD.FS_createDataFile(directory, fileName, new Uint8Array(event.target.result), true, true, true);

        try {
          await loadUsdFile(directory, fileName, fullPath, isRootFile);
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    });
    await loadingPromise;
  }
  catch(ex) {
    if (window.setViewerLoading) window.setViewerLoading(false);
    if (window.hideLoadingOverlay) window.hideLoadingOverlay();
    console.error("Error loading file " + (fileOrHandle && fileOrHandle.name ? fileOrHandle.name : "") + ": " + ex);
    // Include the (truncated, path-stripped) name to debug per-file load crashes.
    trackError('load_file', ex, {
      type: extOf(fileOrHandle && fileOrHandle.name),
      name: safeName(fileOrHandle && fileOrHandle.name),
    });
  }
}

function testAndLoadFile(file) {
  let ext = file.name.split('.').pop();
  if (debugFileHandling) console.log(file.name + ", " + file.size + ", " + ext);
  if(ext == 'usd' || ext == 'usdz' || ext == 'usda' || ext == 'usdc') {
    track('load_file', {
      method: 'drop',
      files: 1,
      bytes: file.size,
      types: extOf(file.name),
      name: safeName(file.name),
    });
    clearStage();
    // Clear console output when loading a new file
    if (window.clearMessageLog) {
      window.clearMessageLog();
    }
    loadFile(file);
  } else {
    // Surface attempts to view a format we don't support.
    track('load_unsupported', { method: 'drop', type: extOf(file.name), name: safeName(file.name) });
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

  // Privacy-safe aggregate for analytics — total size, file count and the set
  // of extensions only. Never names, paths or URLs (those are user content).
  let droppedBytes = 0;
  const droppedExts = new Set();
  const tallyDropped = (resolved, name) => {
    if (resolved && typeof resolved.size === "number") droppedBytes += resolved.size;
    const e = extOf(name || (resolved && resolved.name));
    if (e) droppedExts.add(e);
  };

  // load all files into memory
  for (const file of allFiles) {
    if (debugFileHandling) console.log("loading file ", file)
    const resolved = await getFile(file);
    tallyDropped(resolved, file.name);
    await loadFile(resolved, false, file.fullPath);
  }

  // THEN load the root file if it's a supported format

  if (rootFile) {
    const isSupportedFormat = ['usd', 'usdz', 'usda', 'usdc'].includes(rootFile.name.split('.').pop());
    if (!isSupportedFormat) {
      console.error("Not a supported file format: ", rootFile.name);
      track('load_unsupported', { method: 'drop', type: extOf(rootFile.name), name: safeName(rootFile.name) });
    }
    else {
      const resolvedRoot = await getFile(rootFile);
      tallyDropped(resolvedRoot, rootFile.name);
      // One event per drop (not per nested file): aggregate size/count/types,
      // plus the (truncated, path-stripped) root model name.
      track('load_file', {
        method: 'drop',
        files: allFiles.length + 1, // non-root files + the root file
        bytes: droppedBytes,
        types: [...droppedExts].sort().join(','),
        name: safeName(rootFile.name),
      });
      loadFile(resolvedRoot, true, rootFile.fullPath);
    }
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
