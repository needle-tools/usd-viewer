import { test, expect } from '@playwright/test';

test('Hugging Face test set is a separate top-level catalog', async ({ page }) => {
    await page.goto('/?viewer=three');
    await page.locator('.dropdown-button').click();
    await page.locator('[data-sample-group="needle"]').click();
    await expect(page.locator('#gallery-title')).toHaveText('Needle');
    await expect(page.locator('#gallery-grid .gallery-card').first()).toBeVisible();
    await expect(page.locator('#needle-group-tree [data-sample-group="needle:remote-usd-assets"]')).toHaveCount(0);
    const original = await page.evaluate(async () => (await (await fetch('/data/usd-samples.json')).json()).map((x: any) => x.url));
    const needleUrls = await page.locator('#gallery-grid .gallery-card').evaluateAll(nodes => nodes.map(node => new URL((node as HTMLAnchorElement).href).searchParams.get('file')));
    for (const url of original) expect(needleUrls).not.toContain(url);
    for (const [group, count] of [['MDL', 6], ['Lights', 17], ['MaterialX Volumes', 3], ['MaterialX Graphs', 6]] as const) {
        const item = page.locator(`#needle-group-tree [data-sample-group="needle:${encodeURIComponent(group)}"]`);
        await expect(item.locator('small')).toHaveText(String(count));
        await item.click();
        await expect(page.locator('#gallery-grid .gallery-card')).toHaveCount(count);
    }
    const folder = page.locator('#sample-group-list > [data-sample-group="usd-assets"]');
    await expect(folder).toContainText('Hugging Face test set');
    await expect(folder.locator('small')).toHaveText('14 assets');
    await folder.click();
    await expect(page.locator('#gallery-title')).toHaveText('Hugging Face test set');
    await expect(page.locator('#gallery-grid .gallery-card')).toHaveCount(14);
    const displayed = await page.locator('#gallery-grid .gallery-card').evaluateAll(nodes => nodes.map(node => new URL((node as HTMLAnchorElement).href).searchParams.get('file')));
    expect(displayed).toEqual(original);
});

test('lighting variants change the authored light rig without a host environment', async ({ page }) => {
    await page.goto('/?viewer=three&file=/test-fixtures/coverage/lighting-mdl/studio-variants.usda');
    await page.waitForFunction(() => (window as any).usdHydra && (window as any).usdStage);
    const selection = page.locator('select[data-usd-variant-set="lighting"]');
    await expect(selection).toBeVisible();
    expect(await page.evaluate(() => (window as any).scene.environment === null)).toBe(true);
    await page.waitForTimeout(400);
    const before = await page.locator('canvas.usd-viewer-three-canvas').screenshot();
    await selection.selectOption('nightNeon');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('stageVariant')?.endsWith('|lighting|nightNeon'));
    expect(await page.evaluate(() => (window as any).usdStage.GetPrimAtPath('/World/Lights').GetVariantSelection('lighting'))).toBe('nightNeon');
    await page.waitForTimeout(400);
    const after = await page.locator('canvas.usd-viewer-three-canvas').screenshot();
    const diff = await page.evaluate(async ([a, b]) => {
        const decode = async (base64: string) => {
            const image = await createImageBitmap(await (await fetch('data:image/png;base64,' + base64)).blob());
            const canvas = document.createElement('canvas'); canvas.width=image.width; canvas.height=image.height;
            const ctx = canvas.getContext('2d')!; ctx.drawImage(image,0,0); return ctx.getImageData(0,0,image.width,image.height).data;
        };
        const left=await decode(a), right=await decode(b); let changed=0;
        for(let i=0;i<left.length;i+=4) if(Math.abs(left[i]-right[i])+Math.abs(left[i+1]-right[i+1])+Math.abs(left[i+2]-right[i+2])>18) changed++;
        return changed;
    }, [before.toString('base64'), after.toString('base64')]);
    expect(diff).toBeGreaterThan(1000);
    await page.reload();
    await expect(page.locator('select[data-usd-variant-set="lighting"]')).toHaveValue('nightNeon');
});

