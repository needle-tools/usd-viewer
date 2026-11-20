import {createHash} from 'node:crypto';
import {mkdir,stat,rm,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';
import {serveCorpus} from './server.mjs';
import {writeJsonAtomic} from './files.mjs';
import {createPhaseTiming} from './phase-timing.mjs';
import {validateGltfFile} from './validate-file.mjs';
import {captureBrowserArgs,prepareHardwareCapture} from './rendering.mjs';

/** One isolated, sequential export lane. Reuse the browser, WASM runtime and
 * HTTP connections; recycle the context after failures or large heap growth. */
export async function createCorpusSession({values,build,identity,harness,server,onEvent=event=>console.log(JSON.stringify(event))}){
 const output=resolve(values.output),retainSuccess=!values['discard-success'];
 await mkdir(join(output,'assets'),{recursive:true});
 const ownsServer=!server;server??=await serveCorpus({build:resolve(values.build),assets:/^https?:/.test(values.assets)?values.assets:resolve(values.assets),results:output,port:Number(values.port??0)});
 let browser,context,page;
 const reset=async(restartBrowser=false)=>{page=undefined;await context?.close().catch(()=>{});context=undefined;if(restartBrowser){await browser?.close().catch(()=>{});browser=undefined;}};
 const acquire=async()=>{
  if(page&&!page.isClosed())return page;
  // ANGLE can report no renderer while its hardware process starts. Retry
  // startup only; never replay an export or accept a software renderer.
  for(let attempt=0;;attempt++)try{
   browser??=await chromium.launch({executablePath:values.chrome,headless:true,args:['--js-flags=--max-old-space-size=8192','--disable-background-timer-throttling',...captureBrowserArgs(process.platform)]});
   context=await browser.newContext();page=await context.newPage();
   await page.goto(server.origin+'/gpu.html');await prepareHardwareCapture(page);
   await page.goto(server.origin+'/corpus.html');await page.waitForFunction(()=>typeof window.runAsset==='function');return page;
  }catch(error){await reset(true);if(attempt>=2||error.code!=='GPU_CONTEXT_UNAVAILABLE')throw error;onEvent({event:'hardware-startup-retry',attempt:attempt+1,error:error.message});}
 };
 return {origin:server.origin,async close(){await reset(true);if(ownsServer)await server.close();},async run(asset){
const logs = [], requests = [];
let lastPhase = 'page';
const phaseTiming=createPhaseTiming();
const onConsole = message => {
	if (message.text().startsWith('[corpus-phase] ')) {
		lastPhase = message.text().slice(15);
		onEvent({event:'phase',id:asset.id,phase:lastPhase,elapsedSeconds:phaseTiming.enter(lastPhase),at:new Date().toISOString()});
	}
	if (['error', 'warning'].includes(message.type())) logs.push({type: message.type(), text: message.text().slice(0, 8000)});
};
 const onPageError = error => logs.push({type: 'pageerror', text: error.stack || error.message});
const onRequestFailed = request => {
	const error = request.failure()?.errorText;
	if (error && error !== 'net::ERR_ABORTED') requests.push({url: request.url(), method: request.method(), error});
};
 const onResponse = response => {
	const request=response.request(),discovery=request.method()==='HEAD'&&request.headers().accept==='application/x-usd-udim-probe';
	if (response.status() >= 400 && !(discovery&&response.status()===404)) requests.push({status: response.status(), url: response.url()});
};
 let result = {id: asset.id, root: asset.root, identity, harness, startedAt: new Date().toISOString()}, timeout;
onEvent({event:'asset',id:asset.id,root:asset.root});
try {
 await acquire();
 page.on('console',onConsole);page.on('pageerror',onPageError);page.on('requestfailed',onRequestFailed);page.on('response',onResponse);
	const data = await Promise.race([page.evaluate(options => window.runAsset(options), {asset, textureResolution: values.textures, reimportUsd: !!values['usd-reimport']}), new Promise((_, reject) => {timeout = setTimeout(() => reject(new Error('Asset exceeded ten-minute timeout.')), 600000);})]);
	Object.assign(result, data);
	const runtime = build.runtimes?.[data.runtimeBuild.toolchain.asyncRuntime.toLowerCase()]?.build || build.wasm;
	if (runtime.openusd.gitSha !== data.runtimeBuild.openusd.gitSha || runtime.dependencies.usdGltf.gitSha !== data.runtimeBuild.dependencies.usdGltf.gitSha) throw new Error('Loaded runtime differs from the portable build provenance.');
	lastPhase='validation';onEvent({event:'phase',id:asset.id,phase:lastPhase,elapsedSeconds:phaseTiming.enter(lastPhase),at:new Date().toISOString()});
	const validation = await validateGltfFile(join(output, 'artifacts', asset.id + '.glb'));
	result.sha256 = validation.sha256;
	result.validation = validation.issues;
	result.validationMs = validation.validationMs;
	result.validationThreadId = validation.validationThreadId;
	const renderErrors = logs.filter(log => log.type === 'pageerror' || /WebGLProgram.*(?:Shader Error|ERROR)|WebGL: INVALID_OPERATION|Failed to create MaterialX|Error loading USD material texture|Couldn't load texture|net::ERR_/i.test(log.text));
	result.status = data.checks.length || validation.issues.numErrors || requests.length || renderErrors.length ? 'failed' : data.imageError > .03 || data.usdImageError > .03 || data.diagnostics.materialFallbacks ? 'review' : 'passed';
	if (result.status === 'passed' && !retainSuccess) await rm(join(output, 'artifacts', asset.id + '.glb'));
} catch (error) {
	result.status = 'failed'; result.error = error.stack || String(error);
	result.phase = lastPhase;
} finally {
	clearTimeout(timeout); result.phaseTimings=phaseTiming.snapshot(); result.logs = logs; result.requests = requests;
	const artifact = await stat(join(output, 'artifacts', asset.id + '.glb')).catch(() => null);
	result.artifact = !!artifact;if (artifact && !result.bytes) result.bytes = artifact.size;
	page?.off('console',onConsole);page?.off('pageerror',onPageError);page?.off('requestfailed',onRequestFailed);page?.off('response',onResponse);
	await writeJsonAtomic(join(output,'assets',asset.id+'.json'), result);
	onEvent({event:'result',id:asset.id,status:result.status,error:result.error?.split('\n')[0],checks:result.checks,imageError:result.imageError});
	if(result.status==='failed')await reset(true);else if(result.wasmMemoryBytes>=1536*1024**2)await reset();
}
 return result;
 }};
}

export async function corpusSessionMetadata(values,catalogue){
 const build=JSON.parse(await readFile(join(values.build,'build.json'),'utf8'));
 const files=await Promise.all(['run.mjs','session.mjs','browser.js','profiles.mjs','rendering.mjs','server.mjs','files.mjs','phase-timing.mjs','queue.mjs','geometry.mjs','texture-preview.mjs','bitmap-preview.mjs','validate-file.mjs','validate-file-worker.mjs','policy.mjs'].map(async file=>({file,sha256:createHash('sha256').update(await readFile(new URL(file,import.meta.url))).digest('hex')})));
 const exporter='public/usd/gltf/simready.js';files.push({file:exporter,sha256:createHash('sha256').update(await readFile(join(values.build,exporter))).digest('hex')});
 const harness={files,sha256:createHash('sha256').update(JSON.stringify(files)).digest('hex')};
 const identity=createHash('sha256').update(JSON.stringify({build,textures:values.textures,usdReimport:!!values['usd-reimport']})).digest('hex');
 const run={retainSuccessfulGlbs:!values['discard-success'],startedAt:new Date().toISOString(),pid:process.pid,build,harness,datasetRevision:catalogue.revision,catalogueSha256:createHash('sha256').update(JSON.stringify(catalogue)).digest('hex'),previewTextureLimit:512,previewFilter:'area',wasmMaximumBytes:4*1024**3,options:values,identity};
 return {build,harness,identity,run};
}
