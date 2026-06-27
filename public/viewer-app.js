import {
  Vector3,
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
  getHydraHandleFromNeedleEngineAsset,
  RGBELoader,
  GLTFExporter,
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

// About dialog functionality - runs when module is loaded
onDomReady(function() {
  const aboutLink = document.getElementById('about-link');
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

function setViewerModeUrlParam(url) {
  url.searchParams.set("viewer", viewerMode);
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
  
if (filename) {
  /** @type {HTMLElement | null} */
  const el = document.querySelector("#container");
  if (el) el.classList.add("have-custom-file");
  // get filename from URL
  setFilenameText(filename);
}  

applyViewerModeUi();
  
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
const feedbackLink = document.getElementById('feedback-link');
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

if (feedbackLink) {
  feedbackLink.addEventListener('click', (evt) => {
    evt.preventDefault();
    openFeedbackDialog();
  });
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
      getFiles: () => needleLoaderFiles,
    });
  }
  if (!needleEngineElement) {
    needleEngineElement = document.createElement("needle-engine");
    needleEngineElement.className = "usd-viewer-needle-engine";
    needleEngineElement.setAttribute("camera-controls", "true");
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
      resolve(event.detail?.context || element.context);
    };
    const onError = event => {
      cleanup();
      reject(event.detail || new Error("Needle Engine failed to load " + source));
    };
    element.addEventListener("loadfinished", onLoadFinished, { once: true });
    element.addEventListener("error", onError, { once: true });
  });

  element.setAttribute("src", source);
  const context = await loadPromise;
  if (generation !== loadGeneration) return null;

  const handle = await waitForNeedleHydraHandle(context);
  if (!handle) throw new Error("Needle Engine loaded " + filename + " without creating a USD Hydra handle");

  await handle.ready?.();
  await handle.materialsReady?.();
  if (generation !== loadGeneration) {
    await handle.dispose?.();
    return null;
  }
  return { handle, context };
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
      });

      if (generation !== loadGeneration) {
        await handle.dispose();
        return;
      }

      await handle.ready();
      await handle.materialsReady?.();
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
  // converter controls both in the grid header and in the top toolbar.
  const ASSET_EXPLORER_API = 'https://asset-explorer.needle.tools/api/models.json';
  const USD_WG_MANIFEST_URL = './data/usd-wg-assets.json';
  const dropdownEl = document.querySelector('.dropdown');
  const dropdownMenu = document.querySelector('.dropdown-menu');
  const sampleGroupList = document.getElementById('sample-group-list');
  const usdWgGroupTree = document.getElementById('usd-wg-group-tree');
  const galleryTitle = document.getElementById('gallery-title');
  const gallerySubtitle = document.getElementById('gallery-subtitle');
  const galleryGrid = document.getElementById('gallery-grid');
  const galleryStatus = document.getElementById('gallery-status');
  const converterToggle = document.getElementById('converter-toggle');
  const converterSelectWrap = document.getElementById('converter-select-wrap');
  const converterSelect = document.getElementById('converter-select');

  let galleryFetchStarted = false; // guards against duplicate fetches
  let galleryFetchPromise = null;
  let galleryModels = null;
  let usdWgManifest = null;
  let usdWgManifestPromise = null;
  let usdWgTreeRendered = false;
  let selectedConverter = 'three'; // three | blender | omniverse
  let selectedSampleGroup = 'usd-wg';
  let loadedConversionCard = null;
  let loadedConverter = '';
  let lastPointerActivatedHref = '';
  let lastPointerActivatedAt = 0;
  const conversionCardByUrl = new Map();

  const sampleGroups = new Map([
    ['usd-wg', {
      title: 'USD Working Group Assets',
      subtitle: 'Production USD samples from usd-wg/assets',
      converterVariants: false,
      load: () => loadUsdWgCards(''),
    }],
    ['gltf', {
      title: 'glTF Sample Assets',
      subtitle: 'From the Needle Asset Explorer',
      converterVariants: true,
      load: loadAssetExplorerCards,
    }],
    ['test-models', {
      title: 'Test Models',
      subtitle: 'Curated scenes for viewer checks',
      converterVariants: false,
      cards: [
        {
          name: 'Kitchen Set',
          meta: 'Hosted on Needle Cloud',
          url: 'https://cloud-staging.needle.tools/-/assets/Z23hmXBZCdB4p-ZCdB4p/file.usdz',
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
    if (converterToggle) {
      for (const button of converterToggle.querySelectorAll('button[data-converter]')) {
        const active = button.dataset.converter === selectedConverter;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    }
  }

  function setSelectedConverter(converter) {
    selectedConverter = converter || 'three';
    syncConverterControls();
    applyConverter();
  }

  function setLoadedConverterControlVisible(visible) {
    if (converterSelectWrap) converterSelectWrap.hidden = !visible;
  }

  function syncLoadedConverterControl() {
    if (!converterSelect) return;
    for (const option of converterSelect.options) {
      option.disabled = !!loadedConversionCard && !loadedConversionCard.conversions?.[option.value];
    }
    if (loadedConverter) converterSelect.value = loadedConverter;
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
    loadedConverter = converter || '';
    setLoadedConverterControlVisible(!!loadedConversionCard);
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
    const url = loadedConversionCard?.conversions?.[converter];
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

  // Build a "N textures · M anims · K ext" line from Asset Explorer metadata.
  function assetExplorerMetaLine(model) {
    const info = model.info || {};
    const bits = [];
    if (info.textures) bits.push(info.textures + (info.textures === 1 ? ' texture' : ' textures'));
    if (info.animations) bits.push(info.animations + (info.animations === 1 ? ' anim' : ' anims'));
    if (Array.isArray(model.extensions) && model.extensions.length) bits.push(model.extensions.length + ' ext');
    return bits.join(' · ');
  }

  function assetExplorerModelToCard(model) {
    const usdz = (model.assets && model.assets.usdz) || {};
    const conversions = {};
    if (usdz.three) conversions.three = usdz.three;
    if (usdz.blender) conversions.blender = usdz.blender;
    if (usdz.omniverse) conversions.omniverse = usdz.omniverse;
    const url = conversions[selectedConverter] || conversions.three || conversions.blender || conversions.omniverse;
    if (!url) return null;
    return {
      name: model.name || model.slug || 'Model',
      meta: assetExplorerMetaLine(model),
      thumbnail: model.thumbnail,
      conversions,
      url,
    };
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
    for (const child of entry?.children || []) collectUsdWgCards(child, cards);
    return cards;
  }

  function createUsdWgTreeControl(entry, depth) {
    const hasChildren = !!entry.children?.length;
    const control = document.createElement(hasChildren ? 'summary' : 'button');
    control.className = 'sample-group-button sample-folder-button';
    control.dataset.sampleGroup = usdWgGroupId(entry.path);
    control.style.setProperty('--depth', String(depth));
    if (!hasChildren) control.type = 'button';

    const name = document.createElement('span');
    name.textContent = prettySampleLabel(entry.name);
    control.appendChild(name);

    const count = document.createElement('small');
    count.textContent = String(entry.totalChildren || entry.items?.length || 0);
    control.appendChild(count);
    return control;
  }

  function renderUsdWgTreeEntry(entry, depth = 1) {
    if (entry.children?.length) {
      const details = document.createElement('details');
      details.className = 'sample-folder';
      details.appendChild(createUsdWgTreeControl(entry, depth));
      const children = document.createElement('div');
      children.className = 'sample-folder-children';
      for (const child of entry.children) children.appendChild(renderUsdWgTreeEntry(child, depth + 1));
      details.appendChild(children);
      return details;
    }
    return createUsdWgTreeControl(entry, depth);
  }

  function renderUsdWgTree() {
    if (!usdWgGroupTree || usdWgTreeRendered || !usdWgManifest?.root) return;
    usdWgGroupTree.textContent = '';
    for (const child of usdWgManifest.root.children || []) {
      usdWgGroupTree.appendChild(renderUsdWgTreeEntry(child));
    }
    usdWgTreeRendered = true;
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

  async function loadAssetExplorerCards() {
    if (galleryModels) return galleryModels;
    if (galleryFetchPromise) return galleryFetchPromise;
    galleryFetchStarted = true;
    galleryFetchPromise = (async () => {
    setGalleryStatus('Loading sample models…');
    try {
      const res = await fetch(ASSET_EXPLORER_API);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const models = Array.isArray(data.models) ? data.models : [];
      galleryModels = models.map(assetExplorerModelToCard).filter(Boolean);
      for (const card of galleryModels) indexConversionCard(card);
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
      const url = card.dataset[selectedConverter] || card.dataset.three || card.dataset.blender || card.dataset.omniverse;
      if (url) card.setAttribute('href', sampleHref(url));
    }
  }

  function buildGalleryCards(cards) {
    if (!galleryGrid) return;
    galleryGrid.textContent = '';
    for (const item of cards) {
      const conversions = item.conversions || {};
      const url = conversions[selectedConverter] || item.url || conversions.three || conversions.blender || conversions.omniverse;
      if (!url) continue;

      // Cards are "a.file" so they reuse the delegated URL-load handler below.
      const card = document.createElement('a');
      card.className = 'file gallery-card';
      card.href = sampleHref(url);
      card.draggable = false;
      card.dataset.name = item.name || 'Model';
      if (conversions.three) card.dataset.three = conversions.three;
      if (conversions.blender) card.dataset.blender = conversions.blender;
      if (conversions.omniverse) card.dataset.omniverse = conversions.omniverse;

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
    group = group || sampleGroups.get('usd-wg');
    if (!group) return;
    selectedSampleGroup = groupId;
    if (galleryTitle) galleryTitle.textContent = group.title;
    if (gallerySubtitle) gallerySubtitle.textContent = group.subtitle;
    setConverterControlsVisible(!!group.converterVariants);
    if (sampleGroupList) {
      for (const button of sampleGroupList.querySelectorAll('[data-sample-group]')) {
        const active = button.dataset.sampleGroup === groupId;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
      }
    }

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
  if (converterSelect) {
    converterSelect.addEventListener('change', function() {
      const converter = converterSelect.value;
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
      selectSampleGroup(button.dataset.sampleGroup);
      track('gallery_select_group', { group: button.dataset.sampleGroup });
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
