/** Own one controls update per frame and stop spherical/cartesian round-trip drift at rest. */
export function createOrbitControlUpdater(controls) {
  const camera = controls.object;
  let gesture = false, running = true, updating = false, previous;
  const pose = () => [
    ...camera.position.toArray(), ...camera.quaternion.toArray(), camera.zoom,
    ...controls.target.toArray(), ...camera.up.toArray(), controls.enabled,
    controls.enableDamping, controls.dampingFactor, controls.autoRotate, controls.autoRotateSpeed,
  ];
  const equal = (a, b) => a?.length === b.length && a.every((value, index) => value === b[index]);
  const start = () => { gesture = true; };
  const end = () => { gesture = false; };
  const change = () => { if (!updating) running = true; };
  // Our OrbitControls defers pointer deltas to update(dt), so a change event
  // alone cannot wake a resting camera. Use input events without reading private deltas.
  const wake = event => {
    if (event.type === 'wheel' || gesture && event.buttons ||
      event.type === 'keydown' && Object.values(controls.keys || {}).includes(event.code)) running = true;
  };
  const surface = controls.domElement, document = surface?.ownerDocument;
  document?.addEventListener('pointermove', wake);
  document?.addEventListener('keydown', wake);
  surface?.addEventListener('wheel', wake, { passive: true });
  controls.addEventListener('start', start);
  controls.addEventListener('end', end);
  controls.addEventListener('change', change);
  return {
    update(dt) {
      if (!controls.enabled) return;
      if (!equal(previous, pose())) running = true;
      if (!running && !controls.autoRotate) return;
      const position = camera.position.clone(), rotation = camera.quaternion.clone();
      const target = controls.target.clone(), zoom = camera.zoom;
      updating = true;
      try {
        controls.update(dt);
        const scale = Math.max(1e-8, camera.position.distanceTo(controls.target));
        const small = position.distanceTo(camera.position) < scale * 1e-4 &&
          target.distanceTo(controls.target) < scale * 1e-4 && Math.abs(Math.log(camera.zoom / zoom)) < 1e-4 &&
          8 * (1 - Math.min(1, Math.abs(rotation.dot(camera.quaternion)))) < 1e-8;
        if (!gesture && !controls.autoRotate && small) {
          // Flush the remaining inertia through the public API, then leave the pose untouched.
          const damping = controls.enableDamping;
          controls.enableDamping = false;
          try { controls.update(0); } finally { controls.enableDamping = damping; }
          running = false;
        }
        previous = pose();
      } finally { updating = false; }
    },
    dispose() {
      document?.removeEventListener('pointermove', wake);
      document?.removeEventListener('keydown', wake);
      surface?.removeEventListener('wheel', wake);
      controls.removeEventListener('start', start);
      controls.removeEventListener('end', end);
      controls.removeEventListener('change', change);
    },
  };
}
