import {createJointHelpers as createHelpers} from '@needle-tools/simready/three';
import {Matrix4, Quaternion, Vector3} from 'three';
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

/** Adapt solver poses to the source stage, without creating a second mechanism. */
export function createSimulationJointHelpers(simulation, snapshot, {worldSpace=false,...options}={}){
 const {root}=simulation;
 const joints=new Map(),bodies=new Map();
 for(const data of snapshot.joints || []){
  if(data.jointEnabled===false || !simulation.joints.has(data.path) || !['fixed','revolute','prismatic'].includes(data.type))continue;
  joints.set(data.path,{data,sign:1,parent:data.body0||'',child:data.body1||data.body0||'',
   dof:data.type==='fixed'?null:0,angular:data.type==='revolute',
   lower:data.limit?.enabled?(data.limit.lower??-Infinity):-Infinity,
   upper:data.limit?.enabled?(data.limit.upper??Infinity):Infinity});
 }
 const inverseRoot=new Matrix4(),inverseRotation=new Quaternion(),position=new Vector3(),rotation=new Quaternion();
 function updateSpace(){
  root.updateWorldMatrix(true,false);
  inverseRoot.copy(root.matrixWorld).invert();
  root.getWorldQuaternion(inverseRotation).invert();
 }
 for(const [path,record] of simulation.bodies){
  const body=worldSpace?{
   translation:()=>position.copy(record.body.translation()).applyMatrix4(inverseRoot),
   rotation:()=>rotation.copy(record.body.rotation()).premultiply(inverseRotation),
   isDynamic:()=>record.body.isDynamic(),
  }:record.body;
  bodies.set(path,{data:record.data,body});
 }
 updateSpace();
 const helpers=createJointHelpers({root,bodies,joints,metersPerUnit:snapshot.metersPerUnit||1,
  isPlaying:()=>simulation.isPlaying(),
  getJointValue(path){
   const value=simulation.getJointValue(path);
   return value!==null&&worldSpace&&joints.get(path)?.data.type==='prismatic'?value/(snapshot.metersPerUnit||1):value;
  },
 },options);
 return {...helpers,update(){updateSpace();helpers.update();}};
}
