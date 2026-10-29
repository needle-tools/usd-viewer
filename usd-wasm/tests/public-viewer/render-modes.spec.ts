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

test('Basic, SSGI and MuTracer render the same stage and preserve the camera', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('net::')) errors.push(message.text()); });
    const requests: string[] = []; page.on('request', request => requests.push(request.url()));
    await page.goto('/?viewer=three&file=/test-fixtures/coverage/lighting-mdl/studio-variants.usda&render=basic&assetCache=0', { waitUntil: 'domcontentloaded' });
    await stageReady(page);
    expect(await page.evaluate(() => (window as any).renderer.isWebGPURenderer)).toBe(true);
    expect(requests.some(url => url.includes('/mutracer/'))).toBe(false);
    const state = await page.evaluate(() => {
        const w = window as any; w.usdHydra.setPlaying(false); w._controls.enableDamping = false;
        w.stageBefore = w.usdHydra.driver; return { position: w.camera.position.toArray(), target: w._controls.target.toArray() };
    });
    const canvas = page.locator('canvas.usd-viewer-three-canvas');
    const basic = await canvas.screenshot();
    await openSettings(page);
    const picker = page.getByRole('combobox', { name: 'Render mode', exact: true });
    await picker.selectOption('beauty');
    await expect.poll(() => page.evaluate(() => (window as any).usdRenderModes.mode)).toBe('beauty');
    await page.waitForTimeout(1200);
    const beauty = await canvas.screenshot();
    expect(await imageDifference(page, basic, beauty)).toBeGreaterThan(1000);
    await page.screenshot({ path: testInfo.outputPath('beauty.png') });
    await picker.selectOption('pathtraced');
    await expect.poll(() => page.evaluate(() => (window as any).usdRenderModes.samples), { timeout: 90_000 }).toBeGreaterThan(2);
    expect(requests.some(url => url.endsWith('/mutracer/lib/renderer/bvh.worker.js'))).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('pathtraced.png') });
    await expect.poll(() => page.evaluate(() => (window as any).usdRenderModes.samples), { timeout: 90_000 }).toBe(512);
    const reset = await page.evaluate(() => {
        const w = window as any; w.camera.position.x += 0.2; w.camera.updateMatrixWorld(); w.usdRenderModes.render(); return w.usdRenderModes.samples;
    });
    expect(reset).toBeLessThan(512);
    await page.evaluate(() => { const w = window as any; w.camera.position.x -= 0.2; w._controls.update(); });
    const restored = await page.evaluate(() => {
        const w = window as any; return { position: w.camera.position.toArray(), target: w._controls.target.toArray() };
    });
    for (const key of ['position', 'target'] as const) for (let i = 0; i < 3; i++) expect(restored[key][i]).toBeCloseTo(state[key][i], 10);
    await picker.selectOption('basic');
    await expect.poll(() => page.evaluate(() => (window as any).usdRenderModes.mode)).toBe('basic');
    expect(await page.evaluate(() => {
        const w = window as any; return w.stageBefore === w.usdHydra.driver && w.usdRenderModes.pathCanvas.hidden && w.renderer.domElement.style.opacity === '';
    })).toBe(true);
    await page.setViewportSize({ width: 800, height: 600 });
    await openSettings(page);
    await picker.selectOption('pathtraced');
    await expect.poll(() => page.evaluate(() => (window as any).usdRenderModes.samples), { timeout: 90_000 }).toBeGreaterThan(2);
    expect(await page.evaluate(() => { const canvas = (window as any).usdRenderModes.pathCanvas; return [canvas.width, canvas.height]; })).toEqual(await page.evaluate(() => { const canvas = (window as any).renderer.domElement; return [canvas.width, canvas.height]; }));
    expect(errors).toEqual([]);
});

