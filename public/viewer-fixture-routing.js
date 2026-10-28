// A renderer change requires a fresh page because renderer and runtime imports
// are established at startup. Ordinary same-backend selections stay in-page.
export function fixtureNavigation(url, asset, currentMode, currentNodes) {
  const needsNodes = asset?.renderer === 'bounded-volume';
  const needsThree = needsNodes && currentMode !== 'three';
  if (!needsThree && needsNodes === currentNodes) return null;
  const target = new URL(url);
  if (needsNodes) {
    target.searchParams.set('viewer', 'three');
    target.searchParams.set('render', 'nodes');
  } else {
    target.searchParams.delete('render');
    target.searchParams.set('viewer', currentMode === 'three' ? 'three' : 'needle');
  }
  return target.href;
}
