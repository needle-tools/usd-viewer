import { expect, test } from './test';
import { Matrix4, Vector3 } from 'three';
// standard_surface consumes a tangent basis even on an untextured analytic Cube.
// Author it explicitly so these tests measure shadows on a genuinely lit receiver.
function scene(type:string,variants=false,materialX=false) {
 const pos=new Vector3(-2,4,2),m=new Matrix4().lookAt(pos,new Vector3(),new Vector3(0,1,0)).setPosition(pos);
 const transform=Array.from({length:4},(_,i)=>`(${m.elements.slice(i*4,i*4+4).join(',')})`).join(',');
 const source = `#usda 1.0
(
 metersPerUnit = 1
 upAxis = "Y"
 startTimeCode = 0
 endTimeCode = 24
)
def Xform "World" {
 def Material "Mat" {
  token outputs:surface.connect = </World/Mat/Shader.outputs:surface>
  def Shader "Shader" {
   uniform token info:id = "UsdPreviewSurface"
   color3f inputs:diffuseColor = (0.7,0.7,0.7)
   float inputs:roughness = 1
   token outputs:surface
  }
 }
 def Cube "Ground" (prepend apiSchemas = ["MaterialBindingAPI"]) {
  vector3f[] primvars:tangents = [(1,0,0)] (interpolation = "constant")
  double size = 2
  double3 xformOp:translate = (0,-0.1,0)
  float3 xformOp:scale = (3,0.1,3)
  uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]
  rel material:binding = </World/Mat>
 }
 def Cube "Blocker" (prepend apiSchemas = ["MaterialBindingAPI"]) {
  vector3f[] primvars:tangents = [(1,0,0)] (interpolation = "constant")
  double size = 1
  double3 xformOp:translate = (0,0.75,0)
  uniform token[] xformOpOrder = ["xformOp:translate"]
  rel material:binding = </World/Mat>
 }
 def ${type==='distant'?'DistantLight':'SphereLight'} "Key" (
  prepend apiSchemas = ["ShadowAPI"${type==='spot'?', "ShapingAPI"':''}]
  ${variants?'variants = { string shadows = "on" }\n  prepend variantSets = "shadows"':''}
 ) {
  float inputs:intensity = ${type==='distant'?100:10000}
  ${type==='spot'?'float inputs:shaping:cone:angle = 60':''}
  matrix4d xformOp:transform = (${transform})
  uniform token[] xformOpOrder = ["xformOp:transform"]
  ${variants?`variantSet "shadows" = {
   "on" {
   }
   "off" {
    bool inputs:shadow:enable = false
   }
  }`:`bool inputs:shadow:enable = true
  bool inputs:shadow:enable.timeSamples = {0:true,12:false,24:true}`}
 }
}`;
 return materialX ? source.replace('token outputs:surface.connect', 'token outputs:mtlx:surface.connect')
  .replace('/Shader.outputs:surface', '/Shader.outputs:out').replace('token outputs:surface\n', 'token outputs:out\n')
  .replace('"UsdPreviewSurface"', '"ND_standard_surface_surfaceshader"')
  .replace('inputs:diffuseColor', 'inputs:base_color').replace('inputs:roughness', 'inputs:specular_roughness')
  .replace('token outputs:out\n', 'float3 inputs:tangent = (1,0,0)\n   token outputs:out\n') : source;
}
async function changed(page:any,a:Buffer,b:Buffer,absolute=false) {
 return page.evaluate(async([a,b,absolute]:[string,string,boolean])=>{
  async function pixels(base64:string){
   const im=await createImageBitmap(await(await fetch('data:image/png;base64,'+base64)).blob());
   const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d')!;ctx.drawImage(im,0,0);return ctx.getImageData(0,0,c.width,c.height).data;
  }
  const on=await pixels(a),off=await pixels(b);let count=0;
  for(let i=0;i<on.length;i+=4){const difference=absolute?Math.abs(off[i]-on[i])+Math.abs(off[i+1]-on[i+1])+Math.abs(off[i+2]-on[i+2]):off[i]+off[i+1]+off[i+2]-on[i]-on[i+1]-on[i+2];if(difference>45)count++;}
  return count;
 },[a.toString('base64'),b.toString('base64'),absolute]);
}
for (const viewer of ['three', 'needle']) test(`${viewer}: untextured MaterialX without UVs or tangents stays lit and receives shadows`, async ({ page }, testInfo) => {
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 const source=scene('distant',false,true)
  .replaceAll('  vector3f[] primvars:tangents = [(1,0,0)] (interpolation = "constant")\n','')
  .replace('float3 inputs:tangent = (1,0,0)\n   ','');
 await page.route(url=>url.pathname==='/no-uv-materialx.usda',route=>route.fulfill({contentType:'text/plain',body:source}));
 await page.goto(`/?viewer=${viewer}&file=/no-uv-materialx.usda`);
 await page.waitForFunction(()=>!!(window as any).usdHydra);
 const basis=await page.evaluate(async()=>{
  const w=window as any,h=w.usdHydra;await h.ready();await h.materialsReady();h.setPlaying(false);await h.setTime(0);
  if(w._controls){w._controls.autoRotate=false;w._controls.enableDamping=false;}
  let result:any;h.scene.traverse((object:any)=>{if(object.userData.usdPath==='/World/Ground'){
   const attributes=object.geometry.attributes;
   result={material:object.material.constructor.name,uv:!!attributes.uv,positions:attributes.position.count,
    tangents:attributes.tangent?.count||0,finite:Array.from(attributes.tangent?.array||[]).every(Number.isFinite)};
  }});return result;
 });
 expect(basis.material).toBe(viewer==='three'?'MeshPhysicalNodeMaterial':'MaterialXMaterial');expect(basis.uv).toBe(false);
 if(viewer==='needle'||basis.tangents)expect(basis.tangents).toBe(basis.positions);expect(basis.finite).toBe(true);
 const canvas=page.locator(viewer==='three'?'canvas.usd-viewer-three-canvas':'needle-engine canvas').first();
 await page.waitForTimeout(150);const on=await canvas.screenshot({path:testInfo.outputPath('no-uv-shadow-enabled.png')});
 await page.evaluate(async()=>{await(window as any).usdHydra.setTime(12);});
 await page.waitForTimeout(150);const off=await canvas.screenshot({path:testInfo.outputPath('no-uv-shadow-disabled.png')});
 expect(await changed(page,on,off)).toBeGreaterThan(150);
 expect(errors).toEqual([]);
});
for(const materialX of [false,true])for(const viewer of ['three','needle'])for(const type of ['distant','point','spot'])test(`${viewer}: ${materialX?'MaterialX':'PreviewSurface'} ${type} shadows produce occlusion and follow authored time samples`,async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'){console.log(m.text());errors.push(m.text());}});
 await page.route(url=>url.pathname==='/shadow-test.usda',r=>r.fulfill({contentType:'text/plain',body:scene(type,false,materialX)}));
 await page.goto(`/?viewer=${viewer}&file=/shadow-test.usda`);await page.waitForFunction(()=>!!(window as any).usdHydra,null,{timeout:30000});
 const state=await page.evaluate(async()=>{
  const w=window as any,h=w.usdHydra;await h.ready();await h.materialsReady();h.setPlaying(false);await h.setTime(0);
  if(w._controls){w._controls.enableDamping=false;w._controls.autoRotate=false;}
  let light:any,material:any;h.scene.traverse((o:any)=>{if(o.userData.usdPath==='/World/Key')light=o;if(o.userData.usdPath==='/World/Ground')material=o.material;});
  return {material:material.constructor.name,enabled:(w.needleEngineContext?.renderer||w.renderer).shadowMap.enabled,cast:light.castShadow,type:light.type,authored:light.userData.usdShadowEnabled};
 });
 if(materialX)expect(state.material).toBe(viewer==='three'?'MeshPhysicalNodeMaterial':'MaterialXMaterial');
 expect(state.enabled).toBe(true);expect(state.cast).toBe(true);expect(state.authored).toBe(true);expect(state.type).toBe({distant:'DirectionalLight',point:'PointLight',spot:'SpotLight'}[type]);
 const canvas=page.locator(viewer==='three'?'canvas.usd-viewer-three-canvas':'needle-engine canvas').first();await page.waitForTimeout(150);
 const on=await canvas.screenshot({path:testInfo.outputPath('shadow-enabled.png')});
 const disabled=await page.evaluate(async()=>{const h=(window as any).usdHydra;await h.setTime(12);let cast:any;h.scene.traverse((o:any)=>{if(o.userData.usdPath==='/World/Key')cast=o.castShadow;});return cast;});
 expect(disabled).toBe(false);await page.waitForTimeout(150);const off=await canvas.screenshot({path:testInfo.outputPath('shadow-disabled.png')});
 const delta=await changed(page,on,off);console.log(viewer,type,'shadow pixels',delta);expect(delta).toBeGreaterThan(150);
 await page.evaluate(async()=>{await(window as any).usdHydra.setTime(24);});await page.waitForTimeout(150);const restored=await canvas.screenshot();expect(await changed(page,restored,off)).toBeGreaterThan(150);expect(errors).toEqual([]);
});
for(const viewer of ['three','needle'])test(`${viewer}: shadow enable follows composed variants`,async({page})=>{
 await page.route(url=>url.pathname==='/shadow-variants.usda',r=>r.fulfill({contentType:'text/plain',body:scene('distant',true)}));
 await page.goto(`/?viewer=${viewer}&file=/shadow-variants.usda`);await page.waitForFunction(()=>!!(window as any).usdHydra,null,{timeout:30000});
 const states=await page.evaluate(async()=>{
  const h=(window as any).usdHydra;await h.ready();await h.materialsReady();h.setPlaying(false);const states=[];
  for(const variant of ['off','on','off']){
   await h.editStage(async(stage:any)=>{const p=stage.GetPrimAtPath('/World/Key');try{await p.SetVariantSelection('shadows',variant);}finally{p.delete();}});
   h.scene.traverse((o:any)=>{if(o.userData.usdPath==='/World/Key')states.push(o.castShadow);});
  }
  await h.dispose();return states;
 });expect(states).toEqual([false,true,false]);
});

