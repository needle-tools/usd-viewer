import {assertPhysicsSchemas} from '../../../modules/simready/tests/helpers/physics-schemas.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group,Mesh,InstancedMesh,Matrix4,Vector3,Quaternion,Color,BoxGeometry,BufferAttribute,InterleavedBuffer,InterleavedBufferAttribute,MeshStandardMaterial,ShaderMaterial,Float32BufferAttribute,Texture,Points,PointsMaterial,LineSegments,LineBasicMaterial,PerspectiveCamera,PointLight} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {exportSimreadyGltf} from '../../src/gltf/simready.js';
import {registerSimreadyLoader,toGltfPhysicsSnapshot,fromGltfPhysicsSnapshot} from '@needle-tools/simready/gltf';
import {createSimulationWorld} from '@needle-tools/simready/rapier';
import R from '@dimforge/rapier3d-compat';
import {readFile} from 'node:fs/promises';
import {getUsdModule} from '../runtime.mjs';
import {createThreeHydra} from '../../src/create.three.js';
import {createUsdPhysics,readUsdPhysics} from '../../src/physics/createPhysics.js';
import {validateBytes} from 'gltf-validator';

// Three's exporter uses FileReader in Node as well as in the browser.
globalThis.FileReader ||= class {
 readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
 readAsDataURL(blob){blob.arrayBuffer().then(value=>{this.result=`data:${blob.type};base64,${Buffer.from(value).toString('base64')}`;this.onloadend?.();});}
};
globalThis.ProgressEvent ||= class {};
await R.init();

const snapshotSchema = JSON.parse(await readFile(new URL('../../../modules/simready/extensions/NEEDLE_simready/schema/runtime-snapshot.schema.json', import.meta.url), 'utf8'));
const schemaDefaults = properties => Object.fromEntries(Object.entries(properties)
 .filter(([, property]) => Object.hasOwn(property, 'default'))
 .map(([name, property]) => [name, property.default]));
const bodyDefaults = schemaDefaults(snapshotSchema.$defs.body.properties);
const shapeDefaults = schemaDefaults(snapshotSchema.$defs.shape.properties);
const jointDefaults = schemaDefaults(snapshotSchema.$defs.joint.properties);
const driveDefaults = schemaDefaults(snapshotSchema.$defs.drive.properties);
const groupDefaults = schemaDefaults(snapshotSchema.properties.groups.items.properties);

function withSnapshotDefaults(snapshot) {
 return {...snapshot,
  bodies: snapshot.bodies.map(body => ({...bodyDefaults, ...body})),
  shapes: snapshot.shapes.map(shape => ({...shapeDefaults, ...shape})),
  joints: snapshot.joints.map(joint => ({...jointDefaults, ...joint,
   ...(joint.drive && {drive: {...driveDefaults, ...joint.drive}})})),
  groups: snapshot.groups.map(group => ({...groupDefaults, ...group})),
 };
}

function assertExportedSnapshot(actual, source) {
 assert.deepEqual(withSnapshotDefaults(actual), withSnapshotDefaults(toGltfPhysicsSnapshot(source)));
}

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
 const semantics=[];
 return {root,snapshot,semantics,handle:{scene:root,ready:async()=>{},materialsReady:async()=>{},setPlaying(){},readStage:async()=>[],
  exportUsdz:async()=>{throw new Error('Source packaging must not run during glTF export.');}}};
}
test('exports standard constraints and semantic labels',async()=>{
 const f=fixture(),bytes=await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()});
 const result=await registerSimreadyLoader(new GLTFLoader()).parseAsync(bytes,'');
 assertPhysicsSchemas(result.parser.json);
 const data=result.userData.simready;
 assert.equal(data.handle,undefined,'glTF runtime has no USD/Hydra handle');assertExportedSnapshot(data.snapshot,f.snapshot);assert.deepEqual(data.semantics,[]);
 assert.equal(result.parser.json.extensions.NEEDLE_simready.source,undefined);
 assert.equal(result.parser.json.extensions.KHR_physics_rigid_bodies.physicsJoints.length,2);
 for(const name of ['NEEDLE_simready','KHR_physics_rigid_bodies','KHR_implicit_shapes']){
  assert.ok(result.parser.json.extensionsUsed.includes(name));
  assert.ok(!result.parser.json.extensionsRequired?.includes(name),name+' must allow ordinary glTF rendering without its runtime');
 }
 const plain=await new GLTFLoader().parseAsync(bytes,'');
 assert.ok(plain.scene.children.length>0,'An unregistered loader can still render the asset');
 const mechanism=await data.createMechanism();
 assert.deepEqual(mechanism.unsupported,[]);assert.equal(mechanism.setJointValue('/Hinge',150),true);
 assert.ok(Math.abs(mechanism.getJointValue('/Hinge')-90)<1e-4);
 assert.ok(Math.abs(mechanism.bodies.get('/Knob').body.translation().y-1)<1e-4);
 mechanism.dispose();
 const sim=await data.createSimulation({rapier:R,allowPartial:false});
 sim.play();for(let i=0;i<60;i++)sim.update(1/120);assert.deepEqual(sim.unsupported,[]);sim.dispose();
});

