import {loadSimreadyResources,warmSimreadyComposition,simreadyLocation} from './viewer-simready.js';
import {getUsdModule} from './usd/bindings/index.js';
import {fetchAsset} from './usd/assetFetch.js';
import {createViewerMemory} from './viewer-memory.js';
import {createDownloadProgress} from './viewer-download-progress.js';

export const assetDownloads = createDownloadProgress({
  getHost: () => window.usdWorkbench?.viewport,
  onUpdate(snapshot,runtime) {
    if (runtime) return;
    window.updateLoadingOverlayProgress?.(snapshot.active ? {text:`Downloading ${snapshot.active} ${snapshot.active===1?'file':'files'}${snapshot.ratio==null?'':` ${Math.floor(snapshot.ratio*100)}%`}`} : null);
    window.usdStagePanel?.refreshInfoFiles?.();
  },
});
assetDownloads.setRuntime({});

export const startupPackageAbort = new AbortController();
const params = new URL(location.href).searchParams;
const viewer = params.get('viewer');
const file = params.get('file') || '';
const packageUrl = file.split('?')[0];
let packageBytes;
if (viewer !== 'needle' && viewer !== 'needle-loader' && /\.usdz(?:[?#]|$)/i.test(file)) {
  packageBytes = fetchAsset(packageUrl, reportAssetProgress, {signal: startupPackageAbort.signal}).then(bytes=>bytes.buffer);
  void packageBytes.catch(() => {});
}
startupPackageAbort.signal.addEventListener('abort', () => { packageBytes = undefined; }, {once: true});

// One consumer owns the response bytes, including catalog roots with siblings.
export function takeStartupPackage(url) {
  if (new URL(url, location.href).href !== new URL(packageUrl, location.href).href) return;
  const bytes = packageBytes;
  packageBytes = undefined;
  return bytes;
}

function reportAssetProgress(progress) {
  assetDownloads.update(progress);
}
export const startupSimreadyReady = simreadyLocation(file)
  ? Promise.resolve(window.__usdViewerAssetCacheReady).then(async()=>{
      if(!navigator.serviceWorker?.controller || params.get('assetCache')==='0')return;
      const resources=await loadSimreadyResources(file);
      await warmSimreadyComposition(resources,reportAssetProgress,startupPackageAbort.signal);
    }).catch(()=>{})
  : Promise.resolve();

// Start the runtime independently of the renderer, examples and workbench.
const runtimeOptions = {
  printErr: (...args) => {
    const text = args.join(' ');
    if (/^Warning(?:\b|:| \()/.test(text)) console.warn(...args);
    else console.error(...args);
  },
  onDownloadProgress: (downloaded, total) => {
    assetDownloads.setRuntime({loaded:downloaded,total});
  },
  onAssetFetchProgress: reportAssetProgress,
};
const viewerMemory=createViewerMemory();
if(viewerMemory)runtimeOptions.wasmMemory=viewerMemory;
// Dedicated workers inherit their owner's controller at creation. For remote
// SimReady composition, establish it before starting the native worker pool.
export const viewerUsdReady = simreadyLocation(file) && window.__usdViewerAssetCacheMode
  ? Promise.resolve(window.__usdViewerAssetCacheReady).then(()=>getUsdModule(runtimeOptions))
  : getUsdModule(runtimeOptions);
// Keep the shared panel on initialization until the module can open a stage.
viewerUsdReady.then(() => assetDownloads.setRuntime(null), () => assetDownloads.setRuntime(null));
