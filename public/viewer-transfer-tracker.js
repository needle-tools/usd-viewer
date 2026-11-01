export const formatBytes = value => value < 1000 ? `${Math.round(value)} B`
  : value < 1e6 ? `${(value / 1000).toFixed(value < 1e4 ? 1 : 0)} kB`
  : value < 1e9 ? `${(value / 1e6).toFixed(1)} MB` : `${(value / 1e9).toFixed(2)} GB`;
export function formatEta(seconds) {
  if (seconds == null) return '';
  if (seconds < 1) return '<1 s left';
  if (seconds < 60) return `~${Math.ceil(seconds)} s left`;
  const rounded = Math.ceil(seconds), minutes = Math.floor(rounded / 60), rest = rounded % 60;
  return `~${minutes} min${rest ? ` ${rest} s` : ''} left`;
}
const percent = ratio => `${Math.min(100, Math.floor(ratio * 100))}%`;
export function downloadAmount(item) {
  return item.total == null ? `${formatBytes(item.loaded)} · size unknown`
    : `${formatBytes(item.loaded)} / ${formatBytes(item.total)} · ${percent(item.ratio)}`;
}

/** Tracks discovered files, not a guessed total for the whole USD composition. */
export function createTransferTracker(now = () => performance.now()) {
  const files = new Map();
  let received = 0, samples = [];
  function sample(history, loaded, time) {
    if (history.length > 1 && time - history.at(-1).time < 100) Object.assign(history.at(-1),{time,loaded});
    else history.push({time,loaded});
  }
  function speed(history, loaded, time) {
    while (history.length > 1 && history[1].time <= time - 4000) history.shift();
    const first = history[0], duration = first ? time - first.time : 0;
    return duration >= 600 ? Math.max(0, loaded - first.loaded) / (duration / 1000) : 0;
  }
  return {
    update(event) {
      if (!event?.url) return false;
      const time = now(), previous = files.get(event.url);
      // Warmup and the resolver can report the same immutable file. Keep a
      // completed file complete instead of flashing it back to zero.
      if (previous?.state === 'done') return false;
      const restart = event.state === 'start' && previous?.state === 'error';
      const file = !previous || restart ? {url:event.url,loaded:0,total:0,samples:[{time,loaded:0}]} : previous;
      const loaded = Math.max(file.loaded, Number(event.loaded) || 0);
      if (!samples.length) samples.push({time,loaded:received});
      received += loaded - file.loaded;
      file.loaded = loaded;
      file.state = event.state;
      file.error = event.error;
      if (Number(event.total) > 0) file.total = Number(event.total);
      if (file.loaded > file.total && file.total > 0) file.invalidTotal = true;
      if (event.state === 'done') {file.total = loaded;file.invalidTotal = false;}
      sample(file.samples,loaded,time);sample(samples,received,time);
      // Many chunks can arrive within one frame; samples only need millisecond
      // precision and a bounded recent window for speed estimates.
      speed(file.samples,loaded,time);speed(samples,received,time);
      files.set(event.url,file);
      return true;
    },
    snapshot() {
      const time = now();
      const entries = [...files.values()].map(file => {
        const total = file.state === 'done' || file.total > 0 && !file.invalidTotal ? file.total : null;
        const rate = speed(file.samples,file.loaded,time);
        return {url:file.url,state:file.state,error:file.error,loaded:file.loaded,total,rate,
          ratio:total == null ? null : total ? file.loaded / total : 1,
          eta:total != null && rate > 0 ? Math.max(0,total-file.loaded)/rate : null};
      });
      const active = entries.filter(file => !['done','error'].includes(file.state));
      const unknown = entries.filter(file => file.total == null).length;
      const loaded = entries.reduce((sum,file) => sum+file.loaded,0);
      const total = unknown ? null : entries.reduce((sum,file) => sum+file.total,0);
      const rate = speed(samples,received,time);
      return {files:entries,active:active.length,completed:entries.filter(file=>file.state==='done').length,
        failed:entries.filter(file=>file.state==='error').length,unknown,loaded,total,rate,
        ratio:total == null ? null : total ? loaded/total : 1,
        eta:total != null && rate > 0 && !entries.some(file=>file.state==='error') ? Math.max(0,total-loaded)/rate : null};
    },
    reset() {files.clear();received=0;samples=[];},
  };
}
