import {test,expect} from './test';

test('UDIM tiles retain row orientation, preview budget and full-resolution glTF export',async({page})=>{
 await page.goto('/?viewer=three&render=basic&file=/test-fixtures/simready/assembly.usda');
 const result=await page.evaluate(async()=>{
  const hydraPath='/usd/create.three.js',runtimePath='/usd/bindings/index.js',exportPath='/usd/gltf/simready.js';
  const {Group,Scene,WebGLRenderer,OrthographicCamera,HemisphereLight}=await import('three');
  const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const files:File[]=[];
  for(const [index,color]of ['red','lime','blue','yellow'].entries()){
   const canvas=document.createElement('canvas');canvas.width=canvas.height=4;
   const context=canvas.getContext('2d')!;context.fillStyle=color;context.fillRect(0,0,4,4);
   files.push(Object.assign(new File([await new Promise<Blob>(r=>canvas.toBlob(b=>r(b!)))],`tile.${[1001,1002,1011,1012][index]}.png`),{path:`tile.${[1001,1002,1011,1012][index]}.png`}));
  }
  const source=`#usda 1.0
(upAxis="Y"\nmetersPerUnit=1)
def Mesh "Plane" (prepend apiSchemas=["MaterialBindingAPI"]) {
 point3f[] points=[(0,0,0),(2,0,0),(2,2,0),(0,2,0)]
 int[] faceVertexCounts=[4]
 int[] faceVertexIndices=[0,1,2,3]
 texCoord2f[] primvars:st=[(0,0),(2,0),(2,2),(0,2)] (interpolation="vertex")
 uniform token subdivisionScheme="none"
 rel material:binding=</Material>
}
def Material "Material" {
 token outputs:surface.connect=</Material/PBR.outputs:surface>
 def Shader "PBR" {
  uniform token info:id="UsdPreviewSurface"
  color3f inputs:diffuseColor.connect=</Material/Texture.outputs:rgb>
  token outputs:surface
 }
 def Shader "Texture" {
  uniform token info:id="UsdUVTexture"
  asset inputs:file=@./tile.<UDIM>.png@
  token inputs:sourceColorSpace="sRGB"
  float2 inputs:st.connect=</Material/UV.outputs:result>
  float3 outputs:rgb
 }
 def Shader "UV" {
  uniform token info:id="UsdPrimvarReader_float2"
  string inputs:varname="st"
  float2 outputs:result
 }
}`;
  files.unshift(Object.assign(new File([source],'udim.usda'),{path:'udim.usda'}));
  const renderer=new WebGLRenderer();renderer.setSize(128,128);
  const handle=await(await import(hydraPath)).createThreeHydra({USD:await(await import(runtimePath)).getUsdModule(),scene:new Group(),renderer,files,autoPlay:false,maxTextureSize:2});
  try{
   await handle.ready();await handle.materialsReady();
   let map:any;handle.scene.traverse(o=>{if((o as any).material?.map)map=(o as any).material.map;});
   if(!map)throw new Error('UDIM texture was not assigned');
   const render=(root:any)=>{
    const scene=new Scene();scene.add(root,new HemisphereLight(0xffffff,0xffffff,2));
    const camera=new OrthographicCamera(0,2,2,0,.1,10);camera.position.set(0,0,5);renderer.render(scene,camera);
    const pixels=new Uint8Array(128*128*4);renderer.getContext().readPixels(0,0,128,128,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,pixels);scene.remove(root);return pixels;
   };
   const before=render(handle.scene),dimensions=[];
   let error=0;
   for(const textureResolution of ['original','preview']){
    const blob=await(await import(exportPath)).exportSimreadyGltf({handle,exporter:new GLTFExporter(),textureResolution,output:'blob'});
    const buffer=await blob.arrayBuffer(),jsonLength=new DataView(buffer).getUint32(12,true),json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,jsonLength)));
    const image=json.images[0],view=json.bufferViews[image.bufferView],bitmap=await createImageBitmap(new Blob([new Uint8Array(buffer,28+jsonLength+(view.byteOffset||0),view.byteLength)],{type:image.mimeType}));
    dimensions.push([bitmap.width,bitmap.height]);bitmap.close();
    const loader=new GLTFLoader();loader.register(parser=>{parser.textureLoader.setOptions?.({resizeWidth:2,resizeHeight:2});return{name:'UDIM_PREVIEW_BUDGET'};});
    const gltf=await loader.parseAsync(buffer,''),after=render(gltf.scene);
    for(let i=0;i<before.length;i++)error+=Math.abs(before[i]-after[i]);
   }
   return{size:[map.image.width,map.image.height],tiles:map.userData.usdUdim.tiles,dimensions,error:error/(before.length*255*2)};
  }finally{await handle.dispose();renderer.dispose();renderer.forceContextLoss();}
 });
 expect(result.size).toEqual([2,2]);expect(result.tiles).toEqual([1001,1002,1011,1012]);
 expect(result.dimensions).toEqual([[8,8],[2,2]]);expect(result.error).toBeLessThan(.01);
});

test('HTTP UDIM discovery finds sparse tiles without fetching missing image bodies',async({page})=>{
 await page.goto('/?viewer=three&render=basic&file=/test-fixtures/simready/assembly.usda');
 const png=await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=2;const context=canvas.getContext('2d')!;context.fillStyle='red';context.fillRect(0,0,2,2);return[...new Uint8Array(await(await new Promise<Blob>(resolve=>canvas.toBlob(blob=>resolve(blob!)))).arrayBuffer())];});
 let heads=0,gets=0,missingGets=0;
 await page.route(/\/udim-tiles\/tile\.\d+\.png$/,async route=>{
  const tile=Number(route.request().url().match(/tile\.(\d+)\.png$/)![1]),exists=[1001,1003,1012].includes(tile);
  if(route.request().method()==='HEAD')heads++;else{gets++;if(!exists)missingGets++;}
  await route.fulfill({status:exists?200:404,contentType:'image/png',body:route.request().method()==='HEAD'?'':exists?Buffer.from(png):''});
 });
 const result=await page.evaluate(async()=>{
  const path='/usd/hydra/ThreeJsRenderDelegate.js';
  const {ThreeRenderDelegateInterface}=await import(path),{Group}=await import('three');
  const delegate=new ThreeRenderDelegateInterface({usdRoot:new Group(),paths:[],maxTextureSize:512});
  try{
   const texture=await delegate.registry.getTexture(location.origin+'/udim-tiles/tile.<UDIM>.png');
   const pixels=texture.image.getContext('2d').getImageData(2,2,1,1).data;
   return{size:[texture.image.width,texture.image.height],tiles:texture.userData.usdUdim.tiles,hole:[...pixels]};
  }finally{delegate.dispose();}
 });
 expect(result.tiles).toEqual([1001,1003,1012]);expect(result.size).toEqual([6,4]);expect(result.hole).toEqual([0,0,0,0]);
 expect(heads).toBe(100);expect(gets).toBe(3);expect(missingGets).toBe(0);
});
