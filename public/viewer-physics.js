import { Matrix4, Quaternion, Vector3 } from 'three';
import {bindPointerDrag} from '@needle-tools/simready/three';
import { readUsdPhysics, inspectUsdPhysics } from '/usd/physics/readPhysics.js';
import {holdAssemblyBases, withViewerDamping} from './viewer-physics-policy.mjs';
import {viewerIcon} from './usd/viewer/icons.js';
import {saveRenderSettings} from './viewer-preferences.js';

const runtimePromises = new Map();
const modeKey = 'usd-viewer-physics-mode';
let preferredMode;
try { preferredMode = sessionStorage.getItem(modeKey); } catch {}
function rememberMode(mode) {
  preferredMode = mode;
  try {
    if (mode) sessionStorage.setItem(modeKey,mode);
    else sessionStorage.removeItem(modeKey);
  } catch {}
}

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

function hostPlacement(root, snapshot) {
  root.updateWorldMatrix(true, false);
  const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
  root.matrixWorld.decompose(position, rotation, scale);
  const meters = snapshot.metersPerUnit > 0 ? snapshot.metersPerUnit : .01;
  const reconstructed = new Matrix4().compose(position, rotation, scale);
  if ([scale.x, scale.y, scale.z].some(value => Math.abs(value - meters) > meters * 1e-5)
      || root.matrixWorld.elements.some((value, index) => Math.abs(value - reconstructed.elements[index]) > 1e-5)) {
    throw new Error('Shared Engine simulation requires a USD root scaled to its authored metres per unit, without shear or mirrored scaling.');
  }
  const up = snapshot.upAxis === 'Z' ? new Vector3(0, 0, 1) : snapshot.upAxis === 'X' ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  rotation.multiply(new Quaternion().setFromUnitVectors(up, new Vector3(0, 1, 0)).invert());
  return {position: position.toArray(), rotation: rotation.toArray()};
}

