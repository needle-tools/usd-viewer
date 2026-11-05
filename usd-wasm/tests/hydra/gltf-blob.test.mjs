import assert from 'node:assert/strict';
import {test} from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateBytes} from 'gltf-validator';
import {parseGltfBlob} from '../../src/gltf/blob.js';
import {exportSimreadyGltf} from '../../src/gltf/simready.js';

// Run the same lifecycle and byte-equivalence checks against cached peer
// versions without replacing or reinstalling the project's Three dependency.
const threeRoot=process.env.USD_GLTF_BLOB_THREE_ROOT;
const moduleUrl=(file,fallback)=>threeRoot?pathToFileURL(resolve(threeRoot,file)).href:fallback;
const {BufferAttribute,BufferGeometry,Group,Mesh,MeshStandardMaterial}=await import(moduleUrl('build/three.module.js','three'));
const {GLTFExporter}=await import(moduleUrl('examples/jsm/exporters/GLTFExporter.js','three/addons/exporters/GLTFExporter.js'));
const {GLTFLoader}=await import(moduleUrl('examples/jsm/loaders/GLTFLoader.js','three/addons/loaders/GLTFLoader.js'));

let fileReads=0;
globalThis.FileReader=class {
 readAsArrayBuffer(blob){fileReads++;blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
};
globalThis.ProgressEvent ||= class {};

function triangle(name='/Visual'){
 const geometry=new BufferGeometry().setAttribute('position',new BufferAttribute(new Float32Array([0,0,0,1,0,0,0,1,0]),3));
 const mesh=new Mesh(geometry,new MeshStandardMaterial());mesh.name=name;mesh.userData.usdPath=name;return mesh;
}
function readGlb(bytes){
 const view=new DataView(bytes),jsonLength=view.getUint32(12,true);
 assert.equal(view.getUint32(0,true),0x46546c67);assert.equal(view.getUint32(4,true),2);assert.equal(view.getUint32(8,true),bytes.byteLength);
 assert.equal(jsonLength%4,0);assert.equal(view.getUint32(16,true),0x4e4f534a);
 const binaryOffset=20+jsonLength,binaryLength=view.getUint32(binaryOffset,true);
 assert.equal(binaryLength%4,0);assert.equal(view.getUint32(binaryOffset+4,true),0x004e4942);assert.equal(binaryOffset+8+binaryLength,bytes.byteLength);
 return{json:JSON.parse(new TextDecoder().decode(bytes.slice(20,binaryOffset))),binary:new Uint8Array(bytes,binaryOffset+8,binaryLength)};
}

test('Blob output matches Three binary output byte for byte, including padding and extensions',async()=>{
 const exporter=new GLTFExporter(),scene=new Group();scene.add(triangle());
 const extra=writer=>({name:'TEST_blob',afterParse(){
  writer.buffers.push(new Uint8Array([13,14,15]));
  writer.json.extensions={TEST_blob:{value:'padding'}};writer.extensionsUsed.TEST_blob=true;writer.extensionsRequired.TEST_blob=true;
 }});
 exporter.register(extra);const pluginCount=exporter.pluginCallbacks.length;
 const normal=await exporter.parseAsync(scene,{binary:true});
 fileReads=0;
 const blob=await parseGltfBlob(exporter,scene,{binary:false});
 assert.ok(blob instanceof Blob);assert.equal(blob.type,'model/gltf-binary');assert.equal(fileReads,0,'Blob output never reads the complete BIN or GLB');
 const bytes=await blob.arrayBuffer();assert.deepEqual(new Uint8Array(bytes),new Uint8Array(normal));
 assert.equal(exporter.pluginCallbacks.length,pluginCount,'the output adapter is unregistered');
 const {json,binary}=readGlb(bytes);assert.equal(json.buffers[0].byteLength,39);assert.deepEqual(Array.from(binary.slice(-4)),[13,14,15,0]);
 assert.deepEqual(json.extensionsUsed,['TEST_blob']);assert.deepEqual(json.extensionsRequired,['TEST_blob']);
 const report=await validateBytes(new Uint8Array(bytes));assert.equal(report.issues.numErrors,0,JSON.stringify(report.issues));
});

test('Blob finalization drains asynchronous plugin work added by other pending work',async()=>{
 const exporter=new GLTFExporter(),scene=new Group();scene.add(triangle());
 exporter.register(writer=>({name:'TEST_late',afterParse(){
  writer.pending.push(Promise.resolve().then(async()=>{
   await Promise.resolve();
   writer.pending.push(Promise.resolve().then(async()=>{
    await new Promise(resolve=>setImmediate(resolve));
    const mesh=await(writer.processMeshAsync||writer.processMesh).call(writer,triangle('/Late'));
    const node=writer.json.nodes.push({name:'Late',mesh})-1;writer.json.scenes[0].nodes.push(node);
    writer.extensionsUsed.TEST_late=true;(writer.json.extensions||={}).TEST_late={complete:true};
   }));
  }));
 }}));
 const bytes=await(await parseGltfBlob(exporter,scene)).arrayBuffer(),{json}=readGlb(bytes);
 assert.equal(json.meshes.length,2);assert.equal(json.extensions.TEST_late.complete,true);assert.ok(json.extensionsUsed.includes('TEST_late'));
 const report=await validateBytes(new Uint8Array(bytes));assert.equal(report.issues.numErrors,0,JSON.stringify(report.issues));
 const gltf=await new GLTFLoader().parseAsync(bytes,'');let count=0;gltf.scene.traverse(object=>{if(object.isMesh)count++;});assert.equal(count,2);
});

test('SimReady Blob output includes asynchronous collision meshes and matches ArrayBuffer output',async()=>{
 const scene=new Group();scene.add(triangle());
 const handle={scene,ready:async()=>{},setPlaying(){}};
 const snapshot={metersPerUnit:1,kilogramsPerUnit:1,upAxis:'Y',scenes:[],bodies:[],joints:[],materials:[],groups:[],unsupported:[],shapes:[{
  path:'/Collision',body:'',type:'mesh',approximation:'none',points:[0,0,0,1,0,0,0,1,0],indices:[0,1,2],position:[0,0,0],rotation:[0,0,0,1],materials:[],
 }]};
 const usdMetadata={version:1,time:0,stage:{},prims:[]};
 const normal=await exportSimreadyGltf({handle,snapshot,usdMetadata,exporter:new GLTFExporter()});
 const blob=await exportSimreadyGltf({handle,snapshot,usdMetadata,exporter:new GLTFExporter(),output:'blob'});
 assert.ok(blob instanceof Blob);
 const bytes=await blob.arrayBuffer();assert.deepEqual(new Uint8Array(bytes),new Uint8Array(normal));
 const {json}=readGlb(bytes),shape=json.extensions.NEEDLE_simready.snapshot.shapes[0];
 assert.ok(Number.isInteger(shape.mesh));assert.equal(json.meshes[shape.mesh].primitives[0].material,undefined);
 assert.ok(json.extensionsUsed.includes('NEEDLE_simready'));assert.ok(json.extensionsRequired.includes('NEEDLE_simready'));
 const report=await validateBytes(new Uint8Array(bytes));assert.equal(report.issues.numErrors,0,JSON.stringify(report.issues));
});

for(const phase of ['beforeParse','pending'])test(`Blob export propagates real ${phase} failures and unregisters its plugin`,async()=>{
 const exporter=new GLTFExporter(),failure=new Error('Original export failure');
 exporter.register(writer=>({name:'TEST_failure',beforeParse(){if(phase==='beforeParse')throw failure;},afterParse(){if(phase==='pending')writer.pending.push(Promise.reject(failure));}}));
 const pluginCount=exporter.pluginCallbacks.length;
 await assert.rejects(parseGltfBlob(exporter,triangle()),error=>error===failure);
 assert.equal(exporter.pluginCallbacks.length,pluginCount);
});

test('Blob export cancels while waiting for asynchronous plugin work',async()=>{
 const exporter=new GLTFExporter(),controller=new AbortController();
 let started,release;const ready=new Promise(resolve=>started=resolve),pending=new Promise(resolve=>release=resolve);
 exporter.register(writer=>({name:'TEST_wait',afterParse(){writer.pending.push(pending);started();}}));
 const pluginCount=exporter.pluginCallbacks.length;
 const exporting=parseGltfBlob(exporter,triangle(),{signal:controller.signal});
 await ready;controller.abort();
 try{await assert.rejects(exporting,error=>error.name==='AbortError');assert.equal(exporter.pluginCallbacks.length,pluginCount);}
 finally{release();}
});

test('already-cancelled Blob export does not register a plugin',async()=>{
 const exporter=new GLTFExporter(),controller=new AbortController();controller.abort();const pluginCount=exporter.pluginCallbacks.length;
 await assert.rejects(parseGltfBlob(exporter,triangle(),{signal:controller.signal}),error=>error.name==='AbortError');
 assert.equal(exporter.pluginCallbacks.length,pluginCount);
});

test('Blob export checks the GLB size limit before allocating a container',async()=>{
 const exporter=new GLTFExporter();
 // Simulate the writer's reported size without allocating gigabytes. The
 // header alone pushes this binary length past the uint32 GLB length field.
 exporter.register(writer=>({name:'TEST_size',afterParse(){writer.buffers=[{byteLength:0xfffffff0}];}}));
 await assert.rejects(parseGltfBlob(exporter,triangle()),/32-bit container size limit/);
});
