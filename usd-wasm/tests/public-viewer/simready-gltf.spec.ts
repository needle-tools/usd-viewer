import {test,expect,type Page} from '@playwright/test';
import {unzipSync} from 'three/addons/libs/fflate.module.js';
import {readFile,link} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createServer} from 'node:http';
import {stageReady,openAppMenu} from './workbench-menus';

async function inspectExportedRuntime(page:Page,file:string,simulate=false) {
 const server=createServer((_request,response)=>{
  response.writeHead(200,{'Content-Type':'model/gltf-binary','Access-Control-Allow-Origin':'*','Cross-Origin-Resource-Policy':'cross-origin'});
  createReadStream(file).on('error',error=>response.destroy(error)).pipe(response);
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();
 if(!address||typeof address==='string')throw new Error('Expected a TCP address');
 try {return await page.evaluate(async({url,simulate})=>{
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const path='/simready/gltf.js';
  const {registerSimreadyLoader}=await import(path);
  const gltf=await registerSimreadyLoader(new GLTFLoader()).loadAsync(url);
  const runtime=gltf.userData.simready,mechanism=await runtime.createMechanism();
  let result;
  try {
   const record=[...mechanism.joints.values()].find(record=>record.angular&&record.lower<record.upper);
   const before=mechanism.getJointValue(record.data.path),target=Math.abs(before-record.upper)>1?record.upper:record.lower;
   const changed=mechanism.setJointValue(record.data.path,simulate?120:target);
   result={changed,before,after:mechanism.getJointValue(record.data.path),issues:mechanism.unsupported,
    knob:mechanism.bodies.get('/Assembly/Knob')?.body.translation().y,slider:0};
  } finally {mechanism.dispose();}
  if(simulate){
   const rapierPath='/rapier/rapier.mjs',R=(await import(rapierPath)).default;await R.init();
   const simulation=await runtime.createSimulation({rapier:R});
   try{simulation.play();for(let frame=0;frame<240;frame++)simulation.update(1/120);result.slider=simulation.bodies.get('/Assembly/Slider').body.translation().x;}
   finally{simulation.dispose();}
  }
  return result;
 },{url:`http://127.0.0.1:${address.port}/scene.glb`,simulate});}
 finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
}

for(const viewer of ['three','needle'])test(`${viewer}: USD exports to an explicitly loaded SDK runtime with working limits, attachments and drive`,async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`/?viewer=${viewer}&workspace=studio&file=`+encodeURIComponent('/test-fixtures/simready/assembly.usda'));
 await stageReady(page);
 if(viewer==='needle')expect(await page.evaluate(async()=>{
  const path='/usd/plugins/needle.js';
  const {getHydraHandleFromNeedleEngineAsset}=await import(path);
  const handle=(window as any).usdHydra;
  let visual:any;handle.scene.traverse(object=>{if(!visual&&object.isMesh)visual=object;});
  return !!visual&&getHydraHandleFromNeedleEngineAsset(visual)===handle&&Math.abs(handle.scene.scale.x-.01)<1e-8;
 })).toBe(true);
 await openAppMenu(page,'file');await page.locator('#export-gltf').click();
 const share=page.locator('#export-dialog');await expect(share).toBeVisible();
 await expect(share).toContainText('Your original USD, kept safe');
 await expect(share).toContainText('Optimized glTF/GLB');
 await expect(share).toContainText('Optional password protection');
 await expect(share.locator('#export-cloud-cta')).toHaveAttribute('href',/https:\/\/cloud\.needle\.tools/);
 const download=page.waitForEvent('download');
 await share.getByRole('button',{name:'Just the raw GLB',exact:true}).click();
 const file=info.outputPath('assembly.glb');await(await download).saveAs(file);
 const bytes=await readFile(file);
 const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 expect(json.extensionsRequired).toContain('NEEDLE_simready');expect(json.extensions.NEEDLE_simready.snapshot.joints.length).toBe(3);
 const posed=await inspectExportedRuntime(page,file,true);
 expect(posed.issues).toEqual([]);expect(posed.after).toBeCloseTo(90,3);expect(posed.knob).toBeCloseTo(100,3);
 expect(posed.slider).toBeGreaterThan(20);
 // File → Open follows the normal glTF-in-USD route, even for our exported GLB.
 await page.evaluate(()=>(window as any).previousExportHandle=(window as any).usdHydra);
 await page.locator('input[type=file][accept*=".glb"]').first().setInputFiles(file);
 await expect.poll(()=>page.evaluate(()=>!!(window as any).usdHydra&&(window as any).usdHydra!==(window as any).previousExportHandle)).toBe(true);
 await stageReady(page);
 await expect.poll(()=>page.evaluate(()=>!!(window as any).usdPhysics)).toBe(false);
 expect(errors).toEqual([]);
});

