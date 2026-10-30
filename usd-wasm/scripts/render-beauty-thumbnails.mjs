#!/usr/bin/env node
// Capture the actual application's Beauty renderer, retaining native Storm cards.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
import {testAssetLibrary} from '../tests/fixtures/test-asset-library.js';
import {replExamples,apiExampleAssets} from '../tests/fixtures/api/examples.js';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),fixtures=resolve(repo,'usd-wasm/tests/fixtures');
const args=process.argv.slice(2),option=(name,fallback)=>{const at=args.indexOf(name);return at<0?fallback:args[at+1];};
const base=option('--base-url','http://localhost:3003'),only=option('--only','').split(',').filter(Boolean),force=args.includes('--force');
const timeout=Math.max(1000,Number(option('--timeout','120000'))||120000);
const width=448,height=336,profile={revision:2,renderer:'Needle Beauty',width,height,detail:'high',camera:[6,5,7],fitPasses:2,settleFrames:24};
const output=resolve(fixtures,'thumbnails/beauty'),indexPath=resolve(output,'index.json');await mkdir(output,{recursive:true});
const reportPath=resolve(repo,'usd-wasm/.cache/beauty-thumbnails/captures.json');await mkdir(dirname(reportPath),{recursive:true});
let previous={};try{previous=JSON.parse(await readFile(indexPath,'utf8'));}catch{}
const records=new Map((previous.results||[]).map(record=>[record.root,record]));
const fileHashes=new Map();async function hashFile(path){if(!fileHashes.has(path))fileHashes.set(path,createHash('sha256').update(await readFile(path)).digest('hex'));return fileHashes.get(path);}
const runtime=await Promise.all(['usd-wasm/scripts/render-beauty-thumbnails.mjs','public/viewer-app.js','public/viewer-framing.js','usd-wasm/src/bindings/emHdBindings.wasm','usd-wasm/src/hydra/ThreeJsRenderDelegate.js'].map(path=>hashFile(resolve(repo,path))));
let assets=testAssetLibrary.map(asset=>({...asset,id:asset.id||(asset.executable?'api-'+asset.executable:asset.root.replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase()),source:'/test-fixtures/'+asset.root}));
if(args.includes('--include-remote'))assets.push(...JSON.parse(await readFile(resolve(repo,'public/data/usd-samples.json'),'utf8')).map(asset=>({...asset,id:'usd-assets-'+asset.id,root:asset.url,source:asset.url,label:asset.name,remote:true})));
if(only.length)assets=assets.filter(asset=>only.includes(asset.id)||only.includes(asset.root)||only.includes(asset.executable));
const group=option('--group','');if(group)assets=assets.filter(asset=>asset.group===group);
if(!assets.length)throw new Error('No matching examples');
let writes=Promise.resolve();
// The viewer needs the image inventory; per-run diagnostics stay in the cache.
const previewEntry=record=>Object.fromEntries(['id','root','status','image','sha256','sourceFingerprint','background'].filter(key=>record[key]!==undefined).map(key=>[key,record[key]]));
const save=()=>{writes=writes.then(async()=>{
 const results=[...records.values()].sort((a,b)=>a.root.localeCompare(b.root));
 await writeFile(reportPath,JSON.stringify({schema:1,profile,results},null,2)+'\n');
 await writeFile(indexPath,JSON.stringify({schema:1,profile,results:results.map(previewEntry)},null,2)+'\n');
});return writes;};
const browser=await chromium.launch({channel:'chrome'});
let failed=0,next=0;
async function capture(asset,i,context){
  const background=option('--background',asset.thumbnailBackground||records.get(asset.root)?.background||new URL(base).searchParams.get('background')||'light');
  const lesson=asset.executable?replExamples[apiExampleAssets.findIndex(entry=>entry.executable===asset.executable)]?.code:null;
  const imported=[...(lesson||'').matchAll(/openFixture\(["']([^"']+)["']/g)].flatMap(([,query])=>{const fixture=testAssetLibrary.find(entry=>!entry.executable&&[entry.root,entry.label].some(value=>value.toLowerCase()===query.toLowerCase()));return fixture?[...(fixture.files||[]),fixture.root]:[];});
  const dependencies=asset.remote?[]:await Promise.all([...new Set([...(asset.files||[]),...imported,asset.root.split('#')[0],...(asset.executable?['api/scene-helpers.js','api/create-api-stage.js']:[])])].map(async path=>[path,await hashFile(resolve(fixtures,path))]));
  const fingerprint=createHash('sha256').update(JSON.stringify({profile,runtime,dependencies,lesson,root:asset.root,frame:asset.thumbnailFrame,background})).digest('hex');
  const old=records.get(asset.root);if(!force&&old?.status==='rendered'&&old.sourceFingerprint===fingerprint){try{await access(resolve(fixtures,old.image));console.log(`${i+1}/${assets.length} ${asset.id}: current`);return;}catch{}}
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(timeout);page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('requestfailed',request=>errors.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`));
  const record={id:asset.id,root:asset.root,status:'failed',sourceFingerprint:fingerprint,captureScriptSha256:runtime[0],background};
  try{
   const url=new URL(base);for(const [key,value] of Object.entries({viewer:'three',render:'beauty',complexity:'high',assetCache:'0',cameraX:'6',cameraY:'5',cameraZ:'7',background,file:asset.source}))url.searchParams.set(key,value);
   await page.goto(url.href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.usdStagePanel,null,{timeout});await page.locator('#loading-overlay').waitFor({state:'hidden'});
   await page.evaluate(async asset=>{
    window.usdHydra.setPlaying(false);await window.usdHydra.materialsReady();
    const start=window.usdStage.GetStartTimeCode(),end=window.usdStage.GetEndTimeCode();
    const frame=Number.isFinite(asset.thumbnailFrame)?asset.thumbnailFrame:end>start?Math.round(start+(end-start)*.25):start;
    await window.usdHydra.setTime(frame);
    window.usdWorkbench.reset('viewport');
   },asset);
   const capture=await page.evaluate(async()=>{
    const frames=async count=>{for(let i=0;i<count;i++)await new Promise(requestAnimationFrame);};
    await frames(3);const first=await window.usdViewportInteraction.focus({instant:true});await frames(4);
    const second=await window.usdViewportInteraction.focus({instant:true});await frames(24);
    const c=window.usdRenderCamera||window.camera;
    return {timeCode:window.usdHydra.getTime(),fits:[first,second],camera:{position:c.position.toArray(),target:window._controls.target.toArray(),fov:c.fov,aspect:c.aspect},mode:window.usdRenderModes.mode};
   });
   if(!capture.fits[1]?.bounds)throw new Error('No renderable bounds after the second fit');
   const target=page.locator('#usd-viewport canvas').first();
   const screenshot=await target.screenshot({type:'png'});
   const encoded=await page.evaluate(async({png,width,height})=>{
    const blob=await(await fetch('data:image/png;base64,'+png)).blob(),bitmap=await createImageBitmap(blob),canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d');
    if(Math.abs(bitmap.width/bitmap.height-width/height)>.01)throw new Error('Capture viewport has the wrong aspect ratio');
    ctx.drawImage(bitmap,0,0,width,height);bitmap.close();const pixels=ctx.getImageData(0,0,width,height).data;
    const corner=(8*width+8)*4,bg=[pixels[corner],pixels[corner+1],pixels[corner+2]];let foreground=0,luminance=0,colorful=0;
    for(let i=0;i<pixels.length;i+=4){if(Math.abs(pixels[i]-bg[0])+Math.abs(pixels[i+1]-bg[1])+Math.abs(pixels[i+2]-bg[2])>24){foreground++;luminance+=(pixels[i]+pixels[i+1]+pixels[i+2])/765;if(Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2])>20)colorful++;}}
    const webp=await canvas.convertToBlob({type:'image/webp',quality:.92});return {bytes:Array.from(new Uint8Array(await webp.arrayBuffer())),pixels:{foreground,luminance:foreground?luminance/foreground:0,colorful}};
   },{png:screenshot.toString('base64'),width,height});
   if(!encoded.pixels.foreground)throw new Error('Capture contains only the background');
   const bytes=Buffer.from(encoded.bytes),image='thumbnails/beauty/'+asset.id+'.webp';await writeFile(resolve(fixtures,image),bytes);
   Object.assign(record,{status:'rendered',image,sha256:createHash('sha256').update(bytes).digest('hex'),pixels:encoded.pixels,...capture,...(errors.length?{pageErrors:errors}:{})});
   console.log(`${i+1}/${assets.length} ${asset.id}: rendered`);
  }catch(error){record.error=error.stack||String(error);failed++;console.log(`${i+1}/${assets.length} ${asset.id}: FAILED ${error.message}`);}
  finally{if(errors.length)record.pageErrors=errors;records.set(asset.root,record);await save();await page.close();}
}
const workers=Math.max(1,Math.min(3,Number(option('--workers','2'))||2));
try{await Promise.all(Array.from({length:workers},async()=>{
 const context=await browser.newContext({viewport:{width:800,height:645},deviceScaleFactor:1,reducedMotion:'reduce'});
 try{while(next<assets.length){const i=next++;await capture(assets[i],i,context);}}finally{await context.close();}
}));}finally{await browser.close();await save();}
if(failed)process.exitCode=1;
