/** Inspect functionality without reading mesh arrays, textures or attribute values.
 * Call inside handle.readStage(). Shared prototypes are visited once. */
export async function inspectStageSummary(stage, {signal} = {}) {
  const types = new Set(), apiSchemas = new Set(), seen = new Set();
  const movingParts=new Set(),independentParts=new Set(),root=stage.GetPseudoRoot();let metadata,metersPerUnit;
  try {metadata=root.GetMetadata('customLayerData')?.SimReady_Metadata || {};metersPerUnit=root.GetMetadata('metersPerUnit') ?? .01;}
  finally {root.delete?.();}
  const counts = {prims: 0, meshes: 0, materials: 0, lights: 0, colliders: 0, rigidBodies: 0, constraints: 0};
  async function visit(vector) {
    if (!vector) return;
    try {
      for (let i = 0; i < vector.size(); i++) {
        if (i % 128 === 0) {signal?.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 0));}
        const prim = vector.get(i);
        try {
          const path = prim.GetPath(); if (seen.has(path)) continue; seen.add(path);
          const type = prim.GetTypeName(), applied = prim.GetMetadata('apiSchemas') || [];
          if (type) types.add(type);
          // GetMetadata returns the composed applied-schema list, including
          // multiple-apply instance names, rather than authored list-op text.
          for (const schema of applied) apiSchemas.add(schema);
          counts.prims++;
          if (type === 'Mesh') counts.meshes++;
          if (type === 'Material') counts.materials++;
          if (/Light$/.test(type)) counts.lights++;
          if (applied.includes('PhysicsCollisionAPI')) counts.colliders++;
          if (applied.includes('PhysicsRigidBodyAPI')) counts.rigidBodies++;
          if (/^Physics.*Joint$/.test(type)) counts.constraints++;
          if(/^Physics.*Joint$/.test(type)&&type!=='PhysicsFixedJoint'&&prim.IsActive()&&prim.IsLoaded()){
            const enabled=prim.GetAttribute('physics:jointEnabled');let active;
            try{active=!enabled.IsValid()||await enabled.Get(0)!==false;}finally{enabled.delete?.();}
            if(active){
              const limits=[];
              for(const name of ['physics:lowerLimit','physics:upperLimit']){const attr=prim.GetAttribute(name);try{limits.push(attr.IsValid()?await attr.Get(0):undefined);}finally{attr.delete?.();}}
              if(!(Number.isFinite(limits[0])&&limits[0]===limits[1]))for(const name of ['physics:body1','physics:body0']){
                const rel=prim.GetRelationship(name);let targets;
                try{targets=rel.GetTargets();if(targets.size()){
                  const body=targets.get(0);movingParts.add(body);
                  let dependent=applied.some(schema=>/^PhysxMimicJointAPI(?::|$)/.test(schema));const relationships=prim.GetRelationships();
                  try{for(let j=0;j<relationships.size();j++){const dependency=relationships.get(j);let linked;
                    try{if(/^(simready:(mimic|coupled)Of|physxMimicJoint:.*:referenceJoint)$/.test(dependency.GetName())){linked=dependency.GetTargets();if(linked.size())dependent=true;}}
                    finally{linked?.delete?.();dependency.delete?.();}
                  }}finally{relationships.delete?.();}
                  if(!dependent)independentParts.add(body);break;
                }}
                finally{targets?.delete?.();rel.delete?.();}
              }
            }
          }
        } finally {prim.delete?.();}
      }
    } finally {vector.delete?.();}
  }
  await visit(stage.TraverseAll());
  await visit(stage.TraversePrototypes?.(null));
  return {...counts, movingParts:movingParts.size, independentJoints:independentParts.size, profile:metadata.validation?.profile || metadata.profile || null,
    massKg:Number.isFinite(metadata.mass)?metadata.mass:null,
    dimensions:Array.isArray(metadata.asset_extents)&&metadata.asset_extents.length===3&&metadata.asset_extents.every(value=>Number.isFinite(value)&&value>=0)?metadata.asset_extents:null,
    metersPerUnit, types: [...types].sort(), apiSchemas: [...apiSchemas].sort()};
}

/** File sizes from already mounted data; never reads/copies file contents or
 * fetches dependencies. Missing sizes remain unknown. Session layers are omitted. */
export function inspectStageFiles(stage, usd, sourcePaths) {
  return stage.GetUsedLayers(false).filter(layer => !layer.identifier.startsWith('anon:')).map(layer => {
    const identifier = layer.realPath || layer.identifier;
    const file = usd.FS_analyzePath(identifier);
    const size = file?.exists && !file.object?.isFolder ? file.object?.usedBytes : undefined;
    return {path: sourcePaths ? sourcePaths.path(identifier) : identifier, size};
  });
}