test('authored interchange material projections are cached, exported and disposed without changing the render surface', async () => {
	const f = fixture(), original = f.root.children[0].material;
	const projected = new MeshStandardMaterial({color: 0xd05010, roughness: .27, metalness: .4});
	projected.userData.usdGltfProjection = 'Authored USD Preview Surface selected for MaterialX interchange.';
	let requests = 0, disposed = false;
	projected.addEventListener('dispose', () => {disposed = true;});
	original.userData.usdGltfMaterial = async ({stage, time}) => {
		assert.equal(stage.marker, 'stage'); assert.equal(time, undefined); requests++; return projected;
	};
	f.root.children[1].material = original;
	f.handle.readStage = async callback => callback({marker: 'stage'});
	const bytes = await exportSimreadyGltf({handle: f.handle, snapshot: f.snapshot, semantics: f.semantics, exporter: new GLTFExporter()});
	const result = await registerSimreadyLoader(new GLTFLoader()).parseAsync(bytes, '');
	const definition = result.parser.json.materials.find(material => material.pbrMetallicRoughness?.roughnessFactor === .27);
	assert.deepEqual(definition.pbrMetallicRoughness.baseColorFactor, [...projected.color.toArray(), 1]);
	assert.equal(requests, 1); assert.equal(disposed, true);
	assert.equal(f.root.children[0].material, original); assert.equal(f.root.children[1].material, original);
	assert.ok(result.userData.simready.mappingIssues.some(issue => issue.reason === projected.userData.usdGltfProjection));
});

test('missing authored interchange surfaces retain the explicit shader-to-PBR fallback', async () => {
	const f = fixture(), source = new ShaderMaterial(); source.name = 'Procedural';
	source.userData.usdGltfMaterial = async () => null;
	f.root.children[0].material = source;
	f.handle.readStage = async callback => callback({});
	const bytes = await exportSimreadyGltf({handle: f.handle, snapshot: f.snapshot, semantics: f.semantics, exporter: new GLTFExporter()});
	const result = await registerSimreadyLoader(new GLTFLoader()).parseAsync(bytes, '');
	assert.ok(result.parser.json.materials.some(material => material.name === 'Procedural' && material.pbrMetallicRoughness));
	assert.ok(result.userData.simready.mappingIssues.some(issue => issue.reason.includes('source shader graph has no exact glTF PBR representation')));
	assert.equal(f.root.children[0].material, source);
});

test('HDR emission uses a legal base factor and emissive strength without changing radiance', async () => {
	const f = fixture(), source = f.root.children[0].material;
	source.emissive.setRGB(3, 2.6554646492004395, 1.6538701057434082); source.emissiveIntensity = 2.5;
	const emission = source.emissive.toArray(), intensity = source.emissiveIntensity;
	const bytes = await exportSimreadyGltf({handle: f.handle, snapshot: f.snapshot, semantics: f.semantics, exporter: new GLTFExporter()});
	const report = await validateBytes(new Uint8Array(bytes)); assert.equal(report.issues.numErrors, 0, JSON.stringify(report.issues));
	const result = await registerSimreadyLoader(new GLTFLoader()).parseAsync(bytes, '');
	const material = result.parser.json.materials.find(material => material.extensions?.KHR_materials_emissive_strength);
	assert.equal(Math.max(...material.emissiveFactor), 1);
	for (let channel = 0; channel < 3; channel++) assert.ok(Math.abs(material.emissiveFactor[channel] * material.extensions.KHR_materials_emissive_strength.emissiveStrength - emission[channel] * intensity) < 1e-7);
	assert.deepEqual(source.emissive.toArray(), emission); assert.equal(source.emissiveIntensity, intensity);
});

