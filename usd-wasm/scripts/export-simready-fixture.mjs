import {readFile,writeFile} from 'node:fs/promises';
import {Group} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {getUsdModule} from '../src/bindings/index.js';
import {createThreeHydra} from '../src/create.three.js';
import {exportSimreadyGltf} from '../src/gltf/simready.js';
globalThis.FileReader ||= class {
 readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
 readAsDataURL(blob){blob.arrayBuffer().then(value=>{this.result=`data:${blob.type};base64,${Buffer.from(value).toString('base64')}`;this.onloadend?.();});}
};
export async function exportFixture(){
 const USD=await getUsdModule({print(){},printErr(){}});
 const buffer=await readFile(new URL('../tests/fixtures/simready/assembly.usda',import.meta.url));
 const handle=await createThreeHydra({USD,scene:new Group(),url:'assembly.usda',buffer,autoPlay:false});
 try{return new Uint8Array(await exportSimreadyGltf({handle,exporter:new GLTFExporter()}));}
 finally{await handle.dispose();}
}
if(process.argv[1]===new URL(import.meta.url).pathname){if(!process.argv[2])throw new Error('Provide the output .glb path.');const alive=setInterval(()=>{},1000);try{await writeFile(process.argv[2],await exportFixture());}finally{clearInterval(alive);}}
