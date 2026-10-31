import { hasAuthoredUsdLights } from './usd/scene/index.js';
export { hasAuthoredUsdLights };

/** Own only the viewer's fallback illumination; USD dome textures remain owned by Hydra. */
export function createViewerLighting({ scene, loadEnvironment, isCurrent = () => true }) {
  const defaults = new Map();
  let disposed = false;
  function restore() {
    for (const [light, visible] of defaults) light.visible = visible;
    defaults.clear();
  }
  return {
    async apply({ root, stage, suppressEnvironment = false, explicitEnvironment = false }) {
      if (disposed || !isCurrent()) return;
      const authored = hasAuthoredUsdLights(root, stage);
      const hostAllowed = !suppressEnvironment && (!authored || explicitEnvironment);
      const authoredObjects = new Set(); root?.traverse(object => authoredObjects.add(object));
      restore();
      if (authored) scene.traverse(object => {
        if (object.isLight && !authoredObjects.has(object)) { defaults.set(object, object.visible); object.visible = false; }
      });
      let dome = false;
      root?.traverse(object => { if (object.userData?.usdTypeName === 'DomeLight') dome = true; });
      if (dome) return;
      scene.environment = null;
      if (hostAllowed) {
        const texture = await loadEnvironment();
        if (!disposed && isCurrent()) scene.environment = texture;
      }
    },
    dispose() { disposed = true; restore(); },
  };
}
