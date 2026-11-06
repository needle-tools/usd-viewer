import {loadSimreadyResources,warmSimreadyComposition,simreadyLocation} from './viewer-simready.js';
import {getUsdModule} from './usd/bindings/index.js';
import {fetchAsset} from './usd/assetFetch.js';

const listeners = new Set();
let downloadProgress;
const assetProgress = new Map();

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
  if(progress?.url)assetProgress.set(progress.url,progress);
  for(const listener of listeners)listener.asset(progress);
}
export const startupSimreadyReady = simreadyLocation(file)
  ? Promise.resolve(window.__usdViewerAssetCacheReady).then(async()=>{
      if(!navigator.serviceWorker?.controller || params.get('assetCache')==='0')return;
      const resources=await loadSimreadyResources(file);
      await warmSimreadyComposition(resources,reportAssetProgress,startupPackageAbort.signal);
    }).catch(()=>{})
  : Promise.resolve();

// Start the runtime independently of the renderer, examples and workbench.
// Progress is replayed when the app's loading controls become available.
const runtimeOptions = {
  asyncRuntime: 'auto',
  printErr: (...args) => {
    const text = args.join(' ');
    if (/^Warning(?:\b|:| \()/.test(text)) console.warn(...args);
    else console.error(...args);
  },
  onDownloadProgress: (downloaded, total) => {
    downloadProgress = [downloaded, total];
    for (const listener of listeners) listener.download(...downloadProgress);
  },
  onAssetFetchProgress: reportAssetProgress,
};
// Dedicated workers inherit their owner's controller at creation. For remote
// SimReady composition, establish it before starting the native worker pool.
export const viewerUsdReady = simreadyLocation(file) && window.__usdViewerAssetCacheMode
  ? Promise.resolve(window.__usdViewerAssetCacheReady).then(()=>getUsdModule(runtimeOptions))
  : getUsdModule(runtimeOptions);
// The app attaches its error handler after its dependency graph has loaded.
void viewerUsdReady.catch(() => {});

export function subscribeRuntimeProgress(download, asset) {
  const listener = {download, asset};
  listeners.add(listener);
  if (downloadProgress) download(...downloadProgress);
  for(const progress of assetProgress.values())asset(progress);
  return () => listeners.delete(listener);
}