test('bounded volume selects the Three node renderer on direct navigation', async ({ page }) => {
    await page.goto('/?viewer=needle&file=/test-fixtures/coverage/materialx/ember-torus.usda');
    await page.waitForURL(url => url.searchParams.get('viewer') === 'three' && url.searchParams.get('render') === 'nodes');
    await page.waitForFunction(() => !!(window as any).usdHydra, { timeout: 120_000 });
    const result = await page.evaluate(async () => {
        const w = window as any;
        await w.usdHydra.materialsReady();
        const materials: string[] = [];
        w.usdRoot.traverse((object: any) => { for (const m of [object.material].flat()) if (m) materials.push(m.type); });
        return { nodeRenderer: w.renderer.isWebGPURenderer, materials, diagnostics: w.usdHydra.diagnostics() };
    });
    expect(result.nodeRenderer).toBe(true);
    expect(result.materials.some(type => /VolumeNodeMaterial/.test(type))).toBe(true);
    expect(result.diagnostics.materialXCreateFailures).toBe(0);
    expect(await page.evaluate(() => (window as any).renderer.getClearColor((window as any).renderer._clearColor.clone()).getStyle())).toBe('rgb(240,244,239)');
    await page.waitForTimeout(500);
    const screenshot = await page.locator('canvas.usd-viewer-three-canvas').screenshot({path:'.cache/coverage-validation/vdb-public/materialx-ember.png'});
    const opaqueLighting = await page.evaluate(async base64 => {
        const w = window as any;
        const plinth = w.usdRoot.getObjectByName('Plinth');
        const sample = plinth.localToWorld(plinth.position.clone().set(0, 0.06, 0.7)).project(w.camera);
        const image = await createImageBitmap(await (await fetch('data:image/png;base64,' + base64)).blob());
        const canvas = document.createElement('canvas'); canvas.width=image.width; canvas.height=image.height;
        const ctx=canvas.getContext('2d')!; ctx.drawImage(image,0,0);
        const x=Math.round((sample.x+1)*image.width/2), y=Math.round((1-sample.y)*image.height/2);
        const pixels=ctx.getImageData(x-2,y-2,5,5).data;
        const rgb=[0,0,0]; for(let i=0;i<pixels.length;i+=4) for(let c=0;c<3;c++) rgb[c]+=pixels[i+c]/25;
        const domes: any[]=[]; w.usdRoot.traverse((o:any)=>{if(o.userData?.usdTypeName==='DomeLight') domes.push({type:o.type,isLight:!!o.isLight,path:o.userData.usdPath});});
        return {rgb,domes,environment:!!w.scene.environment,material:plinth.material.type};
    }, screenshot.toString('base64'));
    expect(opaqueLighting.material).toBe('MeshPhysicalMaterial');
    expect(opaqueLighting.environment).toBe(true);
    expect(opaqueLighting.domes.length).toBeGreaterThan(0);
    expect(opaqueLighting.domes.every(dome=>dome.type==='Group'&&!dome.isLight&&dome.path)).toBe(true);
    // A zero-position HemisphereLight poisoned node-renderer irradiance with NaN,
    // turning this opaque surface black while the volume still rendered.
    expect(Math.min(...opaqueLighting.rgb)).toBeGreaterThan(15);
    expect(Math.max(...opaqueLighting.rgb)).toBeGreaterThan(30);
});

test('gallery changes renderer only when entering or leaving bounded volumes', async ({ page }) => {
    await page.goto('/?viewer=needle');
    await page.locator('.dropdown-button').click();
    await page.locator('[data-sample-group="needle"]').click();
    await page.locator('[data-sample-group="needle:MaterialX%20Volumes"]').click();
    await page.locator('.gallery-card[data-name="Ember torus"]').click();
    await page.waitForURL(url => url.searchParams.get('viewer') === 'three' && url.searchParams.get('render') === 'nodes');
    await page.waitForFunction(() => !!(window as any).usdHydra, { timeout: 120_000 });
    await page.locator('.dropdown-button').click();
    await page.locator('[data-sample-group="needle"]').click();
    await page.locator('[data-sample-group="needle:Composition"]').click();
    await page.locator('.gallery-card[data-name="External reference"]').click();
    await page.waitForURL(url => url.searchParams.get('viewer') === 'three' && !url.searchParams.has('render'));
    await page.waitForFunction(() => !!(window as any).usdHydra && !(window as any).renderer.isWebGPURenderer, { timeout: 120_000 });
});

