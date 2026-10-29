import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { createUsdPhysics, readUsdPhysics } from '/usd/physics/createPhysics.js';

const runtimePromises = new Map();
function loadRapier(context, options) {
  const key = options.loadRapier || options.moduleUrl || (context ? 'needle' : 'standalone');
  if (!runtimePromises.has(key)) {
    const promise = (async () => {
      const module = options.loadRapier ? await options.loadRapier()
        : options.moduleUrl ? await import(options.moduleUrl)
        : context ? await (await import('@needle-tools/engine')).NEEDLE_ENGINE_MODULES.RAPIER_PHYSICS.load()
        : await import('/rapier/rapier.mjs');
      const rapier = module.default || module;
      await rapier.init();
      return rapier;
    })().catch(error => { runtimePromises.delete(key); throw error; });
    runtimePromises.set(key, promise);
  }
  return runtimePromises.get(key);
}

export async function setupViewerPhysics(handle, context, fallbackCamera, fallbackControls, isCurrent = () => true, configuration = {}) {
  const container = document.getElementById('usd-physics-controls');
  if (configuration === false || new URLSearchParams(location.search).get('physics') === 'off') {
    container.replaceChildren(); container.hidden = true;
    return null;
  }
  const options = configuration || {};
  if (!handle.driver.GetPhysicsSceneJson) return null;
  const snapshot = await readUsdPhysics(handle);
  if (!isCurrent()) return null;
  const owner = Symbol('USD physics controls');
  container.physicsOwner = owner;
  container.replaceChildren(); container.hidden = true;
  if (!snapshot.bodies?.some(body => body.rigidBodyEnabled && !body.kinematicBody)) return null;
  let simulation, disposed = false, dragging = false, previousControls = [], operation = 0;
  const activeCamera = () => window.usdRenderCamera || context?.mainCamera || fallbackCamera;
  const canvas = context?.renderer?.domElement || fallbackControls.domElement;
  const raycaster = new Raycaster(), pointer = new Vector2(), plane = new Plane(), hit = new Vector3();
  const play = document.createElement('button'); play.type = 'button'; play.textContent = 'Simulate';
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Reset'; reset.disabled = true;
  const sceneSelect = document.createElement('select'); sceneSelect.setAttribute('aria-label', 'Physics scene');
  for (const scene of snapshot.scenes || []) {
    const option = document.createElement('option'); option.value = scene.path; option.textContent = scene.path.split('/').pop();
    sceneSelect.append(option);
  }
  if (sceneSelect.options.length > 1) container.append(sceneSelect);
  container.append(play, reset); container.hidden = false;
  const controls = context ? (() => {
    const result = [];
    context.scene.traverse(object => {
      for (const component of object.userData.components || []) if (component.controls?.object?.isCamera) result.push(component.controls);
    });
    return result;
  })() : [fallbackControls];
  function release() {
    if (!dragging) return;
    dragging = false; simulation?.endDrag();
    for (const [control, enabled] of previousControls) control.enabled = enabled;
    previousControls = [];
  }
  function stop() {
    operation++;
    release(); simulation?.dispose(); simulation = null;
    play.textContent = 'Simulate'; reset.disabled = true;
  }
  play.addEventListener('click', async () => {
    play.disabled = true;
    const currentOperation = operation;
    try {
      if (!simulation) {
        const settings = { handle, snapshot, scenePath: sceneSelect.value || undefined };
        let created;
        if (options.createSimulation) created = await options.createSimulation(settings);
        else {
          const rapier = await loadRapier(context, options);
          if (disposed || currentOperation !== operation) return;
          created = await createUsdPhysics({ ...settings, rapier });
        }
        if (disposed || currentOperation !== operation) { created.dispose(); return; }
        simulation = created;
        if (simulation.unsupported?.length) console.warn('Unsupported USD physics:', simulation.unsupported);
      }
      if (simulation.isPlaying()) { release(); simulation.pause(); }
      else simulation.play();
      play.textContent = simulation.isPlaying() ? 'Pause' : 'Simulate'; reset.disabled = false;
    } catch (error) { console.error('USD physics failed:', error); }
    finally { play.disabled = false; }
  });
  reset.addEventListener('click', stop);
  sceneSelect.addEventListener('change', stop);
  function ray(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2);
    const camera = activeCamera();
    camera.updateWorldMatrix(true, false); raycaster.setFromCamera(pointer, camera);
    return camera;
  }
  function down(event) {
    if (!simulation?.isPlaying() || event.button !== 0 || dragging) return;
    const camera = ray(event); handle.scene.updateWorldMatrix(true, true);
    const intersections = raycaster.intersectObject(handle.scene, true);
    for (const intersection of intersections) {
      const body = simulation.bodyForObject(intersection.object);
      if (!body) continue;
      const point = handle.scene.worldToLocal(intersection.point.clone());
      if (!simulation.beginDrag(body.data.path, point)) return;
      plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), intersection.point);
      dragging = true; previousControls = controls.map(control => [control, control.enabled]);
      for (const control of controls) control.enabled = false;
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
  }
  function move(event) {
    if (!dragging) return;
    ray(event);
    if (raycaster.ray.intersectPlane(plane, hit)) simulation.moveDrag(handle.scene.worldToLocal(hit.clone()));
    event.preventDefault(); event.stopImmediatePropagation();
  }
  function up(event) {
    if (!dragging) return;
    release();
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    event.preventDefault(); event.stopImmediatePropagation();
  }
  canvas.addEventListener('pointerdown', down, true);
  canvas.addEventListener('pointermove', move, true);
  canvas.addEventListener('pointerup', up, true);
  canvas.addEventListener('pointercancel', up, true);
  return {
    update(dt) { simulation?.update(dt); },
    get simulation() { return simulation; },
    dispose() {
      disposed = true; stop();
      canvas.removeEventListener('pointerdown', down, true); canvas.removeEventListener('pointermove', move, true);
      canvas.removeEventListener('pointerup', up, true); canvas.removeEventListener('pointercancel', up, true);
      if (container.physicsOwner === owner) { container.replaceChildren(); container.hidden = true; }
    },
  };
}
