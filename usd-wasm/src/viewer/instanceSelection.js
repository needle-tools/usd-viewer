import {pathContains} from './selection.js';

/** Frame-aware derived masks. USD identities remain owned by the selection model. */
export function createInstanceMaskCache(onChange = () => {}) {
  const sources = new WeakMap();
  let disposed = false;
  return {
    get(source, items, handle, channel = 'selection') {
      if (disposed || !items.length) return new Set();
      const path = source.userData.usdPath;
      if (!source.isInstancedMesh) return items.some(item => !item.instances?.length && pathContains(item.path, path)) ? null : new Set();
      let channels = sources.get(source);
      if (!channels) {channels = {}; sources.set(source, channels);}
      let cache = channels[channel];
      if (!cache || cache.handle !== handle) cache = channels[channel] = {handle, key: '', result: new Set(), pending: false};
      const time = handle?.renderedTime ?? handle?.getTime?.();
      const key = JSON.stringify([items, source.count, handle?.revision]);
      if (cache.key !== key) {cache.key = key; cache.result = new Set(); cache.ready = false;}
      if (!cache.pending && (!cache.ready || cache.time !== time)) {
        cache.pending = true; const requested = cache.key;
        Promise.resolve(handle?.resolveSelection?.(path, source.count, items)).then(indices => {
          if (disposed || cache.key !== requested || !indices) return;
          const result = new Set(indices);
          const changed = result.size !== cache.result.size || [...result].some(index => !cache.result.has(index));
          cache.result = result; cache.ready = true; cache.time = handle?.renderedTime ?? handle?.getTime?.();
          if (changed) onChange();
        }).catch(() => {}).finally(() => {cache.pending = false;});
      }
      return cache.result;
    },
    dispose() {disposed = true;},
  };
}