test('Needle lighting fixtures do not inherit the host environment', async ({ page }) => {
    await page.goto('/?viewer=needle&file=/test-fixtures/coverage/lighting-mdl/studio-variants.usda');
    await page.waitForFunction(() => !!(window as any).usdHydra && !!(window as any).needleEngineContext, null, { timeout: 120_000 });
    expect(await page.evaluate(() => (window as any).needleEngineContext.scene.environment === null)).toBe(true);
    const intensity = await page.evaluate(() => {
        let max=0; (window as any).needleEngineContext.scene.traverse((o:any) => { if(o.isLight && o.userData?.usdKind==='sprim') max=Math.max(max,o.intensity); }); return max;
    });
    expect(intensity).toBeGreaterThan(10);
});

for (const viewer of ['three', 'needle']) {
    test(`${viewer} preserves authored dome environments across variants`, async ({ page }) => {
        await page.goto(`/?viewer=${viewer}&file=/test-fixtures/coverage/lighting-mdl/hdr-variants.usda`);
        await page.waitForFunction(() => !!(window as any).usdHydra && !!(window as any).usdStage, null, { timeout: 120_000 });
        await page.waitForFunction(viewer => !!(viewer === 'needle' ? (window as any).needleEngineContext?.scene : (window as any).scene)?.environment, viewer);
        const initial = await page.evaluate(viewer => (viewer === 'needle' ? (window as any).needleEngineContext.scene : (window as any).scene).environment.uuid, viewer);
        const selection = page.locator('select[data-usd-variant-set="environment"]');
        await selection.selectOption('night');
        await page.waitForFunction(({viewer, initial}) => (viewer === 'needle' ? (window as any).needleEngineContext.scene : (window as any).scene).environment?.uuid !== initial, {viewer,initial});
        await expect(selection).toHaveValue('night');
        await selection.selectOption('dayRotated');
        await page.waitForFunction(viewer => Math.abs((viewer === 'needle' ? (window as any).needleEngineContext.scene : (window as any).scene).environmentRotation.y - Math.PI / 2) < 0.01, viewer);
        await expect(selection).toHaveValue('dayRotated');
    });
}

