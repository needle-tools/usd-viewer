import {readJointMetadata} from './jointMetadata.js';

// Loading a scene only needs body flags and scene names. Extracting the full
// collider snapshot here also copies every collision mesh into JSON.
export async function inspectUsdPhysics(handle) {
  await handle.ready();
  return handle.readStage(async stage => {
  // The Hydra handle owns the stage; only the child/attribute wrappers below are temporary.
  const pending=[stage.GetPrimAtPath('/')],scenes=[],bodies=[],joints=[];
  let dynamic=false;
  const flag=async(prim,name,fallback)=>{
    const attribute=prim.GetAttribute(name);
    try{const value=attribute.IsValid()?await attribute.Get(handle.getTime()):undefined;return typeof value==='boolean'?value:fallback;}
    finally{attribute.delete?.();}
  };
  try{
    while(pending.length){
      const prim=pending.pop();
      try{
        const type=prim.GetTypeName();
        if(type==='PhysicsScene')scenes.push({path:prim.GetPath()});
        if(/^Physics.*Joint$/.test(type))joints.push(prim.GetPath());
        if(await flag(prim,'physics:rigidBodyEnabled',false)&&!await flag(prim,'physics:kinematicEnabled',false)){dynamic=true;bodies.push(prim.GetPath());}
        const children=prim.GetChildren();
        try{for(let i=0;i<children.size();i++)pending.push(children.get(i));}
        finally{children.delete?.();}
      }finally{prim.delete?.();}
    }
    return {scenes,dynamic,bodies,joints};
  }finally{for(const prim of pending)prim.delete?.();}
  });
}

/** Read physics from the composed stage, including referenced layers and relationships. */
export async function readUsdPhysics(handle, {meshGeometry = true} = {}) {
    await handle.ready();
    const snapshot=await handle.readStage(async (_stage, driver) => {
        if (!driver.GetPhysicsSceneJson) throw new Error('This USD runtime does not include physics extraction.');
        const compact = driver.GetPhysicsSceneMetadataJson && (!meshGeometry || driver.GetPhysicsMeshBuffers);
        const raw = await (compact ? driver.GetPhysicsSceneMetadataJson() : driver.GetPhysicsSceneJson());
        if (!raw) throw new Error('USD physics extraction returned no data.');
        const result = JSON.parse(raw);
        if (driver.GetPhysicsMeshBuffers && meshGeometry) {
            for (const shape of result.shapes || []) if (shape.type === 'mesh' && shape.collisionEnabled !== false) {
                try { Object.assign(shape, await driver.GetPhysicsMeshBuffers(shape.path)); }
                catch (error) {
                    result.unsupported.push({path:shape.path,type:'mesh',reason:error.message || String(error)});
                    shape.collisionEnabled = false;
                }
            }
        }
        return result;
    });
    await readJointMetadata(handle,snapshot);
    return snapshot;
}