test('NVIDIA SimReady glasses export keeps resolved instance ownership and articulated behavior',async({page},info)=>{
 const messages:string[]=[];page.on('console',message=>{if(message.type()==='error')messages.push(message.text());});
 const source='https://huggingface.co/datasets/nvidia/simready-assets/resolve/4763fbfaa4f8e97658e68b57d01b4c86659e08b5/accessory_eyeglasses_a01/simready_usd/sm_accessory_eyeglasses_a01_01.usd';
 await page.goto('/?viewer=three&workspace=studio&file='+encodeURIComponent(source));await stageReady(page);
 await page.getByLabel('Download format',{exact:true}).click();await page.getByRole('menuitemradio',{name:'glTF',exact:true}).click();
 const downloaded=page.waitForEvent('download',{timeout:60000}).catch(async error=>{throw new Error(messages.join('\n')+'\nstatus: '+await page.locator('.usd-download-status').textContent()+'\n'+error.message);});await page.getByRole('button',{name:'Download',exact:true}).click();
 const file=info.outputPath('nvidia-glasses.glb');
 // Keep one physical copy of the download.
 await link((await(await downloaded).path())!,file);
 const bytes=await readFile(file),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 const data=json.extensions.NEEDLE_simready;expect(data.bindings.filter((binding:any)=>binding.instance).length).toBe(4);expect(data.bindings.filter((binding:any)=>binding.body).length).toBe(4);
 for(const mesh of json.meshes)for(const primitive of mesh.primitives)if(primitive.material!==undefined)expect(primitive.attributes.COLOR_0).toBeUndefined();expect(data.snapshot.joints.length).toBeGreaterThan(0);expect(data.bindings.some((binding:any)=>binding.instance)).toBe(true);
 expect(data.source).toBeUndefined();expect(data.usdMetadata.prims.length).toBeGreaterThan(0);
 expect(data.usdMetadata.prims.every((prim:any)=>(prim.attributes||[]).every((attribute:any)=>!['points','faceVertexIndices','normals','primvars:st'].includes(attribute.name)))).toBe(true);
 expect(Buffer.byteLength(JSON.stringify(data.usdMetadata))).toBeLessThan(32768);
 expect(data.usdMetadata.prims.some((prim:any)=>prim.attributes?.some((attribute:any)=>attribute.name==='omni:simready:nonvisual:base'&&attribute.value==='aluminum'))).toBe(true);
 expect(data.usdMetadata.prims.some((prim:any)=>prim.type==='GeomSubset'&&prim.attributes?.some((attribute:any)=>attribute.name==='indices'))).toBe(false);
 expect(data.snapshot.shapes.filter((shape:any)=>shape.type==='mesh').every((shape:any)=>Number.isInteger(shape.mesh)&&!!json.meshes[shape.mesh]&&shape.points===undefined&&shape.indices===undefined)).toBe(true);
 const moved=await inspectExportedRuntime(page,file);
 expect(moved.issues).toEqual([]);expect(moved.changed).toBe(true);expect(Math.abs(moved.after-moved.before)).toBeGreaterThan(1);
});

