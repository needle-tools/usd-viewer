// Geometry and appearance are represented by the exported glTF, not a second
// copy of the source mesh. Unknown properties remain semantic data by default.
const geometryProperties=new Set(['points','normals','faceVertexCounts','faceVertexIndices','holeIndices','cornerIndices','cornerSharpnesses','creaseIndices','creaseLengths','creaseSharpnesses','extent','widths','curveVertexCounts','positions','orientations','scales','protoIndices','ids','velocities','accelerations','angularVelocities']);
const geometryTypes=new Set(['Mesh','Points','BasisCurves','NurbsCurves','PointInstancer']);
const renderPrimvar=/^primvars:(?:st\d*|uv\d*|normals|displayColor|displayOpacity)(?::indices)?$/;
const structure=new Set(['specifier','typeName','variability','custom','default','timeSamples']);
const bodyFields=new Set(['physics:rigidBodyEnabled','physics:kinematicEnabled','physics:startsAsleep','physics:velocity','physics:angularVelocity','physics:mass','physics:density','physics:centerOfMass','physics:diagonalInertia','physics:principalAxes']);
const shapeFields=new Set(['physics:collisionEnabled','physics:approximation','physics:mass','physics:density','physics:centerOfMass','physics:diagonalInertia','physics:principalAxes']);
const jointFields=new Set(['physics:jointEnabled','physics:collisionEnabled','physics:axis','physics:breakForce','physics:breakTorque','physics:localPos0','physics:localPos1','physics:localRot0','physics:localRot1','physics:lowerLimit','physics:upperLimit']);
const visualFields=new Set(['doubleSided','subdivisionScheme','purpose','visibility','subsetFamily:materialBind:familyType']);

/** JSON has no nonfinite numbers or bigint. Retain those values explicitly
 * instead of allowing JSON.stringify to replace them with null or throw. */
export function encodeUsdMetadata(value){
 return JSON.parse(JSON.stringify(value,(_key,item)=>{
  if(typeof item==='number'&&!Number.isFinite(item))return{$usdNumber:String(item)};
  if(typeof item==='bigint')return{$usdInteger:String(item)};
  if(ArrayBuffer.isView(item))return item instanceof DataView?[]:Array.from(item);
  return item;
 }));
}

/** Physics snapshots cover composed bodies and constraints. Metadata also
 * catches authored SimReady profiles and schemas on assets without bodies. */
export function hasSimreadyData(snapshot,metadata){
 if(['bodies','shapes','joints','scenes','materials','groups','articulations','unsupported'].some(key=>snapshot[key]?.length))return true;
 const property=/^(?:(?:omni:)?simready|semantics:labels|physics|physx[A-Za-z]*|mjc|mujoco|newton):/i;
 const schema=/^(?:Physics|Physx|SimReady|SemanticsLabelsAPI|Mjc|MuJoCo|Newton)/i;
 const applied=value=>typeof value==='string'?schema.test(value):Array.isArray(value)?value.some(applied):value&&typeof value==='object'&&Object.values(value).some(applied);
 const authored=value=>value&&typeof value==='object'&&Object.keys(value).some(key=>key==='SimReady_Metadata'||property.test(key));
 const fields=value=>authored(value)||authored(value?.customData)||authored(value?.customLayerData)||applied(value?.apiSchemas);
 return !!(fields(metadata.stage)||metadata.prims.some(prim=>schema.test(prim.type)||fields(prim.metadata)
  ||prim.attributes?.some(attribute=>property.test(attribute.name))||prim.relationships?.some(relation=>property.test(relation.name))));
}

async function vector(items,read=value=>value){
 if(!items)return[];
 const result=[];
 try{for(let i=0;i<items.size();i++){const item=items.get(i);try{result.push(await read(item));}finally{item?.delete?.();}}return result;}
 finally{items.delete?.();}
}
const metadata=object=>Object.fromEntries(Object.entries(object.GetAllMetadataValues?.()||object.GetAllMetadata?.()||{})
 .filter(([key])=>!structure.has(key)&&object.HasAuthoredMetadata?.(key)));
const nonempty=value=>Object.keys(value).length>0;

/** Preserve composed schema data independently of original visual geometry.
 * USD paths remain identities; they are never interpreted as glTF indices. */
