import {createJointHelpers as createHelpers} from '@needle-tools/simready/three';
/** Add USD viewport identity and bounds policy to the shared Three helpers. */
export function createJointHelpers(mechanism,options){
 const helpers=createHelpers(mechanism,options);
 for(const object of helpers.objects)object.traverse(child=>{
  const path=child.userData.simreadyHelperFor;
  Object.assign(child.userData,{usdPath:path,usdHelperFor:path,usdHelperKind:'joints',usdExcludeFromBounds:true,usdHelperPickable:true});
  if(child.userData.simreadyJointPath)Object.assign(child.userData,{usdJointPath:child.userData.simreadyJointPath,usdInteractBody:child.userData.simreadyInteractBody});
 });
 return helpers;
}