for(const viewer of ['three','needle'])test(`${viewer}: gallery Distant sun shadow variant changes rendered occlusion`,async({page},testInfo)=>{
 await page.goto(`/?viewer=${viewer}&file=/test-fixtures/coverage/lighting-mdl/distant-sun.usda`);
 await page.waitForFunction(()=>!!(window as any).usdHydra);
 await page.evaluate(async()=>{const h=(window as any).usdHydra;await h.ready();await h.materialsReady();h.setPlaying(false);});
 await page.evaluate(() => (window as any).usdWorkbench.openPanel('properties'));
 const select=page.locator('select[data-stage-variant="shadows"]');
 await expect(select).toHaveValue('enabled');
 const cast=()=>page.evaluate(()=>{let value:any;(window as any).usdHydra.scene.traverse((o:any)=>{if(o.userData.usdPath==='/World/Lights/Sun')value=o.castShadow;});return value;});
 await expect.poll(cast).toBe(true);
 const canvas=page.locator(viewer==='three'?'canvas.usd-viewer-three-canvas':'needle-engine canvas').first();
 await page.waitForTimeout(150);const on=await canvas.screenshot({path:testInfo.outputPath('gallery-shadow-enabled.png')});
 await select.selectOption('disabled');await expect(select).toBeEnabled();await expect.poll(cast).toBe(false);
 await page.waitForTimeout(150);const off=await canvas.screenshot({path:testInfo.outputPath('gallery-shadow-disabled.png')});
 const delta=await changed(page,on,off);console.log(viewer,'gallery shadow pixels',delta);expect(delta).toBeGreaterThan(150);
 await select.selectOption('enabled');await expect(select).toBeEnabled();await expect.poll(cast).toBe(true);
});

