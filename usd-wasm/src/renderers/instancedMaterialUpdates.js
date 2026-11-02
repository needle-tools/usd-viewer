const prepared = new WeakSet();

/** r185's material observer checks matrixWorld but misses instance-buffer edits.
 * Textureless groups can consequently retain old poses while textured groups
 * of the very same mesh move. Extend its public setupObserver hook, retaining
 * the normal idle/material checks rather than forcing uploads on every frame.
 */
export function prepareInstancedMaterialUpdates(material) {
  if (!material?.isNodeMaterial || prepared.has(material)) return;
  prepared.add(material);
  const setup = material.setupObserver;
  material.setupObserver = function(builder) {
    const observer = setup.call(this, builder), equals = observer.equals;
    const instances = new WeakMap();
    observer.equals = function(renderObject, ...args) {
      const attribute = renderObject.object.instanceMatrix;
      if (attribute) {
        const previous = instances.get(renderObject);
        instances.set(renderObject, {attribute, version: attribute.version});
        if (!previous || previous.attribute !== attribute || previous.version !== attribute.version) return false;
      }
      return equals.call(this, renderObject, ...args);
    };
    return observer;
  };
}
