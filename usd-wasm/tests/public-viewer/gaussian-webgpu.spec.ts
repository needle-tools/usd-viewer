import {openSettings,stageReady} from './workbench-menus';
import { expect, test, type Page } from '@playwright/test';

// No external fonts are needed to verify local GPU rendering.
test.beforeEach(async ({ page }) => {
    await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.fulfill({ contentType: 'text/css', body: '' }));
});

async function imageDifference(page: Page, before: Buffer, after: Buffer) {
    return page.evaluate(async ([a, b]: string[]) => {
        async function decode(value: string) {
            const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + value)).blob());
            const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        }
        const left = await decode(a), right = await decode(b); let changed = 0;
        for (let i = 0; i < left.length; i += 4) if (Math.abs(left[i] - right[i]) + Math.abs(left[i + 1] - right[i + 1]) + Math.abs(left[i + 2] - right[i + 2]) > 15) changed++;
        return changed;
    }, [before.toString('base64'), after.toString('base64')]);
}

for (const backend of ['webgpu', 'webgl']) {
    test(`mixed Gaussian, mesh and MaterialX volume share WebGPURenderer (${backend})`, async ({ page }, testInfo) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.goto(`/?viewer=three&backend=${backend}&background=dark&file=/test-fixtures/regressions/mixed-mesh-volume-splats.usda&assetCache=0`, { waitUntil: 'domcontentloaded' });
        await stageReady(page);
        const state = await page.evaluate(async () => {
            const w = window as any; await w.usdHydra.materialsReady(); w.usdHydra.setPlaying(false); w._controls.enableDamping = false;
            w.camera.position.set(1.2,0,12); w._controls.target.set(1.2,0,0); w._controls.update();
            w.originalRenderer = w.renderer; w.originalDriver = w.usdHydra.driver;
            const fields: any[] = [], volumes: any[] = [];
            w.usdRoot.traverse((object: any) => {
                if (object.splatGeometry && object.userData.usdTypeName === 'ParticleField3DGaussianSplat') fields.push(object);
                if (object.material?.isBoundedVolumeNodeMaterial) volumes.push(object);
            });
            w.testField = fields[0]; w.testVolume = volumes[0]; w.occluder = w.usdRoot.getObjectByName('Occluder');
            return { webgpu: w.renderer.isWebGPURenderer, backend: w.renderer.backend.constructor.name, fields: fields.length, volumes: volumes.length };
        });
        expect(state).toEqual({ webgpu: true, backend: backend === 'webgpu' ? 'WebGPUBackend' : 'WebGLBackend', fields: 1, volumes: 1 });
        await page.addStyleTag({ content: '#top-center,#render-mode-controls,#usd-suite,.usd-timeline {visibility:hidden!important}' });
        const canvas = page.locator('canvas.usd-viewer-three-canvas');
        await page.waitForTimeout(300);
        const all = await canvas.screenshot();
        await page.evaluate(() => { (window as any).testField.visible = false; });
        const noSplats = await canvas.screenshot();
        expect(await imageDifference(page, all, noSplats)).toBeGreaterThan(1000);
        await page.evaluate(() => { const w = window as any; w.testField.visible = true; w.testVolume.visible = false; });
        expect(await imageDifference(page, all, await canvas.screenshot())).toBeGreaterThan(1000);
        await page.evaluate(() => { const w = window as any; w.testVolume.visible = true; w.occluder.visible = false; });
        expect(await imageDifference(page, all, await canvas.screenshot())).toBeGreaterThan(1000);
        await page.evaluate(() => { (window as any).occluder.visible = true; });
        await page.evaluate(() => (window as any).usdRenderModes.setMode('beauty'));
        await page.waitForTimeout(800);
        const beauty = await canvas.screenshot();
        const colors = await page.evaluate(async encoded => {
            const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + encoded)).blob());
            const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap,0,0); const data = ctx.getImageData(0,0,canvas.width,canvas.height).data;
            let green = 0, blue = 0;
            for (let i=0;i<data.length;i+=4) { if (data[i+1]>data[i]+20 && data[i+1]>data[i+2]+10) green++; if (data[i+2]>data[i]+30 && data[i+2]>data[i+1]+15) blue++; }
            return { green, blue };
        }, beauty.toString('base64'));
        await page.screenshot({ path: testInfo.outputPath('mixed-beauty.png') });
        expect(colors.green).toBeGreaterThan(500); expect(colors.blue).toBeGreaterThan(500);
        expect(await page.evaluate(() => { const w = window as any; return w.originalRenderer === w.renderer && w.originalDriver === w.usdHydra.driver && w.usdRenderModes.mode === 'beauty'; })).toBe(true);
        expect(new URL(page.url()).searchParams.get('render')).not.toBe('webgl');
        expect(errors).toEqual([]);
    });
}