test('node PreviewSurface preserves custom geomprops and path mode refuses unsupported graphs', async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('net::')) errors.push(message.text()); });
    await page.goto('/?viewer=three&file=/test-fixtures/usd-concepts/custom_vertex_geomprops.usda&render=basic&assetCache=0', { waitUntil: 'domcontentloaded' });
    await stageReady(page);
    await page.evaluate(async () => { const w = window as any; await w.usdHydra.materialsReady(); w.usdHydra.setPlaying(false); });
    const result = await page.evaluate(() => {
        const w = window as any, colors: number[][] = [], materials: string[] = [];
        w.usdRoot.traverse((object: any) => { if (!object.isMesh) return; for (const material of [object.material].flat()) materials.push(material.type); for (const [name, attribute] of Object.entries(object.geometry.attributes) as [string, any][]) if (name.includes('tint') || name.includes('diffuseColor')) colors.push(Array.from(attribute.array)); });
        return { materials, colors };
    });
    expect(result.materials.length).toBeGreaterThan(0);
    expect(result.colors.some(color => new Set(color).size > 2)).toBe(true);
    await openSettings(page);
    await page.getByRole('combobox', { name: 'Render mode', exact: true }).selectOption('pathtraced');
    await expect(page.locator('#render-mode-controls [role=status]')).toContainText(/does not yet support/);
    expect(await page.evaluate(() => (window as any).usdRenderModes.mode)).toBe('basic');
    expect(errors).toEqual([]);
});

for (const [file, expected] of [
    ['coverage/materialx/nested.usda', 'surface'],
    ['coverage/materialx/filename-interface-colorspace.usda', 'surface'],
    ['coverage/materialx/jade-plume.usda', 'volume'],
    ['coverage/advanced/volume-density-heat.usda', 'vdb'],
] as const) {
    test(`WebGPU Basic and Beauty preserve ${file}`, async ({ page }, testInfo) => {
        const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error' && !message.text().includes('net::')) errors.push(message.text()); });
        await page.goto(`/?viewer=three&file=/test-fixtures/${file}&render=basic&assetCache=0`, { waitUntil: 'domcontentloaded' });
        await stageReady(page);
        const result = await page.evaluate(async () => {
            const w = window as any; await w.usdHydra.materialsReady(); w.usdHydra.setPlaying(false);
            const types: string[] = []; w.usdRoot.traverse((object: any) => { for (const material of [object.material].flat()) if (material) types.push(material.type); });
            return { types, diagnostics: w.usdHydra.diagnostics() };
        });
        if (expected !== 'vdb') expect(result.diagnostics.materialXCreateFailures).toBe(0);
        expect(result.types.some(type => expected === 'surface' ? type.includes('NodeMaterial') : type.includes('VolumeNodeMaterial'))).toBe(true);
        await openSettings(page);
        await page.getByRole('combobox', { name: 'Render mode', exact: true }).selectOption('beauty');
        await expect.poll(() => page.evaluate(() => (window as any).usdRenderModes.mode)).toBe('beauty');
        await page.waitForTimeout(500);
        await page.screenshot({ path: testInfo.outputPath('beauty.png') });
        await page.getByRole('combobox', { name: 'Render mode', exact: true }).selectOption('pathtraced');
        await expect(page.locator('#render-mode-controls [role=status]')).toContainText('does not yet support');
        expect(await page.evaluate(() => (window as any).usdRenderModes.mode)).toBe('beauty');
        expect(errors).toEqual([]);
    });
}

