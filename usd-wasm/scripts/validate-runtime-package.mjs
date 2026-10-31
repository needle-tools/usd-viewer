import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, realpath, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {chromium} from '@playwright/test';

const sdk = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(process.argv[2] || join(sdk, '.cache/package-validation', `runtime-${Date.now()}`));
await mkdir(output, {recursive:true});
async function command(label, cwd, cmd, args) {
  const result = spawnSync(cmd, args, {cwd, encoding:'utf8', maxBuffer:25 * 1024 * 1024});
  const log = (result.stdout || '') + (result.stderr || '');
  await writeFile(join(output, `${label}.log`), log);
  assert.equal(result.status, 0, `${label}: ${log.slice(-4000)}`);
  return result.stdout;
}
const pack = JSON.parse(await command('pack', sdk, 'npm', ['pack', '--json', '--pack-destination', output]))[0];
const tarball = join(output, pack.filename);
const result = {tarball, version:pack.version, sha256:createHash('sha256').update(await readFile(tarball)).digest('hex'),
  revision:(await command('revision', sdk, 'git', ['rev-parse', 'HEAD'])).trim(), browsers:[], node:[]};
const root = result.consumer = await realpath(await mkdtemp(join(tmpdir(), 'needle-usd-runtime-')));
await writeFile(join(root, 'package.json'), JSON.stringify({name:'usd-runtime-consumer', private:true, type:'module',
  dependencies:{'@needle-tools/usd':`file:${tarball}`, three:'0.185.0', vite:'8.1.0'}}, null, 2));
await command('install', root, 'npm', ['install', '--no-audit', '--no-fund', '--prefer-offline']);
await command('dependencies', root, 'npm', ['ls', '@needle-tools/usd', 'three']);
assert.equal(await realpath(join(root, 'node_modules/@needle-tools/usd')), join(root, 'node_modules/@needle-tools/usd'));
const exercise = `
  const stage = USD.CreateStage('/tmp/consumer.usda');
  try {
    const prim = stage.DefinePrim('/Cube', 'Cube');
    try {
      const size = prim.GetAttribute('size');
      try {
        size.SetDouble(3, NaN);
        const value = size.GetValueString();
        if ((!runtime || runtime === 'asyncify') && typeof value !== 'string') throw new Error('Default synchronous binding behavior changed');
        if (runtime === 'jspi' && typeof value?.then !== 'function') throw new Error('JSPI getter did not return a promise');
        if(await value !== '3') throw new Error('Authored value missing');
      }
      finally { size.delete(); }
      await prim.SetActive(false); if(prim.IsActive()) throw new Error('Activation failed');
      await prim.SetActive(true);
      if(!(await stage.ExportToString()).includes('def Cube')) throw new Error('Stage export failed');
    } finally { prim.delete(); }
  } finally { USD.ReleaseStage(stage); }
`;
await writeFile(join(root, 'node.mjs'), `import {getUsdModule} from '@needle-tools/usd/runtime';
const runtime=process.argv[2];
const USD=await getUsdModule({asyncRuntime:runtime, print(){}, printErr(){}});
${exercise}
console.log('Runtime completed authoring, async reads, activation and export');process.exit(0);`);
await writeFile(join(root, 'index.html'), '<!doctype html><title>Packed runtime</title><script type="module" src="/main.js"></script>');
await writeFile(join(root, 'main.js'), `import {getUsdModule} from '@needle-tools/usd/runtime';
window.run = async runtime => {
 const USD=await getUsdModule({...(runtime ? {asyncRuntime:runtime} : {}), print(){}, printErr(){}});
 ${exercise}
 const remote=await USD.OpenStage(location.origin+'/root.usda');
 try {const child=remote.GetPrimAtPath('/World/Child');try {if(!child.IsValid()) throw new Error('Remote composition failed');}finally {child.delete();}}
 finally {USD.ReleaseStage(remote);}
 return {jspi:typeof globalThis['NEEDLE:USD:GET:JSPI']==='function',asyncify:typeof globalThis['NEEDLE:USD:GET']==='function'};
};`);
await mkdir(join(root, 'public'));
await writeFile(join(root, 'public/root.usda'), '#usda 1.0\ndef Xform "World" (prepend references = @child.usda@</Root>) {}\n');
await writeFile(join(root, 'public/child.usda'), '#usda 1.0\ndef Xform "Root" {\n def Cube "Child" {}\n}\n');
await writeFile(join(root, 'vite.config.js'), `export default {build:{target:'esnext'},preview:{headers:{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'}}};`);
await command('build', root, 'npx', ['vite', 'build']);
for(const runtime of ['asyncify','jspi','auto']) {
 await command(`node-${runtime}`, root, process.execPath, ['node.mjs', runtime]); result.node.push(runtime);
}
const {preview} = await import(pathToFileURL(join(root, 'node_modules/vite/dist/node/index.js')));
const server = await preview({root, configFile:join(root,'vite.config.js'), preview:{port:0}});
const browser = await chromium.launch({channel:'chrome'});
try {
 for(const [runtime, supported, expected] of [[undefined,true,'asyncify'],['asyncify',true,'asyncify'],['jspi',true,'jspi'],['auto',true,'jspi'],['auto',false,'asyncify']]) {
  const page=await browser.newPage(), errors=[], requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>requests.push({url:response.url(),status:response.status()}));
  if(!supported) await page.addInitScript(()=>{Object.defineProperty(WebAssembly,'Suspending',{value:undefined});Object.defineProperty(WebAssembly,'promising',{value:undefined});});
  await page.goto(server.resolvedUrls.local[0]);await page.waitForFunction(()=>typeof window.run==='function');
  const value=await page.evaluate(runtime=>window.run(runtime),runtime);
  assert.equal(value[expected],true);assert.equal(value[expected==='jspi'?'asyncify':'jspi'],false);
  const wasm=requests.filter(request=>new URL(request.url).pathname.endsWith('.wasm'));
  assert.equal(wasm.length,1,'only the selected wasm downloads');
  assert.equal(wasm[0].url.includes('.jspi'),expected==='jspi');
  assert.ok(requests.some(request=>request.url.endsWith('/child.usda')&&request.status===200),'remote referenced layer fetched');
  assert.deepEqual(errors,[]);
  result.browsers.push({runtime:runtime||'default',supported,expected,requests,errors});await page.close();
 }
} finally {await browser.close();await server.close();await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({tarball,sha256:result.sha256,consumer:root,node:result.node,browsers:result.browsers.map(({runtime,supported,expected})=>({runtime,supported,expected}))},null,2));
