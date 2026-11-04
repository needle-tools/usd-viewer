import {bindVisuals} from '@needle-tools/simready/three';

const contains=(parent,path)=>path===parent||path.startsWith(parent+'/');

/** Bind render instances to composed USD identities, never prototype path guesses. */
export async function bindPhysicsVisuals(handle,root,bodies,warn,{worldSpace=false,signal}={}){
  signal?.throwIfAborted();
  const owners=[...bodies.values()].sort((a,b)=>b.data.path.length-a.data.path.length);
  const ownerFor=path=>path&&owners.find(owner=>contains(owner.data.path,path));
  const bindings=[],objects=[];
  root.updateWorldMatrix(true,true);
  root.traverse(object=>{if(object.userData.usdPath&&!object.userData.usdHelperFor)objects.push(object);});
  for(const object of objects){
    const instanced=object.isInstancedMesh;let bound=0;
    for(let index=0;index<(instanced?object.count:1);index++){
      const resolved=instanced?await handle.resolvePick?.(object.userData.usdPath,index):null;
      signal?.throwIfAborted();
      const owner=ownerFor(resolved?.path)||resolved?.instances?.map(instance=>ownerFor(instance.path)).find(Boolean)
        || (!instanced||object.count===1?ownerFor(object.userData.usdPath):null);
      if(!owner)continue;
      bound++;bindings.push({object,instanceIndex:instanced?index:null,body:owner.data.path});
    }
    if(instanced&&!bound&&ownerFor(object.userData.usdPath))warn({path:object.userData.usdPath},'Rigid-body render instance identities could not be resolved.');
  }
  signal?.throwIfAborted();
  return bindVisuals({root,bodies,worldSpace,bindings});
}
