import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
const sdk = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(process.argv[2] || join(sdk, '.cache/package-validation', `renderers-${Date.now()}`));
await mkdir(output, { recursive: true });
function command(label, cwd, cmd, args) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 25 * 1024 * 1024 });
  const log = (result.stdout || '') + (result.stderr || '');
  return writeFile(join(output, `${label}.log`), log).then(() => { assert.equal(result.status, 0, `${label}: ${log.slice(-3000)}`); return result.stdout; });
}
const pack = JSON.parse(await command('pack', sdk, 'npm', ['pack', '--json', '--pack-destination', output]))[0];
const tarball = join(output, pack.filename), sha256 = createHash('sha256').update(await readFile(tarball)).digest('hex');
const source = (await command('source-revision', sdk, 'git', ['rev-parse', 'HEAD'])).trim();
const result = { tarball, sha256, source, consumers: [], errors: [], requests: [] };
try {
  for (const [name, three] of [['modern', 'npm:@needle-tools/three@0.185.2-alpha.6'], ['legacy', '0.160.0']]) {
    const root = await mkdtemp(join(tmpdir(), `needle-usd-renderers-${name}-`));
    result.consumers.push({ name, root, three });
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: `usd-renderers-${name}`, private: true, type: 'module', scripts: { build: 'vite build' },
      dependencies: { '@needle-tools/usd': `file:${tarball}`, three, vite: '8.1.0', ...(name === 'modern' ? { '@meimu/mutracer': '0.2.0', 'oidn-webgpu':'0.6.0', 'three-gpu-pathtracer': 'https://registry.npmjs.org/three-gpu-pathtracer/-/three-gpu-pathtracer-0.0.27.tgz', 'three-mesh-bvh': 'https://registry.npmjs.org/three-mesh-bvh/-/three-mesh-bvh-0.9.16.tgz', 'xatlas-web': 'https://registry.npmjs.org/xatlas-web/-/xatlas-web-0.1.0.tgz' } : {}) }, overrides: { three: '$three' } }, null, 2));
    await command(`${name}-install`, root, 'npm', ['install', '--no-audit', '--no-fund', '--prefer-offline']);
    assert.equal(await realpath(join(root, 'node_modules/@needle-tools/usd')), join(await realpath(root), 'node_modules/@needle-tools/usd'));
    await command(`${name}-dependencies`, root, 'npm', ['ls', '--all', 'three', '@needle-tools/usd', '@meimu/mutracer', 'three-gpu-pathtracer', 'three-mesh-bvh']);
    await cp(join(sdk, 'tests/renderers-consumer'), root, { recursive: true });
    if (name === 'modern') await cp(join(root,'node_modules/@meimu/mutracer/oidn/weights'),join(root,'public/weights'),{recursive:true});
    if (name === 'legacy') await writeFile(join(root, 'main.js'), "import { getUsdModule, createThreeHydra } from '@needle-tools/usd'; import { inspectStage } from '@needle-tools/usd/scene'; window.baseSdk = { getUsdModule, createThreeHydra, inspectStage };\n");
    await mkdir(join(root, 'public'),{recursive:true});
    await cp(join(sdk, 'tests/fixtures/coverage/lighting-mdl/studio-variants.usda'), join(root, 'public/scene.usda'));
    await command(`${name}-build`, root, 'npm', ['run', 'build']);
  }
  const root = result.consumers[0].root;
  const { preview } = await import(pathToFileURL(join(root, 'node_modules/vite/dist/node/index.js')));
  const server = await preview({ root, configFile: join(root, 'vite.config.js'), preview: { port: 0 } });
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    page.on('pageerror', error => result.errors.push(error.stack));
    page.on('console', message => { if (message.type() === 'error' || /Multiple instances of Three|THREE.TSL|BVH preparation failed/.test(message.text())) result.errors.push(message.text()); });
    page.on('response', response => result.requests.push({ url: response.url(), status: response.status() }));
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => !!window.packed, null, { timeout: 120_000 });
    await page.screenshot({ path: join(output, 'basic.png') });
    await page.evaluate(() => window.packed.modes.setMode('beauty'));
    await page.waitForTimeout(700); await page.screenshot({ path: join(output, 'beauty.png') });
    const beforeBloom = await page.screenshot();
    await page.evaluate(() => window.packed.modes.setSettings({bloom:true,bloomThreshold:0,bloomStrength:1}));
    await page.waitForTimeout(400);
    const withBloom = await page.screenshot({path:join(output,'beauty-bloom.png')});
    result.bloomPixels = await page.evaluate(async ([a,b]) => {
      async function pixels(encoded) {const bitmap=await createImageBitmap(await(await fetch('data:image/png;base64,'+encoded)).blob());const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);return ctx.getImageData(0,0,c.width,c.height).data;}
      const left=await pixels(a),right=await pixels(b);let changed=0;
      for(let i=0;i<left.length;i+=4)if(Math.abs(left[i]-right[i])+Math.abs(left[i+1]-right[i+1])+Math.abs(left[i+2]-right[i+2])>15)changed++;
      return changed;
    },[beforeBloom.toString('base64'),withBloom.toString('base64')]);
    assert.ok(result.bloomPixels>500,'packed HDR bloom changes the rendered image');
    await page.evaluate(() => window.packed.modes.setSettings({bloom:false,bloomStrength:0.5,bloomThreshold:1}));
    await page.evaluate(() => window.packed.modes.setMode('pathtraced'));
    await page.waitForFunction(() => window.packed.modes.samples > 3, null, { timeout: 90_000 });
    await page.waitForFunction(() => window.packed.modes.samples === 32, null, { timeout: 90_000 });
    result.samples = await page.evaluate(() => window.packed.modes.samples);
    result.settings = await page.evaluate(() => window.packed.modes.settings);
    assert.deepEqual(result.settings, {maxSamples:32,bounces:4,denoiser:null,gkDenoiser:null,bloom:false,bloomStrength:0.5,bloomRadius:0.5,bloomThreshold:1});
    await page.screenshot({ path: join(output, 'pathtraced.png') });
    await page.evaluate(() => window.packed.modes.setMode('pathtraced-gk'));
    await page.waitForFunction(() => window.packed.modes.samples > 3, null, { timeout: 90_000 });
    result.gkjohnsonSamples = await page.evaluate(() => window.packed.modes.samples);
    assert.equal(await page.evaluate(() => window.packed.modes.pathCanvas.hidden), true, 'gkjohnson uses the host canvas');
    await page.screenshot({ path: join(output, 'gkjohnson.png') });
    await page.getByRole('button', { name: 'Stage', exact: true }).click();
    await page.getByRole('combobox', { name: 'Camera', exact: true }).selectOption('/World/Camera');
    await page.waitForTimeout(500); await page.screenshot({ path: join(output, 'authored-camera.png') });
    await page.getByRole('combobox', { name: 'Camera', exact: true }).selectOption('');
    for(const mode of ['pathtraced-gk','pathtraced']) {
      await page.evaluate(async mode=>{const p=window.packed;await p.modes.setSettings({maxSamples:2,bounces:2,denoiser:'oidn-fast',gkDenoiser:'oidn-fast'});await p.modes.setMode(mode);},mode);
      await page.waitForFunction(()=>window.packed.status?.status==='finished',null,{timeout:90000});
      await page.screenshot({path:join(output,`${mode}-oidn.png`)});
    }
    result.denoising='OIDN small model completed on both tracers from self-hosted weights';
    await page.evaluate(async()=>{const p=window.packed;await p.modes.setMode('basic');await p.setPrimVisible(p.handle,'/World/Sphere1',false);await p.setPrimVisible(p.handle,'/World/Sphere1',true);await p.setPrimActive(p.handle,'/World/Sphere1',false);await p.setPrimActive(p.handle,'/World/Sphere1',true);p.panel.refresh();});
    assert.equal(await page.getByRole('button',{name:'Deactivate /World/Sphere1',exact:true}).getAttribute('aria-pressed'),'true');
    result.stageEdits='Packed visibility/activation exports edit and restore the loaded stage';
    await page.evaluate(async()=>{
      const p=window.packed;p.panel.selectMany(['/World/Sphere0','/World/Sphere2']);
      if(await p.repl.run('selection.length')!==2)throw new Error('Packed multi-selection is missing');
      await p.repl.run('follow("/World/Sphere1.radius")');
      if(p.panel.selectedProperty!=='/World/Sphere1.radius')throw new Error('Packed property navigation is missing');
      if(await p.repl.run('await Promise.resolve(42)')!==42)throw new Error('Packed REPL await failed');
      await p.repl.run('await edit(stage => {const prim=stage.GetPrimAtPath("/World/Sphere1"), attr=prim.GetAttribute("radius");try{attr.SetDouble(0.6,NaN);}finally{attr.delete();prim.delete();}})');
      if(p.panel.selection[0]?.path!=='/World/Sphere1')throw new Error('Packed edit lost selection');
    });
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.usd-repl')).display==='flex');
    await page.screenshot({path:join(output,'inspection-repl.png')});
    result.inspection='Packed public exports: multi-selection, exact property navigation, REPL await, serialized authored edits and default SDK console styles';
    await page.evaluate(async () => { await window.packed.dispose(); });
    await page.waitForTimeout(100);
    assert.deepEqual(result.errors, []);
    assert.ok(result.requests.some(request => /worker.*\.js|bvh.*\.js/.test(request.url) && request.status === 200), 'bundled worker loads');
    assert.ok(result.requests.some(request => request.url.endsWith('.wasm') && request.status === 200), 'packed WASM loads');
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
  result.outcome = 'passed';
} catch (error) { result.outcome = 'failed'; result.failure = error.stack; throw error; }
finally { await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n'); console.log(output); }
