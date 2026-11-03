import assert from 'node:assert/strict';
import {createServer} from '../../usd-wasm/node_modules/vite/dist/node/index.js';
import {chromium} from '../../usd-wasm/node_modules/playwright-core/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const server=await createServer({configFile:false,root,cacheDir:root+'native/.build/temporal/vite',
  resolve:{dedupe:['three']},optimizeDeps:{noDiscovery:true,include:['three','three/webgpu','three/tsl']},
  server:{host:'127.0.0.1',port:5199,strictPort:true}});
await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu']});
try {
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('http://127.0.0.1:5199/native/tests/temporal-accumulation.html');
  await page.waitForFunction(()=>!!window.testTemporalAccumulation);
  const result=await page.evaluate(()=>window.testTemporalAccumulation());
  assert.deepEqual(errors,[]);
  const [first,,,last]=result.frames;
  assert.ok(first.mean>.05,`First Beauty frame is blank: ${JSON.stringify(first)}`);
  assert.ok(last.grain<first.grain*.5,`Stock TRAA did not reduce grain: ${JSON.stringify(result.frames)}`);
  assert.ok(result.reset.mean>.05,'History reset produced a blank frame');
  assert.ok(result.resizedMean>.05,'Resize produced a blank frame');
  await mkdir(root+'native/.build/temporal',{recursive:true});
  await writeFile(root+'native/.build/temporal/report.json',JSON.stringify(result,null,2)+'\n');
  console.log('NEEDLE_TEMPORAL',JSON.stringify(result));
} finally {await browser.close();await server.close();}