for(const viewer of ['three','needle'])test(`${viewer}: MaterialX per-light shadow changes retain matching shadow-map order`,async({page},testInfo)=>{
 let source=scene('distant',false,true).replace('float inputs:intensity = 100','color3f inputs:color = (1,0.1,0.05)\n  float inputs:intensity = 100');
 const fill=`
 def DistantLight "Fill" (prepend apiSchemas = ["ShadowAPI"]) {
  float inputs:intensity = 100
  color3f inputs:color = (0.05,0.1,1)
  bool inputs:shadow:enable = true
  float3 xformOp:rotateXYZ = (-50,40,0)
  uniform token[] xformOpOrder = ["xformOp:rotateXYZ"]
 }
`;
 source=source.slice(0,source.lastIndexOf('}'))+fill+'}\n';
 await page.route(url=>url.pathname==='/two-shadow-lights.usda',r=>r.fulfill({contentType:'text/plain',body:source}));
 await page.goto(`/?viewer=${viewer}&file=/two-shadow-lights.usda`);await page.waitForFunction(()=>!!(window as any).usdHydra);
 await page.evaluate(async()=>{
  const h=(window as any).usdHydra;
  await h.ready();await h.materialsReady();h.setPlaying(false);await h.setTime(0);
 });
 // MaterialX's environment is initialized by the first rendered frame. Poll the
 // awaited evaluation: waitForFunction treats an async predicate's Promise as truthy.
 const readPaths=()=>page.evaluate(async viewer=>{
  const w=window as any;
  if(viewer==='three'){const paths:string[]=[];w.scene.traverse((light:any)=>{if(light.isDirectionalLight&&light.userData.usdPath)paths.push(light.userData.usdPath);});return paths;}
  const {MaterialXEnvironment}=await import('/materialx/index.js');
  return MaterialXEnvironment.get(w.needleEngineContext.scene).lights
   .filter((light:any)=>light.isDirectionalLight&&light.userData.usdPath).map((light:any)=>light.userData.usdPath);
 },viewer);
 await expect.poll(async()=>(await readPaths()).sort()).toEqual(['/World/Fill','/World/Key']);
 const initial=await readPaths();
 expect(initial).toHaveLength(2);
 expect(initial.every((path:any)=>typeof path==='string')).toBe(true);
 const canvas=page.locator(viewer==='three'?'canvas.usd-viewer-three-canvas':'needle-engine canvas').first();
 await page.waitForTimeout(150);const bothOn=await canvas.screenshot();
 await page.evaluate(async(path:string)=>{
  await (window as any).usdHydra.editStage(async(stage:any)=>{
   const prim=stage.GetPrimAtPath(path);const attribute=prim.GetAttribute('inputs:shadow:enable');
   try{attribute.SetBool(false,0);}finally{attribute.delete();prim.delete();}
  });
 },initial[0]);
 await page.waitForTimeout(150);const actual=await canvas.screenshot({path:testInfo.outputPath('per-light-actual.png')});
 expect(await changed(page,bothOn,actual)).toBeGreaterThan(150);
 const order=await page.evaluate(async viewer=>{
  const w=window as any;
  if(viewer==='three'){
   const before:any[]=[];w.scene.traverse((object:any)=>{
    if(object.isDirectionalLight&&object.userData.usdPath){before.push({path:object.userData.usdPath,cast:object.castShadow});object.shadow.needsUpdate=true;}
    if(object.isMesh)for(const material of [object.material].flat())material.needsUpdate=true;
   });return before;
  }
  const {MaterialXEnvironment}=await import('/materialx/index.js');
  const e=MaterialXEnvironment.get(w.needleEngineContext.scene);
  const before=e.lights.map((l:any)=>({path:l.userData.usdPath,cast:l.castShadow}));
  e.refreshLights();return before;
 },viewer);
 await page.waitForTimeout(150);const reference=await canvas.screenshot({path:testInfo.outputPath('per-light-explicit-refresh.png')});
 const delta=await changed(page,actual,reference,true);
 console.log(viewer,'per-light refresh mismatch pixels',delta,'order',order);
 expect(delta).toBeLessThan(5);
 expect(order.find((light:any)=>light.path===initial[0]).cast).toBe(false);
 expect(order.find((light:any)=>light.path===initial[1]).cast).toBe(true);
 if(viewer==='needle')expect(order.map((l:any)=>l.cast)).toEqual([true,false]);
});