test('WebGPU preserves per-point opacity', async ({ page }) => {
    await page.goto('/?viewer=three&file=/test-fixtures/coverage/core/points-widths.usda', { waitUntil: 'domcontentloaded' });
    await stageReady(page);
    const samples = await page.evaluate(async () => {
        const w = window as any;
        const T = await import('three'); const { createThreeHydra, getUsdModule } = await import('/usd/index.js');
        w.usdHydra.setPlaying(false); w.usdRoot.visible = false;
        const root = new T.Group(); w.scene.add(root); w.scene.environment = null; w.scene.add(new T.AmbientLight(0xffffff, 3));
        const source = `#usda 1.0\n( upAxis = "Y" )
def Points "Points" {
 point3f[] points = [(-1,0,0),(0,0,0),(1,0,0)]
 float[] widths = [0.8,0.8,0.8] (interpolation = "vertex")
 color3f[] primvars:displayColor = [(1,0,0)]
 float[] primvars:displayOpacity = [0,0.5,1] (interpolation = "vertex")
}`;
        const file = Object.assign(new File([source], 'opacity.usda'), { path: 'opacity.usda' });
        w.opacityHandle = await createThreeHydra({ USD: await getUsdModule(), scene: root, renderScene: w.scene, renderer: w.renderer, files: [file], webGpuSupport: w.usdWebGpuSupport });
        await w.opacityHandle.ready();
        w._controls.enableDamping = false; w.camera.position.set(0,0,5); w._controls.target.set(0,0,0); w._controls.update();
        w.camera.updateMatrixWorld();
        return [...[-1,0,1].map(x => { const v = new T.Vector3(x,0,0).project(w.camera); return [Math.round((v.x+1)*w.renderer.domElement.clientWidth/2), Math.round((1-v.y)*w.renderer.domElement.clientHeight/2)]; }), [10, Math.round(w.renderer.domElement.clientHeight / 2)]];
    });
    const screenshot = await page.locator('canvas.usd-viewer-three-canvas').screenshot();
    const pixels = await page.evaluate(async ({ encoded, samples }) => {
        const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + encoded)).blob());
        const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap,0,0);
        return samples.map(([x,y]) => Array.from(ctx.getImageData(x,y,1,1).data).slice(0,3));
    }, { encoded: screenshot.toString('base64'), samples });
    const background = pixels[3];
    const distance = (rgb: number[]) => rgb.reduce((sum,value,index) => sum + Math.abs(value-background[index]),0);
    expect(distance(pixels[0]), JSON.stringify(pixels)).toBeLessThan(5);
    expect(distance(pixels[2])).toBeGreaterThan(60);
    expect(distance(pixels[1])).toBeGreaterThan(10);
    expect(distance(pixels[1])).toBeLessThan(distance(pixels[2]));
    await openSettings(page);
    await page.getByRole('combobox', { name: 'Render mode', exact: true }).selectOption('pathtraced');
    await expect(page.locator('#render-mode-controls [role=status]')).toContainText('point and curve opacity');
    await page.evaluate(() => (window as any).opacityHandle.dispose());
});

test('Beauty supports the WebGL backend and authored orthographic cameras', async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('net::')) errors.push(message.text()); });
    await page.goto('/?viewer=three&backend=webgl&render=beauty&file=/test-fixtures/coverage/core/orthographic-camera.usda', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => (window as any).usdRenderModes?.mode)).toBe('beauty');
    await stageReady(page);
    await page.getByRole('combobox', { name: 'Camera', exact: true }).selectOption('/World/Camera');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => { const w = window as any; return { backend: w.renderer.backend.isWebGLBackend, ortho: w.usdRenderCamera.isOrthographicCamera, width: w.usdRenderCamera.right - w.usdRenderCamera.left }; })).toEqual({ backend: true, ortho: true, width: 7.5 });
    await page.screenshot();
    expect(errors).toEqual([]);
});

