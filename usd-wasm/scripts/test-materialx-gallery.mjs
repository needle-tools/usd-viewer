import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const root=fileURLToPath(new URL('..',import.meta.url));
const server=await createServer({root,configFile:false,resolve:{dedupe:['three']},optimizeDeps:{noDiscovery:true,include:['three','three/webgpu','three/tsl']},server:{port:0,headers:{'Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Opener-Policy':'same-origin'}},plugins:[{name:'gallery-probe',configureServer(server){
 server.middlewares.use((_req,res,next)=>{res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Opener-Policy','same-origin');next();});
 server.middlewares.use('/src/bindings/emHdBindings.js',async(_req,res)=>{res.setHeader('Content-Type','text/javascript');res.end(await readFile(root+'/src/bindings/emHdBindings.js'));});
 server.middlewares.use('/gallery-probe',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>MaterialX gallery probe</title><link rel="icon" href="data:,">');});
}}]});
await server.listen();
const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-webgpu']});const results=[];
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(server.resolvedUrls.local[0]+'gallery-probe');
 const definitionClosure=await page.evaluate(async()=>{
  const {collectMaterialXDefinitions}=await import('/src/hydra/materialxDefinitions.js');
  const document=new DOMParser().parseFromString('<materialx version="1.39"><nodedef name="ND_outer" node="outer"><output name="out" type="color3"/></nodedef><nodegraph name="NG_outer" nodedef="ND_outer"><inner name="child" type="color3"/></nodegraph><nodedef name="ND_inner" node="inner"><output name="out" type="color3"/></nodedef><nodegraph name="NG_inner" nodedef="ND_inner"/><nodedef name="ND_unused" node="unused"/></materialx>','application/xml');
  const result=collectMaterialXDefinitions([document],['ND_outer']);
  return {outer:result.includes('ND_outer'),inner:result.includes('ND_inner'),innerGraph:result.includes('NG_inner'),unused:result.includes('ND_unused')};
 });
 assert.deepEqual(definitionClosure,{outer:true,inner:true,innerGraph:true,unused:false});
 const sourceIsolation=await page.evaluate(async()=>{
  const {materialXDefinitionsFor}=await import('/src/hydra/materialxDefinitions.js');
  const reads=[];let released=0;
  const registry={disposed:false,allPaths:['/unrelated.mtlx'],materialXDefinitionCache:new Map(),getResourceExtension:()=> 'mtlx',
   config:{driver:()=>({GetStage:()=>({GetPrimAtPath:()=>({GetAttribute:()=>({GetValueString:()=> '@/chosen.mtlx@',delete:()=>released++}),delete:()=>released++})})})},
   readResourceText:async path=>{reads.push(path);return '<materialx version="1.39"><nodedef name="ND_chosen" node="chosen"/></materialx>';}};
  const xml=await materialXDefinitionsFor(registry,['ND_chosen'],['/Material/Shader']);
  registry.disposed=true;
  const afterDispose=await materialXDefinitionsFor(registry,['ND_chosen'],['/Material/Shader']);
  return {reads,released,chosen:xml.includes('ND_chosen'),afterDispose};
 });
 assert.deepEqual(sourceIsolation,{reads:['/chosen.mtlx'],released:2,chosen:true,afterDispose:''});
 const tangentTopology=await page.evaluate(async()=>{const {probeConstantTangentTopology}=await import('/tests/hydra/materialx-gallery-browser.js');return probeConstantTangentTopology();});
 assert.deepEqual(tangentTopology,{initial:{count:3,values:[1,0,0,1,0,0,1,0,0]},updated:{count:6,values:[1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0]}});
 const entries=JSON.parse(await readFile(root+'/tests/fixtures/coverage/materialx/manifest.json','utf8'));
 for(const entry of entries.filter(e=>!process.env.GALLERY_FILTER||e.id.includes(process.env.GALLERY_FILTER))){
  errors.length=0;
  try{
   const result=await page.evaluate(async options=>{const {probeGalleryStage}=await import('/tests/hydra/materialx-gallery-browser.js');return Promise.race([probeGalleryStage(options),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Gallery stage timed out after 45s')),45000))]);},{name:entry.id.slice('materialx-'.length),volume:entry.renderer==='bounded-volume'});
   result.errors=[...errors];results.push(result);console.log(JSON.stringify(result));
  }catch(error){results.push({id:entry.id,error:String(error),errors:[...errors]});console.error(entry.id,String(error));await page.reload();}
 }
 await mkdir(root+'/.cache/coverage-validation',{recursive:true});await writeFile(root+'/.cache/coverage-validation/materialx-gallery-browser.json',JSON.stringify(results,null,2)+'\n');
 const expectedDefinitions={nested:['ND_twice','ND_scale'], 'multi-output-uv':['ND_split'], 'two-instances':['ND_scale'], 'wrapped-standard_surface':['ND_wrapped'], 'filename-interface-colorspace':['ND_picture'], 'explicit-version':['ND_v1']};
 for(const result of results){
  for(const name of expectedDefinitions[result.name]||[])assert.ok(result.exportedDefinitions?.includes(name),result.name+': exported custom definition '+name);
  if(result.name==='nested')assert.ok(result.exportedGraphs.includes('NG_scale')&&result.exportedGraphs.includes('NG_twice'),'nested implementation dependency closure');
  if(result.name==='multi-output-uv')assert.ok(result.namedOutputs.includes('outx')&&result.namedOutputs.includes('outy'),'both named outputs preserved');
  assert.ok(!result.error,result.error);assert.deepEqual(result.errors,[],result.name+': console errors');assert.ok(result.materials.length>0,result.name+': featured MaterialX material');assert.ok(result.changed>100,result.name+': visible artifact, excluding furniture');assert.ok(result.colors>4,result.name+': spatial/color variation');assert.equal(result.diagnostics.materialXCreateFailures,0,result.name+': compile failures');assert.equal(result.diagnostics.materialXCreateSuccess,1,result.name+': authored graph selected');assert.equal(result.diagnostics.materialFallbacks,0,result.name+': no fallback material');if(result.name==='nested')assert.ok(result.customSourceAsset?.includes('nested.mtlx'), 'resolver-loaded custom sourceAsset must retain its document URI');}
}finally{await browser.close();await server.close();}
