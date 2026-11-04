import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group,Mesh,InstancedMesh,Matrix4,Vector3,BoxGeometry,MeshStandardMaterial,ShaderMaterial,Float32BufferAttribute,Texture,Points,PointsMaterial,LineSegments,LineBasicMaterial,PerspectiveCamera,PointLight} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {exportSimreadyGltf} from '../../src/gltf/simready.js';
import {registerSimreadyLoader} from '@needle-tools/simready/gltf';
import R from '@dimforge/rapier3d-compat';
import {readFile} from 'node:fs/promises';
import {getUsdModule} from '../runtime.mjs';
import {createThreeHydra} from '../../src/create.three.js';
import {createUsdPhysics,readUsdPhysics} from '../../src/physics/createPhysics.js';

// Three's exporter uses FileReader in Node as well as in the browser.
globalThis.FileReader ||= class {
 readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
 readAsDataURL(blob){blob.arrayBuffer().then(value=>{this.result=`data:${blob.type};base64,${Buffer.from(value).toString('base64')}`;this.onloadend?.();});}
};
globalThis.ProgressEvent ||= class {};
await R.init();
export function fixture(){
 const root=new Group();
 for(const [path,position] of [['/Base',[0,0,0]],['/Door',[0,0,0]],['/Knob',[1,0,0]]]){
  const mesh=new Mesh(new BoxGeometry(.2,.2,.2),new MeshStandardMaterial());mesh.userData.usdPath=path+'/Visual';mesh.position.fromArray(position);root.add(mesh);
 }
 const q=[0,0,0,1],body=(path,position)=>({path,position,rotation:q,scale:[1,1,1],mass:2,rigidBodyEnabled:true,linearVelocity:[0,0,0],angularVelocity:[0,0,0]});
 const snapshot={metersPerUnit:1,kilogramsPerUnit:1,upAxis:'Y',scenes:[{path:'/Scene',gravityDirection:[0,-1,0],gravityMagnitude:0}],
  bodies:[body('/Base',[0,0,0]),body('/Door',[0,0,0]),body('/Knob',[1,0,0])],
  shapes:[{path:'/Knob/Collision',body:'/Knob',type:'cube',halfExtents:[.1,.1,.1],position:[0,0,0],rotation:q,materials:[]}],
  joints:[{path:'/Hinge',type:'revolute',body0:'/Base',body1:'/Door',axis:'Z',position0:[0,0,0],position1:[0,0,0],rotation0:q,rotation1:q,limit:{enabled:true,lower:0,upper:90}},
   {path:'/Fixed',type:'fixed',body0:'/Door',body1:'/Knob',position0:[1,0,0],position1:[0,0,0],rotation0:q,rotation1:q}],materials:[],groups:[],unsupported:[]};
 const usdMetadata={version:1,time:0,stage:{customLayerData:{SimReady_Metadata:{profile:'fixture'}}},prims:[]};
 return {root,snapshot,usdMetadata,handle:{scene:root,ready:async()=>{},materialsReady:async()=>{},setPlaying(){},readStage:async()=>usdMetadata,
  exportUsdz:async()=>{throw new Error('Source packaging must not run during glTF export.');}}};
}
test('exports standard constraints and semantic metadata without embedding original USD',async()=>{
 const f=fixture(),bytes=await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()});
 const result=await registerSimreadyLoader(new GLTFLoader()).parseAsync(bytes,'');
 const data=result.userData.simready;
 assert.equal(data.handle,undefined,'glTF runtime has no USD/Hydra handle');assert.deepEqual(data.snapshot,f.snapshot);assert.deepEqual(data.usdMetadata,f.usdMetadata);
 assert.equal(result.parser.json.extensions.NEEDLE_simready.source,undefined);
 assert.equal(result.parser.json.extensions.KHR_physics_rigid_bodies.physicsJoints.length,2);
 const mechanism=await data.createMechanism();
 assert.deepEqual(mechanism.unsupported,[]);assert.equal(mechanism.setJointValue('/Hinge',150),true);
 assert.ok(Math.abs(mechanism.getJointValue('/Hinge')-90)<1e-4);
 assert.ok(Math.abs(mechanism.bodies.get('/Knob').body.translation().y-1)<1e-4);
 mechanism.dispose();
 const sim=await data.createSimulation({rapier:R,allowPartial:false});
 sim.play();for(let i=0;i<60;i++)sim.update(1/120);assert.deepEqual(sim.unsupported,[]);sim.dispose();
});
test('ordinary stages retain cameras, lights, lines and points without requiring the SimReady runtime',async()=>{
 const f=fixture();
 for(const key of ['bodies','shapes','joints','scenes','materials','groups'])f.snapshot[key]=[];
 f.usdMetadata={version:1,time:0,stage:{customLayerData:{author:'Fixture author'}},prims:[{path:'/Base',type:'Mesh',attributes:[{name:'user:label',type:'string',value:'simready'}]}]};
 for(const [path,object] of [
  ['/Camera',new PerspectiveCamera(45,1,.1,100)],
  ['/Light',new PointLight(0xffcc88,4)],
  ['/Points',new Points(new BoxGeometry(),new PointsMaterial())],
  ['/Lines',new LineSegments(new BoxGeometry(),new LineBasicMaterial())],
 ]){object.userData.usdPath=path;object.position.set(1,2,3);f.root.add(object);}
 const bytes=await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,usdMetadata:f.usdMetadata,exporter:new GLTFExporter()});
 const result=await new GLTFLoader().parseAsync(bytes,''),json=result.parser.json;
 for(const path of ['/Camera','/Light','/Points','/Lines']){
  const index=json.nodes.findIndex(node=>node.name===path);assert.ok(index>=0,path+' must be retained');
  const object=await result.parser.getDependency('node',index);assert.deepEqual(object.position.toArray(),[1,2,3]);
 }
 assert.ok(json.cameras?.length);
 assert.ok(json.extensions.KHR_lights_punctual?.lights.length);
 assert.ok(json.meshes.some(mesh=>mesh.primitives.some(primitive=>primitive.mode===0)));
 assert.ok(json.meshes.some(mesh=>mesh.primitives.some(primitive=>primitive.mode===1)));
 assert.ok(!json.extensionsRequired?.includes('NEEDLE_simready'));
 assert.ok(!json.extensionsUsed?.includes('NEEDLE_simready'));
 assert.equal(json.extensions?.NEEDLE_simready,undefined);
 assert.equal(result.userData.simready,undefined);
 assert.ok(!json.extensionsUsed?.includes('KHR_physics_rigid_bodies'));
});
test('authored SimReady metadata and physics-only stages retain their data without inventing bodies',async()=>{
 const metadata={version:1,time:0,stage:{},prims:[]};
 const cases=[
  {metadata:{...metadata,stage:{customLayerData:{SimReady_Metadata:{profile:'fixture'}}}}},
  {metadata:{...metadata,prims:[{path:'/Base',type:'Xform',attributes:[{name:'simready:category',type:'string',value:'fixture'}]}]}},
  {metadata:{...metadata,prims:[{path:'/Base',type:'Xform',metadata:{apiSchemas:['PhysxArticulationAPI']}}]}},
  {key:'scenes',value:[{path:'/Scene',gravityDirection:[0,-1,0],gravityMagnitude:9.81}]},
  {key:'materials',value:[{path:'/Friction',staticFriction:.5,dynamicFriction:.4,restitution:0}]},
 ];
 for(const example of cases){
  const f=fixture();for(const key of ['bodies','shapes','joints','scenes','materials','groups'])f.snapshot[key]=[];
  if(example.key)f.snapshot[example.key]=example.value;
  const usdMetadata=example.metadata||metadata;
  const bytes=await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,usdMetadata,exporter:new GLTFExporter()});
  const result=await registerSimreadyLoader(new GLTFLoader()).parseAsync(bytes,'');
  assert.deepEqual(result.userData.simready.snapshot,f.snapshot);
  assert.deepEqual(result.userData.simready.usdMetadata,usdMetadata);
  assert.deepEqual(result.userData.simready.snapshot.bodies,[]);
  assert.ok(!result.parser.json.extensionsRequired?.includes('NEEDLE_simready'));
 }
});
test('metadata encoding preserves special numbers, integer precision and typed arrays',async()=>{
 const f=fixture();
 f.usdMetadata.prims=[{path:'/Base',type:'Xform',attributes:[
  {name:'simready:limit',type:'double',value:Infinity},
  {name:'simready:identity',type:'uint64',value:18446744073709551615n},
  {name:'simready:samples',type:'float[]',value:new Float32Array([.25,.5])},
 ]}];
 const bytes=await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,usdMetadata:f.usdMetadata,exporter:new GLTFExporter()});
 const result=await registerSimreadyLoader(new GLTFLoader()).parseAsync(bytes,'');
 assert.deepEqual(result.userData.simready.usdMetadata.prims[0].attributes.map(attribute=>attribute.value),[
  {$usdNumber:'Infinity'},{$usdInteger:'18446744073709551615'},[.25,.5],
 ]);
});
test('exports visible instances once and excludes hidden prototypes and hidden parent subtrees',async()=>{
 const f=fixture(),prototype=f.root.children[0];prototype.visible=false;
 const instances=new InstancedMesh(prototype.geometry,prototype.material,1);instances.userData.usdPath=prototype.userData.usdPath;f.root.add(instances);
 f.handle.resolvePick=async()=>({path:prototype.userData.usdPath,instances:[]});
 const hidden=new Group();hidden.visible=false;const mesh=new Mesh(prototype.geometry,prototype.material);mesh.userData.usdPath='/Hidden/Visual';hidden.add(mesh);f.root.add(hidden);
 const gltf=await registerSimreadyLoader(new GLTFLoader()).parseAsync(await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()}),'');
 const bindings=gltf.parser.json.extensions.NEEDLE_simready.bindings;
 assert.equal(bindings.filter(binding=>binding.path===prototype.userData.usdPath).length,1);
 assert.ok(!bindings.some(binding=>binding.path==='/Hidden/Visual'));
});
test('exports displayColor only for primitives whose material actually uses vertex colors',async()=>{
 const f=fixture(),mesh=f.root.children[0],geometry=mesh.geometry;
 geometry.setAttribute('color',new Float32BufferAttribute(Array.from({length:geometry.getAttribute('position').count*3},(_,index)=>index%3===1?1:0),3));
 const plain=new MeshStandardMaterial(),colored=new MeshStandardMaterial({vertexColors:true});
 mesh.material=[plain,colored];geometry.clearGroups();geometry.addGroup(0,18,0);geometry.addGroup(18,18,1);
 const gltf=await registerSimreadyLoader(new GLTFLoader()).parseAsync(await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()}),'');
 const definition=gltf.parser.json.meshes.find(mesh=>mesh.primitives.length===2);
 assert.equal(definition.primitives[0].attributes.COLOR_0,undefined);
 assert.ok(Number.isInteger(definition.primitives[1].attributes.COLOR_0));
 assert.ok(geometry.getAttribute('color'),'source displayColor remains intact');
});
test('rejects unsupported versions and missing identities instead of silently loading incomplete physics',async()=>{
 const f=fixture();f.snapshot.bodies[0].path='/Unbound';
 // A body without visible geometry is valid; an unresolved render instance is not.
 const mesh=f.root.children[0];mesh.isInstancedMesh=true;mesh.count=2;
 await assert.rejects(exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()}),/instance identit/i);
 const json={asset:{version:'2.0'},scene:0,scenes:[{}],extensionsUsed:['NEEDLE_simready'],extensionsRequired:['NEEDLE_simready'],extensions:{NEEDLE_simready:{version:99}}};
 await assert.rejects(registerSimreadyLoader(new GLTFLoader()).parseAsync(JSON.stringify(json),''),/version/);
});
test('export freezes and restores playback, and refuses a stage edited during metadata extraction',async()=>{
 const f=fixture(),changes=[];let playing=true;
 f.handle.revision=1;f.handle.isPlaying=()=>playing;f.handle.setPlaying=value=>{playing=value;changes.push(value);};
 f.handle.getTime=()=>3;
 await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()});
 assert.deepEqual(changes,[false,true]);assert.equal(playing,true);
 f.handle.readStage=async()=>{f.handle.revision++;return f.usdMetadata;};
 await assert.rejects(exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()}),/stage changed/);
 assert.equal(playing,true,'failure also restores playback');
});
test('native USD extraction, GLB, contacts/drives and joint manipulation agree in centimeter Z-up stages',async()=>{
 const USD=await getUsdModule({print(){},printErr(){}});
 const buffer=await readFile(new URL('../fixtures/simready/assembly.usda',import.meta.url));
 const handle=await createThreeHydra({USD,scene:new Group(),url:'assembly.usda',buffer,autoPlay:false});
 let original,converted,mechanism;
 try{
  const snapshot=await readUsdPhysics(handle);
  const bytes=await exportSimreadyGltf({handle,snapshot,exporter:new GLTFExporter()});
  const result=await registerSimreadyLoader(new GLTFLoader()).parseAsync(bytes,''),runtime=result.userData.simready;
  assert.deepEqual(runtime.snapshot,snapshot);
  original=await createUsdPhysics({handle,snapshot,rapier:R,allowPartial:false});converted=await runtime.createSimulation({rapier:R});
  original.play();converted.play();
  for(let i=0;i<240;i++){original.update(1/120);converted.update(1/120);}
  for(const [path,{body}]of original.bodies){
   assert.deepEqual({...converted.bodies.get(path).body.translation()},{...body.translation()});
   assert.deepEqual({...converted.bodies.get(path).body.rotation()},{...body.rotation()});
   assert.equal(converted.bodies.get(path).body.mass(),body.mass());
  }
  assert.ok(converted.bodies.get('/Assembly/Slider').body.translation().x>20,'the authored slider drive actually runs');
  converted.dispose();converted=null;original.dispose();original=null;
  mechanism=await runtime.createMechanism();assert.deepEqual(mechanism.unsupported,[]);
  assert.equal(mechanism.setJointValue('/Assembly/Hinge',120),true);assert.ok(Math.abs(mechanism.getJointValue('/Assembly/Hinge')-90)<1e-4);
  assert.ok(Math.abs(mechanism.bodies.get('/Assembly/Knob').body.translation().y-100)<1e-4);
  assert.equal(mechanism.setJointValue('/Assembly/Slide',100),true);assert.ok(Math.abs(mechanism.getJointValue('/Assembly/Slide')-50)<1e-4);
  const assembly=runtime.usdMetadata.prims.find(prim=>prim.path==='/Assembly');
  assert.equal(assembly.attributes.find(attribute=>attribute.name==='simready:category').value,'regression assembly');
  assert.equal(runtime.usdMetadata.stage.customLayerData.SimReady_Metadata.profile,'regression');
  assert.deepEqual(assembly.attributes.find(attribute=>attribute.name==='simready:safetyMargin').value,{$usdNumber:'Infinity'});
  assert.deepEqual(assembly.attributes.find(attribute=>attribute.name==='simready:sampledValue').samples,[{time:0,value:2},{time:1,value:4}]);
  assert.deepEqual(assembly.relationships.find(relation=>relation.name==='simready:movableParts').targets,['/Assembly/Door','/Assembly/Slider']);
  assert.equal(runtime.usdMetadata.prims.find(prim=>prim.path==='/Assembly/Slide').attributes.find(attribute=>attribute.name==='drive:linear:physics:vendorLimit').value,123,'unknown vendor parameters are retained rather than mistaken for mapped physics');
  const hingeMetadata=runtime.usdMetadata.prims.find(prim=>prim.path==='/Assembly/Hinge');
  assert.ok(Math.abs(hingeMetadata.attributes.find(attribute=>attribute.name==='physxJoint:armature').value-.03)<1e-6);
  assert.ok(Math.abs(hingeMetadata.attributes.find(attribute=>attribute.name==='mjc:frictionloss').value-.3)<1e-6);
  assert.ok(!runtime.usdMetadata.prims.some(prim=>prim.attributes?.some(attribute=>['physics:mass','physics:lowerLimit'].includes(attribute.name))),'canonical static physics values are stored once in the snapshot');
  assert.ok(!runtime.usdMetadata.prims.some(prim=>prim.attributes?.some(attribute=>attribute.metadata&&Object.hasOwn(attribute.metadata,'default'))),'schema defaults do not duplicate attribute values');
  assert.ok(!runtime.usdMetadata.prims.some(prim=>prim.attributes?.some(attribute=>['points','faceVertexIndices','normals','primvars:st'].includes(attribute.name))),'no original rendering geometry in semantic metadata');
 }finally{original?.dispose();converted?.dispose();mechanism?.dispose();await handle.dispose();}
});
test('instances keep prototype identity and independent owners; mesh collision geometry remains non-rendering',async()=>{
 const f=fixture();f.root.clear();
 const instances=new InstancedMesh(new BoxGeometry(),new MeshStandardMaterial(),2);instances.userData.usdPath='/Prototype';instances.setMatrixAt(0,new Matrix4());instances.setMatrixAt(1,new Matrix4().makeTranslation(1,0,0));f.root.add(instances);
 f.handle.resolvePick=async(_path,index)=>({path:'/Prototype/Visual',instances:[{path:index?'/Knob':'/Door'}]});
 f.snapshot.shapes=[{path:'/Knob/Collision',body:'/Knob',type:'mesh',approximation:'convexHull',points:new Float32Array([-1,-1,-1,1,-1,-1,0,1,-1,0,0,1]),indices:[0,1,2,0,1,3,1,2,3,2,0,3],position:[0,0,0],rotation:[0,0,0,1]}];
 const bytes=await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()});
 const result=await registerSimreadyLoader(new GLTFLoader()).parseAsync(bytes,''),runtime=result.userData.simready;
 const bindings=result.parser.json.extensions.NEEDLE_simready.bindings.filter(item=>item.instance);
 assert.equal(bindings.length,2);assert.equal(bindings[0].path,bindings[1].path);assert.notEqual(bindings[0].body,bindings[1].body);
 let meshes=0;result.scene.traverse(object=>{if(object.isMesh)meshes++;});assert.equal(meshes,2,'the collision-only mesh is outside the rendered scene');
 const collider=result.parser.json.nodes.find(node=>node.extensions?.KHR_physics_rigid_bodies?.collider);
 assert.ok(Number.isInteger(collider.extensions.KHR_physics_rigid_bodies.collider.geometry.mesh));
 const stored=result.parser.json.extensions.NEEDLE_simready.snapshot.shapes[0];
 assert.ok(Number.isInteger(stored.mesh));assert.equal(stored.points,undefined);assert.equal(stored.indices,undefined);
 assert.deepEqual(runtime.snapshot.shapes[0].points,Array.from(f.snapshot.shapes[0].points));
 assert.deepEqual(runtime.snapshot.shapes[0].indices,f.snapshot.shapes[0].indices);
 assert.equal(stored.mesh,collider.extensions.KHR_physics_rigid_bodies.collider.geometry.mesh,'portable and Needle physics share the same ordinary collision mesh');
 const mechanism=await runtime.createMechanism();try{
  mechanism.setJointValue('/Hinge',90);
  for(const binding of bindings)assert.equal(mechanism.bodyForObject(await result.parser.getDependency('node',binding.node)).data.path,binding.body);
 }finally{mechanism.dispose();}
 const reexport=await exportSimreadyGltf({handle:{...f.handle,scene:runtime.root},snapshot:runtime.snapshot,usdMetadata:runtime.usdMetadata,exporter:new GLTFExporter()});
 const again=await registerSimreadyLoader(new GLTFLoader()).parseAsync(reexport,'');
 const rebound=again.parser.json.extensions.NEEDLE_simready.bindings.filter(item=>item.instance);
 assert.deepEqual(rebound.map(item=>({path:item.path,body:item.body,instance:item.instance})),bindings.map(item=>({path:item.path,body:item.body,instance:item.instance})));
});
test('Khronos mass, inertia, COM and limits use their physical or geometric coordinate units',async()=>{
 const f=fixture();f.snapshot.metersPerUnit=.01;f.snapshot.kilogramsPerUnit=.001;f.snapshot.bodies[1].mass=2000;f.snapshot.bodies[1].diagonalInertia=[1000000,1000000,1000000];f.snapshot.bodies[1].centerOfMass=[25,0,0];
 const bytes=await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()});
 const result=await registerSimreadyLoader(new GLTFLoader()).parseAsync(bytes,''),json=result.parser.json;
 const binding=json.extensions.NEEDLE_simready.bindings.find(item=>item.path==='/Door'),node=await result.parser.getDependency('node',binding.node),motion=json.nodes[binding.node].extensions.KHR_physics_rigid_bodies.motion;
 assert.equal(motion.mass,2);assert.deepEqual(motion.inertiaDiagonal,[.1,.1,.1]);
 result.scene.updateMatrixWorld(true);assert.ok(node.localToWorld(new Vector3(...motion.centerOfMass)).distanceTo(new Vector3(.25,0,0))<1e-6);
 const hinge=json.extensions.KHR_physics_rigid_bodies.physicsJoints[0];assert.ok(hinge.limits.some(limit=>limit.angularAxes?.length===1&&Math.abs(limit.max-Math.PI/2)<1e-6));
});
test('ordinary glTF collision meshes reject higher-precision coordinates rather than rounding',async()=>{
 const f=fixture();f.snapshot.shapes=[{path:'/Knob/Collision',body:'/Knob',type:'mesh',approximation:'sdf',points:[1/3,0,0,1,0,0,0,1,0],indices:[0,1,2],position:[0,0,0],rotation:[0,0,0,1]}];
 await assert.rejects(exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()}),/exactly representable.*lose precision/);
});
test('SDF and disabled colliders use ordinary non-rendering meshes; portable colliders reuse those meshes with their scale',async()=>{
 const f=fixture(),points=[0,0,0,1,0,0,0,1,0],indices=[0,1,2];
 f.snapshot.shapes=['none','convexHull','sdf'].map((approximation,index)=>({path:'/Knob/Collider'+index,body:'/Knob',type:'mesh',approximation,points,indices,meshScale:[2,3,4],position:[0,0,0],rotation:[0,0,0,1]}));
 f.snapshot.shapes.push({...f.snapshot.shapes[2],path:'/Knob/Disabled',collisionEnabled:false});
 const gltf=await registerSimreadyLoader(new GLTFLoader()).parseAsync(await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()}),'');
 assert.deepEqual(gltf.userData.simready.snapshot,f.snapshot);
 let rendered=0;gltf.scene.traverse(object=>{if(object.isMesh)rendered++;});assert.equal(rendered,3);
 const data=gltf.parser.json.extensions.NEEDLE_simready;
 for(const shape of data.snapshot.shapes){
  const primitive=gltf.parser.json.meshes[shape.mesh].primitives[0];assert.ok(Number.isInteger(primitive.attributes.POSITION));assert.ok(Number.isInteger(primitive.indices));assert.equal(primitive.material,undefined);
  assert.equal(shape.points,undefined);assert.equal(shape.indices,undefined);
 }
 const nodes=gltf.parser.json.nodes.flatMap((node,index)=>node.extensions?.KHR_physics_rigid_bodies?.collider?[index]:[]);
 assert.equal(nodes.length,2);for(const index of nodes)assert.deepEqual((await gltf.parser.getDependency('node',index)).scale.toArray(),[2,3,4]);
 assert.ok(!gltf.parser.json.extensions.KHR_implicit_shapes,'SDF meshes are not represented as analytic implicit shapes');
});
test('disabled mesh geometry is extracted for export and convex point clouds remain ordinary mesh primitives',async()=>{
 const f=fixture(),points=[-1,-1,-1,1,-1,-1,0,1,-1,0,0,1];let reads=0;
 f.snapshot.shapes=[{path:'/Knob/DisabledHull',body:'/Knob',type:'mesh',approximation:'convexHull',collisionEnabled:false,position:[0,0,0],rotation:[0,0,0,1]}];
 f.handle.readStage=async read=>read(null,{GetPhysicsMeshBuffers(path){assert.equal(path,'/Knob/DisabledHull');reads++;return{points};}});
 const gltf=await registerSimreadyLoader(new GLTFLoader()).parseAsync(await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,usdMetadata:f.usdMetadata,exporter:new GLTFExporter()}),'');
 assert.equal(reads,1);assert.equal(f.snapshot.shapes[0].points,undefined,'the caller snapshot is not mutated');
 const shape=gltf.parser.json.extensions.NEEDLE_simready.snapshot.shapes[0],primitive=gltf.parser.json.meshes[shape.mesh].primitives[0];
 assert.equal(primitive.mode,0);assert.equal(shape.collisionEnabled,false);assert.deepEqual(gltf.userData.simready.snapshot.shapes[0].points,points);
});
test('runtime resolves ordinary multi-primitive collision meshes through GLTFLoader',async()=>{
 const f=fixture(),points=[0,0,0,1,0,0,0,1,0];
 f.snapshot.shapes=[{path:'/Knob/Collision',body:'/Knob',type:'mesh',approximation:'sdf',points,indices:[0,1,2]}];
 const bytes=await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()}),view=new DataView(bytes),jsonLength=view.getUint32(12,true);
 const json=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,jsonLength))),binStart=20+jsonLength;
 json.buffers[0].uri='data:application/octet-stream;base64,'+Buffer.from(new Uint8Array(bytes,binStart+8,view.getUint32(binStart,true))).toString('base64');
 const mesh=json.meshes[json.extensions.NEEDLE_simready.snapshot.shapes[0].mesh];mesh.primitives.push(structuredClone(mesh.primitives[0]));
 const loaded=await registerSimreadyLoader(new GLTFLoader()).parseAsync(JSON.stringify(json),'');
 assert.deepEqual(loaded.userData.simready.snapshot.shapes[0].points,[...points,...points]);
 assert.deepEqual(loaded.userData.simready.snapshot.shapes[0].indices,[0,1,2,3,4,5]);
 json.extensions.NEEDLE_simready.snapshot.shapes[0].mesh=999;
 await assert.rejects(registerSimreadyLoader(new GLTFLoader()).parseAsync(JSON.stringify(json),''),/collision mesh reference/);
});
test('analytic colliders use KHR_implicit_shapes instead of tessellated meshes',async()=>{
 const f=fixture();
 f.snapshot.shapes=[{type:'cube',halfExtents:[1,2,3]},{type:'sphere',radius:2},{type:'capsule',halfHeight:2,radius:1,axis:'X'},{type:'cylinder',halfHeight:3,radius:2,axis:'Z'},{type:'cone',halfHeight:4,radius:3},{type:'plane'}].map((shape,index)=>({...shape,path:'/Knob/Analytic'+index,body:'/Knob',position:[0,0,0],rotation:[0,0,0,1]}));
 const gltf=await registerSimreadyLoader(new GLTFLoader()).parseAsync(await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()}),'');
 const json=gltf.parser.json,shapes=json.extensions.KHR_implicit_shapes.shapes;
 assert.deepEqual(shapes.map(shape=>shape.type),['box','sphere','capsule','cylinder','cylinder','plane']);
 assert.deepEqual(shapes[0].box.size,[2,4,6]);assert.equal(shapes[4].cylinder.radiusTop,0);
 assert.ok(json.extensions.NEEDLE_simready.snapshot.shapes.every(shape=>shape.mesh===undefined));
 assert.deepEqual(gltf.userData.simready.snapshot,f.snapshot);
});
test('runtime uses GLTFLoader triangulation for ordinary strips and fans',async()=>{
 const f=fixture(),points=[0,0,0,1,0,0,0,1,0,1,1,0];
 f.snapshot.shapes=[{path:'/Knob/Collision',body:'/Knob',type:'mesh',approximation:'sdf',points,indices:[0,1,2,3,0,1]}];
 const bytes=await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()}),view=new DataView(bytes),length=view.getUint32(12,true),binStart=20+length;
 const json=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,length)));
 json.buffers[0].uri='data:application/octet-stream;base64,'+Buffer.from(new Uint8Array(bytes,binStart+8,view.getUint32(binStart,true))).toString('base64');
 const primitive=json.meshes[json.extensions.NEEDLE_simready.snapshot.shapes[0].mesh].primitives[0];
 json.accessors[primitive.indices].count=4;
 for(const [mode,expected]of [[5,[0,1,2,3,2,1]],[6,[0,1,2,0,2,3]]]){
  primitive.mode=mode;
  const loaded=await registerSimreadyLoader(new GLTFLoader()).parseAsync(JSON.stringify(json),'');
  assert.deepEqual(loaded.userData.simready.snapshot.shapes[0].points,points);
  assert.deepEqual(loaded.userData.simready.snapshot.shapes[0].indices,expected);
 }
});
test('MaterialX-style uniform colors export as an explicit PBR projection without mutating source materials',async()=>{
 const f=fixture(),material=new ShaderMaterial();material.color=[.2,.4,.6];material.roughness=.3;f.root.children[0].material=material;
 const result=await registerSimreadyLoader(new GLTFLoader()).parseAsync(await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()}),'');
 assert.ok(result.parser.json.materials.some(material=>material.pbrMetallicRoughness?.baseColorFactor?.[1]===.4));
 assert.ok(result.userData.simready.mappingIssues.some(issue=>issue.reason.includes('Shader appearance')));
 assert.deepEqual(material.color,[.2,.4,.6]);assert.equal(material.roughness,.3);
});