test('download quality fetches originals while the scene keeps its preview textures',async({page},info)=>{
 await page.addInitScript(()=>{
  Object.defineProperty(Navigator.prototype,'webdriver',{configurable:true,get:()=>false});
  const events:any[]=[];(window as any).qualityEvents=events;
  Object.defineProperty(window,'rybbit',{configurable:true,get:()=>({event:(name:string,properties:any)=>events.push({name,properties})}),set(){}});
 });
 await page.goto('/?viewer=three&render=basic&file=/test-fixtures/simready/assembly.usda');await stageReady(page);
 const images=await page.evaluate(async()=>{
  const encode=async(width:number,height:number)=>{
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d')!;
   context.fillStyle='rgb(40,80,160)';context.fillRect(0,0,width,height);
   return Array.from(new Uint8Array(await(await new Promise<Blob>(resolve=>canvas.toBlob(blob=>resolve(blob!)))).arrayBuffer()));
  };return{original:await encode(8,4),preview:await encode(2,1)};
 });
 let originalRequests=0;
 await page.route('**/original-export.png',route=>{originalRequests++;return route.fulfill({contentType:'image/png',body:Buffer.from(images.original)});});
 await page.route('**/preview-export.png',route=>route.fulfill({contentType:'image/png',body:Buffer.from(images.preview)}));
 await page.evaluate(async()=>{
  const hydraPath='/usd/create.three.js',runtimePath='/usd/bindings/index.js',exportPath='/usd/gltf/simready.js';
  const {Group}=await import('three'),{GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
  const source=`#usda 1.0
(upAxis = "Y"
 metersPerUnit = 1)
def Mesh "Plane" (prepend apiSchemas = ["MaterialBindingAPI"]) {
 point3f[] points = [(-1,0,0),(1,0,0),(1,1,0),(-1,1,0)]
 int[] faceVertexCounts = [4]
 int[] faceVertexIndices = [0,1,2,3]
 texCoord2f[] primvars:st = [(0,0),(1,0),(1,1),(0,1)] (interpolation = "vertex")
 uniform token subdivisionScheme = "none"
 rel material:binding = </Material>
}
def Material "Material" {
 token outputs:surface.connect = </Material/PBR.outputs:surface>
 def Shader "PBR" {
  uniform token info:id = "UsdPreviewSurface"
  color3f inputs:diffuseColor.connect = </Material/Texture.outputs:rgb>
  float inputs:roughness.connect = </Material/Texture.outputs:r>
  token outputs:surface
 }
 def Shader "Texture" {
  uniform token info:id = "UsdUVTexture"
  asset inputs:file = @${location.origin}/original-export.png@
  token inputs:sourceColorSpace = "raw"
  float2 inputs:st.connect = </Material/UV.outputs:result>
  float3 outputs:rgb
  float outputs:r
 }
 def Shader "UV" {
  uniform token info:id = "UsdPrimvarReader_float2"
  string inputs:varname = "st"
  float2 outputs:result
 }
}`;
  const file=Object.assign(new File([source],'export.usda'),{path:'export.usda'});
  const handle=await(await import(hydraPath)).createThreeHydra({USD:await(await import(runtimePath)).getUsdModule(),scene:new Group(),files:[file],autoPlay:false,maxTextureSize:2,resolveTextureUrl:url=>url.replace('original-export.png','preview-export.png')});
  await handle.ready();await handle.materialsReady();
  const w=window as any;w.qualityHandle=handle;
  let material:any;handle.scene.traverse(object=>{if((object as any).material?.map)material=(object as any).material;});
  w.qualityMaterial=material;w.previewMap=material.map;
  w.usdWorkbench.setDownload(()=>({handle,filename:'quality.usda',formats:['zip','usdz','gltf'],exportGltf:options=>(import(exportPath)).then(module=>module.exportSimreadyGltf({handle,exporter:new GLTFExporter(),...options}))}));
 });
 expect(await page.evaluate(()=>(window as any).qualityMaterial.map.image.width)).toBe(2);
 const exportFile=async(name:string)=>{
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download',exact:true}).click();
  const file=info.outputPath(name);await(await downloaded).saveAs(file);return readFile(file);
 };
 const dimensions=(bytes:Buffer)=>{
  const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length).toString()),start=28+length;
  return json.images.map((image:any)=>{const view=json.bufferViews[image.bufferView],offset=start+(view.byteOffset||0);return[bytes.readUInt32BE(offset+16),bytes.readUInt32BE(offset+20)];});
 };
 await page.getByLabel('Download format',{exact:true}).click();await page.getByRole('menuitemradio',{name:'glTF',exact:true}).click();
 expect(dimensions(await exportFile('full.glb'))).toEqual([[8,4],[8,4]]);expect(originalRequests).toBeGreaterThan(0);
 expect(await page.evaluate(()=>{const w=window as any;return w.qualityMaterial.map===w.previewMap&&w.qualityMaterial.map.image.width===2;})).toBe(true);
 await page.getByLabel('Download format',{exact:true}).click();await page.getByRole('menuitemcheckbox',{name:'Full-resolution textures'}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).qualityEvents.filter((event:any)=>event.name==='export_texture_resolution_changed'))).toEqual([{name:'export_texture_resolution_changed',properties:{resolution:'preview'}}]);
 await page.getByRole('menu').screenshot({path:info.outputPath('texture-quality-menu.png')});await page.keyboard.press('Escape');
 const previous=originalRequests;expect(dimensions(await exportFile('preview.glb'))).toEqual([[2,1],[2,1]]);expect(originalRequests).toBe(previous);
 expect(await page.evaluate(()=>(window as any).qualityMaterial.map===(window as any).previewMap)).toBe(true);
 const layerBefore=await page.evaluate(()=>(window as any).qualityHandle.readStage(stage=>stage.GetRootLayer().ExportToString()));
 const imageSize=(bytes:Buffer)=>{
  const entries=unzipSync(new Uint8Array(bytes)),image=Object.values(entries).find(value=>Buffer.from(value.subarray(0,4)).equals(Buffer.from([137,80,78,71])))!;
  return[Buffer.from(image).readUInt32BE(16),Buffer.from(image).readUInt32BE(20)];
 };
 for(const format of ['USDZ','ZIP']){
  const trigger=page.getByLabel('Download format',{exact:true});await trigger.click();await page.getByRole('menuitemradio',{name:format,exact:true}).click();
  await trigger.click();const checkbox=page.getByRole('menuitemcheckbox',{name:'Full-resolution textures'});await expect(checkbox).not.toBeChecked();await expect(checkbox).toBeEnabled();await page.keyboard.press('Escape');
  const preview=await exportFile('preview.'+format.toLowerCase());expect(imageSize(preview)).toEqual([2,1]);
  if(format==='USDZ'){
   const restored=await page.evaluate(async bytes=>{
    const hydraPath='/usd/create.three.js',runtimePath='/usd/bindings/index.js';const {Group}=await import('three');
    const handle=await(await import(hydraPath)).createThreeHydra({USD:await(await import(runtimePath)).getUsdModule(),scene:new Group(),buffer:new Uint8Array(bytes).buffer,url:'preview.usdz',autoPlay:false});
    try{await handle.ready();await handle.materialsReady();return await handle.readStage(stage=>stage.GetPrimAtPath('/Plane').IsValid());}finally{await handle.dispose();}
   },Array.from(preview));expect(restored).toBe(true);
  }
  await trigger.click();await checkbox.click();await page.keyboard.press('Escape');expect(imageSize(await exportFile('full.'+format.toLowerCase()))).toEqual([8,4]);
  await trigger.click();await checkbox.click();await page.keyboard.press('Escape');
 }
 expect(await page.evaluate(()=>(window as any).qualityHandle.readStage(stage=>stage.GetRootLayer().ExportToString()))).toBe(layerBefore);
 await page.evaluate(()=>(window as any).qualityHandle.dispose());
});


