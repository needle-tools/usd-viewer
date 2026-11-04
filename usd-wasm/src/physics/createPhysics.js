import {placeAssetRoot,withVisualController} from '@needle-tools/simready/three';
import {Vector3} from 'three';
import {createSimulation} from '@needle-tools/simready/rapier';
import {readUsdPhysics} from './readPhysics.js';
import {bindPhysicsVisuals} from './visualBindings.js';
export {readUsdPhysics,inspectUsdPhysics} from './readPhysics.js';
export {getSimulationLimitations as getUsdPhysicsLimitations} from '@needle-tools/simready/rapier';

/** Read the composed stage and connect the shared simulation to USD visuals. */
export async function createUsdPhysics({handle,root=handle.scene,snapshot,world,...options}) {
 if(!root)throw new Error('A USD scene root is required.');
 return withVisualController(root,async()=>{
 snapshot ||= await readUsdPhysics(handle);
 const wasPlaying=handle.isPlaying?.()||false;
 handle.setPlaying(false);
 let placement;
 try{
  await handle.ready();
  if(world)placement=placeAssetRoot(root,snapshot,world,options);
  const configuration={allowPartial:true,...options,snapshot,bindVisuals:(bodies,warn,signal)=>bindPhysicsVisuals(handle,root,bodies,warn,{worldSpace:!!world,signal})};
  const simulation=world?await world.addAsset(configuration):await createSimulation(configuration);
  const play=simulation.play,dispose=simulation.dispose;
  const beginDrag=simulation.beginDrag,moveDrag=simulation.moveDrag;
  // The USD API accepts stage-local points even when the solver uses a shared
  // Y-up world. Root placement includes the unit, up-axis and instance transform.
  const dragPoint=point=>world?root.localToWorld(new Vector3().copy(point)):point;
  let disposed=false;
  return Object.assign(simulation,{root,
   play(){if(disposed)return;handle.setPlaying(false);play();},
   beginDrag(path,point){return beginDrag(path,dragPoint(point));},
   moveDrag(point){moveDrag(dragPoint(point));},
   dispose(){if(disposed)return;disposed=true;try{dispose();}finally{try{placement?.reset();}finally{handle.setPlaying(wasPlaying);}}}
  });
 }catch(error){placement?.reset();handle.setPlaying(wasPlaying);throw error;}
 });
}
