import {getUsdModule} from './usd/bindings/index.js';

const listeners = new Set();
let downloadProgress;
let assetProgress;

export const startupPackageAbort = new AbortController();
const params = new URL(location.href).searchParams;
const viewer = params.get('viewer');
const file = params.get('file') || '';
const packageUrl = file.split('?')[0];
let packageBytes;
if (viewer !== 'needle' && viewer !== 'needle-loader' && /\.usdz(?:[?#]|$)/i.test(file)) {
  packageBytes = fetch(packageUrl, {signal: startupPackageAbort.signal}).then(response => {
    if (!response.ok) throw new Error(`Failed to fetch USD file ${packageUrl}: ${response.status} ${response.statusText}`);
    return response.arrayBuffer();
  });
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

// Start the runtime independently of the renderer, examples and workbench.
// Progress is replayed when the app's loading controls become available.
export const viewerUsdReady = getUsdModule({
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
  onAssetFetchProgress: progress => {
    assetProgress = progress;
    for (const listener of listeners) listener.asset(progress);
  },
});
// The app attaches its error handler after its dependency graph has loaded.
void viewerUsdReady.catch(() => {});

export function subscribeRuntimeProgress(download, asset) {
  const listener = {download, asset};
  listeners.add(listener);
  if (downloadProgress) download(...downloadProgress);
  if (assetProgress) asset(assetProgress);
  return () => listeners.delete(listener);
}