test('out-of-range base colors export legal factors without retaining source-only diagnostic values',async()=>{
	const f=fixture(),source=f.root.children[0].material;
	source.color.setRGB(1.01953125,-.25,.3);const original=source.color.toArray();
	const bytes=await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,semantics:f.semantics,exporter:new GLTFExporter()});
	const validation=await validateBytes(new Uint8Array(bytes));assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues));
	const result=await registerSimreadyLoader(new GLTFLoader()).parseAsync(bytes,'');
	const material=result.parser.json.materials.find(material=>material.pbrMetallicRoughness?.baseColorFactor?.[0]===1);
	assert.deepEqual(material.pbrMetallicRoughness.baseColorFactor,[1,0,.3,1]);
	assert.equal(material.extras,undefined);
	assert.ok(result.userData.simready.mappingIssues.some(issue=>issue.path==='/Base/Visual'&&issue.reason.includes('Base color outside')));
	assert.equal(f.root.children[0].material,source);assert.deepEqual(source.color.toArray(),original);
	assert.equal(source.userData.usdGltfUnclampedBaseColor,undefined);
});

test('base color range projection follows instance tinting without clipping a valid product',async()=>{
	const f=fixture(),source=new MeshStandardMaterial();source.color.setRGB(2,.5,.25);
	const mesh=new InstancedMesh(f.root.children[0].geometry,source,2);mesh.userData.usdPath='/Instances';
	mesh.setColorAt(0,new Color().setRGB(.4,1,1));mesh.setColorAt(1,new Color().setRGB(2,1,1));
	f.root.remove(f.root.children[0]);f.root.add(mesh);f.handle.resolvePick=async(_path,index)=>({path:'/Base/Visual'+index});
	const bytes=await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,semantics:f.semantics,exporter:new GLTFExporter()});
	const validation=await validateBytes(new Uint8Array(bytes));assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues));
	const result=await registerSimreadyLoader(new GLTFLoader()).parseAsync(bytes,'');
	const colors=[];
	for(const path of ['/Base/Visual0','/Base/Visual1']){
		const node=result.parser.json.nodes.find(node=>node.name===path);
		colors.push(result.parser.json.materials[result.parser.json.meshes[node.mesh].primitives[0].material]);
	}
	assert.ok(Math.abs(colors[0].pbrMetallicRoughness.baseColorFactor[0]-.8)<1e-6);
	assert.equal(colors[0].extras?.usdGltfUnclampedBaseColor,undefined);
	assert.deepEqual(colors[1].pbrMetallicRoughness.baseColorFactor,[1,.5,.25,1]);
	assert.equal(colors[1].extras,undefined);
	assert.deepEqual(source.color.toArray(),[2,.5,.25]);
});

