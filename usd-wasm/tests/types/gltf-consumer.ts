import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {exportSimreadyGltf} from '@needle-tools/usd/gltf';
import * as usdGltf from '@needle-tools/usd/gltf';
import {registerSimreadyLoader,getSimreadyRuntime,NeedleSimreadyLoaderPlugin,fromGltfPhysicsSnapshot,type SimreadyRuntime} from '@needle-tools/simready/gltf';
import type {NeedleThreeHydraHandle} from '@needle-tools/usd/three';
declare const handle:NeedleThreeHydraHandle;
// @ts-expect-error glTF loading belongs to SimReady; USD only converts the stage.
void usdGltf.registerSimreadyLoader;
const loader=registerSimreadyLoader(new GLTFLoader());
loader.register(parser=>new NeedleSimreadyLoaderPlugin(parser));
const bytes:Promise<ArrayBuffer>=exportSimreadyGltf({handle,exporter:new GLTFExporter()});
const download:Promise<Blob>=exportSimreadyGltf({handle,exporter:new GLTFExporter(),output:'blob'});
void download;
const runtime:SimreadyRuntime|null=getSimreadyRuntime(handle.scene);
if(runtime){
 const metadata=runtime.usdMetadata;
 const reexport:Promise<ArrayBuffer>=exportSimreadyGltf({handle,exporter:new GLTFExporter(),snapshot:fromGltfPhysicsSnapshot(runtime.snapshot),usdMetadata:metadata});
 void reexport;
 runtime.createMechanism().then(mechanism=>{mechanism.setJointValue('/Assembly/Hinge',45);mechanism.dispose();});
 void metadata;
}
void bytes;