export async function setupViewerPhysics(handle, context, fallbackCamera, fallbackControls, isCurrent = () => true, configuration = {}) {
  const container = document.getElementById('usd-physics-controls');
  if (configuration === false || new URLSearchParams(location.search).get('physics') === 'off') {
    container.replaceChildren(); container.hidden = true;
    return null;
  }
  const options = configuration || {};
  const source = options.source;
  if (!source && !handle.driver?.GetPhysicsSceneJson) return null;
  const overview = source ? await source.inspect() : await inspectUsdPhysics(handle);
  if (!isCurrent()) return null;
  const owner = Symbol('USD physics controls');
  container.physicsOwner = owner;
  container.replaceChildren(); container.hidden = true;
  if (!overview.dynamic) return null;
  const snapshots = new Map();
  let simulation, snapshot, jointHelpers, jointControls, colliderOverlay, disposed = false, previousControls = [], operation = 0, overlayOperation = 0, simulationMode = '', usesHostWorld = false;
  const activeCamera = () => window.usdRenderCamera || context?.mainCamera || fallbackCamera;
  const canvas = context?.renderer?.domElement || fallbackControls?.domElement;
  const rootScale = new Vector3();
  const play = document.createElement('button'); play.type = 'button'; play.textContent = 'Simulate';
  const interact = document.createElement('button');interact.type='button';interact.textContent='Interact';interact.setAttribute('aria-pressed','false');interact.title='Drag movable parts within their joint limits';
  const hasJoints=overview.joints.length>0;interact.disabled=!hasJoints;
  if(!hasJoints)interact.title='This scene has no articulated joints';
  const holdBases = document.createElement('input');
  holdBases.type = 'checkbox';
  holdBases.checked = options.holdAssemblyBases !== false;
  const holdLabel = document.createElement('label');
  holdLabel.append(holdBases, document.createTextNode('Hold assembly bases'));
  holdLabel.title = 'Keep isolated rigid assets and mechanism bases in place.';
  const status=document.createElement('span');status.setAttribute('role','status');
  const colliders = document.createElement('input'); colliders.type = 'checkbox';
  const colliderLabel = document.createElement('label');
  colliderLabel.append(colliders, document.createTextNode('Colliders'));
  colliderLabel.title = 'Show collision geometry; Simulate shows the solver shapes.';
  const joints = document.createElement('input'); joints.type = 'checkbox'; joints.checked = handle.helpers?.joints !== false;
  const jointLabel = document.createElement('label'); jointLabel.append(joints, document.createTextNode('Joints'));
  jointLabel.title = 'Show joint axes and limits.';
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Reset'; reset.disabled = true;
  const sceneSelect = document.createElement('select'); sceneSelect.setAttribute('aria-label', 'Physics scene');
  for (const scene of overview.scenes) {
    const option = document.createElement('option'); option.value = scene.path; option.textContent = scene.path.split('/').pop();
    sceneSelect.append(option);
  }
  if (sceneSelect.options.length > 1) container.append(sceneSelect);
  container.append(interact, play, reset, holdLabel, colliderLabel, status); container.hidden = false;
  if(hasJoints)container.insertBefore(jointLabel,status);
  function clearStatus() {
    status.replaceChildren(); status.title = '';
    status.removeAttribute('data-warning'); status.removeAttribute('tabindex'); status.removeAttribute('aria-label');
  }
  function showWarnings(issues = []) {
    clearStatus();
    if (!issues.length) return;
    const details = issues.map(issue => issue.path ? `${issue.path}: ${issue.reason}` : issue.reason).join('\n');
    status.append(viewerIcon('warning')); status.title = details; status.dataset.warning = '';
    status.tabIndex = 0; status.setAttribute('aria-label', details);
  }
  function readSnapshot(mode) {
    if (!snapshots.has(mode)) {
      const pending = (source ? source.readSnapshot(mode) : readUsdPhysics(handle, {meshGeometry: mode !== 'interaction'})).catch(error => {
        if (snapshots.get(mode) === pending) snapshots.delete(mode);
        throw error;
      });
      snapshots.set(mode, pending);
    }
    return snapshots.get(mode);
  }
  async function refreshColliders() {
    const current = ++overlayOperation;
    colliderOverlay?.dispose(); colliderOverlay = null;
    if (!colliders.checked || disposed) return;
    try {
      const [{createColliderOverlay}, full] = await Promise.all([import('./viewer-colliders.js'), readSnapshot('simulation')]);
      if (disposed || current !== overlayOperation || !colliders.checked || !isCurrent()) return;
      let nativeCollider;
      if (simulationMode === 'simulation' && simulation?.colliders) {
        if (usesHostWorld) {
          const physics = context.physics.getOrCreatePhysicsEngine();
          nativeCollider = path => {
            const component = simulation.colliderComponents.get(path);
            return component ? physics.getBody(component) : undefined;
          };
        } else {
          const native = new Map([...simulation.colliders.values()].map(record => [record.data.path, record.collider]));
          nativeCollider = path => native.get(path);
        }
      }
      colliderOverlay = createColliderOverlay({parent: usesHostWorld ? context.scene : handle.scene,
        snapshot: full, simulation, nativeCollider, worldSpace: usesHostWorld});
      colliderOverlay.update();
    } catch (error) {
      if (!disposed && current === overlayOperation) showWarnings([{reason: error.message}]);
    }
  }
  const controls = context ? (() => {
    const result = [];
    context.scene.traverse(object => {
      for (const component of object.userData.components || []) if (component.controls?.object?.isCamera) result.push(component.controls);
    });
    return result;
  })() : [fallbackControls];
  function stop() {
    operation++;
    pointerDrag.cancel();jointHelpers?.dispose();jointHelpers=null;jointControls?.dispose();jointControls=null;simulation?.dispose(); simulation = null;
    clearStatus();simulationMode='';usesHostWorld=false;interact.setAttribute('aria-pressed','false');hoveredPart=null;draggingPart=false;canvas.style.removeProperty('cursor');
    play.textContent = 'Simulate'; reset.disabled = true;
    void refreshColliders();
  }
  function stopPlayback() {
    rememberMode(null);
    stop();
  }
  async function start(mode) {
    rememberMode(simulation?.isPlaying() && simulationMode === mode ? null : mode);
    if(simulation&&mode!==simulationMode)stop();
    const currentOperation=operation;
    play.disabled=interact.disabled=true;clearStatus();status.textContent=mode==='interaction'?'Preparing joints…':'Preparing physics…';
    try {
      if(!simulation){
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        if(disposed||currentOperation!==operation||!isCurrent())return;
        snapshot = await readSnapshot(mode);
        if(disposed||currentOperation!==operation||!isCurrent())return;
        const scenePath = sceneSelect.value || undefined;
        let simulationSnapshot = mode === 'simulation' ? withViewerDamping(snapshot) : snapshot;
        if (mode === 'simulation' && holdBases.checked)
          simulationSnapshot = holdAssemblyBases(simulationSnapshot, {scenePath}).snapshot;
        const settings={handle,snapshot:simulationSnapshot,scenePath,mode};
        const helpers=hasJoints?await import('/usd/physics/jointHelpers.js'):null;
        if(disposed||currentOperation!==operation||!isCurrent())return;
        let created,kinematics,createdInHost=false;
        if(mode==='interaction'){
          kinematics=await import('/usd/physics/kinematics.js');
          if(disposed||currentOperation!==operation||!isCurrent())return;
          created=source ? await source.createMechanism({scenePath,dragMode:'point',loadKinematics:options.loadKinematics})
            : await kinematics.createUsdMechanism({handle,snapshot,dragMode:'point',loadKinematics:options.loadKinematics});
        }
        else if(options.createSimulation)created=await options.createSimulation(settings);
        else{
          let createSimulation;
          if(source)createSimulation=settings=>source.createSimulation(settings);
          else{
            const {createUsdPhysics,getUsdPhysicsLimitations}=await import('/usd/physics/createPhysics.js');
            if(disposed||currentOperation!==operation||!isCurrent())return;
            const limitations=getUsdPhysicsLimitations(snapshot);
            if(!options.allowPartialSimulation&&limitations.length)throw new Error(`Simulation unavailable: ${(limitations.find(issue=>issue.type==='mesh')||limitations[0]).reason}`);
            createSimulation=createUsdPhysics;
          }
          if(context){
            const placement=hostPlacement(handle.scene,snapshot);
            const {createNeedleSimulationWorld}=await import('@needle-tools/simready/needle');
            if(disposed||currentOperation!==operation||!isCurrent())return;
            const world=await createNeedleSimulationWorld({context});
            if(disposed||currentOperation!==operation||!isCurrent()){world.dispose();return;}
            try{
              created=await createSimulation({...settings,...placement,world,allowPartial:options.allowPartialSimulation===true});
              const dispose=created.dispose.bind(created);
              created.dispose=()=>{try{dispose();}finally{world.dispose();}};
              createdInHost=true;
            }catch(error){world.dispose();throw error;}
          }else{
            const rapier=await loadRapier(context,options);
            if(disposed||currentOperation!==operation||!isCurrent())return;
            created=await createSimulation({...settings,rapier,allowPartial:options.allowPartialSimulation===true});
          }
        }
        if(disposed||currentOperation!==operation||!isCurrent()){created.dispose();return;}
        simulation=created;simulationMode=mode;usesHostWorld=createdInHost;
        if(helpers && created.joints && created.bodies){
          const visibility={visible:()=>handle.helpers?.joints!==false,selected:(path,body)=>handle.isHelperSelected?.(path)||handle.isHelperSelected?.(body)};
          jointHelpers=mode==='interaction'?helpers.createJointHelpers(created,visibility)
            :helpers.createSimulationJointHelpers(created,snapshot,{...visibility,worldSpace:usesHostWorld});
        }
        if(mode==='interaction'){
          jointControls=kinematics.mountJointControls(container,created,{onError:message=>showWarnings(message ? [{reason:message}] : created.unsupported)});
        }
      }
      if(simulation.isPlaying()){pointerDrag.cancel();simulation.pause();}
      else simulation.play();
      jointControls?.update();
      interact.setAttribute('aria-pressed',String(mode==='interaction'&&simulation.isPlaying()));
      updateCursor();
      play.textContent=mode==='simulation'&&simulation.isPlaying()?(usesHostWorld?'Stop':'Pause'):'Simulate';reset.disabled=false;
      showWarnings(simulation.unsupported);
      void refreshColliders();
    }catch(error){if(disposed||currentOperation!==operation||!isCurrent())return;status.textContent=error.message;console.error('USD physics failed:',error);}
    finally{play.disabled=false;interact.disabled=!hasJoints;}
  }
  play.addEventListener('click',()=>{if(usesHostWorld&&simulationMode==='simulation'&&simulation?.isPlaying())stopPlayback();else void start('simulation');});
  interact.addEventListener('click',()=>void start('interaction'));
  reset.addEventListener('click', stopPlayback);
  sceneSelect.addEventListener('change', stopPlayback);
  holdBases.addEventListener('change', stopPlayback);
  colliders.addEventListener('change', () => void refreshColliders());
  joints.addEventListener('change',()=>{
    handle.setHelpers({joints:joints.checked});
    saveRenderSettings({helpers:{...handle.helpers,guides:handle.includedPurposes.includes('guide')}});
    jointHelpers?.update();
  });
  // The pointer binding reports what is under the pointer and whether a drag is active; the viewer picks the cursor.
  let hoveredPart=null,draggingPart=false;
  function updateCursor(){
    if(draggingPart)canvas.style.cursor='grabbing';
    else if(hoveredPart&&simulation?.isPlaying())canvas.style.cursor='grab';
    else canvas.style.removeProperty('cursor');
  }
  const pointerDrag = bindPointerDrag({
    element:canvas, camera:activeCamera,
    controller:() => simulation?.isPlaying() ? simulation : null,
    // Native USD controllers accept stage points. A glTF bound directly into
    // the Engine's shared physics world accepts world points.
    root:() => source && usesHostWorld ? null : handle.scene,
    pick(_event, raycaster) {
      handle.scene.updateWorldMatrix(true, true);
      raycaster.params.Line.threshold=.012*Math.abs(handle.scene.getWorldScale(rootScale).x)/(snapshot?.metersPerUnit||1);
      raycaster.params.Points.threshold=raycaster.params.Line.threshold;
      const intersections = raycaster.intersectObject(handle.scene, true);
      for (const intersection of intersections) {
        let helperObject=intersection.object;while(helperObject&&!helperObject.userData.usdJointPath)helperObject=helperObject.parent;
        const helper=helperObject?.userData.usdJointPath;
        let visible=true;for(let parent=intersection.object;parent;parent=parent.parent)if(!parent.visible||parent.userData.usdHelperFor&&!helper){visible=false;break;}
        if(!visible)continue;
        const body = helper?simulation.bodies.get(helperObject.userData.usdInteractBody):simulation.bodyForObject(intersection.object,intersection.instanceId);
        // An opaque stationary part occludes geometry behind it. Do not grab a
        // hidden drawer by casting through the cabinet's shell.
        if (!body) { if(!helper)return null;continue; }
        return {path:body.data.path, point:intersection.point};
      }
      return null;
    },
    onDraggingChange(active) {
      if (active) {
        previousControls = controls.map(control => [control, control.enabled]);
        for (const control of controls) control.enabled = false;
      } else {
        for (const [control, enabled] of previousControls) control.enabled = enabled;
        previousControls = [];
      }
      draggingPart = active;
      updateCursor();
    },
    onHoverChange(path) { hoveredPart = path; updateCursor(); },
  });
  if (preferredMode === 'simulation' || preferredMode === 'interaction' && hasJoints) void start(preferredMode);
  return {
    reset() { if (!disposed) stopPlayback(); },
    update(dt) { simulation?.update(dt);jointHelpers?.update();jointControls?.update();colliderOverlay?.update(); const visible=handle.helpers?.joints!==false;if(joints.checked!==visible)joints.checked=visible; },
    canInteract(path) { return !disposed && hasJoints && !!path && (overview.joints.includes(path) || overview.bodies.some(body=>path===body||path.startsWith(body+'/'))); },
    async interact() { if (!disposed && !interact.disabled && !(simulationMode==='interaction'&&simulation?.isPlaying())) await start('interaction'); },
    get simulation() { return simulation; },
    dispose() {
      disposed = true; stop(); snapshots.clear(); snapshot = null;
      pointerDrag.dispose();
      if (container.physicsOwner === owner) { container.replaceChildren(); container.hidden = true; }
    },
  };
}
