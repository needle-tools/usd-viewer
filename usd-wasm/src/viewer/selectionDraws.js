import {BufferGeometry, BufferAttribute} from 'three';
import {pathContains} from './selection.js';

const pickSubsets = new WeakMap();
/** Resolve a rendered triangle to an authored face subset in the composed mesh. */
export async function resolveSubsetPick(handle, pick, geometry, triangle) {
  const params=geometry.userData.usdCoarseFaceParams,face=params?.[triangle] >> 2;
  if (!params || triangle<0 || triangle>=params.length) return pick;
  const key=JSON.stringify([pick.path,handle.revision,handle.renderedTime]);
  let cached=pickSubsets.get(geometry);
  if(!cached || cached.handle!==handle || cached.key!==key){
    cached={handle,key,promise:handle.readStage(async stage=>{
      const parent=stage.GetPrimAtPath(pick.path),subsets=[];let children;
      try{
        if(!parent.IsValid())return subsets;
        children=parent.GetChildren();
        for(let i=0;i<children.size();i++){
          const prim=children.get(i);
          try{if(prim.GetTypeName()!=='GeomSubset')continue;
            const type=prim.GetAttribute('elementType'),indices=prim.GetAttribute('indices');
            try{if(await type.Get(handle.renderedTime??handle.getTime())==='face')subsets.push({path:prim.GetPath(),indices:Int32Array.from(await indices.Get(handle.renderedTime??handle.getTime())).sort()});}
            finally{type.delete?.();indices.delete?.();}
          }finally{prim.delete?.();}
        }
        return subsets;
      }finally{children?.delete?.();parent.delete?.();}
    })};pickSubsets.set(geometry,cached);
  }
  for(const subset of await cached.promise){
    let low=0,high=subset.indices.length;
    while(low<high){const mid=(low+high)>>>1;if(subset.indices[mid]<face)low=mid+1;else high=mid;}
    if(subset.indices[low]===face)return {...pick,path:subset.path};
  }
  return pick;
}

/** Per-selection draw geometry, sharing animated vertex buffers with the source.
 * Face identity is supplied by Hydra, never guessed from material groups.
 */
export function createSelectionDrawCache(onChange = () => {}) {
  let records = new Map(), disposed = false;
  const queries = {};
  const release = record => { for (const part of record.parts) if (part.geometry !== record.geometry) part.geometry.dispose(); };
  async function readSubsets(items, handle) {
    const subsets = new Map();
    if (handle.readStage) await handle.readStage(async stage => {
      for (const item of items) {
        const prim = stage.GetPrimAtPath(item.path);
        try {
          if (!prim.IsValid() || prim.GetTypeName() !== 'GeomSubset') continue;
          const type = prim.GetAttribute('elementType'), indices = prim.GetAttribute('indices');
          try {
            if (await type.Get(handle.renderedTime ?? handle.getTime()) === 'face') subsets.set(item, Int32Array.from(await indices.Get(handle.renderedTime ?? handle.getTime())));
          } finally { type.delete?.(); indices.delete?.(); }
        } finally { prim.delete?.(); }
      }
    });
    return subsets;
  }
  async function build(source, items, handle, channel) {
    const queryKey = JSON.stringify([items,handle.revision,handle.renderedTime]);
    if (queries[channel]?.handle !== handle || queries[channel]?.key !== queryKey) queries[channel] = {handle,key:queryKey,promise:readSubsets(items,handle)};
    const subsets = await queries[channel].promise;
    const parts = [], path = source.userData.usdPath, geometry = source.geometry;
    for (const item of items) {
      const faces = subsets.get(item), target = faces ? {...item,path:item.path.slice(0,item.path.lastIndexOf('/'))} : item;
      const instances = source.isInstancedMesh ? await handle.resolveSelection?.(path, source.count, [target])
        : !target.instances?.length && pathContains(target.path,path) ? [0] : [];
      if (!instances?.length) continue;
      let selectedGeometry = geometry;
      if (faces) {
        const params = geometry.userData.usdCoarseFaceParams;
        if (!params) continue;
        let maxFace=0;for(const param of params)maxFace=Math.max(maxFace,param>>2);
        const mask=new Uint8Array(maxFace+1);for(const face of faces)if(face>=0&&face<=maxFace)mask[face]=1;
        let count=0;for(const param of params)count+=mask[param>>2];if(!count)continue;
        if (count !== params.length) {
          const indices=new Uint32Array(count*3),original=geometry.index;let at=0;
          for(let triangle=0;triangle<params.length;triangle++)if(mask[params[triangle]>>2])for(let corner=0;corner<3;corner++){const offset=triangle*3+corner;indices[at++]=original?original.getX(offset):offset;}
          selectedGeometry = new BufferGeometry(); selectedGeometry.attributes = {...geometry.attributes};
          selectedGeometry.morphAttributes = geometry.morphAttributes; selectedGeometry.morphTargetsRelative = geometry.morphTargetsRelative;
          selectedGeometry.setIndex(new BufferAttribute(indices, 1));
        }
      }
      parts.push({geometry:selectedGeometry,instances:new Set(instances)});
    }
    return parts;
  }
  return {
    get(source, items, handle, channel = 'selection') {
      if (disposed || !items.length) return [];
      let channels = records.get(source); if (!channels) records.set(source,channels = {});
      const geometry = source.geometry, params = geometry.userData.usdCoarseFaceParams;
      const key = JSON.stringify([items,source.count,handle?.revision,geometry.index?.version]);
      let record = channels[channel];
      if (!record || record.key !== key || record.handle !== handle || record.geometry !== geometry || record.params !== params || record.index !== geometry.index) {
        if (record) { record.stale = true; release(record); }
        record = channels[channel] = {key,handle,geometry,params,index:geometry.index,parts:[]};
      }
      if (!record.pending && (!record.ready || record.time !== handle.renderedTime)) {
        record.pending = true;
        const time = handle.renderedTime;
        void build(source,items,handle,channel).then(parts => {
          if (disposed || record.stale) { release({...record,parts}); return; }
          release(record); record.parts = parts; record.time = time; record.ready = true; onChange();
        }).catch(error => { if (!disposed) console.warn('USD selection geometry failed',error); }).finally(()=>{record.pending=false;});
      }
      for (const part of record.parts) if (part.geometry !== geometry) { part.geometry.attributes = {...geometry.attributes}; part.geometry.morphAttributes = geometry.morphAttributes; }
      return record.parts;
    },
    reset() { for (const channels of records.values()) for (const record of Object.values(channels)) {record.stale=true;release(record);} records.clear(); for (const key of Object.keys(queries)) delete queries[key]; },
    dispose() { disposed = true; this.reset(); },
  };
}
