import { Matrix4, Plane, Quaternion, Raycaster, Vector2, Vector3 } from 'three';
import { readUsdPhysics, inspectUsdPhysics } from '/usd/physics/readPhysics.js';

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
  if (!handle.driver?.GetPhysicsSceneJson) return null;
  const overview = await inspectUsdPhysics(handle);
  if (!isCurrent()) return null;
  const owner = Symbol('USD physics controls');
  container.physicsOwner = owner;
  container.replaceChildren(); container.hidden = true;
  if (!overview.dynamic) return null;
  const snapshots = new Map();
  let simulation, snapshot, jointHelpers, jointControls, disposed = false, dragging = false, previousControls = [], operation = 0, simulationMode = '', usesHostWorld = false;
  const activeCamera = () => window.usdRenderCamera || context?.mainCamera || fallbackCamera;
  const canvas = context?.renderer?.domElement || fallbackControls?.domElement;
  const raycaster = new Raycaster(), pointer = new Vector2(), plane = new Plane(), hit = new Vector3(), rootScale = new Vector3();
  const play = document.createElement('button'); play.type = 'button'; play.textContent = 'Simulate';
  const interact = document.createElement('button');interact.type='button';interact.textContent='Interact';interact.setAttribute('aria-pressed','false');interact.title='Drag movable parts within their joint limits';
  const hasJoints=overview.joints.length>0;interact.disabled=!hasJoints;
  if(!hasJoints)interact.title='This scene has no articulated joints';
  const status=document.createElement('span');status.setAttribute('role','status');
  const hint=document.createElement('p');hint.className='usd-physics-hint';hint.textContent='Interact: drag a movable part in the viewport.';
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Reset'; reset.disabled = true;
  const sceneSelect = document.createElement('select'); sceneSelect.setAttribute('aria-label', 'Physics scene');
  for (const scene of overview.scenes) {
    const option = document.createElement('option'); option.value = scene.path; option.textContent = scene.path.split('/').pop();
    sceneSelect.append(option);
  }
  if (sceneSelect.options.length > 1) container.append(sceneSelect);
  container.append(interact, play, reset, status, hint); container.hidden = false;
  const controls = context ? (() => {
    const result = [];
    context.scene.traverse(object => {
      for (const component of object.userData.components || []) if (component.controls?.object?.isCamera) result.push(component.controls);
    });
    return result;
  })() : [fallbackControls];
  function release() {
    if (!dragging) return;
    dragging = false; simulation?.endDrag();canvas.style.cursor=simulationMode==='interaction'?'grab':'';
    for (const [control, enabled] of previousControls) control.enabled = enabled;
    previousControls = [];
  }
  function stop() {
    operation++;
    release();jointHelpers?.dispose();jointHelpers=null;jointControls?.dispose();jointControls=null;simulation?.dispose(); simulation = null;
    status.textContent='';status.title='';simulationMode='';usesHostWorld=false;interact.setAttribute('aria-pressed','false');canvas.style.removeProperty('cursor');
    play.textContent = 'Simulate'; reset.disabled = true;
  }
  async function start(mode) {
    if(simulation&&mode!==simulationMode)stop();
    const currentOperation=operation;
    play.disabled=interact.disabled=true;status.textContent=mode==='interaction'?'Preparing joints…':'Preparing physics…';
    try {
      if(!simulation){
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        if(disposed||currentOperation!==operation||!isCurrent())return;
        snapshot = snapshots.get(mode) || await readUsdPhysics(handle,{meshGeometry:mode!=='interaction'});
        snapshots.set(mode,snapshot);
        if(disposed||currentOperation!==operation||!isCurrent())return;
        const settings={handle,snapshot,scenePath:sceneSelect.value||undefined,mode};
        let created,kinematics,createdInHost=false;
        if(mode==='interaction'){
          kinematics=await import('/usd/physics/kinematics.js');
          if(disposed||currentOperation!==operation||!isCurrent())return;
          created=await kinematics.createUsdMechanism({handle,snapshot,loadKinematics:options.loadKinematics});
        }
        else if(options.createSimulation)created=await options.createSimulation(settings);
        else{
          const {createUsdPhysics,getUsdPhysicsLimitations}=await import('/usd/physics/createPhysics.js');
          if(disposed||currentOperation!==operation||!isCurrent())return;
          const limitations=getUsdPhysicsLimitations(snapshot);
          if(!options.allowPartialSimulation&&limitations.length)throw new Error(`Simulation unavailable: ${(limitations.find(issue=>issue.type==='mesh')||limitations[0]).reason}`);
          if(context){
            const placement=hostPlacement(handle.scene,snapshot);
            const {createNeedleSimulationWorld}=await import('@needle-tools/simready/needle');
            if(disposed||currentOperation!==operation||!isCurrent())return;
            const world=await createNeedleSimulationWorld({context});
            if(disposed||currentOperation!==operation||!isCurrent()){world.dispose();return;}
            try{
              created=await createUsdPhysics({...settings,...placement,world,allowPartial:options.allowPartialSimulation===true});
              const dispose=created.dispose.bind(created);
              created.dispose=()=>{try{dispose();}finally{world.dispose();}};
              createdInHost=true;
            }catch(error){world.dispose();throw error;}
          }else{
            const rapier=await loadRapier(context,options);
            if(disposed||currentOperation!==operation||!isCurrent())return;
            created=await createUsdPhysics({...settings,rapier,allowPartial:options.allowPartialSimulation===true});
          }
        }
        if(disposed||currentOperation!==operation||!isCurrent()){created.dispose();return;}
        simulation=created;simulationMode=mode;usesHostWorld=createdInHost;
        if(mode==='interaction'){
          jointHelpers=kinematics.createJointHelpers(created,{visible:()=>handle.helpers?.joints!==false,selected:(path,body)=>handle.isHelperSelected?.(path)||handle.isHelperSelected?.(body)});
          jointControls=kinematics.mountJointControls(container,created,{onError:message=>{status.textContent=message;}});
        }
      }
      if(simulation.isPlaying()){release();simulation.pause();}
      else simulation.play();
      interact.setAttribute('aria-pressed',String(mode==='interaction'&&simulation.isPlaying()));
      canvas.style.cursor=mode==='interaction'&&simulation.isPlaying()?'grab':'';
      play.textContent=mode==='simulation'&&simulation.isPlaying()?(usesHostWorld?'Stop':'Pause'):'Simulate';reset.disabled=false;
      status.textContent=simulation.unsupported?.length?`${simulation.unsupported.length} unsupported ${mode==='interaction'?'joint':'physics'} features`:'';
      status.title=simulation.unsupported?.map(item=>`${item.path}: ${item.reason}`).join('\n')||'';
    }catch(error){if(disposed||currentOperation!==operation||!isCurrent())return;status.textContent=error.message;console.error('USD physics failed:',error);}
    finally{play.disabled=false;interact.disabled=!hasJoints;}
  }
  play.addEventListener('click',()=>{if(usesHostWorld&&simulationMode==='simulation'&&simulation?.isPlaying())stop();else void start('simulation');});
  interact.addEventListener('click',()=>void start('interaction'));
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
      if (!body) { if(!helper)return;continue; }
      const point = handle.scene.worldToLocal(intersection.point.clone());
      if (!simulation.beginDrag(body.data.path, point)) return;
      plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), intersection.point);
      dragging = true;canvas.style.cursor='grabbing'; previousControls = controls.map(control => [control, control.enabled]);
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
    reset() { if (!disposed) stop(); },
    update(dt) { simulation?.update(dt);jointHelpers?.update();jointControls?.update(); },
    canInteract(path) { return !disposed && hasJoints && !!path && (overview.joints.includes(path) || overview.bodies.some(body=>path===body||path.startsWith(body+'/'))); },
    async interact() { if (!disposed && !interact.disabled && !(simulationMode==='interaction'&&simulation?.isPlaying())) await start('interaction'); },
    get simulation() { return simulation; },
    dispose() {
      disposed = true; stop(); snapshots.clear(); snapshot = null;
      canvas.removeEventListener('pointerdown', down, true); canvas.removeEventListener('pointermove', move, true);
      canvas.removeEventListener('pointerup', up, true); canvas.removeEventListener('pointercancel', up, true);
      if (container.physicsOwner === owner) { container.replaceChildren(); container.hidden = true; }
    },
  };
}