test('gkjohnson traces on the shared renderer, resets on edits and releases private geometry', async ({ page }, testInfo) => {
    const errors: string[] = []; const requests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => requests.push(request.url()));
    await page.setViewportSize({ width: 640, height: 480 });
    await page.goto('/?viewer=three&file=/test-fixtures/coverage/lighting-mdl/studio-variants.usda', { waitUntil: 'domcontentloaded' });
    await stageReady(page);
    expect(requests.some(url => url.includes('/three-gpu-pathtracer/'))).toBe(false);
    const original = await page.evaluate(() => {
        const w = window as any; w.usdHydra.setPlaying(false); w._controls.enableDamping = false;
        w.originalRenderer = w.renderer; w.originalDriver = w.usdHydra.driver;
        const meshes: any[] = []; w.usdRoot.traverse((o: any) => { if (o.isMesh) meshes.push(o); }); w.testMesh = meshes[0];
        return { index: Array.from(w.testMesh.geometry.index?.array || []), attributes: Object.keys(w.testMesh.geometry.attributes).sort() };
    });
    await openSettings(page);
    const picker = page.getByRole('combobox', { name: 'Render mode', exact: true });
    await picker.selectOption('pathtraced-gk');
    await expect.poll(() => page.evaluate(() => (window as any).usdRenderModes.samples), { timeout: 90_000 }).toBeGreaterThan(4);
    expect(await page.evaluate(() => { const w = window as any; return w.originalRenderer === w.renderer && w.originalDriver === w.usdHydra.driver && w.usdRenderModes.pathCanvas.hidden && w.renderer.domElement.style.opacity === ''; })).toBe(true);
    expect(requests.some(url => url.includes('/mutracer/'))).toBe(false);
    await page.screenshot({ path: testInfo.outputPath('gkjohnson.png') });
    for (const edit of ['camera', 'transform', 'material', 'geometry', 'light', 'background', 'visibility']) {
        const after = await page.evaluate(edit => {
            const w = window as any;
            const before = w.usdRenderModes.samples;
            if (edit === 'camera') w.camera.position.x += 0.2;
            if (edit === 'transform') w.testMesh.matrix.elements[12] += 0.1;
            if (edit === 'material') w.testMesh.material.roughness = 0.25;
            if (edit === 'geometry') { const attribute = w.testMesh.geometry.getAttribute('position'); attribute.setX(0, attribute.getX(0) + 0.05); attribute.needsUpdate = true; }
            if (edit === 'light') { let light: any; w.usdRoot.traverse((o: any) => { if (o.isLight) light = o; }); light.intensity *= 0.8; }
            if (edit === 'background') w.renderer.setClearColor(0x223344, 1);
            if (edit === 'visibility') w.testMesh.visible = false;
            w.usdRenderModes.render(); return { before, after: w.usdRenderModes.samples };
        }, edit);
        expect(after.before).toBeGreaterThan(0); expect(after.after, edit).toBe(0);
        await expect.poll(() => page.evaluate(() => (window as any).usdRenderModes.samples), { timeout: 90_000 }).toBeGreaterThan(2);
    }
    await picker.selectOption('basic');
    expect(await page.evaluate(() => {
        const w = window as any; return { index: Array.from(w.testMesh.geometry.index?.array || []), attributes: Object.keys(w.testMesh.geometry.attributes).sort() };
    })).toEqual(original);
    expect(await page.evaluate(() => !!(window as any).testMesh.geometry.boundsTree)).toBe(false);
    await picker.selectOption('pathtraced-gk');
    await expect.poll(() => page.evaluate(() => (window as any).usdRenderModes.samples), { timeout: 90_000 }).toBeGreaterThan(2);
    await openSettings(page);
    await page.getByRole('combobox', { name: 'Camera', exact: true }).selectOption('/World/Camera');
    await expect.poll(() => page.evaluate(() => (window as any).usdRenderModes.samples), { timeout: 90_000 }).toBeGreaterThan(2);
    await page.evaluate(() => (window as any).usdWorkbench.openPanel('properties'));
    await page.locator('select[data-stage-variant=lighting]').selectOption('nightNeon');
    await expect.poll(() => page.evaluate(() => (window as any).usdRenderModes.samples), { timeout: 90_000 }).toBeGreaterThan(2);
    await page.setViewportSize({ width: 800, height: 600 });
    await expect.poll(() => page.evaluate(() => (window as any).usdRenderModes.samples), { timeout: 90_000 }).toBeGreaterThan(2);
    await openSettings(page);
    await picker.selectOption('basic');
    expect(errors).toEqual([]);
});
