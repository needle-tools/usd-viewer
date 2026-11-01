import {Matrix4, Quaternion, Vector3} from 'three';

const contains=(parent,path)=>path===parent||path.startsWith(parent+'/');
const pose=body=>new Matrix4().compose(new Vector3().copy(body.translation()),new Quaternion().copy(body.rotation()),new Vector3(1,1,1));

/** Bind render instances to composed USD identities, never prototype path guesses. */
export async function bindPhysicsVisuals(handle,root,bodies,warn){
  const owners=[...bodies.values()].sort((a,b)=>b.data.path.length-a.data.path.length);
  const ownerFor=path=>path&&owners.find(owner=>contains(owner.data.path,path));
  const bindings=[],byObject=new WeakMap(),objects=[];
  root.updateWorldMatrix(true,true);
  const inverseRoot=root.matrixWorld.clone().invert();
  root.traverse(object=>{if(object.userData.usdPath)objects.push(object);});
  for(const object of objects){
    const instanced=object.isInstancedMesh, identities=new Map();
    for(let index=0;index<(instanced?object.count:1);index++){
      const resolved=instanced?await handle.resolvePick?.(object.userData.usdPath,index):null;
      const owner=ownerFor(resolved?.path)||resolved?.instances?.map(instance=>ownerFor(instance.path)).find(Boolean)
        || (!instanced||object.count===1?ownerFor(object.userData.usdPath):null);
      if(!owner)continue;
      const original=new Matrix4();
      if(instanced)object.getMatrixAt(index,original);else original.copy(object.matrix);
      const world=instanced?object.matrixWorld.clone().multiply(original):object.matrixWorld;
      const offset=pose(owner.body).invert().multiply(inverseRoot).multiply(world);
      identities.set(index,owner);
      bindings.push({object,index:instanced?index:null,owner,original,offset,autoUpdate:object.matrixAutoUpdate});
    }
    byObject.set(object,identities);
    if(instanced&&!identities.size&&ownerFor(object.userData.usdPath))warn({path:object.userData.usdPath},'Rigid-body render instance identities could not be resolved.');
  }
  function update(reset=false){
    const changed=new Set();
    root.updateWorldMatrix(true,false);
    for(const {object,index,owner,original,offset,autoUpdate} of bindings){
      let target=original;
      if(!reset){
        object.parent?.updateWorldMatrix(true,false);
        target=root.matrixWorld.clone().multiply(pose(owner.body)).multiply(offset);
        if(index!==null){object.updateWorldMatrix(true,false);target.premultiply(object.matrixWorld.clone().invert());}
        else if(object.parent)target.premultiply(object.parent.matrixWorld.clone().invert());
      }
      if(index!==null){object.setMatrixAt(index,target);changed.add(object);}
      else{object.matrix.copy(target);object.matrixAutoUpdate=reset?autoUpdate:false;object.matrixWorldNeedsUpdate=true;}
    }
    for(const object of changed){object.instanceMatrix.needsUpdate=true;object.computeBoundingSphere();if(object.boundingBox)object.computeBoundingBox();}
  }
  return {
    sync:()=>update(),reset:()=>update(true),
    bodyForObject(object,instanceIndex){
      for(let current=object;current;current=current.parent){
        const owner=byObject.get(current)?.get(current.isInstancedMesh?instanceIndex??0:0);
        if(owner?.body.isDynamic())return owner;
      }
      return null;
    },
  };
}