for(const [Type,values]of [
 [Int32Array,[-32768,0,32767]], [Uint32Array,[0,2147483648,4294967295]], [Float32Array,[0,.25,1]],
])test(`source-only ${Type.name} primvars and property bags are absent from the runtime GLB`,async()=>{
 const f=fixture(),mesh=f.root.children[0],geometry=mesh.geometry;
 const array=Type.from({length:geometry.attributes.position.count},(_,i)=>values[i%values.length]);
 const attribute=new BufferAttribute(array,1);geometry.setAttribute('primvars:SculptMaskColorTemp',attribute);
 geometry.setAttribute('uv2',geometry.attributes.uv);geometry.userData={blender:{selection_order:3}};
 mesh.material.userData={sourceShader:{inputs:[1,2,3]}};
 f.semantics=[{path:mesh.userData.usdPath,taxonomy:'class',labels:['cabinet']}];
 const bytes=await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,semantics:f.semantics,exporter:new GLTFExporter()});
 const validation=await validateBytes(new Uint8Array(bytes));assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues));
 const result=await registerSimreadyLoader(new GLTFLoader()).parseAsync(bytes,''),json=result.parser.json,payload=json.extensions.NEEDLE_simready;
 assert.equal(payload.version,1);
 const primitive=json.meshes[json.nodes.find(node=>node.name===mesh.userData.usdPath).mesh].primitives[0];
 assert.equal(primitive.attributes['_PRIMVARS:SCULPTMASKCOLORTEMP'],undefined);assert.equal(primitive.extras,undefined);
 assert.ok(json.materials.every(material=>material.extras===undefined));assert.deepEqual(result.userData.simready.semantics,[{path:mesh.userData.usdPath,taxonomy:'class',labels:['cabinet']}]);
 const node=await result.parser.getDependency('node',json.nodes.findIndex(node=>node.name===mesh.userData.usdPath));
 assert.deepEqual(Array.from(node.geometry.attributes.position.array),Array.from(geometry.attributes.position.array));
 assert.equal(primitive.attributes.TEXCOORD_0,primitive.attributes.TEXCOORD_1);assert.equal(primitive.attributes.TEXCOORD_0,primitive.attributes.TEXCOORD_2);
 assert.equal(geometry.attributes['primvars:SculptMaskColorTemp'],attribute);assert.deepEqual(geometry.userData,{blender:{selection_order:3}});assert.deepEqual(mesh.material.userData,{sourceShader:{inputs:[1,2,3]}});
});
test('shared and interleaved source IDs are not copied into custom runtime accessors or metadata',async()=>{
 const f=fixture(),mesh=f.root.children[0],geometry=mesh.geometry,count=geometry.attributes.position.count;
 const source=Int32Array.from({length:count*2},(_,i)=>i%2?-999:16777217),data=new InterleavedBuffer(source,2),attribute=new InterleavedBufferAttribute(data,1,0);
 geometry.setAttribute('primvars:id',attribute);f.root.children[1].geometry=geometry;
 const bytes=await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,semantics:f.semantics,exporter:new GLTFExporter()});
 const result=await registerSimreadyLoader(new GLTFLoader()).parseAsync(bytes,'');
 for(const mesh of result.parser.json.meshes)for(const primitive of mesh.primitives){assert.equal(primitive.attributes['_PRIMVARS:ID'],undefined);assert.equal(primitive.extras,undefined);}
 assert.equal(geometry.attributes['primvars:id'],attribute);assert.equal(attribute.getX(0),16777217);
});
test('ordinary stages retain cameras, lights, lines and points without requiring the SimReady runtime',async()=>{
 const f=fixture();
 for(const key of ['bodies','shapes','joints','scenes','materials','groups'])f.snapshot[key]=[];
 for(const [path,object] of [
  ['/Camera',new PerspectiveCamera(45,1,.1,100)],
  ['/Light',new PointLight(0xffcc88,4)],
  ['/Points',new Points(new BoxGeometry(),new PointsMaterial())],
  ['/Lines',new LineSegments(new BoxGeometry(),new LineBasicMaterial())],
 ]){object.userData.usdPath=path;object.position.set(1,2,3);f.root.add(object);}
 const bytes=await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,semantics:f.semantics,exporter:new GLTFExporter()});
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
test('semantic labels and physics-only stages export defined runtime data without inventing bodies',async()=>{
 for(const example of [
  {semantics:[{path:'/Base',taxonomy:'wikidata_qcode',labels:['Q150']}]},
  {key:'scenes',value:[{path:'/Scene',gravityDirection:[0,-1,0],gravityMagnitude:9.81}]},
  {key:'materials',value:[{path:'/Friction',staticFriction:.5,dynamicFriction:.4,restitution:0}]},
 ]){
  const f=fixture();for(const key of ['bodies','shapes','joints','scenes','materials','groups'])f.snapshot[key]=[];
  if(example.key)f.snapshot[example.key]=example.value;
  const bytes=await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,semantics:example.semantics||f.semantics,exporter:new GLTFExporter()});
  const result=await registerSimreadyLoader(new GLTFLoader()).parseAsync(bytes,''),runtime=result.userData.simready;
  assert.deepEqual(runtime.snapshot,toGltfPhysicsSnapshot(f.snapshot));assert.deepEqual(runtime.snapshot.bodies,[]);
  if(example.semantics)assert.deepEqual(runtime.semantics,[{path:'/Base/Visual',taxonomy:'wikidata_qcode',labels:['Q150']}]);
 }
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
test('rejects unresolved render instance identities',async()=>{
 const f=fixture();f.snapshot.bodies[0].path='/Unbound';
 // A body without visible geometry is valid; an unresolved render instance is not.
 const mesh=f.root.children[0];mesh.isInstancedMesh=true;mesh.count=2;
 await assert.rejects(exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()}),/instance identit/i);
});
test('export freezes and restores playback, and refuses a stage edited during metadata extraction',async()=>{
 const f=fixture(),changes=[];let playing=true;
 f.handle.revision=1;f.handle.isPlaying=()=>playing;f.handle.setPlaying=value=>{playing=value;changes.push(value);};
 f.handle.getTime=()=>3;
 await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()});
 assert.deepEqual(changes,[false,true]);assert.equal(playing,true);
 f.handle.readStage=async()=>{f.handle.revision++;return [];};
 await assert.rejects(exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()}),/stage changed/);
 assert.equal(playing,true,'failure also restores playback');
});
test('native USD extraction, GLB, contacts/drives and joint manipulation agree in centimeter Z-up stages',async()=>{
 const USD=await getUsdModule({print(){},printErr(){}});
 const buffer=await readFile(new URL('../fixtures/simready/assembly.usda',import.meta.url));
 const handle=await createThreeHydra({USD,scene:new Group(),url:'assembly.usda',buffer,autoPlay:false});
 const nativeWorld=createSimulationWorld({rapier:R}),convertedWorld=createSimulationWorld({rapier:R});
 let original,converted,mechanism;
 try{
  const snapshot=await readUsdPhysics(handle);
  const bytes=await exportSimreadyGltf({handle,snapshot,exporter:new GLTFExporter()});
  const result=await registerSimreadyLoader(new GLTFLoader()).parseAsync(bytes,''),runtime=result.userData.simready;
  assertExportedSnapshot(runtime.snapshot,snapshot);
  original=await createUsdPhysics({handle,snapshot,world:nativeWorld,allowPartial:false});converted=await runtime.createSimulation({world:convertedWorld});
  for(let i=0;i<240;i++){nativeWorld.step();convertedWorld.step();}
  for(const [path,{body}]of original.bodies){
   assert.deepEqual({...converted.bodies.get(path).body.translation()},{...body.translation()});
   assert.deepEqual({...converted.bodies.get(path).body.rotation()},{...body.rotation()});
   assert.equal(converted.bodies.get(path).body.mass(),body.mass());
  }
  assert.ok(converted.bodies.get('/Assembly/Slider').body.translation().x>.2,'the authored slider drive actually runs in metres');
  converted.dispose();converted=null;original.dispose();original=null;
  mechanism=await runtime.createMechanism();assert.deepEqual(mechanism.unsupported,[]);
  assert.equal(mechanism.setJointValue('/Assembly/Hinge',120),true);assert.ok(Math.abs(mechanism.getJointValue('/Assembly/Hinge')-90)<1e-4);
  assert.ok(Math.abs(mechanism.bodies.get('/Assembly/Knob').body.translation().z+1)<1e-4);
  assert.equal(mechanism.setJointValue('/Assembly/Slide',1),true);assert.ok(Math.abs(mechanism.getJointValue('/Assembly/Slide')-.5)<1e-4);

  const payload=result.parser.json.extensions.NEEDLE_simready;
  assert.equal(payload.version,1);
  assert.ok(payload.snapshot.bodies.every(body => !Object.hasOwn(body, 'scale')));
  assert.ok(!Object.hasOwn(payload.snapshot.joints.find(joint => joint.path === '/Assembly/Hinge'), 'rotation1'));
  assert.ok(!JSON.stringify(payload).includes('physxJoint:armature'));
  assert.ok(!JSON.stringify(payload).includes('mjc:frictionloss'));
  assert.ok(!JSON.stringify(payload).includes('simready:sampledValue'));
  assert.ok(runtime.semantics.some(record=>record.path==='/Assembly/Door'&&record.taxonomy==='class'&&record.labels.includes('regression assembly')));

 }finally{original?.dispose();converted?.dispose();mechanism?.dispose();nativeWorld.dispose();convertedWorld.dispose();await handle.dispose();}
});
test('instances keep prototype identity and independent owners; mesh collision geometry remains non-rendering',async()=>{
 const f=fixture();f.root.clear();
 const instances=new InstancedMesh(new BoxGeometry(),new MeshStandardMaterial(),2);instances.userData.usdPath='/Prototype';instances.setMatrixAt(0,new Matrix4());instances.setMatrixAt(1,new Matrix4().makeTranslation(1,0,0));f.root.add(instances);
 f.handle.resolvePick=async(_path,index)=>({path:'/Prototype/Visual',instances:[{path:index?'/Knob':'/Door'}]});
 f.snapshot.shapes=[{path:'/Knob/Collision',body:'/Knob',type:'mesh',approximation:'convexHull',points:new Float32Array([-1,-1,-1,1,-1,-1,0,1,-1,0,0,1]),indices:[0,1,2,0,1,3,1,2,3,2,0,3],position:[0,0,0],rotation:[0,0,0,1]}];
 const bytes=await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()});
 const result=await registerSimreadyLoader(new GLTFLoader()).parseAsync(bytes,''),runtime=result.userData.simready;
 const bindings=result.parser.json.extensions.NEEDLE_simready.bindings.filter(item=>item.body);
 assert.equal(bindings.length,2);assert.equal(bindings[0].path,bindings[1].path);assert.notEqual(bindings[0].body,bindings[1].body);
 let meshes=0;result.scene.traverse(object=>{if(object.isMesh)meshes++;});assert.equal(meshes,2,'the collision-only mesh is outside the rendered scene');
 const collider=result.parser.json.nodes.find(node=>node.extensions?.KHR_physics_rigid_bodies?.collider);
 assert.ok(Number.isInteger(collider.extensions.KHR_physics_rigid_bodies.collider.geometry.node));
 assertPhysicsSchemas(result.parser.json);
 const stored=result.parser.json.extensions.NEEDLE_simready.snapshot.shapes[0];
 assert.ok(Number.isInteger(stored.mesh));assert.equal(stored.points,undefined);assert.equal(stored.indices,undefined);
 assert.deepEqual(runtime.snapshot.shapes[0].points,Array.from(f.snapshot.shapes[0].points));
 assert.deepEqual(runtime.snapshot.shapes[0].indices,f.snapshot.shapes[0].indices);
 assert.equal(stored.mesh,result.parser.json.nodes[collider.extensions.KHR_physics_rigid_bodies.collider.geometry.node].mesh,'portable and Needle physics share the same ordinary collision mesh');
 const mechanism=await runtime.createMechanism();try{
  mechanism.setJointValue('/Hinge',90);
  for(const binding of bindings)assert.equal(mechanism.bodyForObject(await result.parser.getDependency('node',binding.node)).data.path,binding.body);
 }finally{mechanism.dispose();}
 const reexport=await exportSimreadyGltf({handle:{...f.handle,scene:runtime.root},snapshot:fromGltfPhysicsSnapshot(runtime.snapshot),semantics:runtime.semantics,exporter:new GLTFExporter()});
 const again=await registerSimreadyLoader(new GLTFLoader()).parseAsync(reexport,'');
 const rebound=again.parser.json.extensions.NEEDLE_simready.bindings.filter(item=>item.body);
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
test('a canonical reference root aligns converted collision geometry, visuals, cameras and lights',async()=>{
 const f=fixture();Object.assign(f.snapshot,{metersPerUnit:.01,kilogramsPerUnit:.001,upAxis:'Z'});
 const points=[0,0,0,1,0,0,0,1,0],geometry=new BoxGeometry();
 geometry.setAttribute('position',new Float32BufferAttribute(points,3));geometry.setIndex([0,1,2]);geometry.deleteAttribute('normal');geometry.deleteAttribute('uv');geometry.clearGroups();
 const visual=new Mesh(geometry,new MeshStandardMaterial());visual.userData.usdPath='/Static/Visual';visual.position.set(100,200,300);visual.scale.set(2,3,4);f.root.add(visual);
 f.snapshot.shapes=[{path:'/Static/Collider',type:'mesh',points,indices:[0,1,2],position:[100,200,300],rotation:[0,0,0,1],meshScale:[2,3,4]}];
 const camera=new PerspectiveCamera(45,1,1,1000),light=new PointLight(0xffffff,1,500);
 for(const [object,path]of [[camera,'/Camera'],[light,'/Light']]){object.userData.usdPath=path;object.position.set(100,200,300);f.root.add(object);}
 const before=structuredClone(f.snapshot),result=await registerSimreadyLoader(new GLTFLoader()).parseAsync(await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()}),'');
 assert.deepEqual(f.snapshot,before,'export leaves the USD descriptor unchanged');
 const runtime=result.userData.simready,shape=runtime.snapshot.shapes[0],json=result.parser.json;
 assert.deepEqual(runtime.root.matrix.elements,new Matrix4().elements);
 for(const key of ['metersPerUnit','kilogramsPerUnit','upAxis'])assert.equal(Object.hasOwn(json.extensions.NEEDLE_simready.snapshot,key),false);
 const node=await result.parser.getDependency('node',json.nodes.findIndex(node=>node.name==='/Static/Visual'));result.scene.updateMatrixWorld(true);
 const bodyMatrix=new Matrix4().compose(new Vector3(...shape.position),new Quaternion(...shape.rotation),new Vector3(1,1,1));
 const position=node.geometry.getAttribute('position');
 for(let i=0;i<3;i++){
  const rendered=new Vector3().fromBufferAttribute(position,i).applyMatrix4(node.matrixWorld);
  const collider=new Vector3(...shape.points.slice(i*3,i*3+3)).multiply(new Vector3(...shape.meshScale)).applyMatrix4(bodyMatrix);
  assert.ok(rendered.distanceTo(collider)<1e-7,'render and collision positions share glTF metres and axes');
 }
 const exportedCamera=await result.parser.getDependency('node',json.nodes.findIndex(node=>node.name==='/Camera'));
 assert.equal(exportedCamera.near,.01);assert.equal(exportedCamera.far,10);assert.ok(exportedCamera.scale.distanceTo(new Vector3(1,1,1))<1e-6);
 const exportedLight=await result.parser.getDependency('node',json.nodes.findIndex(node=>node.name==='/Light'));
 assert.equal(exportedLight.distance,5);
 assert.ok(exportedLight.getWorldPosition(new Vector3()).distanceTo(new Vector3(1,3,-2))<1e-6);
});
test('joint frames retain identity defaults when attached to a body',async()=>{
 const f=fixture();f.snapshot.joints=[{path:'/DefaultFrame',type:'fixed',body1:'/Knob'}];
 const result=await registerSimreadyLoader(new GLTFLoader()).parseAsync(await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()}),'');
 const frame=await result.parser.getDependency('node',result.parser.json.nodes.findIndex(node=>node.name==='/DefaultFrame frame 1'));
 assert.deepEqual(frame.position.toArray(),[0,0,0]);assert.deepEqual(frame.quaternion.toArray(),[0,0,0,1]);
});
test('ordinary glTF collision meshes reject higher-precision coordinates rather than rounding',async()=>{
 const f=fixture();f.snapshot.shapes=[{path:'/Knob/Collision',body:'/Knob',type:'mesh',approximation:'sdf',points:[1/3,0,0,1,0,0,0,1,0],indices:[0,1,2],position:[0,0,0],rotation:[0,0,0,1]}];
 await assert.rejects(exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()}),/exactly representable.*lose precision/);
});
test('SDF and disabled colliders use ordinary non-rendering meshes; portable colliders reuse those meshes with their scale',async()=>{
 const f=fixture(),points=[0,0,0,1,0,0,0,1,0],indices=[0,1,2];
 f.snapshot.shapes=['none','convexHull','sdf','convexDecomposition'].map((approximation,index)=>({path:'/Knob/Collider'+index,body:'/Knob',type:'mesh',approximation,points,indices,meshScale:[2,3,4],position:[0,0,0],rotation:[0,0,0,1]}));
 f.snapshot.shapes.push({...f.snapshot.shapes[2],path:'/Knob/Disabled',collisionEnabled:false});
 const gltf=await registerSimreadyLoader(new GLTFLoader()).parseAsync(await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()}),'');
 assertExportedSnapshot(gltf.userData.simready.snapshot,f.snapshot);
 let rendered=0;gltf.scene.traverse(object=>{if(object.isMesh)rendered++;});assert.equal(rendered,3);
 const data=gltf.parser.json.extensions.NEEDLE_simready;
 for(const shape of data.snapshot.shapes){
  const primitive=gltf.parser.json.meshes[shape.mesh].primitives[0];assert.ok(Number.isInteger(primitive.attributes.POSITION));assert.ok(Number.isInteger(primitive.indices));assert.equal(primitive.material,undefined);
  assert.equal(shape.points,undefined);assert.equal(shape.indices,undefined);
 }
 const nodes=gltf.parser.json.nodes.flatMap((node,index)=>node.extensions?.KHR_physics_rigid_bodies?.collider?[index]:[]);
 assert.equal(nodes.length,4);for(const index of nodes)assert.deepEqual((await gltf.parser.getDependency('node',index)).scale.toArray(),[2,3,4]);
 for(const [i,approximation] of ['none','convexHull','sdf','convexDecomposition'].entries()){
  const node=gltf.parser.json.nodes.find(node=>node.name==='/Knob/Collider'+i+' collider');
  const geometry=node.extensions.KHR_physics_rigid_bodies.collider.geometry;
  assert.equal(gltf.parser.json.nodes[geometry.node].mesh,data.snapshot.shapes[i].mesh);assert.equal(geometry.convexHull,approximation==='convexHull');
 }
 assert.ok(gltf.userData.simready.mappingIssues.some(issue=>issue.path==='/Knob/Collider2'&&issue.reason.includes('triangle surface')));
 assert.ok(!gltf.parser.json.extensions.KHR_implicit_shapes,'SDF meshes are not represented as analytic implicit shapes');
});
test('disabled mesh geometry is extracted for export and convex point clouds remain ordinary mesh primitives',async()=>{
 const f=fixture(),points=[-1,-1,-1,1,-1,-1,0,1,-1,0,0,1];let reads=0;
 f.snapshot.shapes=[{path:'/Knob/DisabledHull',body:'/Knob',type:'mesh',approximation:'convexHull',collisionEnabled:false,position:[0,0,0],rotation:[0,0,0,1]}];
 f.handle.readStage=async read=>read(null,{GetPhysicsMeshBuffers(path){assert.equal(path,'/Knob/DisabledHull');reads++;return{points};}});
 const gltf=await registerSimreadyLoader(new GLTFLoader()).parseAsync(await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,semantics:f.semantics,exporter:new GLTFExporter()}),'');
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
test('projects only representable analytic dimensions and principal inertia into Khronos physics',async()=>{
 const f=fixture();
 f.snapshot.bodies[0].diagonalInertia=[0,1,2];
 f.snapshot.shapes=[
  {path:'/Door/Flat',body:'/Door',type:'cube',halfExtents:[0,1,1]},
  {path:'/Door/Ball',body:'/Door',type:'capsule',radius:2,halfHeight:0},
 ];
 const bytes=await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()});
 const {parser}=await new GLTFLoader().parseAsync(bytes,'');
 assertPhysicsSchemas(parser.json);
 assert.deepEqual(parser.json.extensions.KHR_implicit_shapes.shapes,[{type:'sphere',sphere:{radius:2}}]);
 const snapshot=parser.json.extensions.NEEDLE_simready.snapshot;
 assert.deepEqual(snapshot.bodies[0].diagonalInertia,[0,1,2]);
 assert.deepEqual(snapshot.shapes[0].halfExtents,[0,1,1]);
});