for (const name of ['volume-density', 'volume-density-heat', 'volume-sequence', 'volume-transformed']) {
    test(`renders the ${name} VDB fixture through the public node renderer`, async ({ page }) => {
        const unsafeInvalidations: string[] = [];
        page.on('console', message => { if (message.text().includes('Unsafe scene index invalidation')) unsafeInvalidations.push(message.text()); });
        await page.setViewportSize({width:320,height:240});
        await page.goto(`/?viewer=needle&file=/test-fixtures/coverage/advanced/${name}.usda`);
        await page.waitForURL(url => url.searchParams.get('viewer') === 'three' && url.searchParams.get('render') === 'nodes');
        await page.waitForFunction(() => !!(window as any).usdHydra, null, { timeout: 120_000 });
        await page.evaluate(async () => { const w=window as any; w.usdHydra.setPlaying(false); await w.usdHydra.setTime(1); await w.usdHydra.materialsReady(); });
        await page.waitForFunction(() => {let found=false;(window as any).usdRoot.traverse((o:any)=>{if(o.userData?.usdVolumeFields?.length) found=true});return found}, null, {timeout:120_000});
        const scene = await page.evaluate(() => {const w=window as any;let fields:any[]=[];let transform:number[]=[];w.usdRoot.updateMatrixWorld(true);w.usdRoot.traverse((o:any)=>{if(o.userData?.usdVolumeFields?.length){fields=o.userData.usdVolumeFields;transform=o.matrixWorld.toArray()}});return {node:w.renderer.isWebGPURenderer,fields,transform}});
        expect(scene.node).toBe(true);
        expect(await page.evaluate(() => (window as any).renderer.getClearColor((window as any).renderer._clearColor.clone()).getStyle())).toBe('rgb(240,244,239)');
        expect(scene.fields.some(f=>f.name==='density' && f.dimensions.every((n:number)=>n>0))).toBe(true);
        if(name==='volume-density-heat') expect(scene.fields.some(f=>f.name==='heat')).toBe(true);
        if(name==='volume-transformed') expect(scene.transform[12]).toBeCloseTo(1);
        // Element screenshots include DOM overlays. Keep toolbar text out of the
        // scene-pixel assertions, especially at this deliberately small viewport.
        await page.locator('#top-center').evaluate((element: HTMLElement) => { element.style.visibility = 'hidden'; });
        await page.waitForTimeout(500);
        const filled=await page.locator('canvas.usd-viewer-three-canvas').screenshot({path:`.cache/coverage-validation/vdb-public/${name}-filled.png`});
        const foreground = await page.evaluate(async encoded => {
            const image=await createImageBitmap(await (await fetch('data:image/png;base64,'+encoded)).blob());
            const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
            const context=canvas.getContext('2d')!;context.drawImage(image,0,0);const data=context.getImageData(0,0,image.width,image.height).data;
            const corner=((image.height-1)*image.width+image.width-1)*4;let count=0, black=0;
            for(let y=Math.floor(image.height*.28);y<image.height*.85;y++)for(let x=Math.floor(image.width*.15);x<image.width*.85;x++){
                const i=(y*image.width+x)*4;if(Math.abs(data[i]-data[corner])+Math.abs(data[i+1]-data[corner+1])+Math.abs(data[i+2]-data[corner+2])>12)count++;
                if(y>image.height*.4 && y<image.height*.8 && data[i]<30 && data[i+1]<30 && data[i+2]<30) black++;
            } return {count,black};
        },filled.toString('base64'));
        expect(foreground.count).toBeGreaterThan(150);
        expect(foreground.black).toBeLessThan(20);
        if(name==='volume-sequence') {
            await page.evaluate(async()=>{await (window as any).usdHydra.setTime(24)});
            await page.waitForFunction(()=>{let empty=false;(window as any).usdRoot.traverse((o:any)=>{if(o.userData?.usdVolumeEmpty)empty=true});return empty},null,{timeout:120_000});
            await page.waitForTimeout(300); const empty=await page.locator('canvas.usd-viewer-three-canvas').screenshot({path:'.cache/coverage-validation/vdb-public/sequence-empty.png'});
            const changedPixels = async (left: Buffer, right: Buffer) => page.evaluate(async ([a,b]) => {
                const decode = async (v:string) => { const im=await createImageBitmap(await (await fetch('data:image/png;base64,'+v)).blob()); const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d')!;ctx.drawImage(im,0,0);return {data:ctx.getImageData(0,0,im.width,im.height).data,width:im.width,height:im.height};};
                const x=await decode(a),y=await decode(b);let count=0;
                for(let j=Math.floor(x.height*.3);j<x.height*.52;j++)for(let i=Math.floor(x.width*.28);i<x.width*.72;i++){const n=(j*x.width+i)*4;if(Math.abs(x.data[n]-y.data[n])+Math.abs(x.data[n+1]-y.data[n+1])+Math.abs(x.data[n+2]-y.data[n+2])>18)count++;}return count;
            },[left.toString('base64'),right.toString('base64')]);
            expect(await changedPixels(filled,empty)).toBeGreaterThan(100);
            await page.evaluate(async()=>{await (window as any).usdHydra.setTime(48)});
            await page.waitForFunction(()=>{let found=false;(window as any).usdRoot.traverse((o:any)=>{if(o.userData?.usdVolumeFields?.length)found=true});return found},null,{timeout:120_000});
            await page.waitForTimeout(300);const restored=await page.locator('canvas.usd-viewer-three-canvas').screenshot({path:'.cache/coverage-validation/vdb-public/sequence-restored.png'});
            expect(await changedPixels(restored,empty)).toBeGreaterThan(100);
        }
        expect(unsafeInvalidations).toEqual([]);
    });
}

for (const viewer of ['three','needle']) {
    test(`uses the subdivision fixture's high complexity in ${viewer}`, async ({ page }) => {
        await page.goto(`/?viewer=${viewer}&file=/test-fixtures/coverage/core/subdivision-catmullclark.usda`);
        await page.waitForFunction(() => !!(window as any).usdHydra, null, {timeout:120_000});
        expect(await page.evaluate(() => (window as any).usdHydra.driver.GetComplexity())).toBeCloseTo(1.2);
        expect(await page.evaluate(() => (window as any).usdHydra.driver.GetRefineLevelFallback())).toBeGreaterThan(0);
    });
}
test('an explicit complexity URL overrides the subdivision fixture default', async ({ page }) => {
    await page.goto('/?viewer=three&complexity=low&file=/test-fixtures/coverage/core/subdivision-catmullclark.usda');
    await page.waitForFunction(() => !!(window as any).usdHydra, null, {timeout:120_000});
    expect(await page.evaluate(() => (window as any).usdHydra.driver.GetComplexity())).toBeCloseTo(1);
});
