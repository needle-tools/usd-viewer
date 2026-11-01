/** Read optional authored mimic relationships without interpreting display strings. */
export async function readJointMetadata(handle,snapshot){
 if(!handle.readStage)return;
 await handle.readStage(async stage=>{
  for(let data of snapshot.joints||[]){
   const prim=stage.GetPrimAtPath(data.path);let attrs,rels;
   try{
    const values={},targets={};attrs=prim.GetAttributes();rels=prim.GetRelationships();
    for(let i=0;i<attrs.size();i++){const a=attrs.get(i);try{const name=a.GetName();if(/^(simready:|physxMimicJoint:)/.test(name))values[name]=await a.Get(handle.getTime?.());}finally{a.delete?.();}}
    for(let i=0;i<rels.size();i++){const r=rels.get(i);try{const name=r.GetName();if(/^(simready:|physxMimicJoint:)/.test(name)){const paths=r.GetTargets();try{targets[name]=Array.from({length:paths.size()},(_,i)=>String(paths.get(i)));}finally{paths.delete?.();}}}finally{r.delete?.();}}
    const key=Object.keys(targets).find(name=>/^(simready:(mimic|coupled)Of|physxMimicJoint:.*:referenceJoint)$/.test(name)&&targets[name].length);
    if(key){const prefix=key.startsWith('simready:')?key.replace(/Of$/,''):key.replace(/referenceJoint$/,'');
     data={...data}; // Keep the caller's snapshot reusable by another adapter.
     const gearing=values[prefix+(key.startsWith('simready:')?'Gearing':'gearing')]??1;
     const offset=values[prefix+(key.startsWith('simready:')?'Offset':'offset')]??0;
     data.mimic={joint:targets[key][0],multiplier:-gearing,offset:-offset};
     snapshot.joints=snapshot.joints.map(j=>j.path===data.path?data:j);
    }
   }finally{attrs?.delete?.();rels?.delete?.();prim.delete?.();}
  }
 });
}
