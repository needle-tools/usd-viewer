import {BufferAttribute,BufferGeometry,Color,Group,Matrix4,Mesh,MeshPhysicalMaterial,Points,Quaternion,Vector3} from 'three';
import {readUsdPhysics} from '../physics/readPhysics.js';
import {readRuntimeSemanticLabels,bindRuntimeSemanticLabels} from './semantics.js';
import {parseGltfBlob} from './blob.js';
import {materialTextures,prepareGltfTexture,textureCanonicalizer,cachePackedTextures,useGltfTextureTransforms,useEncodedGltfImages} from './textures.js';
import {coalesceGroups} from './groups.js';
import {needsUdimTiles,partitionUdimGeometry,selectGeometryRanges,udimSamplingMatrix} from './udim.js';

export const SIMREADY_EXTENSION='NEEDLE_simready';
const PHYSICS='KHR_physics_rigid_bodies',SHAPES='KHR_implicit_shapes';
const plain=value=>JSON.parse(JSON.stringify(value,(_key,v)=>ArrayBuffer.isView(v)?Array.from(v):v));
const contains=(parent,path)=>path===parent||path?.startsWith(parent+'/');
const pose=(position=[0,0,0],rotation=[0,0,0,1])=>new Matrix4().compose(new Vector3(...position),new Quaternion(...rotation),new Vector3(1,1,1));
const axes=[0,1,2],axisIndex=name=>({X:0,Y:1,Z:2})[name||'X'];

/** Export rigid visuals, physics and composed schema semantics. Supplying the
 * exporter keeps renderer/texture setup with the host. */