for (const backend of ['webgpu', 'webgl']) test(`Gaussian SH changes with view direction and releases on clear (${backend})`, async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`/?viewer=three&backend=${backend}&file=/test-fixtures/coverage/advanced/splat-harmonics.usda&assetCache=0`, { waitUntil: 'domcontentloaded' });
    await stageReady(page);
    await page.evaluate(() => { const w = window as any; w.usdHydra.setPlaying(false); w._controls.enableDamping = false; });
    await page.addStyleTag({ content: '#top-center,#render-mode-controls,#usd-suite,.usd-timeline {visibility:hidden!important}' });
    const images: Buffer[] = [];
    for (const z of [5, -5]) {
        await page.evaluate(z => { const w = window as any; w.camera.position.set(0,0,z); w._controls.target.set(0,0,0); w._controls.update(); }, z);
        images.push(await page.locator('canvas.usd-viewer-three-canvas').screenshot());
    }
    const means = await page.evaluate(async images => {
        return Promise.all(images.map(async encoded => {
            const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + encoded)).blob());
            const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap,0,0); const data = ctx.getImageData(0,0,canvas.width,canvas.height).data;
            let red = 0, blue = 0, pixels = 0;
            for (let i=0;i<data.length;i+=4) if (Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])>30) { red+=data[i]; blue+=data[i+2]; pixels++; }
            return { red: red/pixels, blue: blue/pixels, pixels };
        }));
    }, images.map(image => image.toString('base64')));
    expect(means[0].pixels).toBeGreaterThan(1000); expect(means[1].pixels).toBeGreaterThan(1000);
    expect(Math.abs((means[0].red-means[0].blue)-(means[1].red-means[1].blue))).toBeGreaterThan(50);
    await page.screenshot({ path: testInfo.outputPath('opposite-view.png') });
    await page.evaluate(() => {
        const w = window as any; w.splatResources = [];
        w.usdRoot.traverse((o: any) => { if (o.isGaussianSplat) w.splatResources.push(o); });
        w.usdHydra.dispose();
    });
    expect(await page.evaluate(() => (window as any).splatResources.every((o: any) => o._usdDisposed && !o.parent))).toBe(true);
    expect(errors).toEqual([]);
});

for (const backend of ['webgpu', 'webgl']) test(`orthographic splats retain size and SH color at different camera distances (${backend})`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`/?viewer=three&backend=${backend}&file=/test-fixtures/coverage/advanced/splat-harmonics.usda`, { waitUntil: 'domcontentloaded' });
    await stageReady(page);
    await page.evaluate(async () => {
        const w = window as any, T = await import('three/webgpu');
        w.usdHydra.setPlaying(false); const aspect = w.renderer.domElement.clientWidth / w.renderer.domElement.clientHeight;
        w.usdRenderCamera = new T.OrthographicCamera(-2*aspect,2*aspect,2,-2,0.01,100);
        w.usdRenderCamera.position.set(0,0,5); w.usdRenderCamera.lookAt(0,0,0);
    });
    await page.addStyleTag({ content: '#top-center,#render-mode-controls,#usd-suite,.usd-timeline {visibility:hidden!important}' });
    const canvas = page.locator('canvas.usd-viewer-three-canvas'), before = await canvas.screenshot();
    await page.evaluate(() => { const w = window as any; w.usdRenderCamera.position.z = 10; w.usdRenderCamera.updateMatrixWorld(); });
    expect(await imageDifference(page, before, await canvas.screenshot())).toBeLessThan(30);
    expect(errors).toEqual([]);
});

