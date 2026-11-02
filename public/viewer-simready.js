const labels={bodyPart:'Body parts',engineComponent:'Engine components',interiorPart:'Interior parts',airSystem:'Air systems',food:'Food',kitchenware:'Kitchenware',furniture:'Furniture',IV:'Medical equipment',CT:'Medical equipment',Xray:'Medical equipment'};
const words=value=>String(value).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/^\w/,letter=>letter.toUpperCase());

export function simreadyCategory(packageName) {
  const prefix=packageName.split('/').at(-1).split('_')[0];
  return labels[prefix] || words(prefix);
}

/** The catalog is app data; USD loading and relative dependencies use the SDK. */
export function createSimreadyLibrary({fetchCatalog=()=>fetch('/data/nvidia-simready.json')}={}) {
  let pending;
  async function load() {
    pending ||= (async()=>{
      const response=await fetchCatalog();
      if (!response.ok) throw new Error(`SimReady catalog: HTTP ${response.status}`);
      const manifest=await response.json();
      if (manifest.version!==1 || !/^[-\w.]+\/[-\w.]+$/.test(manifest.repository) || !/^[a-f0-9]{40}$/.test(manifest.revision) || !manifest.assets?.length) throw new Error('Invalid SimReady catalog');
      const base=`https://huggingface.co/datasets/${manifest.repository}`;
      const encodePath=value=>value.split('/').map(encodeURIComponent).join('/');
      const resolve=value=>`${base}/resolve/${manifest.revision}/${encodePath(value)}`;
      const cards=manifest.assets.map(asset=>{
        const category=simreadyCategory(asset.package);
        return {
          id:asset.root,name:words(asset.package.split('/').at(-1)),category,
          meta:`${category} · ${manifest.repository.split('/')[0]}${manifest.license?' · '+manifest.license:''}`,
          search:`${asset.package} ${asset.root}`,
          url:resolve(asset.root),thumbnail:resolve(asset.thumbnail),
          thumbnailLight:asset.lightThumbnail?resolve(asset.lightThumbnail):undefined,
          source:`${base}/blob/${manifest.revision}/${encodePath(asset.root)}`,
        };
      });
      const counts=new Map();for(const card of cards)counts.set(card.category,(counts.get(card.category)||0)+1);
      return {...manifest,cards,categories:[...counts].sort(([a],[b])=>a.localeCompare(b)).map(([name,count])=>({name,count}))};
    })().catch(error=>{pending=undefined;throw error;});
    return pending;
  }
  return {load,async cards(category) {const catalog=await load();return category?catalog.cards.filter(card=>card.category===category):catalog.cards;}};
}

const resourceLoads=new Map();
export function simreadyLocation(url) {
  try {
    const value=new URL(url),match=value.pathname.match(/^\/datasets\/nvidia\/simready-assets\/resolve\/([a-f0-9]{40})\/([^/]+)\/simready_usd\/[^/]+\.usd[acz]?$/);
    return value.hostname==='huggingface.co' && match ? {revision:match[1],asset:match[2],root:value.href,base:new URL('.',value).href} : null;
  } catch {return null;}
}
export async function loadSimreadyResources(url) {
  const location=simreadyLocation(url);if(!location)return null;
  const shard=[...location.asset].reduce((hash,char)=>((hash*31)+char.charCodeAt(0))>>>0,0)%16;
  let pending=resourceLoads.get(shard);
  if(!pending){pending=fetch(`/data/simready-resources/${shard}.json?revision=${location.revision}&format=1`).then(async response=>{if(!response.ok)throw new Error('SimReady resources unavailable');return response.json();}).catch(error=>{resourceLoads.delete(shard);throw error;});resourceLoads.set(shard,pending);}
  const data=await pending;if(data.revision!==location.revision)return null;
  const resources=data.assets[location.asset];if(!resources)return null;
  const textures=new Set(resources.textures.map(path=>new URL(path,location.base).href));
  return {...resources,location,resolveTextureUrl(url) {
    if(!textures.has(url))return url;
    const path=new URL(url),file=path.pathname.split('/').pop();
    path.pathname=path.pathname.slice(0,path.pathname.lastIndexOf('/')+1)+`.thumbs/512x512/${file}.png`;
    return path.href;
  }};
}

/** Warm small composition layers in the HTTP cache while OpenUSD starts. */
export async function warmSimreadyComposition(resources, onProgress, signal) {
  if(!resources || !resources.layers.length && !resources.geometry && !resources.instances)return;
  const {fetchAsset}=await import('./usd/assetFetch.js');
  const queue=[resources.location.root,...(resources.geometry?[resources.geometry]:[]),...(resources.instances?[resources.instances]:[]),...resources.layers];
  await Promise.all(Array.from({length:Math.min(6,queue.length)},async()=>{
    while(queue.length && !signal?.aborted){
      const path=queue.shift();
      // Warming is speculative. A failed layer is still reported by OpenUSD
      // when it becomes part of the selected composition.
      try {await fetchAsset(new URL(path,resources.location.base).href,onProgress,{signal,cache:'force-cache'});}
      catch { }
    }
  }));
}
