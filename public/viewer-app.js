import {
  Vector3,
  AnimationMixer,
  Box3,
  PerspectiveCamera,
  Scene,
  Color,
  AmbientLight,
  Group,
  PointLight,
  WebGLRenderer,
  SRGBColorSpace,
  AgXToneMapping,
  NeutralToneMapping,
  PMREMGenerator,
  EquirectangularReflectionMapping,
  createThreeHydra,
  getUsdModule,
  addPluginForNeedleEngine,
  fitNeedleCameraToObjects,
  getHydraHandleFromNeedleEngineAsset,
  RGBELoader,
  GLTFExporter,
  GLTFLoader,
  OrbitControls,
  runtimeViewerMode,
} from 'viewer-runtime';
import { track, trackError } from './analytics.js';
import { stashHandoffPayload } from './cloud-handoff-store.js';
import { testAssetLibrary, fixtureUrl as testFixtureUrl } from '/test-fixtures/test-asset-library.js';

const SHOW_OPENUSD_TEST_ASSETS = false;

// --- Upload-to-Needle-Cloud capture ---------------------------------------
// As files are loaded we keep the ORIGINAL bytes + their relative paths so the
// user can upload the exact USD set (a USD can reference external layers/textures)
// to Needle Cloud — where it's converted to glTF and hosted. Reset whenever the
// stage is cleared (i.e. a new model is loaded).
let capturedFiles = [];          // [{ relativePath, bytes: ArrayBuffer }] — drag-drop loads
let capturedRootFilename = null; // the entrypoint USD's relative path
// URL / sample loads (?file=…) are downloaded INSIDE the USD WASM runtime, so JS
// never sees the bytes. We remember the source URL + name and re-fetch on upload.
let loadedSourceUrl = null;
let loadedSourceFilename = null;

// Where the Needle Cloud upload flow lives. Localhost dev points at the cloud dev
// server so the whole flow can be tested locally; an explicit `?cloud=` query or a
// `needle_cloud_base` localStorage value overrides it.
function needleCloudBase() {
  const override = new URLSearchParams(location.search).get('cloud')
    || (typeof localStorage !== 'undefined' && localStorage.getItem('needle_cloud_base'));
  if (override) return override.replace(/\/+$/, '');
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'https://localhost:5173';
  return 'https://cloud.needle.tools';
}

// Stash the captured USD set and hand off to the (non-isolated) /cloud-handoff
// page, which postMessages it to Needle Cloud. Returns false if nothing is loaded.
async function uploadToNeedleCloud() {
  let files = capturedFiles;
  let rootFilename = capturedRootFilename;

  // URL / sample load: no captured drop bytes — re-fetch the original source.
  if (!files.length && loadedSourceUrl) {
    try {
      const resp = await fetch(loadedSourceUrl);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const bytes = await resp.arrayBuffer();
      // Must be a PLAIN filename — the upload SDK rejects names with slashes/URLs.
      rootFilename = cloudUploadBasename(loadedSourceUrl, loadedSourceFilename);
      files = [{ relativePath: rootFilename, bytes }];
    } catch (err) {
      console.error('[needle-cloud] could not fetch source for upload', err);
      trackError('upload_to_cloud_fetch', err);
      return false;
    }
  }

  if (!files.length || !rootFilename) return false;
  const payload = {
    type: 'needle-cloud-import',
    source: 'usd-viewer',
    rootFilename,
    files: files.map(f => ({ relativePath: f.relativePath, bytes: f.bytes })),
  };
  await stashHandoffPayload(payload);
  track('upload_to_cloud', { file: rootFilename || undefined, files: files.length });
  return true;
}

// Is there anything to upload right now (a drop set or a URL/sample load)?
function hasUploadableAsset() {
  return (capturedFiles.length > 0 && !!capturedRootFilename) || !!loadedSourceUrl;
}

// Reduce a URL (or a possibly-dirty name) to a plain filename like "Avocado.usdz".
// The upload SDK rejects filenames containing slashes or a full URL.
function cloudUploadBasename(url, fallbackName) {
  let name = '';
  try { name = decodeURIComponent(new URL(url).pathname.split('/').pop() || ''); } catch {}
  if (!name && fallbackName) name = String(fallbackName).split(/[\\/]/).pop().split('?')[0];
  name = name || 'model.usdz';
  // Collapse a pipeline-style compound extension to a single clean one
  // (e.g. "Avocado.glb.three.usdz" → "Avocado.usdz"). The intermediate ".glb"/
  // ".three" parts confuse cloud type detection and the converted-GLB naming.
  // Only safe here because this is a single, self-contained file (a .usdz / .usd);
  // multi-file drops keep their exact relative paths (USD references depend on them).
  const parts = name.split('.');
  if (parts.length > 2) name = parts[0] + '.' + parts[parts.length - 1];
  return name;
}

// Show / hide a .dialog-overlay with a quick fade + lift. The dialogs default to
// display:none in CSS; we set display first, force a reflow so the opacity/
// transform transition has a start state, then flip .is-open. On close we drop
// .is-open (transitioning back out) and hide after the animation — guarded so a
// reopen mid-animation cancels the pending hide. Works with reduced motion too
// (the timeout still hides it even when the transition is disabled).
//
// Defined at module scope (not inside init()) so BOTH the About dialog wiring
// below and the export/feedback wiring inside init() can use it.
const DIALOG_ANIM_MS = 220; // must be >= the CSS transition duration
function openDialogAnimated(el) {
  if (!el) return;
  el.style.display = 'block';
  void el.offsetWidth; // reflow: commit display + opacity:0 before .is-open
  el.classList.add('is-open');
}
function closeDialogAnimated(el) {
  if (!el) return;
  el.classList.remove('is-open');
  window.setTimeout(() => {
    if (!el.classList.contains('is-open')) el.style.display = 'none';
  }, DIALOG_ANIM_MS);
}

function formatOpenUsdBuildInfo(buildInfo) {
  const modules = Object.entries(buildInfo.modules ?? {})
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .join(", ");
  const sha = buildInfo.openusd?.gitSha ? buildInfo.openusd.gitSha.slice(0, 8) : "unknown";
  return `OpenUSD ${buildInfo.openusd?.version ?? "unknown"} (${sha}) - ${modules}`;
}

function updateOpenUsdBuildInfo(Usd) {
  const element = document.getElementById("openusd-build-info");
  if (!element || typeof Usd?.GetBuildInfoJson !== "function") return;
  try {
    element.textContent = formatOpenUsdBuildInfo(JSON.parse(Usd.GetBuildInfoJson()));
  } catch (error) {
    console.warn("Failed to read OpenUSD build info", error);
  }
}

function onDomReady(callback) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback, { once: true });
  } else {
    callback();
  }
}

function setHeaderOverflowOpen(open) {
  const overflow = document.getElementById('header-overflow');
  const button = overflow && overflow.querySelector('.header-overflow-button');
  if (!overflow || !button) return;
  overflow.classList.toggle('menu-open', open);
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function closeHeaderOverflowMenu() {
  setHeaderOverflowOpen(false);
}

onDomReady(function() {
  const overflow = document.getElementById('header-overflow');
  const button = overflow && overflow.querySelector('.header-overflow-button');
  if (!overflow || !button) return;

  button.addEventListener('click', function(event) {
    event.preventDefault();
    event.stopPropagation();
    setHeaderOverflowOpen(!overflow.classList.contains('menu-open'));
  });

  document.addEventListener('click', function(event) {
    if (!overflow.contains(event.target)) closeHeaderOverflowMenu();
  });

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') closeHeaderOverflowMenu();
  });
});