for (const backend of ['webgpu', 'webgl']) test(`repeated Gaussian disposal releases storage buffers and WebGL fallback textures (${backend})`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`/?viewer=three&backend=${backend}&file=/test-fixtures/coverage/advanced/splat-harmonics.usda`, { waitUntil: 'domcontentloaded' });
    await stageReady(page);
    const counts = await page.evaluate(async () => {
        const w = window as any; w.usdHydra.setPlaying(false);
        const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await frame();
        let data: any; w.usdRoot.traverse((o: any) => { if (o.isGaussianSplat) data = o.userData.usdGaussianData; });
        const memory = () => { const m = w.renderer.info.memory; return { storage: m.storageAttributes, bytes: m.storageAttributesSize, textures: m.textures, geometries: m.geometries }; };
        const counts = [memory()];
        for (let i = 0; i < 4; i++) {
            const mesh = await w.usdWebGpuSupport.createParticleField(data); w.scene.add(mesh);
            await frame(); mesh.removeFromParent(); mesh.dispose(); await frame(); counts.push(memory());
        }
        return counts;
    });
    for (const count of counts.slice(1)) expect(count).toEqual(counts[0]);
    expect(errors).toEqual([]);
});

for (const backend of ['webgpu','webgl']) test(`Gaussian tails stay smooth on dark backgrounds and preserve HDR (${backend})`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.setViewportSize({width:700,height:600});
  await page.goto(`/?viewer=three&backend=${backend}&file=/test-fixtures/coverage/advanced/splat-harmonics.usda`);
  await stageReady(page);
  const sigma=await page.evaluate(async()=>{
    const w=window as any,T=await import('three/webgpu');w.usdHydra.setPlaying(false);w.usdRoot.visible=false;
    w.renderer.toneMapping=T.NoToneMapping;w.renderer.outputColorSpace=T.LinearSRGBColorSpace;w.renderer.setClearColor(0,1);w.scene.background=null;
    const aspect=w.renderer.domElement.clientWidth/w.renderer.domElement.clientHeight;w.usdRenderCamera=new T.OrthographicCamera(-2*aspect,2*aspect,2,-2,.01,100);w.usdRenderCamera.position.z=5;w.usdRenderCamera.updateMatrixWorld();
    const coeff=new Float32Array([(.8-.5)/.28209479177387814,(2-.5)/.28209479177387814,(.4-.5)/.28209479177387814]);
    w.tailSplat=await w.usdWebGpuSupport.createParticleField({positions:new Float32Array([0,0,0]),scales:new Float32Array([.2,.2,.2]),orientations:new Float32Array([0,0,0,1]),opacities:new Float32Array([1]),coefficients:coeff,degree:0});w.scene.add(w.tailSplat);
    return w.renderer.domElement.clientHeight*.2/4;
  });
  const pixels=await page.evaluate(async sigma=>{
    const w=window as any,T=await import('three/webgpu'),r=w.renderer,size=r.domElement;
    const target=new T.RenderTarget(size.width,size.height,{type:T.HalfFloatType});r.setOutputRenderTarget(target);
    try {for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);
      const pixels=[];for(const radius of [0,2.2,3,3.6]) {const data=await r.readRenderTargetPixelsAsync(target,Math.floor(size.width/2+radius*sigma),Math.floor(size.height/2),1,1);pixels.push(Array.from(data,(value:any)=>T.DataUtils.fromHalfFloat(value)*255));}return pixels;
    }finally{r.setOutputRenderTarget(null);target.dispose();}
  },sigma);
  expect(pixels[1][0],JSON.stringify(pixels)).toBeGreaterThan(12);expect(pixels[2][0]).toBeGreaterThan(0);expect(pixels[0][1]).toBeGreaterThan(450);expect(pixels[3][0]).toBe(0);
  // HDR green radiance is 2.5 times red, including in the unsaturated tail.
  expect(pixels[1][1]/pixels[1][0]).toBeGreaterThan(2);
  await page.evaluate(()=>{const w=window as any;w.tailSplat.removeFromParent();w.tailSplat.dispose();w.usdRoot.visible=true;});
  await openSettings(page);
  const background=page.getByRole('combobox',{name:'Background',exact:true});
  for(const mode of ['basic','beauty']){
    await page.evaluate(mode=>(window as any).usdRenderModes.setMode(mode),mode);
    await background.selectOption('light');await page.waitForTimeout(100);const before=await page.locator('canvas.usd-viewer-three-canvas').screenshot();
    await background.selectOption('dark');await background.selectOption('light');await page.waitForTimeout(100);
    expect(await imageDifference(page,before,await page.locator('canvas.usd-viewer-three-canvas').screenshot())).toBeLessThan(30);
  }
  expect(errors).toEqual([]);
});
