const nvidiaViewer = 'https://nvidia-simready-central.hf.space/';

export function assetSourceLinks(source, base = globalThis.location?.href) {
  let url;
  try {url = new URL(source, base);} catch {return null;}
  if (!['https:', 'http:'].includes(url.protocol)) return null;
  const match = url.hostname === 'huggingface.co' && url.pathname.match(/^\/datasets\/([^/]+\/[^/]+)\/(?:resolve|blob)\/([^/]+)\/(.+)$/);
  if (!match) return {source: url.href};
  url.pathname = `/datasets/${match[1]}/blob/${match[2]}/${match[3]}`;
  url.search = ''; url.hash = '';
  const simready=match[1].endsWith('/simready-assets')||match[3].includes('/simready_usd/');
  return {source: url.href, huggingface: true, simreadyPath:simready?match[3]:null,...(simready?{simreadyRepository:match[1]}:{})};
}

/** A single-result filter opens the asset and survives NVIDIA catalog revisions. */
export function nvidiaAssetLink(path,{repository='nvidia/simready-assets'}={}) {
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const url = new URL(nvidiaViewer);
  url.searchParams.set('filter_url_regexp', `.*/datasets/${escape(repository)}/(resolve|blob)/[^/]+/${escape(path)}`);
  return url.href;
}
