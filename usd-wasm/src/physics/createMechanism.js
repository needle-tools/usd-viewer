import {withVisualController} from '@needle-tools/simready/three';
import {createMechanism} from '@needle-tools/simready/kinematics';
import {readUsdPhysics} from './readPhysics.js';
import {readJointMetadata} from './jointMetadata.js';
import {bindPhysicsVisuals} from './visualBindings.js';

/** Connect composed USD joint data and visuals to the shared posing controller. */
export async function createUsdMechanism({handle,root=handle.scene,snapshot,...options}) {
 if(!root)throw new Error('A USD scene root is required.');
 return withVisualController(root,async()=>{
 const resolved=snapshot||await readUsdPhysics(handle,{meshGeometry:false});
 snapshot={...resolved,joints:[...(resolved.joints||[])]};
 await readJointMetadata(handle,snapshot);
 const wasPlaying=handle.isPlaying?.()||false;handle.setPlaying(false);
 try{
  await handle.ready();
  const mechanism=await createMechanism({...options,snapshot,bindVisuals:(bodies,warn)=>bindPhysicsVisuals(handle,root,bodies,warn)});
  const dispose=mechanism.dispose;let disposed=false;
  return Object.assign(mechanism,{root,dispose(){if(disposed)return;disposed=true;try{dispose.call(mechanism);}finally{handle.setPlaying(wasPlaying);}}});
 }catch(error){handle.setPlaying(wasPlaying);throw error;}
 });
}