test('Cloud sharing hands off the selected format and preview quality without uploading in the test',async({page})=>{
 await page.route('**/cloud-handoff.html?*',route=>route.fulfill({contentType:'text/html',body:'<p>Captured handoff</p>'}));
 await page.goto('/?viewer=three&render=basic&file=/test-fixtures/simready/assembly.usda');await stageReady(page);
 const trigger=page.getByLabel('Download format',{exact:true});await trigger.click();await page.getByRole('menuitemradio',{name:'USDZ',exact:true}).click();
 await trigger.click();await page.getByRole('menuitemcheckbox',{name:'Full-resolution textures'}).click();await page.getByRole('menuitemradio',{name:'Share on Needle Cloud',exact:true}).click();
 await page.getByRole('button',{name:'Share',exact:true}).click();await page.waitForURL('**/cloud-handoff.html?*',{timeout:15000});
 const payload=await page.evaluate(async()=>{const path='/cloud-handoff-store.js',data=await(await import(path)).loadHandoffPayload();return{root:data.rootFilename,files:data.files.map(file=>({name:file.relativePath,bytes:Array.from(new Uint8Array(file.bytes))}))};});
 expect(payload.root).toMatch(/\.usdz$/);expect(payload.files).toHaveLength(1);
 const entries=unzipSync(new Uint8Array(payload.files[0].bytes));expect(Object.keys(entries).some(name=>/\.usd[ac]?$/.test(name))).toBe(true);
});