// About dialog functionality - runs when module is loaded
onDomReady(function() {
  const aboutLinks = Array.from(document.querySelectorAll('[data-open-about]'));
  const aboutDialog = document.getElementById('about-dialog');
  const dialogCloseBtn = document.getElementById('dialog-close-btn');

  // openDialogAnimated / closeDialogAnimated are module-scope helpers (hoisted)
  // that fade + lift the dialog in/out — see their definition further below.
  function openAboutDialog() {
    openDialogAnimated(aboutDialog);
  }

  function closeAboutDialog() {
    closeDialogAnimated(aboutDialog);
  }

  aboutLinks.forEach(function(aboutLink) {
    aboutLink.addEventListener('click', function(event) {
      event.preventDefault();
      closeHeaderOverflowMenu();
      track('open_about');
      openAboutDialog();
    });
  });

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

  // Track clicks on the About footer links. Rybbit auto-tracks outbound clicks,
  // but this attributes them to the About dialog and labels which link it was.
  const aboutActions = aboutDialog && aboutDialog.querySelector('.dialog-actions');
  if (aboutActions) {
    aboutActions.addEventListener('click', function(event) {
      const link = event.target.closest('a');
      if (!link) return;
      const href = link.getAttribute('href') || '';
      let target = 'other';
      if (href.includes('github.com/needle-tools/usd-viewer')) target = 'github';
      else if (href.includes('cloud.needle.tools')) target = 'cloud';
      else if (href.includes('autodesk')) target = 'autodesk';
      track('about_link_click', { target, url: href });
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
onDomReady(function() {

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
const VIEWER_MODE_THREE = "three";
const VIEWER_MODE_NEEDLE_LOADER = "needle-loader";
const VIEWER_MODE_STORAGE_KEY = "usd-viewer-mode";
let viewerMode = normalizeViewerMode(runtimeViewerMode);
let waitForMaterials = parseBooleanUrlParam(params.get("waitForMaterials"));
const DEFAULT_CAMERA_FIT_OFFSET = 1.5;
var currentRootFileName = undefined;
var timeout = 40;
var endTimeCode = 1;
var ready = false;
var loadGeneration = 0;
var currentHydraHandle = null;
var pendingHydraFiles = [];
var lastAnimationTimeSeconds = performance.now() / 1000;
let needleEngineElement = null;
let removeNeedleEngineUsdPlugin = null;
let needleLoaderFiles = [];
let nativeGltfRoot = null;
let nativeGltfMixers = [];

// Lowercase file extension from a name or URL, with any query/hash stripped.
// Used only for analytics — extensions are not sensitive (unlike names/paths).
function extOf(name) {
  return String(name || "").split("#")[0].split("?")[0].split(".").pop().toLowerCase();
}

function isUsdFileName(name) {
  return ['usd', 'usdz', 'usda', 'usdc'].includes(extOf(name));
}

function isGltfFileName(name) {
  return ['glb', 'gltf'].includes(extOf(name));
}

function isMaterialXFileName(name) {
  return extOf(name) === 'mtlx';
}

function usdStringFile(content, name) {
  return new File([new TextEncoder().encode(content)], name, { type: "model/vnd.usda" });
}

function makeGltfReferenceUsda(referencePath) {
  const normalized = String(referencePath || "").replaceAll("\\", "/");
  const fileName = normalized.split("/").pop() || "asset.glb";
  const directory = normalized.includes("/") ? normalized.slice(0, normalized.length - fileName.length) : "";
  const wrapperName = `${fileName.replace(/\.[^/.]+$/, "") || "asset"}.usda`;
  const wrapperPath = `${directory}${wrapperName}`;
  const content = `#usda 1.0
(
    defaultPrim = "Asset"
    upAxis = "Y"
)

def Xform "Asset" (
    prepend references = @./${fileName}@
)
{
}
`;
  return { file: usdStringFile(content, wrapperName), path: wrapperPath };
}

function inferMaterialXMaterialName(content) {
  try {
    const document = new DOMParser().parseFromString(content, "application/xml");
    const parserError = document.querySelector("parsererror");
    if (parserError) {
      console.warn("Failed to parse MaterialX document for material preview", parserError.textContent);
      return "";
    }

    const surfaceMaterials = document.getElementsByTagName("surfacematerial");
    for (const material of surfaceMaterials) {
      const name = material.getAttribute("name");
      if (name) return name;
    }

    const materials = document.querySelectorAll('[type="material"][name]');
    for (const material of materials) {
      const name = material.getAttribute("name");
      if (name) return name;
    }
  } catch (error) {
    console.warn("Failed to inspect MaterialX document for material preview", error);
  }

  return "";
}

function makeMaterialXReferenceUsda(referencePath, materialName) {
  const normalized = String(referencePath || "").replaceAll("\\", "/");
  const fileName = normalized.split("/").pop() || "material.mtlx";
  const directory = normalized.includes("/") ? normalized.slice(0, normalized.length - fileName.length) : "";
  const wrapperName = `${fileName.replace(/\.[^/.]+$/, "") || "material"}.usda`;
  const wrapperPath = `${directory}${wrapperName}`;
  const content = `#usda 1.0
(
    defaultPrim = "World"
    metersPerUnit = 1
    upAxis = "Z"
)

def Xform "World"
{
    def Sphere "PreviewSphere" (
        prepend apiSchemas = ["MaterialBindingAPI"]
    )
    {
        rel material:binding = </Materials/MaterialX/Materials/${materialName}>
        color3f[] primvars:displayColor = [(0.8, 0.8, 0.8)]
        double radius = 1
    }
}

def Scope "Materials"
{
    def "MaterialX" (
        references = [
            @./${fileName}@</MaterialX>
        ]
    )
    {
    }
}
`;
  return { file: usdStringFile(content, wrapperName), path: wrapperPath };
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

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage may be blocked in private/cross-origin contexts.
  }
}

function normalizeViewerMode(value) {
  return value === VIEWER_MODE_NEEDLE_LOADER ? VIEWER_MODE_NEEDLE_LOADER : VIEWER_MODE_THREE;
}

function parseBooleanUrlParam(value) {
  return value === "1" || value === "true" || value === "yes";
}

function setViewerModeUrlParam(url) {
  url.searchParams.set("viewer", viewerMode);
}

function setWaitForMaterialsUrlParam(url) {
  if (waitForMaterials) {
    url.searchParams.set("waitForMaterials", "1");
  } else {
    url.searchParams.delete("waitForMaterials");
  }
}

function applyViewerModeUi() {
  document.body.classList.toggle("viewer-mode-three", viewerMode === VIEWER_MODE_THREE);
  document.body.classList.toggle("viewer-mode-needle-loader", viewerMode === VIEWER_MODE_NEEDLE_LOADER);
  for (const button of document.querySelectorAll("[data-viewer-mode]")) {
    const active = button.getAttribute("data-viewer-mode") === viewerMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function applyMaterialLoadPolicyUi() {
  const toggle = document.getElementById("wait-materials-toggle");
  if (toggle instanceof HTMLInputElement) {
    toggle.checked = waitForMaterials;
  }
}
  
if (filename) {
  /** @type {HTMLElement | null} */
  const el = document.querySelector("#container");
  if (el) el.classList.add("have-custom-file");
  // get filename from URL
  setFilenameText(filename);
}  

applyViewerModeUi();
applyMaterialLoadPolicyUi();
  
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
  setViewerModeUrlParam(currentUrl);
  setWaitForMaterialsUrlParam(currentUrl);
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
    updateOpenUsdBuildInfo(USD);
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

      await clearStage();
      const urlPath = (new URL(document.location)).searchParams.get("file").split('?')[0];
      const catalogAsset = catalogAssetForUrlPath(urlPath);
      if (catalogAsset?.files?.length) {
        await loadCatalogAssetBundle(catalogAsset, filename);
      } else {
        const parts = filename.split('/');
        const displayFilename = parts[parts.length - 1];
        if (isGltfFileName(displayFilename || urlPath)) {
          await loadNativeGltfFile(displayFilename, urlPath);
        } else {
          await loadUsdFile(undefined, displayFilename, urlPath, true);
        }
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

// "Convert to glTF" opens a dialog that points users to Needle Cloud for a
// production-ready conversion, while still offering the quick in-browser export.
const gltfExportBtn = document.getElementById('export-gltf');
const gltfExportBtns = Array.from(document.querySelectorAll('[data-export-gltf]'));
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
  openDialogAnimated(exportDialog);
}

function closeExportDialog(via) {
  closeDialogAnimated(exportDialog);
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

// When no model is loaded the button is shown but inert. CSS reveals the hint on
// hover; on click/tap (where :hover doesn't fire) we flash it ourselves.
let exportHintTimer = null;
function flashExportHint(button) {
  const target = button || gltfExportBtn;
  if (!target) return;
  target.classList.add('show-tip');
  if (exportHintTimer) clearTimeout(exportHintTimer);
  exportHintTimer = setTimeout(() => target.classList.remove('show-tip'), 2500);
}

gltfExportBtns.forEach((button) => {
  button.addEventListener('click', (evt) => {
    evt.preventDefault();
    const container = document.getElementById('container');
    const hasFile = container && container.classList.contains('have-custom-file');
    if (!hasFile) {
      track('export_blocked_no_file');
      flashExportHint(button);
      return;
    }
    closeHeaderOverflowMenu();
    openExportDialog();
  });
});
if (exportDialogCloseBtn) exportDialogCloseBtn.addEventListener('click', () => closeExportDialog('close_button'));
if (exportDialog) exportDialog.addEventListener('click', (event) => {
  if (event.target === exportDialog) closeExportDialog('backdrop');
});
if (exportCloudCta) {
  exportCloudCta.addEventListener('mouseenter', () => trackExportHover('cloud'));
  exportCloudCta.addEventListener('click', async (evt) => {
    evt.preventDefault();
    exportDialogResolved = true;
    closeExportDialog('cloud');

    // Nothing loaded → just open Needle Cloud (dev-aware).
    if (!hasUploadableAsset()) {
      track('export_cloud_cta', { mode: 'open' });
      window.open(needleCloudBase(), '_blank', 'noopener');
      return;
    }

    // Stash the asset, then navigate to our top-level /cloud-handoff page. It opens
    // the cloud /connect popup and postMessages the asset up. We navigate (not a
    // popup) because the bridge must be TOP-LEVEL same-origin to read the stash —
    // a cross-site iframe gets partitioned storage and sees nothing.
    track('export_cloud_cta', { mode: 'upload' });
    try { sessionStorage.setItem('needle_cloud_base', needleCloudBase()); } catch {}
    // Preserve the current viewer URL (e.g. ?file=…) so the handoff's "Back to the
    // viewer" link returns to the same loaded asset.
    const returnUrl = location.href;
    const ok = await uploadToNeedleCloud();
    if (ok) location.assign('/cloud-handoff.html?return=' + encodeURIComponent(returnUrl));
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

// "Feedback" opens a dialog that posts a message to the Needle team via the
// server-side Discord webhook (POST /api/feedback). The webhook URL is a secret
// held only on the server — this page just sends the message + light context.
const feedbackLinks = Array.from(document.querySelectorAll('[data-open-feedback]'));
const feedbackDialog = document.getElementById('feedback-dialog');
const feedbackDialogCloseBtn = document.getElementById('feedback-dialog-close-btn');
const feedbackForm = document.getElementById('feedback-form');
const feedbackMessage = document.getElementById('feedback-message');
const feedbackEmail = document.getElementById('feedback-email');
const feedbackWebsite = document.getElementById('feedback-website'); // honeypot
const feedbackSubmit = document.getElementById('feedback-submit');
const feedbackStatus = document.getElementById('feedback-status');

let feedbackSending = false;
// True once the form was successfully sent, so closing afterwards isn't counted
// as an abandonment.
let feedbackResolved = false;

function setFeedbackStatus(text, kind) {
  if (!feedbackStatus) return;
  feedbackStatus.textContent = text || '';
  feedbackStatus.classList.toggle('is-error', kind === 'error');
  feedbackStatus.classList.toggle('is-success', kind === 'success');
}

function openFeedbackDialog() {
  feedbackResolved = false;
  track('open_feedback', { file: currentDisplayFilename || undefined });
  setFeedbackStatus('');
  openDialogAnimated(feedbackDialog);
  // Defer focus until the dialog is painted.
  window.requestAnimationFrame(() => feedbackMessage && feedbackMessage.focus());
}

function closeFeedbackDialog(via) {
  // Count an abandonment only if the dialog is actually open, the user typed a
  // message, and it wasn't sent. We report the length (not the text) — content
  // the user chose not to send must not leak into analytics.
  const wasOpen = feedbackDialog && feedbackDialog.classList.contains('is-open');
  if (wasOpen && !feedbackResolved) {
    const chars = (feedbackMessage?.value || '').trim().length;
    if (chars > 0) {
      track('feedback_dismiss', {
        via: via || 'unknown',
        chars,
        has_email: !!(feedbackEmail?.value || '').trim(),
      });
    }
  }
  closeDialogAnimated(feedbackDialog);
}

if (feedbackLinks.length) {
  feedbackLinks.forEach((feedbackLink) => feedbackLink.addEventListener('click', (evt) => {
    evt.preventDefault();
    closeHeaderOverflowMenu();
    openFeedbackDialog();
  }));
}
if (feedbackDialogCloseBtn) feedbackDialogCloseBtn.addEventListener('click', () => closeFeedbackDialog('close_button'));
if (feedbackDialog) feedbackDialog.addEventListener('click', (event) => {
  if (event.target === feedbackDialog) closeFeedbackDialog('backdrop');
});

if (feedbackForm) {
  feedbackForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (feedbackSending) return;

    const message = (feedbackMessage?.value || '').trim();
    if (!message) {
      setFeedbackStatus('Please enter a message.', 'error');
      feedbackMessage && feedbackMessage.focus();
      return;
    }

    feedbackSending = true;
    if (feedbackSubmit) feedbackSubmit.disabled = true;
    setFeedbackStatus('Sending…');

    const body = {
      message,
      email: (feedbackEmail?.value || '').trim(),
      website: feedbackWebsite?.value || '', // honeypot — should be empty
      pageUrl: location.href,
      file: currentDisplayFilename || '',
      userAgent: navigator.userAgent,
    };

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let msg = 'Could not send feedback. Please try again later.';
        try {
          const data = await res.json();
          if (data && data.error) msg = data.error;
        } catch {
          // non-JSON error body — keep the generic message
        }
        throw new Error(msg);
      }
      feedbackResolved = true; // sent — closing now is not an abandonment
      track('feedback_submit', { has_email: !!body.email, file: currentDisplayFilename || undefined });
      setFeedbackStatus('Thanks! Your feedback was sent.', 'success');
      feedbackForm.reset();
      window.setTimeout(() => closeFeedbackDialog(), 1500);
    } catch (err) {
      // Surface the failure to the user; never pretend it succeeded.
      trackError('feedback_submit', err);
      setFeedbackStatus(err && err.message ? err.message : 'Could not send feedback.', 'error');
    } finally {
      feedbackSending = false;
      if (feedbackSubmit) feedbackSubmit.disabled = false;
    }
  });
}

async function clearStage() {
  loadGeneration++;
  ready = false;

  const handle = currentHydraHandle;
  currentHydraHandle = null;
  window.usdHydra = undefined;
  window.driver = undefined;
  window.usdStage = undefined;
  window.renderInterface = undefined;
  window.needleEngineContext = undefined;
  pendingHydraFiles = [];
  needleLoaderFiles = [];
  nativeGltfMixers = [];

  try {
    await handle?.dispose?.();
  } catch (error) {
    console.warn("Failed to dispose Hydra handle", error);
  }

  try {
    if (needleEngineElement) {
      needleEngineElement.setAttribute("src", "");
      needleEngineElement.context?.clear?.();
    }
  } catch (error) {
    console.warn("Failed to clear Needle Engine scene", error);
  }

  try {
    disposeNativeGltfRoot();
  } catch (error) {
    console.warn("Failed to dispose native glTF scene", error);
  }

  // A new model is being loaded — drop any previously captured upload set.
  capturedFiles = [];
  capturedRootFilename = null;
  loadedSourceUrl = null;
  loadedSourceFilename = null;

  window.usdRoot.clear();
  window.usdRoot.rotation.set(0, 0, 0);
  
  // Clear console output when stage is cleared
  if (window.clearMessageLog) {
    window.clearMessageLog();
  }
}

function disposeMaterial(material) {
  if (!material) return;
  const materials = Array.isArray(material) ? material : [material];
  for (const item of materials) {
    for (const value of Object.values(item)) {
      if (value && typeof value === "object" && typeof value.dispose === "function" && value.isTexture) {
        value.dispose();
      }
    }
    item.dispose?.();
  }
}

function disposeNativeGltfRoot() {
  if (!nativeGltfRoot) return;
  nativeGltfRoot.traverse?.(object => {
    object.geometry?.dispose?.();
    disposeMaterial(object.material);
  });
  nativeGltfRoot.parent?.remove?.(nativeGltfRoot);
  nativeGltfRoot = null;
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

function toHydraFile(file, path) {
  const hydraPath = (path || file.name).replace(/^\/+/, "");
  try {
    Object.defineProperty(file, "path", {
      value: hydraPath,
      configurable: true,
    });
  } catch {
    file.path = hydraPath;
  }
  return file;
}

async function waitMaybeAsync(value) {
  return value && typeof value.then === "function" ? await value : value;
}

async function ensureNeedleEngineLoader() {
  await import("@needle-tools/engine");
  if (!removeNeedleEngineUsdPlugin) {
    removeNeedleEngineUsdPlugin = await addPluginForNeedleEngine({
      waitForMaterials,
      getFiles: () => needleLoaderFiles,
    });
  }
  if (!needleEngineElement) {
    needleEngineElement = document.createElement("needle-engine");
    needleEngineElement.className = "usd-viewer-needle-engine";
    needleEngineElement.setAttribute("camera-controls", "true");
    needleEngineElement.setAttribute("auto-fit", "false");
    needleEngineElement.setAttribute("autoplay", "");
    needleEngineElement.setAttribute("contactshadows", "0.7");
    needleEngineElement.setAttribute("background-color", "rgba(0,0,0,0)");
    needleEngineElement.addEventListener("loadstart", () => {
      ready = false;
    });
    needleEngineElement.addEventListener("progress", event => {
      const progress = event.detail?.totalProgress01;
      if (typeof progress === "number" && messageLog) {
        messageLog.textContent = `Loading ${currentDisplayFilename || "file"} ${Math.round(progress * 100)}%`;
      }
    });
    needleEngineElement.addEventListener("drop", dropHandler);
    needleEngineElement.addEventListener("dragover", dragOverHandler);
    document.body.appendChild(needleEngineElement);
  }
  return needleEngineElement;
}

function sourceForNeedleEngine(path, filesForHydra) {
  if (!filesForHydra?.length) return path;
  const rootFile = filesForHydra[0];
  return rootFile?.path || path || rootFile?.name || "";
}

async function waitForNeedleHydraHandle(context) {
  const started = performance.now();
  let handle = null;
  while (!handle && performance.now() - started < 10_000) {
    handle = getHydraHandleFromNeedleEngineAsset(context?.scene);
    if (handle) break;
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  return handle;
}

function toNeedleFitObject(value) {
  if (!value) return null;
  if (value.isObject3D === true) return value;
  return toNeedleFitObject(value.scene) || toNeedleFitObject(value.root) || null;
}

function needleFitObjectsFromLoadDetail(detail) {
  const objects = [];
  for (const loaded of detail?.loadedFiles || []) {
    const object = toNeedleFitObject(loaded?.file);
    if (object) objects.push(object);
  }
  return objects;
}

function cameraFitOffset() {
  const offset = new Vector3(
    numberUrlParam("cameraX", 0),
    numberUrlParam("cameraY", 7),
    numberUrlParam("cameraZ", 7),
  );
  if (offset.lengthSq() <= 0) {
    offset.set(0, 7, 7);
  }
  return offset;
}

function numberUrlParam(name, fallback) {
  const value = Number(params.get(name));
  return Number.isFinite(value) ? value : fallback;
}

function fitNeedleEngineCamera(context, targets = undefined) {
  if (!context?.scene || typeof fitNeedleCameraToObjects !== "function") return;
  const objects = (Array.isArray(targets) && targets.length > 0) ? targets : [context.scene];
  context.scene.updateMatrixWorld?.(true);
  const box = new Box3();
  box.makeEmpty();
  for (const object of objects) {
    object.updateMatrixWorld?.(true);
    box.expandByObject(object);
  }
  const size = new Vector3();
  box.getSize(size);
  if (!Number.isFinite(size.x) || !Number.isFinite(size.y) || !Number.isFinite(size.z) || size.lengthSq() <= 0) {
    return false;
  }
  try {
    return fitNeedleCameraToObjects(context, objects, {
      fitOffset: DEFAULT_CAMERA_FIT_OFFSET,
      centerCamera: "y",
    });
  } catch (err) {
    console.warn("Needle camera fit failed", err);
    return false;
  }
}

function scheduleNeedleEngineCameraFit(context, targets = undefined, timeoutMs = 15000) {
  const started = performance.now();
  const tick = () => {
    if (fitNeedleEngineCamera(context, targets)) return;
    if (performance.now() - started > timeoutMs) return;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function waitForNeedleHydraReady(handle, timeoutMs = 15000) {
  const promise = handle?.ready?.();
  if (!promise || typeof promise.then !== "function") return;
  let timedOut = false;
  let timeout = 0;
  await Promise.race([
    promise,
    new Promise(resolve => {
      timeout = setTimeout(() => {
        timedOut = true;
        resolve(undefined);
      }, timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeout));
  if (timedOut) {
    console.warn(`Needle Engine USD readiness is still pending after ${timeoutMs}ms; continuing loader readiness.`);
  }
}

async function loadNeedleEngineFile(filename, path, filesForHydra, generation) {
  const element = await ensureNeedleEngineLoader();
  needleLoaderFiles = filesForHydra || [];
  const source = sourceForNeedleEngine(path, filesForHydra);
  if (!source) throw new Error("Needle Engine USD load requires a source path");

  const loadPromise = new Promise((resolve, reject) => {
    const cleanup = () => {
      element.removeEventListener("loadfinished", onLoadFinished);
      element.removeEventListener("error", onError);
    };
    const onLoadFinished = event => {
      cleanup();
      resolve(event.detail || { context: element.context, loadedFiles: [] });
    };
    const onError = event => {
      cleanup();
      reject(event.detail || new Error("Needle Engine failed to load " + source));
    };
    element.addEventListener("loadfinished", onLoadFinished, { once: true });
    element.addEventListener("error", onError, { once: true });
  });

  element.setAttribute("src", source);
  const loadDetail = await loadPromise;
  const context = loadDetail?.context || element.context;
  if (generation !== loadGeneration) return null;

  const handle = await waitForNeedleHydraHandle(context);
  if (!handle) throw new Error("Needle Engine loaded " + filename + " without creating a USD Hydra handle");

  await waitForNeedleHydraReady(handle);
  const fitTargets = needleFitObjectsFromLoadDetail(loadDetail);
  if (!fitNeedleEngineCamera(context, fitTargets)) {
    scheduleNeedleEngineCameraFit(context, fitTargets);
  }
  if (waitForMaterials) {
    await handle.materialsReady?.();
  } else {
    void handle.materialsReady?.().catch(err => {
      console.warn("Needle Engine USD materials finished with errors", err);
    });
  }
  if (generation !== loadGeneration) {
    await handle.dispose?.();
    return null;
  }
  return { handle, context };
}

async function loadNativeNeedleEngineGltf(filename, path, generation) {
  const element = await ensureNeedleEngineLoader();
  needleLoaderFiles = [];

  const loadPromise = new Promise((resolve, reject) => {
    const cleanup = () => {
      element.removeEventListener("loadfinished", onLoadFinished);
      element.removeEventListener("error", onError);
    };
    const onLoadFinished = event => {
      cleanup();
      resolve(event.detail || { context: element.context, loadedFiles: [] });
    };
    const onError = event => {
      cleanup();
      reject(event.detail || new Error("Needle Engine failed to load " + path));
    };
    element.addEventListener("loadfinished", onLoadFinished, { once: true });
    element.addEventListener("error", onError, { once: true });
  });

  element.setAttribute("src", path);
  const loadDetail = await loadPromise;
  const context = loadDetail?.context || element.context;
  if (generation !== loadGeneration) return null;
  const fitTargets = needleFitObjectsFromLoadDetail(loadDetail);
  if (!fitNeedleEngineCamera(context, fitTargets)) {
    scheduleNeedleEngineCameraFit(context, fitTargets);
  }
  return context;
}

function loadThreeGltf(path) {
  const loader = new GLTFLoader();
  loader.setCrossOrigin?.("anonymous");
  return new Promise((resolve, reject) => {
    loader.load(
      path,
      resolve,
      event => {
        if (!event.lengthComputable || !messageLog) return;
        const percent = Math.round((event.loaded / event.total) * 100);
        messageLog.textContent = `Loading ${currentDisplayFilename || "glTF"} ${percent}%`;
      },
      reject,
    );
  });
}

async function loadNativeGltfFile(filename, path) {
  setFilenameText(filename);
  ready = false;
  const generation = loadGeneration;

  loadedSourceUrl = path;
  loadedSourceFilename = filename;

  const containerEl = document.querySelector("#container");
  if (containerEl) containerEl.classList.add("have-custom-file");
  if (window.showLoadingOverlay) window.showLoadingOverlay(filename);
  if (window.setViewerLoading) window.setViewerLoading(true);

  try {
    if (viewerMode === VIEWER_MODE_NEEDLE_LOADER) {
      const context = await loadNativeNeedleEngineGltf(filename, path, generation);
      if (!context || generation !== loadGeneration) return;
      window.needleEngineContext = context;
      window.usdHydra = undefined;
      window.driver = undefined;
      window.usdStage = undefined;
      window.renderInterface = undefined;
    } else {
      const gltf = await loadThreeGltf(path);
      if (generation !== loadGeneration) return;
      nativeGltfRoot = gltf.scene || new Group();
      window.usdRoot.add(nativeGltfRoot);
      nativeGltfMixers = (gltf.animations || []).length ? [new AnimationMixer(nativeGltfRoot)] : [];
      for (const clip of gltf.animations || []) {
        nativeGltfMixers[0]?.clipAction(clip).play();
      }
      fitCameraToSelection(window.camera, window._controls, [nativeGltfRoot]);
      window.needleEngineContext = undefined;
      window.usdHydra = undefined;
      window.driver = undefined;
      window.usdStage = undefined;
      window.renderInterface = undefined;
    }

    if (generation !== loadGeneration) return;
    ready = true;
    if (window.setViewerLoading) window.setViewerLoading(false);
    if (window.hideLoadingOverlay) window.hideLoadingOverlay();
    if (messageLog) messageLog.textContent = "";
  } catch (err) {
    console.error("Failed to load glTF file:", err);
    trackError('gltf_load', err, { type: extOf(filename), name: safeName(filename) });
    if (window.setViewerLoading) window.setViewerLoading(false);
    if (window.hideLoadingOverlay) window.hideLoadingOverlay();
    ready = false;
  }
}

async function loadUsdFile(directory, filename, path, isRootFile = true, filesForHydra = undefined) {
  setFilenameText(filename);
  if (debugFileHandling) console.warn("loading " + path, isRootFile, directory, filename);
  ready = false;
  const generation = loadGeneration;

  // Remember a URL/sample source (no directory) so "Upload to Needle Cloud" can
  // re-fetch it — drag-drop loads are captured separately in loadFile.
  if (isRootFile && directory === undefined && path) {
    loadedSourceUrl = path;
    loadedSourceFilename = filename;
  }

  // should be loaded last
  if (!isRootFile) return;

  // A file is now loaded — hide the drop hint (covers drag-drop, which otherwise
  // never sets this) and show the centered loading overlay.
  const containerEl = document.querySelector("#container");
  if (containerEl) containerEl.classList.add("have-custom-file");
  if (window.showLoadingOverlay) window.showLoadingOverlay(filename);

  let handle = null;
  let needleContext = null;
  try {
    if (viewerMode === VIEWER_MODE_NEEDLE_LOADER) {
      const result = await loadNeedleEngineFile(filename, path, filesForHydra, generation);
      if (!result) return;
      handle = result.handle;
      needleContext = result.context;
    } else {
      handle = await createThreeHydra({
        USD,
        scene: window.usdRoot,
        url: filesForHydra?.length ? undefined : path,
        files: filesForHydra,
        waitForMaterials,
      });

      if (generation !== loadGeneration) {
        await handle.dispose();
        return;
      }

      await handle.ready();
      if (!waitForMaterials) {
        void handle.materialsReady?.().catch(err => {
          console.warn("Three.js USD materials finished with errors", err);
        });
      }
    }

    if (generation !== loadGeneration) {
      await handle.dispose();
      return;
    }

    const stage = await waitMaybeAsync(handle.driver.GetStage());
    if (!stage) {
      throw new Error("USD did not create a stage for " + (path || filename));
    }

    currentHydraHandle = handle;
    window.usdHydra = handle;
    window.driver = handle.driver;
    window.usdStage = stage;
    window.needleEngineContext = needleContext || undefined;
    window.renderInterface = undefined;

    const metadata = handle.stageMetadata?.();
    if (metadata) {
      endTimeCode = metadata.endTimeCode;
      timeout = 1000 / metadata.timeCodesPerSecond;
    }

    if (viewerMode === VIEWER_MODE_THREE) {
      fitCameraToSelection(window.camera, window._controls, [window.usdRoot]);
    }
    console.log("Loading done. Scene: ", window.usdRoot);
    ready = true;

    if (window.setViewerLoading) window.setViewerLoading(false);
    if (window.hideLoadingOverlay) window.hideLoadingOverlay();
    messageLog.textContent = "";

    try {
      console.log("Currently Exposed API", {
        "Stage": Object.getPrototypeOf(stage),
        "Layer": Object.getPrototypeOf(stage.GetRootLayer()),
        "Prim": Object.getPrototypeOf(stage.GetPrimAtPath("/")),
      });
    } catch(e) {
      console.warn("Couldn't log state root layer / root prim", e, stage, Object.getPrototypeOf(stage));
    }

    const root = {};
    addPath(root, "/");
    console.log("File system", root, USD.FS_analyzePath("/"));
  } catch (err) {
    try {
      await handle?.dispose?.();
      if (generation === loadGeneration) currentHydraHandle = null;
      window.usdHydra = undefined;
      window.driver = undefined;
      window.usdStage = undefined;
    } catch (disposeError) {
      console.warn("Failed to clean up failed USD load", disposeError);
    }
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
function fitCameraToSelection(camera, controls, selection, fitOffset = DEFAULT_CAMERA_FIT_OFFSET) {
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
      controls.update(0);
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

  const direction = cameraFitOffset()
    .multiplyScalar(-1)
    .normalize()
    .multiplyScalar(distance);

  controls.maxDistance = distance * 10;
  controls.target.copy(center);

  camera.near = distance / 100;
  camera.far = distance * 100;

  camera.updateProjectionMatrix();

  camera.position.copy(controls.target).sub(direction);
  controls.update(0);

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
  window.__usdViewerThreeDiagnostics = { Box3, Vector3 };
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
  renderer.domElement.classList.add("usd-viewer-three-canvas");
  const controls = window._controls = new OrbitControls( camera, renderer.domElement );
  controls.enableDamping = true;
  controls.dampingFactor = 0.2;
  controls.update(0);

  window.addEventListener( 'resize', onWindowResize );
  
  renderer.domElement.addEventListener("drop", dropHandler);
  renderer.domElement.addEventListener("dragover", dragOverHandler);

  const viewerModeToggle = document.getElementById("viewer-mode-toggle");
  if (viewerModeToggle) {
    viewerModeToggle.addEventListener("click", event => {
      const button = event.target.closest?.("[data-viewer-mode]");
      if (!button) return;
      const nextMode = normalizeViewerMode(button.getAttribute("data-viewer-mode"));
      if (nextMode === viewerMode) return;
      viewerMode = nextMode;
      safeLocalStorageSet(VIEWER_MODE_STORAGE_KEY, viewerMode);
      const currentUrl = new URL(window.location.href);
      setViewerModeUrlParam(currentUrl);
      setWaitForMaterialsUrlParam(currentUrl);
      window.location.href = currentUrl.href;
    });
  }

  const waitMaterialsToggle = document.getElementById("wait-materials-toggle");
  if (waitMaterialsToggle instanceof HTMLInputElement) {
    waitMaterialsToggle.addEventListener("change", () => {
      waitForMaterials = waitMaterialsToggle.checked;
      const currentUrl = new URL(window.location.href);
      setViewerModeUrlParam(currentUrl);
      setWaitForMaterialsUrlParam(currentUrl);
      window.location.href = currentUrl.href;
    });
  }

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

  // ---- Sample Library mega-menu -------------------------------------------
  // The left column selects a source group; every group renders into the same
  // right-hand card grid. Groups with multiple conversion outputs expose the
  // converter controls in the grid header and on the loaded-file row.
  const ASSET_EXPLORER_API = 'https://asset-explorer.needle.tools/api/models.json';
  const GLTF_SAMPLE_ASSETS_INDEX = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/model-index.json';
  const USD_WG_MANIFEST_URL = './data/usd-wg-assets.json';
  const dropdownEl = document.querySelector('.dropdown');
  const dropdownMenu = document.querySelector('.dropdown-menu');
  const sampleGroupList = document.getElementById('sample-group-list');
  const usdWgGroupTree = document.getElementById('usd-wg-group-tree');
  const gltfGroupTree = document.getElementById('gltf-group-tree');
  const galleryTitle = document.getElementById('gallery-title');
  const gallerySubtitle = document.getElementById('gallery-subtitle');
  const galleryGrid = document.getElementById('gallery-grid');
  const galleryStatus = document.getElementById('gallery-status');
  const converterToggle = document.getElementById('converter-toggle');
  const loadedConverterToggleWrap = document.getElementById('loaded-converter-toggle-wrap');
  const loadedConverterToggle = document.getElementById('loaded-converter-toggle');

  let galleryFetchStarted = false; // guards against duplicate fetches
  let galleryFetchPromise = null;
  let galleryModels = null;
  let gltfTagIndexPromise = null;
  let gltfTagIndex = null;
  let gltfTreeRendered = false;
  let usdWgManifest = null;
  let usdWgManifestPromise = null;
  let usdWgTreeRendered = false;
  let selectedConverter = 'three-r185';
  let selectedSampleGroup = 'gltf';
  let loadedConversionCard = null;
  let loadedConverter = '';
  let lastPointerActivatedHref = '';
  let lastPointerActivatedAt = 0;
  const conversionCardByUrl = new Map();
  const collapsedSampleTrees = new Set(['usd-wg']);
  const gltfExcludedTags = new Set(['video']);
  const converterFamilies = [
    { id: 'three-r185', aliases: ['three-r185'], name: 'three', version: 'r185', icon: 'three', title: 'Converted with upstream three.js 0.185.0' },
    { id: 'three-r154', aliases: ['three', 'three-r154'], name: 'three', version: 'r154', icon: 'three', title: 'Converted with three.js r154, Needle fork' },
    { id: 'needle-engine', aliases: ['needle-engine', 'needle'], name: 'Needle', version: '5.1', title: 'Converted with Needle Engine 5.1.2 USDZExporter' },
    { id: 'blender-5-1', aliases: ['blender-5-1'], name: 'Blender', version: '5.1', icon: 'blender', title: 'Converted with Blender 5.1.2' },
    { id: 'blender-3-6', aliases: ['blender', 'blender-3-6'], name: 'Blender', version: '3.6', icon: 'blender', title: 'Converted with Blender 3.6' },
    { id: 'openusd-adobe-gltf', aliases: ['openusd-adobe-gltf', 'adobe-gltf', 'adobe-openusd-gltf'], name: 'Adobe glTF', version: 'OpenUSD', title: 'Converted with OpenUSD 26.05 and Adobe glTF file-format plugin 2026.03' },
    { id: 'guc', aliases: ['guc'], name: 'GUC', version: '0.5', title: 'Converted with GUC 0.5' },
    { id: 'omniverse', aliases: ['omniverse', 'ov'], name: 'Omniverse', version: 'Kit 105', icon: 'omniverse', title: 'Converted with Omniverse Kit 105.0' },
    { id: 'original-gltf', name: 'Original glTF', title: 'Original glTF/GLB source asset' },
  ];
  const converterIconSvg = {
    three: '<svg class="conv-logo notranslate" translate="no" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M.38 0a.268.268 0 0 0-.256.332l2.894 11.716a.268.268 0 0 0 .01.04l2.89 11.708a.268.268 0 0 0 .447.128L23.802 7.15a.268.268 0 0 0-.112-.45l-5.784-1.667a.268.268 0 0 0-.123-.035L6.38 1.715a.268.268 0 0 0-.144-.04L.456.01A.268.268 0 0 0 .38 0zm.374.654L5.71 2.08 1.99 5.664zM6.61 2.34l4.864 1.4-3.65 3.515zm-.522.12l1.217 4.926-4.877-1.4zm6.28 1.538l4.878 1.404-3.662 3.53zm-.52.13l1.208 4.9-4.853-1.392zm6.3 1.534l4.947 1.424-3.715 3.574zm-.524.12l1.215 4.926-4.876-1.398zm-15.432.696l4.964 1.424-3.726 3.586zM8.047 8.15l4.877 1.4-3.66 3.527zm-.518.137l1.236 5.017-4.963-1.432zm6.274 1.535l4.965 1.425-3.73 3.586zm-.52.127l1.235 5.012-4.958-1.43zm-9.63 2.438l4.873 1.406-3.656 3.523zm5.854 1.687l4.863 1.403-3.648 3.51zm-.54.04l1.214 4.927-4.875-1.4zm-3.896 4.02l5.037 1.442-3.782 3.638z"/></svg>',
    blender: '<svg class="conv-logo notranslate" translate="no" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.51 13.214c.046-.8.438-1.506 1.03-2.006a3.424 3.424 0 0 1 2.212-.79c.85 0 1.631.3 2.211.79.592.5.983 1.206 1.028 2.005.045.823-.285 1.586-.865 2.153a3.389 3.389 0 0 1-2.374.938 3.393 3.393 0 0 1-2.376-.938c-.58-.567-.91-1.33-.865-2.152M7.35 14.831c.006.314.106.922.256 1.398a7.372 7.372 0 0 0 1.593 2.757 8.227 8.227 0 0 0 2.787 2.001 8.947 8.947 0 0 0 3.66.76 8.964 8.964 0 0 0 3.657-.772 8.285 8.285 0 0 0 2.785-2.01 7.428 7.428 0 0 0 1.592-2.762 6.964 6.964 0 0 0 .25-3.074 7.123 7.123 0 0 0-1.016-2.779 7.764 7.764 0 0 0-1.852-2.043h.002L13.566 2.55l-.02-.015c-.492-.378-1.319-.376-1.86.002-.547.382-.609 1.015-.123 1.415l-.001.001 3.126 2.543-9.53.01h-.013c-.788.001-1.545.518-1.695 1.172-.154.665.38 1.217 1.2 1.22V8.9l4.83-.01-8.62 6.617-.034.025c-.813.622-1.075 1.658-.563 2.313.52.667 1.625.668 2.447.004L7.414 14s-.069.52-.063.831zm12.09 1.741c-.97.988-2.326 1.548-3.795 1.55-1.47.004-2.827-.552-3.797-1.538a4.51 4.51 0 0 1-1.036-1.622 4.282 4.282 0 0 1 .282-3.519 4.702 4.702 0 0 1 1.153-1.371c.942-.768 2.141-1.183 3.396-1.185 1.256-.002 2.455.41 3.398 1.175.48.391.87.854 1.152 1.367a4.28 4.28 0 0 1 .522 1.706 4.236 4.236 0 0 1-.239 1.811 4.54 4.54 0 0 1-1.035 1.626"/></svg>',
    omniverse: '<svg class="conv-logo notranslate" translate="no" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.948 8.798v-1.43a6.7 6.7 0 0 1 .424-.018c3.922-.124 6.493 3.374 6.493 3.374s-2.774 3.851-5.75 3.851c-.398 0-.787-.062-1.158-.185v-4.346c1.528.185 1.837.857 2.747 2.385l2.04-1.714s-1.492-1.952-4-1.952a6.016 6.016 0 0 0-.796.035m0-4.735v2.138l.424-.027c5.45-.185 9.01 4.47 9.01 4.47s-4.08 4.964-8.33 4.964c-.37 0-.733-.035-1.095-.097v1.325c.3.035.61.062.91.062 3.957 0 6.82-2.023 9.593-4.408.459.371 2.34 1.263 2.73 1.652-2.633 2.208-8.772 3.984-12.253 3.984-.335 0-.653-.018-.971-.053v1.864H24V4.063zm0 10.326v1.131c-3.657-.654-4.673-4.46-4.673-4.46s1.758-1.944 4.673-2.262v1.237H8.94c-1.528-.186-2.73 1.245-2.73 1.245s.68 2.412 2.739 3.11M2.456 10.9s2.164-3.197 6.5-3.533V6.201C4.153 6.59 0 10.653 0 10.653s2.35 6.802 8.948 7.42v-1.237c-4.84-.6-6.492-5.936-6.492-5.936z"/></svg>',
  };
  const converterFamilyById = new Map();
  const converterAliasToId = new Map();
  for (const family of converterFamilies) {
    converterFamilyById.set(family.id, family);
    for (const alias of [family.id, ...(family.aliases || [])]) converterAliasToId.set(alias, family.id);
  }

  function normalizeConverterId(value) {
    const key = String(value || '').trim();
    return converterAliasToId.get(key) || key;
  }

  function orderedConverterIds(conversions) {
    const available = new Set(Object.keys(conversions || {}).map(normalizeConverterId));
    const ordered = converterFamilies.map(family => family.id).filter(id => available.has(id));
    for (const id of available) {
      if (!ordered.includes(id)) ordered.push(id);
    }
    return ordered;
  }

  function pickConverterId(conversions, preferred = selectedConverter) {
    const ids = orderedConverterIds(conversions);
    if (!ids.length) return '';
    const normalizedPreferred = normalizeConverterId(preferred);
    if (normalizedPreferred && conversions?.[normalizedPreferred]) return normalizedPreferred;
    return ids[0];
  }

  function pickConversionUrl(conversions, preferred = selectedConverter) {
    const id = pickConverterId(conversions, preferred);
    return id ? conversions?.[id] : '';
  }

  function createConverterButton(converterId, activeId) {
    const id = normalizeConverterId(converterId);
    const family = converterFamilyById.get(id) || { id, name: id, version: '', title: id };
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.converter = id;
    button.title = family.title || family.name || id;
    const isActive = id === normalizeConverterId(activeId);
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    if (family.icon && converterIconSvg[family.icon]) {
      button.insertAdjacentHTML('beforeend', converterIconSvg[family.icon]);
    }

    const label = document.createElement('span');
    label.className = 'converter-label';
    const name = document.createElement('span');
    name.className = 'converter-name';
    name.textContent = family.name || id;
    label.appendChild(name);
    if (family.version) {
      const version = document.createElement('span');
      version.className = 'converter-version';
      version.setAttribute('aria-label', family.version);
      version.textContent = family.version;
      label.appendChild(version);
    }
    button.appendChild(label);
    return button;
  }

  function renderConverterToggle(toggle, ids, activeId = selectedConverter) {
    if (!toggle) return;
    const ordered = ids.filter(Boolean);
    toggle.textContent = '';
    for (const id of ordered) toggle.appendChild(createConverterButton(id, activeId));
  }

  const sampleGroups = new Map([
    ['gltf', {
      title: 'glTF → USD conversions',
      subtitle: 'Converted from glTF Sample Assets',
      converterVariants: true,
      load: loadAssetExplorerCards,
    }],
    ['usd-wg', {
      title: 'USD Working Group Assets',
      subtitle: 'Production USD samples from usd-wg/assets',
      converterVariants: false,
      load: () => loadUsdWgCards(''),
    }],
    ['test-models', {
      title: 'Needle Cloud',
      subtitle: 'Hosted USDZ assets with automatic optimization',
      converterVariants: false,
      cards: [
        {
          name: 'Kitchen Set',
          meta: 'Hosted on Needle Cloud',
          url: 'https://cloud-staging.needle.tools/-/assets/Z23hmXBZCdB4p-ZCdB4p/file.usdz',
          thumbnail: needleCloudScreenshotThumbnail('https://cloud-staging.needle.tools/-/assets/Z23hmXBZCdB4p-ZCdB4p/file.usdz'),
        },
      ],
    }],
  ]);

  function setGalleryStatus(text, isError = false) {
    if (!galleryStatus) return;
    galleryStatus.hidden = !text;
    galleryStatus.textContent = text || '';
    galleryStatus.classList.toggle('error', isError);
  }

  function setConverterControlsVisible(visible) {
    if (converterToggle) converterToggle.hidden = !visible;
  }

  function syncConverterControls() {
    for (const toggle of [converterToggle, loadedConverterToggle]) {
      if (!toggle) continue;
      for (const button of toggle.querySelectorAll('button[data-converter]')) {
        const active = normalizeConverterId(button.dataset.converter) === normalizeConverterId(selectedConverter);
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    }
  }

  function setSelectedConverter(converter) {
    selectedConverter = normalizeConverterId(converter) || 'three-r185';
    syncConverterControls();
    applyConverter();
  }

  function setLoadedConverterControlVisible(visible) {
    if (loadedConverterToggleWrap) loadedConverterToggleWrap.hidden = !visible;
  }

  function syncLoadedConverterControl() {
    if (!loadedConverterToggle) return;
    const ids = orderedConverterIds(loadedConversionCard?.conversions || {});
    renderConverterToggle(loadedConverterToggle, ids, loadedConverter || selectedConverter);
  }

  function canonicalSampleUrl(url) {
    try {
      const parsed = new URL(url, window.location.href);
      parsed.hash = '';
      return parsed.href;
    } catch {
      return String(url || '').split('#')[0];
    }
  }

  function indexConversionCard(card) {
    for (const [converter, url] of Object.entries(card.conversions || {})) {
      if (url) conversionCardByUrl.set(canonicalSampleUrl(url), { card, converter });
    }
  }

  function looksLikeAssetExplorerConversion(url) {
    return /https:\/\/asset-explorer\.needle\.tools\/downloads\/.+\.usdz(?:[?#].*)?$/i.test(String(url || ''));
  }

  function setLoadedConversionCard(card, converter) {
    loadedConversionCard = card || null;
    loadedConverter = normalizeConverterId(converter) || '';
    setLoadedConverterControlVisible(orderedConverterIds(loadedConversionCard?.conversions || {}).length > 1);
    syncLoadedConverterControl();
  }

  async function refreshLoadedConverterState(url) {
    if (!url) {
      setLoadedConversionCard(null, '');
      return;
    }
    if (!conversionCardByUrl.has(canonicalSampleUrl(url)) && looksLikeAssetExplorerConversion(url)) {
      await loadAssetExplorerCards();
    }
    const match = conversionCardByUrl.get(canonicalSampleUrl(url));
    setLoadedConversionCard(match?.card || null, match?.converter || '');
    if (match?.converter) setSelectedConverter(match.converter);
  }

  function loadConvertedVariant(converter) {
    const normalized = normalizeConverterId(converter);
    const url = loadedConversionCard?.conversions?.[normalized];
    if (!url || canonicalSampleUrl(url) === canonicalSampleUrl(filename)) return;
    const link = document.createElement('a');
    link.className = 'file gallery-card';
    link.href = sampleHref(url);
    link.dataset.name = loadedConversionCard.name || 'Model';
    return loadFromFileLink(link);
  }

  function sampleHref(url) {
    return '?file=' + url;
  }

  function needleCloudScreenshotThumbnail(assetUrl) {
    const url = new URL(assetUrl);
    url.pathname = url.pathname.replace(/\/file(?:\.[^/?#]+)?$/, '/screenshot.needle.webp');
    return url.href;
  }

  // Build a "N textures · M anims · K ext" line from Asset Explorer metadata.
  function assetExplorerMetaLine(model) {
    const info = model.info || {};
    const bits = [];
    if (info.textures) bits.push(info.textures + (info.textures === 1 ? ' texture' : ' textures'));
    if (info.animations) bits.push(info.animations + (info.animations === 1 ? ' anim' : ' anims'));
    if (Array.isArray(model.extensions) && model.extensions.length) bits.push(model.extensions.length + ' ext');
    return bits.join(' · ');
  }

  function addConversion(conversions, converter, url) {
    const id = normalizeConverterId(converter);
    if (!id || !url) return;
    conversions[id] = url;
  }

  function collectAssetExplorerConversions(model) {
    const conversions = {};
    const legacyUsdz = (model.assets && model.assets.usdz) || {};
    addConversion(conversions, 'three', legacyUsdz.three);
    addConversion(conversions, 'blender', legacyUsdz.blender);
    addConversion(conversions, 'omniverse', legacyUsdz.omniverse || legacyUsdz.ov);

    const conversionEntries = [
      ...(Array.isArray(model.conversions) ? model.conversions : []),
      ...(Array.isArray(model.paths?.conversions) ? model.paths.conversions : []),
    ];
    for (const conversion of conversionEntries) {
      if (!conversion || conversion.available === false) continue;
      const converter = conversion.id || conversion.suffix || conversion.converter || conversion.label;
      const url = conversion.usdzUri || conversion.usdzUrl || conversion.downloadUri || conversion.url || conversion.href;
      addConversion(conversions, converter, url);
    }
    addConversion(conversions, 'original-gltf', model.assets?.glb);
    return conversions;
  }

  function assetExplorerModelToCard(model) {
    if (!model.tags?.length) return null;
    const conversions = collectAssetExplorerConversions(model);
    const url = pickConversionUrl(conversions);
    if (!url) return null;
    return {
      name: model.name || model.slug || 'Model',
      meta: assetExplorerMetaLine(model),
      thumbnail: model.thumbnail || model.previewUri,
      conversions,
      url,
      tags: model.tags || ['untagged'],
    };
  }

  function normalizeModelKey(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  async function loadGltfTagIndex() {
    if (gltfTagIndex) return gltfTagIndex;
    if (gltfTagIndexPromise) return gltfTagIndexPromise;
    gltfTagIndexPromise = (async () => {
      const index = new Map();
      try {
        const res = await fetch(GLTF_SAMPLE_ASSETS_INDEX);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const entries = await res.json();
        for (const entry of Array.isArray(entries) ? entries : []) {
          const tags = normalizeGltfTags(entry.tags);
          for (const key of [entry.name, entry.label]) {
            const normalized = normalizeModelKey(key);
            if (normalized) index.set(normalized, tags);
          }
        }
      } catch (err) {
        trackError('gltf_tag_index_fetch', err, { index: GLTF_SAMPLE_ASSETS_INDEX });
      }
      gltfTagIndex = index;
      return gltfTagIndex;
    })();
    return gltfTagIndexPromise;
  }

  function normalizeGltfTags(tags, fallbackForMissing = true) {
    const values = Array.isArray(tags) && tags.length ? tags : (fallbackForMissing ? ['untagged'] : []);
    return [...new Set(values
      .map((tag) => String(tag || '').trim())
      .filter(Boolean)
      .filter((tag) => !gltfExcludedTags.has(tag.toLowerCase())))];
  }

  function attachGltfTags(model, tagIndex) {
    const slugTags = tagIndex.get(normalizeModelKey(model.slug));
    const nameTags = tagIndex.get(normalizeModelKey(model.name));
    const tags = Array.isArray(slugTags)
      ? slugTags
      : (Array.isArray(nameTags) ? nameTags : normalizeGltfTags(undefined));
    return { ...model, tags };
  }

  function prettySampleLabel(value) {
    return String(value || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (match) => match.toUpperCase());
  }

  function normalizeUsdWgPath(value) {
    const path = String(value || '').replace(/^\/+/, '');
    return path && !path.endsWith('/') ? `${path}/` : path;
  }

  function usdWgGroupId(path) {
    const normalized = normalizeUsdWgPath(path);
    return normalized ? `usd-wg:${normalized}` : 'usd-wg';
  }

  function usdWgPathFromGroupId(groupId) {
    return String(groupId || '').startsWith('usd-wg:')
      ? normalizeUsdWgPath(String(groupId).slice('usd-wg:'.length))
      : '';
  }

  function gltfTagGroupId(tag) {
    return `gltf:${encodeURIComponent(tag)}`;
  }

  function gltfTagFromGroupId(groupId) {
    return String(groupId || '').startsWith('gltf:')
      ? decodeURIComponent(String(groupId).slice('gltf:'.length))
      : '';
  }

  function topLevelSampleGroup(groupId) {
    const value = String(groupId || '');
    if (value.startsWith('usd-wg:')) return 'usd-wg';
    if (value.startsWith('gltf:')) return 'gltf';
    return sampleGroups.has(value) ? value : 'gltf';
  }

  function syncSampleTreeVisibility(groupId = selectedSampleGroup) {
    const activeTopLevel = topLevelSampleGroup(groupId);
    const treeByGroup = new Map([
      ['usd-wg', usdWgGroupTree],
      ['gltf', gltfGroupTree],
    ]);
    for (const [key, tree] of treeByGroup) {
      if (!tree) continue;
      tree.hidden = key !== activeTopLevel || collapsedSampleTrees.has(key);
    }
    if (!sampleGroupList) return;
    for (const button of sampleGroupList.querySelectorAll('.sample-root-folder[data-sample-group]')) {
      const group = button.dataset.sampleGroup || '';
      const expanded = group === activeTopLevel && !collapsedSampleTrees.has(group);
      button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }
  }

  function compareGltfTags(a, b) {
    const left = String(a || '');
    const right = String(b || '');
    if (left === 'showcase' && right !== 'showcase') return -1;
    if (right === 'showcase' && left !== 'showcase') return 1;
    return prettySampleLabel(left).localeCompare(prettySampleLabel(right));
  }

  function usdWgEntryBucket(entry) {
    const path = normalizeUsdWgPath(entry?.path);
    if (path.startsWith('full_assets/')) return 0;
    if (path.startsWith('test_assets/')) return 1;
    return 2;
  }

  function sortUsdWgEntries(entries) {
    return [...(entries || [])].sort((a, b) => {
      const bucket = usdWgEntryBucket(a) - usdWgEntryBucket(b);
      if (bucket) return bucket;
      return prettySampleLabel(a?.name).localeCompare(prettySampleLabel(b?.name));
    });
  }

  function findUsdWgEntry(path, entry = usdWgManifest?.root) {
    const normalized = normalizeUsdWgPath(path);
    if (!entry || normalizeUsdWgPath(entry.path) === normalized) return entry || null;
    for (const child of entry.children || []) {
      const result = findUsdWgEntry(normalized, child);
      if (result) return result;
    }
    return null;
  }

  function collectUsdWgCards(entry, cards = []) {
    for (const item of entry?.items || []) {
      const folder = String(item.assetPath || item.path || '').split('/').slice(0, -1).join('/');
      cards.push({
        name: item.name || 'USD Asset',
        meta: [String(item.ext || '').replace('.', '').toUpperCase(), folder].filter(Boolean).join(' · '),
        thumbnail: item.thumbnail,
        url: item.url,
      });
    }
    for (const child of sortUsdWgEntries(entry?.children)) collectUsdWgCards(child, cards);
    return cards;
  }

  function createSampleTreeControl({ groupId, name, count, hasChildren }, depth) {
    const control = document.createElement(hasChildren ? 'summary' : 'button');
    control.className = 'sample-group-button sample-folder-button';
    control.dataset.sampleGroup = groupId;
    control.style.setProperty('--depth', String(depth));
    if (!hasChildren) control.type = 'button';

    const label = document.createElement('span');
    label.textContent = name;
    control.appendChild(label);

    const countEl = document.createElement('small');
    countEl.textContent = String(count || 0);
    control.appendChild(countEl);
    return control;
  }

  function createUsdWgTreeControl(entry, depth) {
    const hasChildren = !!entry.children?.length;
    return createSampleTreeControl({
      groupId: usdWgGroupId(entry.path),
      name: prettySampleLabel(entry.name),
      count: entry.totalChildren || entry.items?.length || 0,
      hasChildren,
    }, depth);
  }

  function createGltfTagTreeControl(tag, count) {
    return createSampleTreeControl({
      groupId: gltfTagGroupId(tag),
      name: prettySampleLabel(tag),
      count,
      hasChildren: false,
    }, 1);
  }

  function renderUsdWgTreeEntry(entry, depth = 1) {
    if (entry.children?.length) {
      const details = document.createElement('details');
      details.className = 'sample-folder';
      details.appendChild(createUsdWgTreeControl(entry, depth));
      const children = document.createElement('div');
      children.className = 'sample-folder-children';
      for (const child of sortUsdWgEntries(entry.children)) children.appendChild(renderUsdWgTreeEntry(child, depth + 1));
      details.appendChild(children);
      return details;
    }
    return createUsdWgTreeControl(entry, depth);
  }

  function renderUsdWgTree() {
    if (!usdWgGroupTree || usdWgTreeRendered || !usdWgManifest?.root) return;
    usdWgGroupTree.textContent = '';
    for (const child of sortUsdWgEntries(usdWgManifest.root.children)) {
      usdWgGroupTree.appendChild(renderUsdWgTreeEntry(child));
    }
    usdWgTreeRendered = true;
    syncSampleTreeVisibility();
  }

  function renderGltfTagTree(cards) {
    if (!gltfGroupTree || gltfTreeRendered) return;
    const counts = new Map();
    for (const card of cards || []) {
      for (const tag of normalizeGltfTags(card.tags, false)) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    gltfGroupTree.textContent = '';
    for (const [tag, count] of [...counts.entries()].sort((a, b) => compareGltfTags(a[0], b[0]))) {
      gltfGroupTree.appendChild(createGltfTagTreeControl(tag, count));
    }
    gltfTreeRendered = true;
    syncSampleTreeVisibility();
  }

  async function loadUsdWgManifest() {
    if (usdWgManifest) return usdWgManifest;
    if (usdWgManifestPromise) return usdWgManifestPromise;
    usdWgManifestPromise = (async () => {
      const res = await fetch(USD_WG_MANIFEST_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      usdWgManifest = await res.json();
      renderUsdWgTree();
      return usdWgManifest;
    })();
    return usdWgManifestPromise;
  }

  async function loadUsdWgCards(path) {
    try {
      setGalleryStatus('Loading USD-WG catalog…');
      await loadUsdWgManifest();
      const entry = findUsdWgEntry(path) || usdWgManifest.root;
      return collectUsdWgCards(entry);
    } catch (err) {
      usdWgManifestPromise = null;
      setGalleryStatus('Couldn’t load the USD-WG catalog.', true);
      trackError('usd_wg_manifest_fetch', err, { manifest: USD_WG_MANIFEST_URL });
      return [];
    }
  }

  async function loadGltfCards(tag) {
    const cards = await loadAssetExplorerCards();
    if (!tag) return cards;
    return cards.filter((card) => (card.tags || []).includes(tag));
  }

  async function loadAssetExplorerCards() {
    if (galleryModels) return galleryModels;
    if (galleryFetchPromise) return galleryFetchPromise;
    galleryFetchStarted = true;
    galleryFetchPromise = (async () => {
    setGalleryStatus('Loading sample models…');
    try {
      const [res, tagIndex] = await Promise.all([
        fetch(ASSET_EXPLORER_API),
        loadGltfTagIndex(),
      ]);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const models = Array.isArray(data.models) ? data.models : [];
      galleryModels = models.map((model) => assetExplorerModelToCard(attachGltfTags(model, tagIndex))).filter(Boolean);
      for (const card of galleryModels) indexConversionCard(card);
      renderConverterToggle(converterToggle, orderedConverterIds(Object.assign({}, ...galleryModels.map(card => card.conversions || {}))), selectedConverter);
      syncConverterControls();
      renderGltfTagTree(galleryModels);
      if (!galleryModels.length) setGalleryStatus('No sample models available right now.', true);
      return galleryModels;
    } catch (err) {
      galleryFetchStarted = false; // allow a retry on next open
      galleryFetchPromise = null;
      setGalleryStatus('Couldn’t load sample models. Try the external library link instead.', true);
      trackError('gallery_fetch', err, { api: ASSET_EXPLORER_API });
      return [];
    }
    })();
    return galleryFetchPromise;
  }

  // Re-point every card to the currently selected converter variant. Cards keep
  // each available variant URL in their dataset, so the toggle never refetches.
  function applyConverter() {
    if (!galleryGrid) return;
    for (const card of galleryGrid.querySelectorAll('.gallery-card')) {
      let conversions = {};
      try {
        conversions = JSON.parse(card.dataset.conversions || '{}');
      } catch {
        conversions = {};
      }
      const url = pickConversionUrl(conversions);
      if (url) card.setAttribute('href', sampleHref(url));
    }
  }

  function buildGalleryCards(cards) {
    if (!galleryGrid) return;
    galleryGrid.textContent = '';
    const converterIds = orderedConverterIds(Object.assign({}, ...cards.map(card => card.conversions || {})));
    renderConverterToggle(converterToggle, converterIds, selectedConverter);
    setConverterControlsVisible(converterIds.length > 1);
    syncConverterControls();
    for (const item of cards) {
      const conversions = item.conversions || {};
      const url = pickConversionUrl(conversions) || item.url;
      if (!url) continue;

      // Cards are "a.file" so they reuse the delegated URL-load handler below.
      const card = document.createElement('a');
      card.className = 'file gallery-card';
      card.href = sampleHref(url);
      card.draggable = false;
      card.dataset.name = item.name || 'Model';
      card.dataset.conversions = JSON.stringify(conversions);

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'gallery-thumb-wrap';
      if (item.thumbnail) {
        const img = document.createElement('img');
        img.className = 'gallery-thumb';
        img.loading = 'lazy';
        img.draggable = false;
        // COEP: require-corp blocks no-cors cross-origin images; load via CORS
        // (the API host sends Access-Control-Allow-Origin: *).
        img.crossOrigin = 'anonymous';
        img.alt = card.dataset.name;
        img.src = item.thumbnail;
        thumbWrap.appendChild(img);
      }
      card.appendChild(thumbWrap);

      const body = document.createElement('div');
      body.className = 'gallery-card-body';
      const name = document.createElement('span');
      name.className = 'gallery-name';
      name.textContent = card.dataset.name;
      body.appendChild(name);
      if (item.meta) {
        const metaEl = document.createElement('span');
        metaEl.className = 'gallery-meta';
        metaEl.textContent = item.meta;
        body.appendChild(metaEl);
      }
      card.appendChild(body);

      galleryGrid.appendChild(card);
    }
  }

  async function selectSampleGroup(groupId) {
    let group = sampleGroups.get(groupId);
    if (!group && String(groupId || '').startsWith('usd-wg:')) {
      const path = usdWgPathFromGroupId(groupId);
      const titleSegment = path.split('/').filter(Boolean).at(-1) || 'USD Working Group Assets';
      group = {
        title: prettySampleLabel(titleSegment),
        subtitle: `USD-WG folder: ${path}`,
        converterVariants: false,
        load: () => loadUsdWgCards(path),
      };
    }
    if (!group && String(groupId || '').startsWith('gltf:')) {
      const tag = gltfTagFromGroupId(groupId);
      group = {
        title: prettySampleLabel(tag),
        subtitle: `glTF Sample Assets tagged ${tag}`,
        converterVariants: true,
        load: () => loadGltfCards(tag),
      };
    }
    group = group || sampleGroups.get('usd-wg');
    if (!group) return;
    selectedSampleGroup = groupId;
    if (galleryTitle) galleryTitle.textContent = group.title;
    if (gallerySubtitle) gallerySubtitle.textContent = group.subtitle;
    setConverterControlsVisible(!!group.converterVariants);
    if (sampleGroupList) {
      const activeTopLevel = topLevelSampleGroup(groupId);
      for (const button of sampleGroupList.querySelectorAll('[data-sample-group]')) {
        const buttonGroup = button.dataset.sampleGroup || '';
        const isTopLevel = sampleGroups.has(buttonGroup);
        const active = isTopLevel
          ? buttonGroup === activeTopLevel
          : buttonGroup === groupId;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
      }
    }
    syncSampleTreeVisibility(groupId);

    setGalleryStatus(group.load ? 'Loading sample models…' : '');
    if (galleryGrid) galleryGrid.textContent = '';
    const cards = group.load ? await group.load() : group.cards || [];
    if (selectedSampleGroup !== groupId) return;
    buildGalleryCards(cards);
    if (cards.length) setGalleryStatus('');
    else if (!galleryStatus?.classList.contains('error')) setGalleryStatus('No samples available yet.', true);
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

  if (SHOW_OPENUSD_TEST_ASSETS) addOpenUsdTestAssets();

  // Menu open/close is JS-driven (class .menu-open) so the close can be delayed.
  let menuCloseTimer = null;
  let menuOpenedAt = 0;
  function menuOpen() {
    if (menuCloseTimer) { clearTimeout(menuCloseTimer); menuCloseTimer = null; }
    if (!dropdownEl) return;
    const wasOpen = dropdownEl.classList.contains('menu-open');
    dropdownEl.classList.add('menu-open');
    if (!wasOpen) menuOpenedAt = performance.now();
    selectSampleGroup(selectedSampleGroup);
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
      setSelectedConverter(btn.dataset.converter);
      track('gallery_select_converter', { converter: selectedConverter });
    });
  }
  if (loadedConverterToggle) {
    loadedConverterToggle.addEventListener('click', function(event) {
      const btn = event.target.closest('button[data-converter]');
      if (!btn) return;
      const converter = normalizeConverterId(btn.dataset.converter);
      loadedConverter = converter;
      setSelectedConverter(converter);
      loadConvertedVariant(converter)?.catch(error => console.error("Failed to load converted sample", error));
      track('gallery_select_converter', { converter, source: 'loaded_asset' });
    });
  }
  if (sampleGroupList) {
    sampleGroupList.addEventListener('click', function(event) {
      const button = event.target.closest('[data-sample-group]');
      if (!button) return;
      const groupId = button.dataset.sampleGroup;
      const isTopLevel = sampleGroups.has(groupId);
      const hasTree = groupId === 'usd-wg' || groupId === 'gltf';
      if (isTopLevel && hasTree && selectedSampleGroup === groupId) {
        if (collapsedSampleTrees.has(groupId)) collapsedSampleTrees.delete(groupId);
        else collapsedSampleTrees.add(groupId);
        syncSampleTreeVisibility(groupId);
      } else {
        if (hasTree) collapsedSampleTrees.delete(groupId);
        selectSampleGroup(groupId);
      }
      track('gallery_select_group', { group: groupId });
    });
  }
  syncConverterControls();
  selectSampleGroup(selectedSampleGroup);
  refreshLoadedConverterState(filename);

  function activateFileLink(link) {
    // Highlight the active gallery card, then close the menu after a 300ms grace
    // (not instantly) so the choice registers visually before it disappears.
    if (link.classList.contains('gallery-card')) {
      if (galleryGrid) {
        for (const c of galleryGrid.querySelectorAll('.gallery-card.active')) c.classList.remove('active');
        link.classList.add('active');
      }
      menuScheduleClose();
    }
    loadFromFileLink(link).catch(error => console.error("Failed to load linked USD file", error));
  }

  if (galleryGrid) {
    galleryGrid.addEventListener('pointerdown', function(event) {
      if (event.defaultPrevented || event.button !== 0 || event.pointerType === 'touch' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest && event.target.closest('a.file.gallery-card');
      if (!link || !galleryGrid.contains(link)) return;
      event.preventDefault();
      event.stopPropagation();
      lastPointerActivatedHref = link.href;
      lastPointerActivatedAt = performance.now();
      activateFileLink(link);
    }, true);

    galleryGrid.addEventListener('click', function(event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest && event.target.closest('a.file.gallery-card');
      if (!link || !galleryGrid.contains(link)) return;
      event.preventDefault();
      event.stopPropagation();
      if (link.href === lastPointerActivatedHref && performance.now() - lastPointerActivatedAt < 750) return;
      activateFileLink(link);
    }, true);
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
      await refreshLoadedConverterState(filename);
    } else {
      track('clear_model');
      setLoadedConversionCard(null, '');
    }

    if (params.get('cameraZ') !== undefined) camera.position.z = params.get('cameraZ');
    if (params.get('cameraY') !== undefined) camera.position.y = params.get('cameraY');
    if (params.get('cameraX') !== undefined) camera.position.x = params.get('cameraX');
    window._controls.update(0);

    // clear existing objects
    if (filename !== undefined) {
      // clearStage();
      setFilenameText("");
    }

    const el = document.querySelector("#container");
    el.classList.remove("have-custom-file");

    await clearStage();

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
      const displayFilename = parts[parts.length - 1];
      if (isGltfFileName(displayFilename || urlPath)) {
        await loadNativeGltfFile(displayFilename, urlPath);
        return;
      }
      await loadUsdFile(undefined, displayFilename, urlPath, true);
    } else {
      // Clear the URL when no file is selected (Clear button clicked)
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete("file");
      setViewerModeUrlParam(currentUrl);
      window.history.pushState({}, "USD Viewer", currentUrl);
    }
  }

  // Single delegated listener so that we don't have to reload the entire page,
  // and so gallery cards added after init are handled too.
  document.body.addEventListener('click', function(event) {
    if (event.defaultPrevented) return;
    const link = event.target.closest && event.target.closest('a.file');
    if (!link) return;
    event.preventDefault();
    activateFileLink(link);
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

  const now = performance.now() / 1000;
  const dt = Math.min(0.1, Math.max(0, now - lastAnimationTimeSeconds));
  lastAnimationTimeSeconds = now;
  window._controls.update(dt);
  if (nativeGltfMixers.length && ready) {
    for (const mixer of nativeGltfMixers) mixer.update(dt);
  }
  if (viewerMode === VIEWER_MODE_THREE && currentHydraHandle && ready) currentHydraHandle.update(dt);
  render();
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
  const generation = loadGeneration;
  try {
    if(fileOrHandle.getFile !== undefined) {
      file = await fileOrHandle.getFile();
    }
    else
      file = fileOrHandle;
    if (generation !== loadGeneration) return;

    const loadingPromise = new Promise((resolve, reject) => {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = async function(event) {
        if (generation !== loadGeneration) {
          resolve();
          return;
        }
        let fileName = file.name;
        let directory = "/";
        if (fullPath !== undefined) {
          fileName = fullPath.split('/').pop();
          directory = fullPath.substring(0, fullPath.length - fileName.length);
          if (debugFileHandling) console.warn("directory", directory, "fileName", fileName);
        }

        // Keep the original bytes + relative path so the user can upload this exact
        // USD set to Needle Cloud (see uploadToNeedleCloud).
        const relPath = (fullPath !== undefined ? fullPath : file.name).replace(/^\/+/, "");
        capturedFiles.push({ relativePath: relPath, bytes: event.target.result });
        if (isRootFile) capturedRootFilename = relPath;

        try {
          if (generation !== loadGeneration) {
            resolve();
            return;
          }
          const hydraFile = toHydraFile(file, relPath);
          if (!isRootFile) {
            pendingHydraFiles.push(hydraFile);
            resolve();
            return;
          }

          const filesForHydra = [
            hydraFile,
            ...pendingHydraFiles.filter(entry => entry.path !== hydraFile.path),
          ];
          pendingHydraFiles = [];
          await loadUsdFile(directory, fileName, fullPath, isRootFile, filesForHydra);
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

async function testAndLoadFile(file) {
  if (debugFileHandling) console.log(file.name + ", " + file.size + ", " + extOf(file.name));
  if(isUsdFileName(file.name)) {
    track('load_file', {
      method: 'drop',
      files: 1,
      bytes: file.size,
      types: extOf(file.name),
      name: safeName(file.name),
    });
    await clearStage();
    // Clear console output when loading a new file
    if (window.clearMessageLog) {
      window.clearMessageLog();
    }
    await loadFile(file);
  } else if (isGltfFileName(file.name)) {
    track('load_file', {
      method: 'drop',
      files: 2,
      bytes: file.size,
      types: extOf(file.name) + ',usda',
      name: safeName(file.name),
    });
    await clearStage();
    if (window.clearMessageLog) {
      window.clearMessageLog();
    }
    await loadGltfFileAsUsd(file, `/${file.name}`);
  } else if (isMaterialXFileName(file.name)) {
    track('load_file', {
      method: 'drop',
      files: 2,
      bytes: file.size,
      types: extOf(file.name) + ',usda',
      name: safeName(file.name),
    });
    await clearStage();
    if (window.clearMessageLog) {
      window.clearMessageLog();
    }
    await loadMaterialXFileAsUsd(file, `/${file.name}`);
  } else {
    // Surface attempts to view a format we don't support.
    track('load_unsupported', { method: 'drop', type: extOf(file.name), name: safeName(file.name) });
  }
}

async function loadGltfFileAsUsd(file, fullPath) {
  await loadFile(file, false, fullPath);
  const wrapper = makeGltfReferenceUsda(fullPath);
  await loadFile(wrapper.file, true, wrapper.path);
}

async function loadMaterialXFileAsUsd(file, fullPath) {
  const content = await file.text();
  const materialName = inferMaterialXMaterialName(content);
  if (!materialName) {
    const error = new Error(`Could not find a MaterialX material in ${file.name}`);
    console.error(error.message);
    trackError('materialx_preview', error, { type: extOf(file.name), name: safeName(file.name) });
    return;
  }

  await loadFile(file, false, fullPath);
  const wrapper = makeMaterialXReferenceUsda(fullPath, materialName);
  await loadFile(wrapper.file, true, wrapper.path);
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
  await clearStage();

  // determine which of these is likely the root file
  let rootFileCandidates = [];
  let usdaCandidates = [];
  let materialXCandidates = [];
  let gltfCandidates = [];
  
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
    if(isUsdFileName(file.name)) {
      rootFileCandidates.push(file);
    }
    if(isMaterialXFileName(file.name)) {
      materialXCandidates.push(file);
    }
    if(isGltfFileName(file.name)) {
      gltfCandidates.push(file);
    }
    if(extOf(file.name) == 'usda') {
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
      if(isUsdFileName(file.name)) {
        rootFile = file;
        break;
      }
    }
  }

  if (!rootFile && allFiles.length > 0) {
    // Prefer generated-preview roots before falling back to the first sidecar.
    rootFile = materialXCandidates[0] || gltfCandidates[0] || allFiles[0];
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
    if (isUsdFileName(a.name)) return 1;
    if (isUsdFileName(b.name)) return -1;
    if (isMaterialXFileName(a.name)) return 1;
    if (isMaterialXFileName(b.name)) return -1;
    if (isGltfFileName(a.name)) return 1;
    if (isGltfFileName(b.name)) return -1;
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
    const isSupportedFormat = isUsdFileName(rootFile.name);
    const isGltfRoot = isGltfFileName(rootFile.name);
    const isMaterialXRoot = isMaterialXFileName(rootFile.name);
    if (!isSupportedFormat) {
      if (!isGltfRoot && !isMaterialXRoot) {
        console.error("Not a supported file format: ", rootFile.name);
        track('load_unsupported', { method: 'drop', type: extOf(rootFile.name), name: safeName(rootFile.name) });
      }
      else if (isGltfRoot) {
        const resolvedRoot = await getFile(rootFile);
        tallyDropped(resolvedRoot, rootFile.name);
        track('load_file', {
          method: 'drop',
          files: allFiles.length + 2, // sidecars + glTF root + generated USDA wrapper
          bytes: droppedBytes,
          types: [...droppedExts, 'usda'].sort().join(','),
          name: safeName(rootFile.name),
        });
        await loadGltfFileAsUsd(resolvedRoot, rootFile.fullPath);
      }
      else {
        const resolvedRoot = await getFile(rootFile);
        tallyDropped(resolvedRoot, rootFile.name);
        track('load_file', {
          method: 'drop',
          files: allFiles.length + 2, // sidecars + MaterialX root + generated USDA wrapper
          bytes: droppedBytes,
          types: [...droppedExts, 'usda'].sort().join(','),
          name: safeName(rootFile.name),
        });
        await loadMaterialXFileAsUsd(resolvedRoot, rootFile.fullPath);
      }
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
      await loadFile(resolvedRoot, true, rootFile.fullPath);
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
      console.log(item.kind, item);
      if (item.kind === 'file')
      {
        var file = item.getAsFile();
        testAndLoadFile(file).catch(error => console.error("Failed to load dropped USD file", error));
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
                testAndLoadFile(file).catch(error => console.error("Failed to load dropped USD file", error));
              });
            }
          }
        });
      }
    }
  } else {
    for (var i = 0; i < ev.dataTransfer.files.length; i++) {
      let file = ev.dataTransfer.files[i];
      testAndLoadFile(file).catch(error => console.error("Failed to load dropped USD file", error));
    }
  }
}

function dragOverHandler(ev) {
  ev.preventDefault();
}
});
};
