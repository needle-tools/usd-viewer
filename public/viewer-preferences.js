const STORAGE = 'needle-usd-render-settings';
const modes = ['basic', 'beauty', 'pathtraced', 'pathtraced-gk'];

export function readRenderSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {}
  return {};
}
export function saveRenderSettings(patch) {
  try { localStorage.setItem(STORAGE, JSON.stringify({...readRenderSettings(), ...patch})); } catch {}
}
export function preferredRenderMode(params) {
  return [params.get('render'), readRenderSettings().mode].find(value => modes.includes(value)) || 'beauty';
}
function detailLevel(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const level = String(value).trim().toLowerCase();
  if (['low', 'medium', 'high', 'very-high'].includes(level)) return level;
  if (['veryhigh', 'very_high'].includes(level)) return 'very-high';
  if (level && Number.isFinite(Number(level))) return level;
}
export function preferredDetail(params) {
  // Leave fixture-specific defaults available until a user or URL overrides them.
  return detailLevel(params.get('complexity')) ?? detailLevel(readRenderSettings().detail);
}
