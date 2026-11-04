import {BufferAttribute,BufferGeometry,Color,Group,Matrix4,Mesh,MeshPhysicalMaterial,Points,Quaternion,Vector3} from 'three';
import {readUsdPhysics} from '../physics/readPhysics.js';
import {encodeUsdMetadata,readSimreadyMetadata} from './metadata.js';

import {SIMREADY_EXTENSION,createSimreadyExtension} from '@needle-tools/simready';
const PHYSICS='KHR_physics_rigid_bodies',SHAPES='KHR_implicit_shapes';
const plain=value=>JSON.parse(JSON.stringify(value,(_key,v)=>ArrayBuffer.isView(v)?Array.from(v):v));
const contains=(parent,path)=>path===parent||path?.startsWith(parent+'/');
const pose=(position=[0,0,0],rotation=[0,0,0,1])=>new Matrix4().compose(new Vector3(...position),new Quaternion(...rotation),new Vector3(1,1,1));
const axes=[0,1,2],axisIndex=name=>({X:0,Y:1,Z:2})[name||'X'];

/** Export rigid visuals, physics and composed schema semantics. Supplying the
 * exporter keeps renderer/texture setup with the host. */
export async function exportSimreadyGltf({handle,exporter,snapshot,usdMetadata,onProgress,textureResolution='original',signal}){
 const report=(phase,completed=0,total=0)=>onProgress?.({phase,completed,total});
 if(!['preview','original'].includes(textureResolution))throw new RangeError('Invalid export texture resolution.');
 let textureExport;
 const ownedMaterials=new Set(),ownedGeometry=new Set();
 const wasPlaying=handle.isPlaying?.()||false;
 handle.setPlaying?.(false);
 try{
 report('physics');
 await handle.ready();await handle.materialsReady?.();
 if(signal?.aborted)throw new DOMException('Export cancelled','AbortError');
 textureExport=handle.createTextureExport?.({signal,resolution:textureResolution});
 const revision=handle.revision,time=handle.getTime?.();
 const assertCurrent=()=>{if(signal?.aborted)throw new DOMException('Export cancelled','AbortError');if(revision!==undefined&&revision!==handle.revision||time!==undefined&&time!==handle.getTime?.())throw new Error('USD stage changed during SimReady export; retry the export.');};
 snapshot=plain(snapshot||await readUsdPhysics(handle));
 if(!(snapshot.metersPerUnit>0)||!(snapshot.kilogramsPerUnit>0))throw new Error('SimReady export requires valid USD length and mass units.');
 // The interactive inspector avoids extracting disabled mesh colliders. An
 // interchange export must retain their geometry too, so they can be enabled.
 for(const shape of snapshot.shapes)if(shape.type==='mesh'&&!shape.points?.length&&handle.readStage){
  const geometry=await handle.readStage((_stage,driver)=>driver?.GetPhysicsMeshBuffers?.(shape.path));
  if(geometry)Object.assign(shape,geometry);
 }
 report('metadata');
 usdMetadata=usdMetadata?encodeUsdMetadata(usdMetadata):await readSimreadyMetadata(handle,snapshot);
 if(usdMetadata.version!==1||!Array.isArray(usdMetadata.prims))throw new Error('Invalid SimReady USD metadata.');
 report('geometry');
 const stage=new Group();stage.name='USD stage';stage.rotation.x=snapshot.upAxis==='Z'?-Math.PI/2:0;stage.scale.setScalar(snapshot.metersPerUnit);
 const bodies=new Map(),bindings=[],physics=new Map(),colliders=[],jointFrames=[],mappingIssues=[],portableMaterials=new Map(),untintedGeometry=new WeakMap(),exportMaterials=new Map();
 const m=snapshot.metersPerUnit,k=snapshot.kilogramsPerUnit;
 for(const body of snapshot.bodies){
  const node=new Group();node.name=body.path;node.position.fromArray(body.position);node.quaternion.fromArray(body.rotation);stage.add(node);bodies.set(body.path,node);
  const motion={isKinematic:!!body.kinematicBody};
  if(body.mass>0)motion.mass=body.mass*k;
  // COM is a point in the node frame; the stage root applies the length unit.
  if(body.centerOfMass)motion.centerOfMass=body.centerOfMass.map((v,i)=>v*(body.scale?.[i]??1));
  if(body.diagonalInertia)motion.inertiaDiagonal=body.diagonalInertia.map(v=>v*k*m*m);
  if(body.principalAxes)motion.inertiaOrientation=body.principalAxes;
  const inverse=new Quaternion(...body.rotation).invert();
  if(body.linearVelocity)motion.linearVelocity=new Vector3(...body.linearVelocity).applyQuaternion(inverse).multiplyScalar(m).toArray();
  if(body.angularVelocity)motion.angularVelocity=new Vector3(...body.angularVelocity).applyQuaternion(inverse).multiplyScalar(Math.PI/180).toArray();
  physics.set(node,body.rigidBodyEnabled===false?{}:{motion});
  bindings.push({object:node,path:body.path});
 }
 const owners=[...bodies.keys()].sort((a,b)=>b.length-a.length);
 handle.scene.updateWorldMatrix(true,true);const inverseRoot=handle.scene.matrixWorld.clone().invert();
 // Hydra keeps hidden source meshes beside their visible instance batches.
 // Only the rendered representation belongs in the exported scene.
 const objects=[];handle.scene.traverseVisible(object=>{if((object.isMesh||object.isPoints||object.isLine||object.isCamera||object.isLight)&&!object.userData.usdHelperFor)objects.push(object);});
 for(const object of objects){
  if(object.isSkinnedMesh||object.morphTargetInfluences?.length)throw new Error('SimReady export currently requires rigid visuals.');
  for(let i=0;i<(object.isInstancedMesh?object.count:1);i++){
   const identity=object.isInstancedMesh?await handle.resolvePick?.(object.userData.usdPath,i):object.userData.usdInstanceIdentity;
   const path=identity?.path||(!object.isInstancedMesh?(object.userData.usdSourcePath||object.userData.usdPath):null);
   const owner=object.userData.usdBodyPath||owners.find(key=>contains(key,path))||identity?.instances?.map(item=>owners.find(key=>contains(key,item.path))).find(Boolean);
   if(owner&&!bodies.has(owner))throw new Error('SimReady visual references an unavailable rigid body.');
   if(object.isInstancedMesh&&!identity)throw new Error('SimReady export requires resolved render instance identities.');
   if(!path)throw new Error('SimReady visual is missing its USD prim identity.');
   const materialFor=source=>{
    if(source.color?.isColor&&(source.isMeshStandardMaterial||source.isMeshBasicMaterial||source.isPointsMaterial||source.isLineBasicMaterial))return source;
    if(portableMaterials.has(source))return portableMaterials.get(source);
    const fallback=object.userData.usdHydraFallbackMaterial?.(),target=new MeshPhysicalMaterial();
    target.name=source.name;target.side=source.side;target.vertexColors=source.vertexColors;
    for(const key of ['color','emissive','attenuationColor','specularColor']){
     const color=source[key]??fallback?.[key];if(color?.isColor)target[key].copy(color);
     else if((Array.isArray(color)||ArrayBuffer.isView(color))&&color.length>=3)target[key].setRGB(color[0],color[1],color[2]);
    }
    for(const key of ['roughness','metalness','opacity','ior','transmission','thickness','attenuationDistance','clearcoat','clearcoatRoughness','emissiveIntensity','specularIntensity'])if(Number.isFinite(source[key]??fallback?.[key]))target[key]=source[key]??fallback[key];
    for(const key of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','alphaMap','aoMap','transmissionMap','thicknessMap'])if(source[key]?.isTexture)target[key]=source[key];
    target.transparent=source.transparent||target.opacity<1;target.alphaTest=source.alphaTest||0;
    ownedMaterials.add(target);portableMaterials.set(source,target);
    mappingIssues.push({path,reason:'Shader appearance is projected to exposed PBR properties; the source shader graph has no exact glTF PBR representation.'});return target;
   };
   const exportMaterial=async source=>{
    const material=materialFor(source);
    if(!textureExport)return material;
    if(!exportMaterials.has(material))exportMaterials.set(material,(async()=>{
     let copy;
     for(const key of Object.keys(material))if(material[key]?.isTexture){
      const texture=await textureExport.getTexture(material[key]);assertCurrent();
      if(texture!==material[key]){copy??=material.clone();ownedMaterials.add(copy);copy[key]=texture;}
     }
     return copy||material;
    })());
    return exportMaterials.get(material);
   };
   let materials=Array.isArray(object.material)?await Promise.all(object.material.map(exportMaterial)):object.material?await exportMaterial(object.material):undefined;
   if(object.instanceColor){const tint=new Color();object.getColorAt(i,tint);const tinted=material=>{const copy=material.clone();copy.color.multiply(tint);ownedMaterials.add(copy);return copy;};materials=Array.isArray(materials)?materials.map(tinted):tinted(materials);}
   let geometry=object.geometry;
   const usedMaterials=Array.isArray(materials)?geometry.groups.filter(group=>group.count>0).map(group=>materials[group.materialIndex]):[materials];
   if(geometry?.getAttribute('color')&&!usedMaterials.some(material=>material?.vertexColors)){
    if(!untintedGeometry.has(geometry)){const copy=geometry.clone();copy.deleteAttribute('color');untintedGeometry.set(geometry,copy);ownedGeometry.add(copy);}
    geometry=untintedGeometry.get(geometry);
   }
   const mesh=object.isMesh?new Mesh(geometry,materials):object.clone(false);
   if(geometry)mesh.geometry=geometry;if(materials)mesh.material=materials;
   mesh.name=path;mesh.userData={};mesh.matrixAutoUpdate=false;
   mesh.matrix.copy(inverseRoot).multiply(object.matrixWorld);
   if(object.isInstancedMesh){const instance=new Matrix4();object.getMatrixAt(i,instance);mesh.matrix.multiply(instance);}
   if(owner){const body=snapshot.bodies.find(item=>item.path===owner);mesh.matrix.premultiply(pose(body.position,body.rotation).invert());}
   (bodies.get(owner)||stage).add(mesh);bindings.push({object:mesh,path,body:owner||'',...(identity?{instance:plain(identity)}:{})});
  }
 }
 const shapes=[];
 let collisionMaterial;
 for(const [index,shape]of snapshot.shapes.entries()){
  let record;
  if(shape.type==='mesh'){
   collisionMaterial??=new MeshPhysicalMaterial();ownedMaterials.add(collisionMaterial);
   record={index,shape,mesh:createCollisionMesh(shape,collisionMaterial),node:null};colliders.push(record);
  }
  if(shape.collisionEnabled===false)continue;
  const parameters=implicitShape(shape);
  if(!parameters&&!(record&&['none','convexHull',undefined].includes(shape.approximation))){mappingIssues.push({path:shape.path,reason:'Collider mesh and USD approximation settings are retained in NEEDLE_simready; no exact Khronos physics projection is available.'});continue;}
  const node=new Group();node.name=shape.path+' collider';node.position.fromArray(shape.position||[0,0,0]);node.quaternion.fromArray(shape.rotation||[0,0,0,1]);(bodies.get(shape.body)||stage).add(node);
  const geometry={};
  if(parameters){geometry.shape=shapes.length;shapes.push(parameters);if(['plane','capsule','cylinder','cone'].includes(shape.type))node.quaternion.multiply(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),new Vector3(...(shape.axis==='X'?[1,0,0]:shape.axis==='Z'?[0,0,1]:[0,1,0]))));}
  else{record.node=node;node.scale.fromArray(shape.meshScale||[1,1,1]);geometry.convexHull=shape.approximation==='convexHull';}
  const material=snapshot.materials.findIndex(item=>shape.materials?.includes(item.path));
  physics.set(node,{collider:{geometry,...(material>=0?{physicsMaterial:material}:{})}});
 }
 const physicsJoints=[];
 for(const joint of snapshot.joints){
  if(joint.jointEnabled===false)continue;
  const projected=projectJoint(joint,m,k);
  if(!projected){mappingIssues.push({path:joint.path,reason:'Joint is retained in NEEDLE_simready; no exact Khronos projection is available.'});continue;}
  const frames=[0,1].map(end=>{const node=new Group();node.name=joint.path+' frame '+end;node.position.fromArray(joint['position'+end]);node.quaternion.fromArray(joint['rotation'+end]);(bodies.get(joint['body'+end])||stage).add(node);return node;});
  physics.set(frames[0],{joint:{joint:physicsJoints.length,enableCollision:!!joint.collisionEnabled}});jointFrames.push(frames);physicsJoints.push(projected);
 }
 for(const scene of snapshot.scenes)mappingIssues.push({path:scene.path,reason:'USD scene gravity and ownership are retained in NEEDLE_simready.'});
 for(const group of snapshot.groups)mappingIssues.push({path:group.path,reason:'USD collision-group semantics are retained in NEEDLE_simready.'});
 for(const body of snapshot.bodies)if(body.startsAsleep||body.density>0||body.filteredCollisions?.length||body.simulationOwners?.length)mappingIssues.push({path:body.path,reason:'USD sleep state, density inheritance, collision filters or simulation ownership require NEEDLE_simready.'});
 for(const shape of snapshot.shapes)if(shape.filteredCollisions?.length||shape.collisionGroups?.length||shape.simulationOwners?.length||shape.density>0||shape.mass>0||shape.centerOfMass||shape.diagonalInertia||shape.principalAxes)mappingIssues.push({path:shape.path,reason:'USD collider filtering, ownership or local mass overrides require NEEDLE_simready.'});
 for(const joint of snapshot.joints)if(joint.mimic||Number.isFinite(joint.breakForce)||Number.isFinite(joint.breakTorque))mappingIssues.push({path:joint.path,reason:'USD joint coupling or breaking thresholds require NEEDLE_simready.'});
 stage.updateMatrixWorld(true);
 const vertexColorMaterials=new Set();
 const plugin=writer=>({
  name:SIMREADY_EXTENSION,
  async writeMaterialAsync(material,definition){if(material.vertexColors)vertexColorMaterials.add(definition);},
  writeMesh(mesh,definition){
   // glTF always multiplies COLOR_0 into the material. Hydra also carries
   // displayColor on textured meshes whose material explicitly ignores it.
   definition.primitives.forEach(primitive=>{
    if(!vertexColorMaterials.has(writer.json.materials?.[primitive.material])){primitive.attributes={...primitive.attributes};delete primitive.attributes.COLOR_0;}
   });
  },
  writeNode(object,definition){if(physics.has(object))(definition.extensions||={})[PHYSICS]=physics.get(object);},
  afterParse(){writer.pending.push((async()=>{
   const storedSnapshot=plain(snapshot);
   for(const {index,node,mesh} of colliders){
    const meshIndex=await writer.processMeshAsync(mesh);
    if(node)physics.get(node).collider.geometry.mesh=meshIndex;
    for(const primitive of writer.json.meshes[meshIndex].primitives)delete primitive.material;
    const shape=storedSnapshot.shapes[index];shape.mesh=meshIndex;delete shape.points;delete shape.indices;
    mesh.geometry.dispose();
   }
   for(const [a,b]of jointFrames)physics.get(a).joint.connectedNode=writer.nodeMap.get(b);
   writer.json.extensions||={};
   writer.json.extensions[SIMREADY_EXTENSION]=createSimreadyExtension({stageNode:writer.nodeMap.get(stage),snapshot:storedSnapshot,usdMetadata,bindings:bindings.map(({object,...identity})=>({node:writer.nodeMap.get(object),...identity})),mappingIssues});
   writer.extensionsUsed[SIMREADY_EXTENSION]=true;
   if(snapshot.bodies.length||snapshot.shapes.length||snapshot.joints.length||snapshot.groups.length)writer.extensionsRequired[SIMREADY_EXTENSION]=true;
   if(physics.size||snapshot.materials.length){
    writer.json.extensions[PHYSICS]={physicsMaterials:snapshot.materials.map(item=>({staticFriction:item.staticFriction,dynamicFriction:item.dynamicFriction,restitution:item.restitution})),physicsJoints};
    writer.extensionsUsed[PHYSICS]=true;
   }
   if(shapes.length){writer.json.extensions[SHAPES]={shapes};writer.extensionsUsed[SHAPES]=true;}
  })());},
 });
 exporter.register(plugin);
 try{assertCurrent();report('writing');const result=await exporter.parseAsync(stage,{binary:true,onlyVisible:false,maxTextureSize:textureResolution==='preview'?(textureExport?.maxTextureSize||512):Infinity});assertCurrent();report('complete',1,1);return result;}
  finally{exporter.unregister(plugin);}
 }finally{for(const material of ownedMaterials)material.dispose();for(const geometry of ownedGeometry)geometry.dispose();textureExport?.dispose();handle.setPlaying?.(wasPlaying);}
}
function createCollisionMesh(shape,material){
 const points=shape.points,indices=shape.indices,count=points?.length/3;
 if(!points?.length||!Number.isInteger(count)||!points.every(value=>Number.isFinite(value)&&value===Math.fround(value)))throw new Error(`Collider ${shape.path} requires positions exactly representable as glTF FLOAT/VEC3; export would otherwise lose precision.`);
 if(indices?.length&&(!indices.every(value=>Number.isInteger(value)&&value>=0&&value<count)||indices.length%3))throw new Error(`Collider ${shape.path} has invalid triangle indices.`);
 if(!indices?.length&&shape.approximation!=='convexHull'&&count%3)throw new Error(`Collider ${shape.path} has incomplete non-indexed triangles.`);
 const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(Float32Array.from(points),3));
 if(indices?.length)geometry.setIndex(Array.from(indices));
 const mesh=!indices?.length&&shape.approximation==='convexHull'?new Points(geometry,material):new Mesh(geometry,material);
 mesh.name=shape.path+' collision geometry';return mesh;
}
function implicitShape(shape){
 if(shape.type==='cube')return{type:'box',box:{size:shape.halfExtents.map(v=>v*2)}};
 if(shape.type==='sphere')return{type:'sphere',sphere:{radius:shape.radius}};
 if(shape.type==='plane')return{type:'plane',plane:{}};
 if(['capsule','cylinder','cone'].includes(shape.type)){const type=shape.type==='cone'?'cylinder':shape.type;return{type,[type]:{height:shape.halfHeight*2,radiusBottom:shape.radius,radiusTop:shape.type==='cone'?0:shape.radius}};}
 return null;
}
function projectJoint(joint,m,k){
 if(!['fixed','revolute','prismatic','spherical'].includes(joint.type)||joint.type==='spherical'&&joint.limit?.enabled)return null;
 const angular=joint.type==='revolute',axis=axisIndex(joint.axis),limits=[],drives=[];
 const lock=(key,values)=>{if(values.length)limits.push({[key]:values,min:0,max:0});};
 lock('linearAxes',joint.type==='prismatic'?axes.filter(a=>a!==axis):axes);
 if(joint.type!=='spherical')lock('angularAxes',angular?axes.filter(a=>a!==axis):axes);
 const factor=angular?Math.PI/180:m;
 if((angular||joint.type==='prismatic')&&joint.limit?.enabled)limits.push({[angular?'angularAxes':'linearAxes']:[axis],...(Number.isFinite(joint.limit.lower)?{min:joint.limit.lower*factor}:{}),...(Number.isFinite(joint.limit.upper)?{max:joint.limit.upper*factor}:{})});
 if((angular||joint.type==='prismatic')&&joint.drive?.enabled){const d=joint.drive,forceUnit=angular?k*m*m:k*m;drives.push({type:angular?'angular':'linear',axis,mode:d.acceleration?'acceleration':'force',positionTarget:d.targetPosition*factor,velocityTarget:d.targetVelocity*factor,stiffness:d.stiffness*(d.acceleration?1:forceUnit)/factor,damping:d.damping*(d.acceleration?1:forceUnit)/factor,...(Number.isFinite(d.forceLimit)?{maxForce:d.forceLimit*forceUnit}:{})});}
 return{limits,...(drives.length?{drives}:{})};
}

export {SIMREADY_EXTENSION} from '@needle-tools/simready';