test('analytic colliders use KHR_implicit_shapes instead of tessellated meshes',async()=>{
 const f=fixture();
 f.snapshot.shapes=[{type:'cube',halfExtents:[1,2,3]},{type:'sphere',radius:2},{type:'capsule',halfHeight:2,radius:1,axis:'X'},{type:'cylinder',halfHeight:3,radius:2,axis:'Z'},{type:'cone',halfHeight:4,radius:3},{type:'plane'}].map((shape,index)=>({...shape,path:'/Knob/Analytic'+index,body:'/Knob',position:[0,0,0],rotation:[0,0,0,1]}));
 const gltf=await registerSimreadyLoader(new GLTFLoader()).parseAsync(await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,exporter:new GLTFExporter()}),'');
 const json=gltf.parser.json,shapes=json.extensions.KHR_implicit_shapes.shapes;
 assert.deepEqual(shapes.map(shape=>shape.type),['box','sphere','capsule','cylinder','cylinder','plane']);
 assert.deepEqual(shapes[0].box.size,[2,4,6]);assert.equal(shapes[4].cylinder.radiusTop,0);
 for(const index of [4,5]){
  const nodeIndex=json.nodes.findIndex(node=>node.extensions?.KHR_physics_rigid_bodies?.collider?.geometry?.shape===index);
  const node=await gltf.parser.getDependency('node',nodeIndex);
  const direction=new Vector3(0,1,0).applyQuaternion(node.quaternion);
  assert.ok(direction.distanceTo(new Vector3(1,0,0))<1e-5,'an omitted collider axis projects onto source X');
 }
 assert.ok(json.extensions.NEEDLE_simready.snapshot.shapes.every(shape=>shape.mesh===undefined));
 assertExportedSnapshot(gltf.userData.simready.snapshot,f.snapshot);
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
  await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,semantics:f.semantics,exporter,textureResolution:resolution});
  assert.equal(material.map,preview);
 };
 await exportWith(undefined,original);assert.equal(scopes,1);assert.equal(disposals,1);
 await exportWith('preview',preview);assert.equal(scopes,2);assert.equal(disposals,2);
 f.handle.createTextureExport=()=>({getTexture:async()=>{throw new Error('Original unavailable');},dispose(){disposals++;}});
 await assert.rejects(exportWith('original',original),/Original unavailable/);assert.equal(disposals,3);
 const controller=new AbortController();controller.abort();
 await assert.rejects(exportSimreadyGltf({handle:f.handle,exporter:{},signal:controller.signal}),{name:'AbortError'});
});


test('authored body gravity and CCD survive export and gravity reaches standard glTF physics', async () => {
 const f=fixture(); f.snapshot.bodies[0].gravityScale=0; f.snapshot.bodies[0].continuousCollision=false;
 f.snapshot.bodies[1].gravityScale=.5; f.snapshot.bodies[1].continuousCollision=true;
 const bytes=await exportSimreadyGltf({handle:f.handle,snapshot:f.snapshot,semantics:f.semantics,exporter:new GLTFExporter()});
 const imported=await registerSimreadyLoader(new GLTFLoader()).parseAsync(bytes,'');
 assertExportedSnapshot(imported.userData.simready.snapshot,f.snapshot);
 const nodes=imported.parser.json.nodes;
 for(const [path,gravity] of [['/Base',0],['/Door',.5]]){
  const node=nodes.find(n=>n.name===path);
  assert.equal(node.extensions.KHR_physics_rigid_bodies.motion.gravityFactor,gravity);
 }
 const validation=await validateBytes(new Uint8Array(bytes));assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues));
});
