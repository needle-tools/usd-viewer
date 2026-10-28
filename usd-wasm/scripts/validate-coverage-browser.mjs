#!/usr/bin/env node
// Smoke and evidence collection, not feature conformance or a native reference render.
import {spawn} from 'node:child_process';
import {mkdir,writeFile,copyFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const wasmHash = async () => createHash('sha256').update(await readFile(path.join(root,'src/bindings/emHdBindings.wasm'))).digest('hex');
const wasmSha256AtStart = await wasmHash();
let wasmSha256AtEnd = null;
const args=process.argv.slice(2); const outputIndex=args.indexOf('--output');
if (outputIndex>=0 && !args[outputIndex+1]) throw Error('--output requires a path');
const requestedOutput=outputIndex>=0 ? args.splice(outputIndex,2)[1] : null;
const canonicalOutput=path.join(root,'.cache/coverage-validation/browser-results.json');
const output=requestedOutput ? path.resolve(root,requestedOutput) : path.join(root,'.cache/coverage-validation/browser-results-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
const {coverageAssetLibrary:assets}=await import(pathToFileURL(path.join(root,'tests/fixtures/coverage/asset-library.js')));
const base='http://127.0.0.1:5197'; const timeout=Number(process.env.COVERAGE_TIMEOUT_MS||45000);
const wanted=args; if(wanted.length && !requestedOutput) throw Error('Selected runs require --output to preserve the full-corpus report');
const selected=wanted.length?assets.filter(a=>wanted.includes(a.id)):assets;
if(wanted.length && path.resolve(output)===canonicalOutput) throw Error('Selected runs cannot overwrite the full-corpus report');
if(!selected.length) throw Error('No matching fixtures');
await mkdir(path.dirname(output),{recursive:true});
const isolatedConfig=path.join(root,'.cache/coverage-validation/vite.config.mjs');
await mkdir(path.dirname(isolatedConfig),{recursive:true});
await writeFile(isolatedConfig, `import {mergeConfig} from 'vite';\nimport config from ${JSON.stringify(pathToFileURL(path.join(root,'tests/three-matrix/vite.config.js')).href)};\nexport default mergeConfig(config, {cacheDir:${JSON.stringify(path.join(root,'.cache/coverage-validation/vite'))},resolve:{dedupe:['three','@needle-tools/materialx','@sparkjsdev/spark']},optimizeDeps:{noDiscovery:true,include:['three','three/webgpu','three/tsl','@needle-tools/materialx','@sparkjsdev/spark'],entries:['tests/coverage-corpus/index.html']},server:{hmr:false,watch:{ignored:['**/*']}}});\n`);
const server=spawn(path.join(root,'node_modules/.bin/vite'),['--config',isolatedConfig,'--host','127.0.0.1','--port','5197','--strictPort'],{cwd:root,stdio:['ignore','pipe','pipe']});
let serverOutput=''; server.stdout.on('data',s=>serverOutput+=s);server.stderr.on('data',s=>serverOutput+=s);
let browser, page, pageNodes; const results=[]; let completed=false;
await mkdir(path.dirname(output),{recursive:true});
const report=async()=>writeFile(output,JSON.stringify({recordedAt:new Date().toISOString(),scope:'Chromium/SwiftShader load and render smoke, scene and sampled animation evidence; not feature conformance or native rendering.',cameraAndLighting:'Autoframed perspective camera; synthetic lights are disabled for fixtures requesting environment:none. Authored camera behavior is not tested.',completed,wasmSha256AtStart,wasmSha256AtEnd,expectedTotal:assets.length,selectedTotal:selected.length,results},null,2)+'\n');
try {
    let ready=false;
    for(let i=0;i<100;i++){if(server.exitCode!==null) throw Error('Vite failed: '+serverOutput);try{const r=await fetch(base+'/tests/coverage-corpus/');if(r.ok){ready=true;break}}catch{} await new Promise(r=>setTimeout(r,200));}
    if(!ready) throw Error('Vite did not start: '+serverOutput);
    browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    async function newPage(nodes){const p=await browser.newPage();await p.goto(base+'/tests/coverage-corpus/'+(nodes?'?nodes=1':''));await p.waitForFunction(()=>window.coverageReady,null,{timeout:60000});return p;}
    for(const asset of selected){
        const nodes=asset.renderer==='bounded-volume';
        if (!page || pageNodes!==nodes) {await page?.close(); page=await newPage(nodes);pageNodes=nodes;}
        const consoleMessages=[],pageErrors=[];
        const onConsole=m=>{if(['error','warning'].includes(m.type()))consoleMessages.push({type:m.type(),text:m.text()})};
        const onError=e=>pageErrors.push(String(e)); page.on('console',onConsole);page.on('pageerror',onError);
        let result;
        try {
            let timer;
            try { result=await Promise.race([page.evaluate(a=>window.runCoverage(a),asset),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`Timeout after ${timeout}ms`)),timeout);})]); } finally {clearTimeout(timer);}
        } catch(e) {result={loaded:false,error:String(e),timedOut:String(e).includes('Timeout')};}
        page.off('console',onConsole);page.off('pageerror',onError);
        const first=result.samples?.[0];
        result.smoke={loaded:!!result.loaded,rendered:!!(first?.render.foregroundPixels && (first.render.triangles||first.render.lines||first.render.points)),
            reason:!result.loaded ? (result.error || 'Load failed') : !first?.render.foregroundPixels ? 'No foreground pixels captured' : !(first.render.triangles||first.render.lines||first.render.points) ? 'No drawn primitives reported' : null,
            note:'Visible pixels or triangles do not prove the advertised USD feature is implemented.'};
        results.push({id:asset.id,root:asset.root,features:asset.features,expected:asset.expected,...result,consoleMessages,pageErrors});
        await report(); console.log(`${results.length}/${selected.length} ${asset.id}: ${result.smoke.rendered?'rendered':result.loaded?'loaded-no-visible-geometry':'load-failed'}`);
        if(!result.loaded || page.isClosed()){await page.close().catch(()=>{});page=undefined;}
    }
    wasmSha256AtEnd=await wasmHash();
    completed=results.length===selected.length && wasmSha256AtEnd===wasmSha256AtStart;
} finally {await report();if(completed && !requestedOutput && !wanted.length) await copyFile(output,canonicalOutput);await browser?.close();server.kill('SIGTERM');}