export async function readSimreadyMetadata(handle,snapshot){
 if(!handle.readStage)throw new Error('SimReady export requires USD semantic metadata or a readable stage.');
 const time=handle.getTime?.()??0;
 return handle.readStage(async stage=>{
  const root=stage.GetPseudoRoot();let stageMetadata;
  try{stageMetadata=metadata(root);}finally{root.delete?.();}
  const prims=await vector(stage.TraverseAllWithInstanceProxies?.(null)||stage.TraverseAll(),async prim=>{
   const path=prim.GetPath(),type=prim.GetTypeName();
   const body=snapshot.bodies.find(item=>item.path===path),shape=snapshot.shapes.find(item=>item.path===path),joint=snapshot.joints.find(item=>item.path===path);
   const scene=snapshot.scenes.some(item=>item.path===path),physicalMaterial=snapshot.materials.some(item=>item.path===path);
   const shader=type==='Shader'||type==='Material';
   let materialSubset=false;
   if(type==='GeomSubset'){const family=prim.GetAttribute('familyName');try{materialSubset=await family.Get(time)==='materialBind';}finally{family.delete?.();}}
   const covered=name=>body&&bodyFields.has(name)||shape&&shapeFields.has(name)||joint&&(jointFields.has(name)||joint.drive&&/^drive:(?:angular|linear):physics:(?:type|targetPosition|targetVelocity|stiffness|damping|maxForce)$/.test(name))
    ||scene&&['physics:gravityDirection','physics:gravityMagnitude'].includes(name)||physicalMaterial&&['physics:staticFriction','physics:dynamicFriction','physics:restitution','physics:density'].includes(name)
    ||body&&(name==='xformOpOrder'||name.startsWith('xformOp:'));
   const attributes=(await vector(prim.GetAttributes(),async attribute=>{
    const name=attribute.GetName();
    if(geometryTypes.has(type)&&(geometryProperties.has(name)||renderPrimvar.test(name)))return null;
    if(shader&&/^(?:inputs:|outputs:|info:)/.test(name)||materialSubset&&['indices','elementType','familyName'].includes(name)||(geometryTypes.has(type)||body)&&visualFields.has(name))return null;
    const connections=await vector(attribute.GetConnections?.());
    const extra=metadata(attribute);
    if(!attribute.HasAuthoredValueOpinion?.()&&!connections.length&&!nonempty(extra))return null;
    const times=await vector(await attribute.GetTimeSamples());
    if(covered(name)&&!times.length&&!nonempty(extra))return null;
    const readValue=async time=>{
     const value=await attribute.Get(time);
     return value===undefined?{$usdValue:await attribute.GetValueStringAtTime(time)}:value;
    };
    const value=await readValue(time),samples=[];
    for(const sampleTime of times)samples.push({time:sampleTime,value:await readValue(sampleTime)});
    return{name,type:attribute.GetTypeName(),value,...(nonempty(extra)?{metadata:extra}:{}),...(connections.length?{connections}:{}),
     ...(times.length?{default:await readValue(Number.NaN),samples}:{})};
   })).filter(Boolean);
   const relationships=(await vector(prim.GetRelationships(),async relation=>{
    const name=relation.GetName(),targets=await vector(relation.GetTargets()),extra=metadata(relation);
    if(joint&&['physics:body0','physics:body1'].includes(name)||(body||shape)&&['physics:simulationOwner','physics:filteredPairs'].includes(name))return null;
    if(!targets.length&&!nonempty(extra)&&!relation.GetMetadata?.('custom'))return null;
    return{name,targets,...(nonempty(extra)?{metadata:extra}:{})};
   })).filter(Boolean);
   const variants=await vector(prim.GetVariantSetNames(),async name=>({name,selection:prim.GetVariantSelection(name),choices:await vector(prim.GetVariantNames(name))}));
   const extra=metadata(prim);
   if(shader&&Array.isArray(extra.apiSchemas))extra.apiSchemas=extra.apiSchemas.filter(schema=>!['MaterialBindingAPI','NodeDefAPI'].includes(schema));
   if(extra.apiSchemas?.length===0)delete extra.apiSchemas;
   if(materialSubset&&Array.isArray(extra.apiSchemas))extra.apiSchemas=extra.apiSchemas.filter(schema=>schema!=='MaterialBindingAPI');
   if(extra.apiSchemas?.length===0)delete extra.apiSchemas;
   if(!attributes.length&&!relationships.length&&!nonempty(extra)&&!variants.length&&prim.IsActive())return null;
   return{path,type,...(!prim.IsActive()?{active:false}:{}),...(nonempty(extra)?{metadata:extra}:{}),...(attributes.length?{attributes}:{}),...(relationships.length?{relationships}:{}),...(variants.length?{variants}:{})};
  });
  return encodeUsdMetadata({version:1,time,stage:stageMetadata,prims:prims.filter(Boolean)});
 });
}