test('selected texture resolution uses a disposable source scope without changing preview materials',async()=>{
 const f=fixture(),material=f.root.children[0].material,preview=new Texture(),original=new Texture();material.map=preview;
 let scopes=0,disposals=0;
 f.handle.createTextureExport=({resolution})=>{scopes++;return{getTexture:async texture=>resolution==='original'&&texture===preview?original:texture,dispose(){disposals++;}};};
 const exportWith=async(resolution,expected)=>{
  const exporter={register(){},unregister(){},async parseAsync(stage){
   assert.equal(stage.getObjectByName('/Base/Visual').material.map,expected);return new ArrayBuffer(0);
  }};
  await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,usdMetadata:f.usdMetadata,exporter,textureResolution:resolution});
  assert.equal(material.map,preview);
 };
 await exportWith(undefined,original);assert.equal(scopes,1);assert.equal(disposals,1);
 await exportWith('preview',preview);assert.equal(scopes,2);assert.equal(disposals,2);
 f.handle.createTextureExport=()=>({getTexture:async()=>{throw new Error('Original unavailable');},dispose(){disposals++;}});
 await assert.rejects(exportWith('original',original),/Original unavailable/);assert.equal(disposals,3);
 const controller=new AbortController();controller.abort();
 await assert.rejects(exportSimreadyGltf({handle:f.handle,exporter:{},signal:controller.signal}),{name:'AbortError'});
});
