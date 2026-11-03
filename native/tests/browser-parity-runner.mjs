import {createServer} from '../../usd-wasm/node_modules/vite/dist/node/index.js';
import {chromium} from '../../usd-wasm/node_modules/playwright-core/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const server=await createServer({configFile:false,root,cacheDir:root+'native/.build/browser/vite',
  resolve:{dedupe:['three']},optimizeDeps:{noDiscovery:true,include:['three','three/webgpu','three/tsl']},
  server:{host:'127.0.0.1',port:5198,strictPort:true,headers:{
    'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'}}});
await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu']});
try {
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('http://127.0.0.1:5198/native/tests/browser-parity.html');
  await page.waitForFunction(()=>!!window.captureParity);
  for(const fixture of ['parity','parity-lit','parity-textured']) for(const ssgi of [true,false]) {
    const result=await page.evaluate(options=>window.captureParity(options),{ssgi,url:'/native/tests/fixtures/'+fixture+'.usda'});
    const output=root+'native/.build/browser/'+fixture+(ssgi?'':'-basic');
    await mkdir(output,{recursive:true});
    await writeFile(output+'/aov-color.bin',Buffer.from(new Uint16Array(result.pixels).buffer));
    delete result.pixels;await writeFile(output+'/smoke.json',JSON.stringify(result,null,2)+'\n');
    console.log('Browser parity capture',ssgi,output);
  }
  if(errors.length)throw new Error(errors.join('\n'));
} finally {await browser.close();await server.close();}
