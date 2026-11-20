import {getSimreadyRuntime, fromGltfPhysicsSnapshot} from '@needle-tools/simready/gltf';
import {bindVisuals, withVisualController} from '@needle-tools/simready/three';

/** Connect decoded glTF runtime data to the viewer's physics controls. */
export function createGltfPhysicsSource(asset) {
  const runtime = getSimreadyRuntime(asset);
  if (!runtime) return null;
  const wire = runtime.snapshot, root = runtime.root;
  let snapshot;
  const handle = {
    scene: root,
    async ready() {},
    helpers: {joints: true},
    includedPurposes: ['default', 'render'],
    setHelpers(value) { Object.assign(this.helpers, value); },
  };
  const source = {
    inspect() {
      return {scenes: wire.scenes, bodies: wire.bodies.map(body => body.path),
        joints: wire.joints.map(joint => joint.path),
        dynamic: wire.joints.length > 0 || wire.bodies.some(body => body.rigidBodyEnabled !== false && !body.kinematicBody)};
    },
    async readSnapshot() { return snapshot ||= fromGltfPhysicsSnapshot(wire); },
    createMechanism(options) { return runtime.createMechanism(options); },
    async createSimulation({snapshot: configured, rapier, world, position, rotation, scenePath, allowPartial}) {
      return withVisualController(root, async () => {
        const options = {snapshot: configured, position, rotation, scenePath, allowPartial,
          bindVisuals(bodies, _warn, signal) {
            signal?.throwIfAborted();
            return bindVisuals({root, bodies, bindings: runtime.bindings, worldSpace: !!world});
          }};
        const simulation = world ? await world.addAsset(options)
          : await (await import('@needle-tools/simready/rapier')).createSimulation({...options, rapier});
        return Object.assign(simulation, {root});
      });
    },
  };
  return {handle, source, semantics: runtime.semantics};
}
