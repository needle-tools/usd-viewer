import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { unzipSync } from 'three/addons/libs/fflate.module.js';
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
    if (name === 'legacy') await writeFile(join(root, 'main.js'), "import { getUsdModule, createThreeHydra } from '@needle-tools/usd'; import { inspectStage } from '@needle-tools/usd/scene'; import { Group, Scene, WebGLRenderer, WebGLRenderTarget, PerspectiveCamera } from 'three'; import { mountDownloadButton } from '@needle-tools/usd/viewer/download'; window.baseSdk = { getUsdModule, createThreeHydra, inspectStage, Group, Scene, WebGLRenderer, WebGLRenderTarget, PerspectiveCamera, mountDownloadButton };\n");
    await mkdir(join(root, 'public'),{recursive:true});
    await cp(join(sdk, 'tests/fixtures/coverage/lighting-mdl/studio-variants.usda'), join(root, 'public/scene.usda'));
    if (name === 'modern') await cp(join(sdk,'tests/fixtures/coverage/lighting-mdl'),join(root,'public/mdl'),{recursive:true});
    await cp(join(sdk,'tests/fixtures/coverage/textures'),join(root,'public/textures'),{recursive:true});
    if (name === 'legacy') await cp(join(root,'node_modules/three/examples/jsm/libs/basis'),join(root,'public/basis'),{recursive:true});
    await command(`${name}-build`, root, 'npm', ['run', 'build']);
  }
  const root = result.consumers[0].root;
  const { preview } = await import(pathToFileURL(join(root, 'node_modules/vite/dist/node/index.js')));
  const server = await preview({ root, configFile: join(root, 'vite.config.js'), preview: { port: 0 } });
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    page.on('pageerror', error => result.errors.push(error.stack));
    page.on('console', message => { if (message.type() === 'error' || /Multiple instances of Three|THREE.TSL|BVH preparation failed/.test(message.text())) {result.errors.push(message.text());(result.errorPhases||=[]).push({phase:result.phase,text:message.text()});} });
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
    result.archive = await page.evaluate(async () => {
      const {USD, handle} = window.packed, bytes = await handle.exportUsdz();
      USD.FS_createDataFile('/tmp','packed-download.usdz',bytes,true,true,true);
      const stage = await USD.OpenStage('/tmp/packed-download.usdz');
      try {
        const prim = stage.GetPrimAtPath('/World/Sphere1'), radius = prim.GetAttribute('radius');
        try {
          if (radius.GetValueString() !== '0.6') throw new Error('Packed USDZ lost the authored radius edit');
        } finally { radius.delete(); prim.delete(); }
        return {bytes: bytes.length, editedRadius: 0.6};
      } finally { USD.ReleaseStage(stage); USD.FS_unlink('/tmp/packed-download.usdz'); }
    });
    const zipEvent = page.waitForEvent('download');
    await page.getByRole('button', {name:'Download',exact:true}).click();
    const zipped = await zipEvent;
    assert.equal(zipped.suggestedFilename(), 'scene.zip');
    const zippedEntries = unzipSync(new Uint8Array(await readFile(await zipped.path())));
    assert.ok(Object.keys(zippedEntries).length > 0);
    await page.getByLabel('Download format', {exact:true}).focus(); await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End'); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.packed.downloads.format), 'usdz');
    const usdzEvent = page.waitForEvent('download');
    await page.getByRole('button', {name:'Download',exact:true}).click();
    const downloaded = await usdzEvent;
    assert.equal(downloaded.suggestedFilename(), 'scene.usdz');
    assert.ok((await readFile(await downloaded.path())).length > 100);
    result.exportPhases = await page.evaluate(() => [...new Set(window.packed.exportProgress.map(value=>value.phase))]);
    for(const phase of ['preparing','packaging','reading','compressing','complete']) assert.ok(result.exportPhases.includes(phase),`packed export phase ${phase}`);
    await page.screenshot({path:join(output,'download-component.png')});
    result.downloadControl = 'Installed /viewer/download split button: default ZIP, keyboard-selected USDZ, actual downloads and standalone SDK styles';
    result.mdlCutouts=[];
    for(const value of ['enabled','disabled','enabled']) {
      result.phase='MDL cutout '+value;
      const materials=await page.evaluate(value=>window.packed.cutout(value),value);
      assert.ok(materials.length>=4 && materials.every(m=>m.sideCopy),'packed MDL has actual mixed-side material copies');
      assert.ok(materials.every(m=>m.alphaTest===(value==='enabled'?.5:0)),'packed side copies retain the composed alpha cutoff');
      result.mdlCutouts.push({value,materials});await page.waitForTimeout(300);
      await page.screenshot({path:join(output,`mdl-cutout-${value}.png`)});
    }
    result.phase='KTX2 compressed color';
    result.ktx2 = await page.evaluate(()=>window.packed.ktx2());
    assert.ok(result.ktx2.length>=2&&result.ktx2.every(t=>t.compressed&&t.colorSpace==='srgb'&&t.width===256),'packed KTX2 color maps decode with container color space');
    await page.screenshot({path:join(output,'ktx2.png')});
    result.phase='KTX2 readable channels';
    result.ktx2Readable = await page.evaluate(()=>window.packed.ktx2(true));
    assert.ok(result.ktx2Readable.every(t=>t.compressed&&t.readable),'packed KTX2 scalar remaps retain the compressed color map');
    result.phase='modern disposal';
    await page.evaluate(async () => { await window.packed.dispose(); });
    const legacyRoot = result.consumers[1].root;
    const legacyServer = await preview({root:legacyRoot, configFile:join(legacyRoot,'vite.config.js'), preview:{port:0}});
    try {
      result.phase='legacy';
      await page.goto(legacyServer.resolvedUrls.local[0]);
      await page.waitForFunction(() => !!window.baseSdk);
      const legacyDownload = page.waitForEvent('download');
      result.legacyArchive = await page.evaluate(async () => {
        const {getUsdModule, createThreeHydra, Group, mountDownloadButton} = window.baseSdk, USD = await getUsdModule();
        const handle = await createThreeHydra({USD, scene:new Group(), url:'source.usda', buffer:new TextEncoder().encode('#usda 1.0\ndef Sphere "Ball" {}\n')});
        let repack;
        try {
          await handle.ready(); const bytes = await handle.exportUsdz();
          repack = await createThreeHydra({USD, scene:new Group(), url:'reloaded.usdz', buffer:bytes.buffer});
          await repack.ready(); await repack.editStage(stage => stage.DefinePrim('/Edited','Xform').delete());
          const edited = await repack.exportUsdz();
          USD.FS_createDataFile('/tmp','legacy-export.usdz',edited,true,true,true);
          const stage = await USD.OpenStage('/tmp/legacy-export.usdz');
          try {
            if (!stage.GetPrimAtPath('/Edited').IsValid()) throw new Error('Legacy USDZ repackaging lost edits');
            const control = mountDownloadButton({getSource:()=>({handle:repack,filename:'legacy.usdz'})});
            try { await control.download(); } finally { control.dispose(); }
            return {bytes:edited.length, innerEdits:true, downloadControl:true};
          } finally { USD.ReleaseStage(stage); USD.FS_unlink('/tmp/legacy-export.usdz'); }
        } finally { await repack?.dispose(); await handle.dispose(); }
      });
      assert.equal((await legacyDownload).suggestedFilename(), 'legacy.zip');
      result.legacySolidDome = await page.evaluate(async () => {
        const {getUsdModule, createThreeHydra, Group, Scene, WebGLRenderer, WebGLRenderTarget, PerspectiveCamera} = window.baseSdk;
        const USD = await getUsdModule(), scene = new Scene(), root = new Group(); scene.add(root);
        const renderer = new WebGLRenderer(), target = new WebGLRenderTarget(64, 64);
        const camera = new PerspectiveCamera(35, 1, .1, 100); camera.position.z = 4;
        const source = '#usda 1.0\n( upAxis = "Y" )\ndef Xform "World" {\n def Sphere "Metal" (prepend apiSchemas = ["MaterialBindingAPI"]) {\n rel material:binding = </World/Material>\n }\n def Material "Material" {\n token outputs:surface.connect = </World/Material/Surface.outputs:surface>\n def Shader "Surface" {\n uniform token info:id = "UsdPreviewSurface"\n color3f inputs:diffuseColor = (1, .28, .08)\n float inputs:metallic = 1\n float inputs:roughness = .2\n token outputs:surface\n }\n }\n def DomeLight "Sky" {\n float inputs:intensity = .8\n }\n}\n';
        const handle = await createThreeHydra({USD, scene:root, renderScene:scene, renderer, url:'solid-dome.usda', buffer:new TextEncoder().encode(source)});
        try {
          await handle.ready(); await handle.materialsReady();
          renderer.setRenderTarget(target); renderer.render(scene, camera);
          const pixels = new Uint8Array(64 * 64 * 4); renderer.readRenderTargetPixels(target, 0, 0, 64, 64, pixels);
          const index = (32 * 64 + 32) * 4, center = [...pixels.slice(index, index + 3)];
          if (!(center[0] > 80 && center[0] > center[1] * 1.2 && center[1] > center[2])) throw new Error('Solid dome lost its metal reflections: ' + center);
          return {center, reflected:true};
        } finally { scene.remove(root); renderer.render(scene,camera); await handle.dispose(); target.dispose(); renderer.dispose(); }
      });
      result.legacyKtx2 = await page.evaluate(async () => {
        const {getUsdModule,createThreeHydra,Group,Scene,WebGLRenderer,WebGLRenderTarget,PerspectiveCamera} = window.baseSdk;
        const USD=await getUsdModule(),scene=new Scene(),root=new Group();scene.add(root);
        const renderer=new WebGLRenderer(),target=new WebGLRenderTarget(64,64),camera=new PerspectiveCamera(40,1,.1,100);camera.position.set(0,1.1,6);camera.lookAt(0,1,0);
        const handle=await createThreeHydra({USD,scene:root,renderScene:scene,renderer,url:'/textures/ktx2-mosaic.usda',ktx2TranscoderPath:'/basis/',scenePrimitiveLightIntensityScale:1});
        try {
          await handle.ready();await handle.materialsReady();renderer.setRenderTarget(target);renderer.render(scene,camera);
          const maps=[];root.traverse(o=>{if(o.material?.map)maps.push({compressed:!!o.material.map.isCompressedTexture,colorSpace:o.material.map.colorSpace,width:o.material.map.image.width});});
          if(maps.length!==2||!maps.every(t=>t.compressed&&t.colorSpace==='srgb'&&t.width===256))throw new Error('Legacy KTX2 material textures failed: '+JSON.stringify(maps));
          await handle.editStage(stage=>stage.GetPrimAtPath('/World/Looks/Mosaic/Surface').GetAttribute('inputs:roughness').AddConnection('/World/Looks/Mosaic/Texture.outputs:r'));await handle.materialsReady();renderer.render(scene,camera);
          const readable=[];root.traverse(o=>{if(o.material?.map)readable.push(!!o.material.roughnessMap?.isDataTexture);});
          if(!readable.length||!readable.every(Boolean))throw new Error('Legacy KTX2 scalar remapping failed');
          const pixels=new Uint8Array(64*64*4);renderer.readRenderTargetPixels(target,0,0,64,64,pixels);let colored=0;
          for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2])>30)colored++;
          if(colored<30)throw new Error('Legacy KTX2 produced no colored render');return {maps,colored,readable};
        }finally{scene.remove(root);renderer.render(scene,camera);await handle.dispose();target.dispose();renderer.dispose();}
      });
    } finally { await new Promise(resolve => legacyServer.httpServer.close(resolve)); }
    await page.waitForTimeout(100);
    assert.deepEqual(result.errors, []);
    assert.ok(result.requests.some(request => /worker.*\.js|bvh.*\.js/.test(request.url) && request.status === 200), 'bundled worker loads');
    assert.ok(result.requests.some(request => request.url.endsWith('.wasm') && request.status === 200), 'packed WASM loads');
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
  result.outcome = 'passed';
} catch (error) { result.outcome = 'failed'; result.failure = error.stack; throw error; }
finally { await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n'); console.log(output); }