export async function exportSimreadyGltf({handle,exporter,snapshot,semantics,onProgress,textureResolution='original',output='arraybuffer',signal,capturePose,exportChangedPose=false,transformPng,binarySpool}){
 const report=(phase,completed=0,total=0)=>onProgress?.({phase,completed,total});
 if(!['preview','original'].includes(textureResolution))throw new RangeError('Invalid export texture resolution.');
 if(!['arraybuffer','blob'].includes(output))throw new RangeError('Invalid glTF export output.');
 let textureExport;
 const ownedMaterials=new Set(),ownedGeometry=new Set(),ownedTextures=new Set(),textureCopies=new WeakMap();
 const canonicalTexture=textureCanonicalizer(),tileTextureCopies=new WeakMap(),tilePartitions=new WeakMap(),textureCoordinates=new WeakMap();
 const wasPlaying=handle.isPlaying?.()||false;
 handle.setPlaying?.(false);
 try{
 report('physics');
 await handle.ready();await handle.materialsReady?.();
 if(signal?.aborted)throw new DOMException('Export cancelled','AbortError');
 textureExport=handle.createTextureExport?.({signal,resolution:textureResolution});
 const revision=handle.revision,time=handle.getTime?.();
 const assertCurrent=()=>{if(signal?.aborted)throw new DOMException('Export cancelled','AbortError');if(revision!==undefined&&revision!==handle.revision||time!==undefined&&time!==handle.getTime?.())throw new Error('USD stage changed during SimReady export; retry the export.');};
 // The stage reader returns an owned snapshot. Keep its collision buffers typed
 // instead of expanding them into JSON before the coordinate conversion.
 snapshot=snapshot?plain(snapshot):await readUsdPhysics(handle);
 if(!Number.isFinite(snapshot.metersPerUnit)||snapshot.metersPerUnit<=0||!Number.isFinite(snapshot.kilogramsPerUnit)||snapshot.kilogramsPerUnit<=0||!['X','Y','Z'].includes(snapshot.upAxis))throw new Error('SimReady export requires valid USD coordinates and units.');
 // The interactive inspector avoids extracting disabled mesh colliders. An
 // interchange export must retain their geometry too, so they can be enabled.
 for(const shape of snapshot.shapes)if(shape.type==='mesh'&&!shape.points?.length&&handle.readStage){
  const geometry=await handle.readStage((_stage,driver)=>driver?.GetPhysicsMeshBuffers?.(shape.path));
  if(geometry)Object.assign(shape,geometry);
 }
 report('metadata');
 semantics=semantics??await readRuntimeSemanticLabels(handle);
 const bodyTransforms=capturePose?.(exportChangedPose);
 handle.scene.updateWorldMatrix(true,true);
 const inverseRoot=handle.scene.matrixWorld.clone().invert();
 // Capture visible Hydra meshes and instances in the same frame as the physics bodies.
 const objects=[];
 handle.scene.traverseVisible(object=>{
  if(!(object.isMesh||object.isPoints||object.isLine||object.isCamera||object.isLight)||object.userData.usdHelperFor)return;
  const matrix=inverseRoot.clone().multiply(object.matrixWorld);
  const instances=object.isInstancedMesh?object.instanceMatrix?.array.slice(0,object.count*16):null;
  objects.push({object,matrix,instances});
 });
 if(exportChangedPose&&bodyTransforms?.size)for(const body of snapshot.bodies){
  const transform=bodyTransforms.get(body.path);
  if(transform)Object.assign(body,transform);
 }
 const sourceSnapshot=snapshot,m=sourceSnapshot.metersPerUnit;
 const up=sourceSnapshot.upAxis==='Z'?new Vector3(0,0,1):sourceSnapshot.upAxis==='X'?new Vector3(1,0,0):new Vector3(0,1,0);
 const conversion=new Matrix4().compose(new Vector3(),new Quaternion().setFromUnitVectors(up,new Vector3(0,1,0)),new Vector3(m,m,m));
 let simready;
 if(semantics.length||['bodies','shapes','joints','scenes','materials','groups','articulations','unsupported'].some(key=>snapshot[key]?.length)){
  try{
   simready=await import('@needle-tools/simready');
   if(typeof simready.createSimreadyRuntimeExtension!=='function')throw new Error('The SimReady runtime serializer is unavailable.');
  }
  catch(cause){throw new Error('Install @needle-tools/simready to preserve this asset’s SimReady or USD physics data in glTF export.',{cause});}
  for(const shape of sourceSnapshot.shapes)if(shape.type==='mesh')validateCollisionPositions(shape);
  const {toGltfPhysicsSnapshot}=await import('@needle-tools/simready/gltf');
  snapshot=toGltfPhysicsSnapshot(sourceSnapshot);
  // Source precision is checked before conversion. FLOAT accessors store the
  // converted metre positions at their normal Float32 precision.
  for(const shape of snapshot.shapes)if(shape.points)shape.points=Float32Array.from(shape.points);
 }
 report('geometry');
 const stage=new Group();stage.name='Asset';
 const bodies=new Map(),bindings=[],physics=new Map(),colliders=[],jointFrames=[],mappingIssues=[],portableMaterials=new Map(),authoredMaterials=new Map(),exportGeometries=new WeakMap(),untintedGeometry=new WeakMap(),exportMaterials=new Map(),groupGeometries=new WeakMap(),boundedMaterials=new Map();
 for(const body of snapshot.bodies){
  const node=new Group();node.name=body.path;node.position.fromArray(body.position);node.quaternion.fromArray(body.rotation);stage.add(node);bodies.set(body.path,node);
  const motion={isKinematic:!!body.kinematicBody};
  if(body.mass>0)motion.mass=body.mass;
  if(body.gravityScale!==undefined)motion.gravityFactor=body.gravityScale;
  if(body.centerOfMass)motion.centerOfMass=body.centerOfMass.map((v,i)=>v*(body.scale?.[i]??1));
  if(body.diagonalInertia?.every(value=>value>0))motion.inertiaDiagonal=body.diagonalInertia;
  else if(body.diagonalInertia)mappingIssues.push({path:body.path,reason:'Zero principal moments are retained in NEEDLE_simready; the rigid-body draft requires positive inertiaDiagonal components.'});
  if(body.principalAxes)motion.inertiaOrientation=body.principalAxes;
  const inverse=new Quaternion(...body.rotation).invert();
  if(body.linearVelocity)motion.linearVelocity=new Vector3(...body.linearVelocity).applyQuaternion(inverse).toArray();
  if(body.angularVelocity)motion.angularVelocity=new Vector3(...body.angularVelocity).applyQuaternion(inverse).toArray();
  physics.set(node,body.rigidBodyEnabled===false?{}:{motion});
  bindings.push({object:node,path:body.path});
 }
 const owners=[...bodies.keys()].sort((a,b)=>b.length-a.length);
 for(const {object,matrix,instances} of objects){
  if(object.isSkinnedMesh||object.morphTargetInfluences?.length)throw new Error('SimReady export currently requires rigid visuals.');
  for(let i=0;i<(instances?instances.length/16:object.isInstancedMesh?object.count:1);i++){
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
   const resolveMaterial=async source=>{
    if(source.userData?.usdGltfMaterial&&handle.readStage){
     if(!authoredMaterials.has(source)){
      const projected=await handle.readStage(stage=>source.userData.usdGltfMaterial({stage,time}));assertCurrent();
      if(projected){ownedMaterials.add(projected);mappingIssues.push({path,reason:projected.userData.usdGltfProjection});}
      authoredMaterials.set(source,projected||source);
     }
     source=authoredMaterials.get(source);
    }
    return materialFor(source);
   };
   const exportMaterial=async(material,tile,targetChannel)=>{
    if(!exportMaterials.has(material))exportMaterials.set(material,new Map());
    const variants=exportMaterials.get(material),variant=tile===undefined?'atlas':tile+':'+targetChannel;
    if(!variants.has(variant))variants.set(variant,(async()=>{
     let copy;
     const emission=material.emissive?.isColor?Math.max(material.emissive.r,material.emissive.g,material.emissive.b):1;
     if(emission>1){
      copy=material.clone();ownedMaterials.add(copy);
      copy.emissive.multiplyScalar(1/emission);copy.emissiveIntensity=(material.emissiveIntensity??1)*emission;
     }
     for(const [key] of materialTextures(material)){
      const tiled=tile!==undefined&&material[key].userData?.usdUdim;
      let original=textureExport?(tiled?await textureExport.getUdimTile(material[key],tile):await textureExport.getTexture(material[key])):material[key];assertCurrent();
      if(tiled){
       let channels=tileTextureCopies.get(original);if(!channels)tileTextureCopies.set(original,channels=new Map());
       if(!channels.has(targetChannel)){const texture=original.clone();texture.channel=targetChannel;ownedTextures.add(texture);channels.set(targetChannel,texture);}
       original=channels.get(targetChannel);
      }
      let copies=textureCopies.get(original);if(!copies)textureCopies.set(original,copies=new Map());
      if(!copies.has(key))copies.set(key,prepareGltfTexture(original,key,textureResolution,transformPng).then(portable=>{
       if(portable!==original)ownedTextures.add(portable);return portable;
      }));
      const texture=canonicalTexture(await copies.get(key));
      if(texture!==material[key]){copy??=material.clone();ownedMaterials.add(copy);copy[key]=texture;}
     }
     return copy||material;
    })());
    return variants.get(variant);
   };
   const sourceMaterials=object.material?[object.material].flat():[];
   const resolvedMaterials=await Promise.all(sourceMaterials.map(resolveMaterial));
   const plans=resolvedMaterials.map(material=>{
    const textures=materialTextures(material).map(([,texture])=>texture),udims=textures.filter(texture=>texture.userData?.usdUdim);
    if(textureResolution!=='original'||!udims.some(needsUdimTiles))return null;
    if(!textureExport?.getUdimTile)throw new Error('Oversized UDIM export requires a texture scope with individual source tiles.');
    const channel=udims[0].channel||0,matrix=udimSamplingMatrix(udims[0]);
    if(udims.some(texture=>(texture.channel||0)!==channel||udimSamplingMatrix(texture).elements.some((value,index)=>Math.abs(value-matrix.elements[index])>1e-7)))throw new Error('Oversized UDIM maps require matching UV channels and transforms.');
    let targetChannel=channel;
    if(textures.some(texture=>!texture.userData?.usdUdim&&(texture.channel||0)===channel)){
     targetChannel=['uv','uv1','uv2','uv3'].findIndex((name,index)=>!object.geometry.attributes[name]&&!textures.some(texture=>(texture.channel||0)===index));
     if(targetChannel<0)throw new Error('Oversized UDIM export requires a free UV channel for mixed texture layouts.');
    }
    return{matrix,channel,targetChannel,udims};
   });
   let geometry=object.geometry;
   if(geometry){
    if(!exportGeometries.has(geometry)){
     const projected=projectGeometry(geometry);
     if(projected.geometry!==geometry)ownedGeometry.add(projected.geometry);
     exportGeometries.set(geometry,projected);
    }
    geometry=exportGeometries.get(geometry).geometry;
   }
   const parts=[];
   if(plans.some(Boolean)){
    if(!object.isMesh)throw new Error('Oversized UDIM export requires triangle meshes.');
    for(const [materialIndex,material]of resolvedMaterials.entries()){
     const ranges=geometry.groups.length?geometry.groups.filter(group=>group.materialIndex===materialIndex):materialIndex===0?[{start:0,count:geometry.index?.count||geometry.attributes.position.count}]:[];
     if(!ranges.length)continue;
     const plan=plans[materialIndex];
     if(plan){
      let cache=tilePartitions.get(geometry);if(!cache)tilePartitions.set(geometry,cache=new Map());
      const key=JSON.stringify([plan.channel,plan.targetChannel,plan.matrix.elements,ranges]);
      if(!cache.has(key)){
       const partitions=partitionUdimGeometry(geometry,{...plan,ranges});
       for(const part of partitions)ownedGeometry.add(part.geometry);
       cache.set(key,partitions);
      }
      for(const part of cache.get(key)){
       if(part.u<0||part.u>9||part.v<0||part.v>9)throw new Error('Oversized UDIM mesh samples outside the supported tile range: '+part.tile);
       parts.push({geometry:part.geometry,materials:await exportMaterial(material,part.tile,plan.targetChannel)});
      }
      mappingIssues.push({path,reason:'Oversized UDIM atlas is represented by individual full-resolution tile materials.'});
     }else{
      const copy=selectGeometryRanges(geometry,ranges);ownedGeometry.add(copy);
      if(copy.index.count)parts.push({geometry:copy,materials:await exportMaterial(material)});
     }
    }
   }else{
    const materials=await Promise.all(resolvedMaterials.map(material=>exportMaterial(material)));
    parts.push({geometry,materials:Array.isArray(object.material)?materials:materials[0]});
   }
   const tintedMaterials=new Map(),tint=new Color();if(object.instanceColor)object.getColorAt(i,tint);
   for(const part of parts){
    let geometry=part.geometry,materials=part.materials;
    if(object.instanceColor){const tinted=material=>{if(!tintedMaterials.has(material)){const copy=material.clone();copy.color.multiply(tint);ownedMaterials.add(copy);tintedMaterials.set(material,copy);}return tintedMaterials.get(material);};materials=Array.isArray(materials)?materials.map(tinted):tinted(materials);}
    const bounded=material=>{
     if(!material?.color?.isColor)return material;
     const rgb=material.color.toArray();
     if(!rgb.every(Number.isFinite))throw new Error('glTF base colors require finite linear RGB values.');
     if(rgb.every(value=>value>=0&&value<=1))return material;
     if(!boundedMaterials.has(material)){
      const copy=material.clone();copy.color.setRGB(...rgb.map(value=>Math.max(0,Math.min(1,value))));
      copy.userData={...copy.userData,usdGltfUnclampedBaseColor:rgb};ownedMaterials.add(copy);boundedMaterials.set(material,copy);
     }
     mappingIssues.push({path,reason:'Base color outside the glTF [0, 1] range is clamped; unclamped linear RGB is retained in material extras.'});
     return boundedMaterials.get(material);
    };
    materials=Array.isArray(materials)?materials.map(bounded):bounded(materials);
    if(geometry&&object.isMesh){const grouped=coalesceGroups(geometry,materials,groupGeometries);if(grouped.geometry!==geometry)ownedGeometry.add(grouped.geometry);geometry=grouped.geometry;materials=grouped.materials;}
    const usedMaterials=Array.isArray(materials)?geometry.groups.filter(group=>group.count>0).map(group=>materials[group.materialIndex]):[materials];
    if(geometry?.attributes.position){
     const projected=projectTextureCoordinates(geometry,usedMaterials,textureCoordinates);
     if(projected.geometry!==geometry)ownedGeometry.add(projected.geometry);
     geometry=projected.geometry;
     if(projected.missing.length)mappingIssues.push({path,reason:`Missing texture coordinates ${projected.missing.join(', ')} are represented by the rendered constant (0, 0).`});
    }
    if(geometry?.getAttribute('color')&&!usedMaterials.some(material=>material?.vertexColors)){
     if(!untintedGeometry.has(geometry)){const copy=geometry.clone();copy.deleteAttribute('color');untintedGeometry.set(geometry,copy);ownedGeometry.add(copy);}
     geometry=untintedGeometry.get(geometry);
    }
    const mesh=object.isMesh?new Mesh(geometry,materials):object.clone(false);
    if(geometry)mesh.geometry=geometry;if(materials)mesh.material=materials;
    mesh.name=path;mesh.userData={};mesh.matrixAutoUpdate=false;
    mesh.matrix.copy(conversion);
    const correction=!exportChangedPose&&bodyTransforms?.get(owner);
    if(correction)mesh.matrix.multiply(correction);
    mesh.matrix.multiply(matrix);
    if(instances)mesh.matrix.multiply(new Matrix4().fromArray(instances,i*16));
    if(object.isCamera||object.isLight){
     mesh.matrix.scale(new Vector3(1/m,1/m,1/m));
     if(object.isCamera)for(const key of ['near','far','left','right','top','bottom'])if(Number.isFinite(mesh[key]))mesh[key]*=m;
     if(object.isLight&&Number.isFinite(mesh.distance))mesh.distance*=m;
    }
    if(owner){const body=snapshot.bodies.find(item=>item.path===owner);mesh.matrix.premultiply(pose(body.position,body.rotation).invert());}
    (bodies.get(owner)||stage).add(mesh);bindings.push({object:mesh,path,body:owner||'',...(identity?{instance:plain(identity)}:{})});
   }
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
  // The physics draft permits concave triangle surfaces. Preserve the authored
  // collision mesh as that portable approximation; a single convex hull would
  // close cavities. NEEDLE_simready retains the original cooking method.
  if(record&&['sdf','convexDecomposition'].includes(shape.approximation))mappingIssues.push({path:shape.path,reason:'USD '+shape.approximation+' collision is projected as its authored triangle surface; the original approximation remains in NEEDLE_simready.'});
  if(!parameters&&!(record&&['none','convexHull','sdf','convexDecomposition',undefined].includes(shape.approximation))){mappingIssues.push({path:shape.path,reason:'Collider geometry and settings are retained in NEEDLE_simready; no exact Khronos physics projection is available.'});continue;}
  const node=new Group();node.name=shape.path+' collider';node.position.fromArray(shape.position||[0,0,0]);node.quaternion.fromArray(shape.rotation||[0,0,0,1]);(bodies.get(shape.body)||stage).add(node);
  const geometry={};
  if(parameters){geometry.shape=shapes.length;shapes.push(parameters);if(['plane','capsule','cylinder','cone'].includes(shape.type))node.quaternion.multiply(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),new Vector3(...(shape.axis==='Y'?[0,1,0]:shape.axis==='Z'?[0,0,1]:[1,0,0]))));}
  else{record.node=node;node.scale.fromArray(shape.meshScale||[1,1,1]);geometry.convexHull=shape.approximation==='convexHull';}
  const material=snapshot.materials.findIndex(item=>shape.materials?.includes(item.path));
  physics.set(node,{collider:{geometry,...(material>=0?{physicsMaterial:material}:{})}});
 }
 const physicsJoints=[];
 for(const joint of snapshot.joints){
  if(joint.jointEnabled===false)continue;
  const projected=projectJoint(joint);
  if(!projected){mappingIssues.push({path:joint.path,reason:'Joint is retained in NEEDLE_simready; no exact Khronos projection is available.'});continue;}
  const frames=[0,1].map(end=>{const node=new Group();node.name=joint.path+' frame '+end;node.position.fromArray(joint['position'+end]||[0,0,0]);node.quaternion.fromArray(joint['rotation'+end]||[0,0,0,1]);(bodies.get(joint['body'+end])||stage).add(node);return node;});
  physics.set(frames[0],{joint:{joint:physicsJoints.length,enableCollision:!!joint.collisionEnabled}});jointFrames.push(frames);physicsJoints.push(projected);
 }
 for(const scene of snapshot.scenes)mappingIssues.push({path:scene.path,reason:'USD scene gravity and ownership are retained in NEEDLE_simready.'});
 for(const group of snapshot.groups)mappingIssues.push({path:group.path,reason:'USD collision-group semantics are retained in NEEDLE_simready.'});
 for(const body of snapshot.bodies)if(body.startsAsleep||body.density>0||body.filteredCollisions?.length||body.simulationOwners?.length)mappingIssues.push({path:body.path,reason:'USD sleep state, density inheritance, collision filters or simulation ownership require NEEDLE_simready.'});
 for(const shape of snapshot.shapes)if(shape.filteredCollisions?.length||shape.collisionGroups?.length||shape.simulationOwners?.length||shape.density>0||shape.mass>0||shape.centerOfMass||shape.diagonalInertia||shape.principalAxes)mappingIssues.push({path:shape.path,reason:'USD collider filtering, ownership or local mass overrides require NEEDLE_simready.'});
 for(const joint of snapshot.joints)if(joint.mimic||Number.isFinite(joint.breakForce)||Number.isFinite(joint.breakTorque))mappingIssues.push({path:joint.path,reason:'USD joint coupling or breaking thresholds require NEEDLE_simready.'});
 stage.updateMatrixWorld(true);
 const vertexColorMaterials=new Set();
 const plugin=writer=>{
 cachePackedTextures(writer);
 useGltfTextureTransforms(writer);
 useEncodedGltfImages(writer,transformPng);
 return {
  name:SIMREADY_EXTENSION,
  async writeMaterialAsync(material,definition){delete definition.extras;if(material.vertexColors)vertexColorMaterials.add(definition);},
  writeTexture(_texture,definition){delete definition.extras;},
  writeMesh(mesh,definition){
   delete definition.extras;
   // glTF always multiplies COLOR_0 into the material. Hydra also carries
   // displayColor on textured meshes whose material explicitly ignores it.
   definition.primitives.forEach(primitive=>{
    if(!vertexColorMaterials.has(writer.json.materials?.[primitive.material])){primitive.attributes={...primitive.attributes};delete primitive.attributes.COLOR_0;}
   });
  },
  writeNode(object,definition){if(physics.has(object))(definition.extensions||={})[PHYSICS]=physics.get(object);},
  afterParse(){writer.pending.push((async()=>{
   // Collision buffers have already been staged as glTF meshes.
   const storedSnapshot={...snapshot,shapes:snapshot.shapes.map(({points,indices,...shape})=>shape)};
   for(const {index,node,mesh} of colliders){
    const meshIndex=await (writer.processMeshAsync?writer.processMeshAsync(mesh):writer.processMesh(mesh));
    if(node)physics.get(node).collider.geometry.node=writer.json.nodes.push({mesh:meshIndex})-1;
    for(const primitive of writer.json.meshes[meshIndex].primitives)delete primitive.material;
    storedSnapshot.shapes[index].mesh=meshIndex;
    mesh.geometry.dispose();
   }
   for(const [a,b]of jointFrames)physics.get(a).joint.connectedNode=writer.nodeMap.get(b);
   if(simready){
    writer.json.extensions||={};
    const options={stageNode:writer.nodeMap.get(stage),snapshot:storedSnapshot,semantics:bindRuntimeSemanticLabels(semantics,bindings),bindings:bindings.map(({object,path,body})=>({node:writer.nodeMap.get(object),path,...(body?{body}:{})})),mappingIssues};
    writer.json.extensions[SIMREADY_EXTENSION]=simready.createSimreadyRuntimeExtension(options);
    writer.extensionsUsed[SIMREADY_EXTENSION]=true;
   }
   if(physics.size||snapshot.materials.length){
    const tables={};
    if(snapshot.materials.length)tables.physicsMaterials=snapshot.materials.map(item=>({staticFriction:item.staticFriction,dynamicFriction:item.dynamicFriction,restitution:item.restitution}));
    if(physicsJoints.length)tables.physicsJoints=physicsJoints;
    (writer.json.extensions??={})[PHYSICS]=tables;
    writer.extensionsUsed[PHYSICS]=true;
   }
   if(shapes.length){writer.json.extensions[SHAPES]={shapes};writer.extensionsUsed[SHAPES]=true;}
  })());},
 };
 };
 exporter.register(plugin);
 try{assertCurrent();report('writing');const options={binary:true,onlyVisible:false,maxTextureSize:textureResolution==='preview'?(textureExport?.maxTextureSize||512):Infinity};const result=output==='blob'?await parseGltfBlob(exporter,stage,{...options,signal,binarySpool}):await exporter.parseAsync(stage,options);assertCurrent();report('complete',1,1);return result;}
  finally{exporter.unregister(plugin);}
 }finally{for(const material of ownedMaterials)material.dispose();for(const geometry of ownedGeometry)geometry.dispose();for(const texture of ownedTextures)texture.dispose();textureExport?.dispose();handle.setPlaying?.(wasPlaying);}
}
function projectGeometry(source){
 const supported=new Set(['position','normal','tangent','color','uv','uv1','uv2','uv3']);
 const unknown=Object.keys(source.attributes).filter(name=>!supported.has(name));
 if(!unknown.length&&!Object.keys(source.userData).length)return{geometry:source};
 const geometry=copyGeometry(source);geometry.userData={};
 for(const name of unknown)geometry.deleteAttribute(name);
 return{geometry};
}
function projectTextureCoordinates(source,materials,cache){
 const uvs=['uv','uv1','uv2','uv3'];
 const required=new Set(materials.filter(Boolean).flatMap(material=>materialTextures(material).map(([,texture])=>texture.channel||0)));
 if([...required].some(channel=>!Number.isInteger(channel)||channel<0||channel>=uvs.length))throw new Error('glTF export supports texture coordinate channels 0 through 3.');
 const missing=[...required].filter(channel=>!source.attributes[uvs[channel]]).sort();
 const last=Math.max(uvs.findLastIndex(name=>source.attributes[name]),...required);
 const gaps=uvs.slice(0,last+1).some(name=>!source.attributes[name]);
 if(!gaps)return{geometry:source,missing:[]};
 let variants=cache.get(source);if(!variants)cache.set(source,variants=new Map());
 const key=missing.join(',');
 if(!variants.has(key)){
  const geometry=copyGeometry(source);
  if(missing.length){
   const zero=new BufferAttribute(new Float32Array(source.attributes.position.count*2),2);
   for(const channel of missing)geometry.setAttribute(uvs[channel],zero);
  }
  // glTF requires contiguous TEXCOORD sets. Alias unused gaps, but preserve
  // WebGL's constant (0, 0) for a missing channel sampled by a texture.
  let previous=uvs.map(name=>geometry.attributes[name]).find(Boolean);
  for(let channel=0;channel<=last;channel++){
   if(geometry.attributes[uvs[channel]])previous=geometry.attributes[uvs[channel]];
   else geometry.setAttribute(uvs[channel],previous);
  }
  variants.set(key,geometry);
 }
 return{geometry:variants.get(key),missing:missing.map(channel=>uvs[channel])};
}
function copyGeometry(source){
 const geometry=new BufferGeometry();geometry.index=source.index;geometry.attributes={...source.attributes};
 geometry.groups=source.groups.map(group=>({...group}));geometry.drawRange={...source.drawRange};
 geometry.morphAttributes={...source.morphAttributes};geometry.morphTargetsRelative=source.morphTargetsRelative;
 geometry.userData={...source.userData};return geometry;
}
function createCollisionMesh(shape,material){
 const points=shape.points,indices=shape.indices,count=points?.length/3;
 validateCollisionPositions(shape);
 if(indices?.length&&(!indices.every(value=>Number.isInteger(value)&&value>=0&&value<count)||indices.length%3))throw new Error(`Collider ${shape.path} has invalid triangle indices.`);
 if(!indices?.length&&shape.approximation!=='convexHull'&&count%3)throw new Error(`Collider ${shape.path} has incomplete non-indexed triangles.`);
 const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(points,3));
 if(indices?.length)geometry.setIndex(Array.from(indices));
 const mesh=!indices?.length&&shape.approximation==='convexHull'?new Points(geometry,material):new Mesh(geometry,material);
 mesh.name=shape.path+' collision geometry';return mesh;
}
function validateCollisionPositions(shape){
 const points=shape.points,count=points?.length/3;
 if(!points?.length||!Number.isInteger(count)||!points.every(value=>Number.isFinite(value)&&value===Math.fround(value)))throw new Error(`Collider ${shape.path} requires positions exactly representable as glTF FLOAT/VEC3; export would otherwise lose precision.`);
}
function implicitShape(shape){
 if(shape.type==='cube'&&shape.halfExtents.every(value=>value>0))return{type:'box',box:{size:shape.halfExtents.map(v=>v*2)}};
 if((shape.type==='sphere'||(shape.type==='capsule'&&shape.halfHeight===0))&&shape.radius>0)return{type:'sphere',sphere:{radius:shape.radius}};
 if(shape.type==='plane')return{type:'plane',plane:{}};
 if(['capsule','cylinder','cone'].includes(shape.type)&&shape.halfHeight>0&&shape.radius>0){const type=shape.type==='cone'?'cylinder':shape.type;return{type,[type]:{height:shape.halfHeight*2,radiusBottom:shape.radius,radiusTop:shape.type==='cone'?0:shape.radius}};}
 return null;
}
function projectJoint(joint){
 if(!['fixed','revolute','prismatic','spherical'].includes(joint.type)||joint.type==='spherical'&&joint.limit?.enabled)return null;
 const angular=joint.type==='revolute',axis=axisIndex(joint.axis),limits=[],drives=[];
 const lock=(key,values)=>{if(values.length)limits.push({[key]:values,min:0,max:0});};
 lock('linearAxes',joint.type==='prismatic'?axes.filter(a=>a!==axis):axes);
 if(joint.type!=='spherical')lock('angularAxes',angular?axes.filter(a=>a!==axis):axes);
 if((angular||joint.type==='prismatic')&&joint.limit?.enabled)limits.push({[angular?'angularAxes':'linearAxes']:[axis],...(Number.isFinite(joint.limit.lower)?{min:joint.limit.lower}:{}),...(Number.isFinite(joint.limit.upper)?{max:joint.limit.upper}:{} )});
 if((angular||joint.type==='prismatic')&&joint.drive?.enabled){const d=joint.drive;drives.push({type:angular?'angular':'linear',axis,mode:d.acceleration?'acceleration':'force',positionTarget:d.targetPosition,velocityTarget:d.targetVelocity,stiffness:d.stiffness,damping:d.damping,...(Number.isFinite(d.forceLimit)?{maxForce:d.forceLimit}:{})});}
 return{limits,...(drives.length?{drives}:{})};
}
