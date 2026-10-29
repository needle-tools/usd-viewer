import { expect, test } from '@playwright/test';

// Keep these local rendering checks independent of the web-font CDN.
test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.fulfill({ contentType: 'text/css', body: '' }));
});

test('jade volume composites over the background and receives light without an opaque proxy shadow', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/?viewer=three&render=nodes&backend=webgl&file=/test-fixtures/coverage/materialx/jade-plume.usda&assetCache=0');
    const background = page.getByRole('combobox', { name: 'Background', exact: true });
    await expect(background).toHaveValue('light');
    const initial = await page.evaluate(async () => {
        const w = window as any; await w.usdHydra.ready(); await w.usdHydra.materialsReady();
        w.usdHydra.setPlaying(false); w._controls.autoRotate = false; w._controls.enableDamping = false;
        w.camera.position.set(0, 0, 5); w._controls.target.set(0, 0, 0); w._controls.update();
        w.usdRoot.getObjectByName('Plinth').visible = false;
        w.testMedium = w.usdRoot.getObjectByName('Medium');
        w.originalDriver = w.usdHydra.driver;
        w.key = w.usdRoot.getObjectByName('Key');
        return { castShadow: w.testMedium.castShadow, receives: w.testMedium.receiveShadow, intensity: w.key.intensity };
    });
    expect(initial.castShadow).toBe(false);
    expect(initial.receives).toBe(true);
    expect(initial.intensity).toBe(4);
    const pixel = () => page.evaluate(() => {
        const w = window as any; w.renderer.render(w.scene, w.camera);
        const gl = w.renderer.backend.gl, data = new Uint8Array(4);
        gl.readPixels(640, 450, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
        return Array.from(data);
    });
    await page.waitForTimeout(100);
    const lightBackground = await pixel();
    await page.evaluate(async () => {
        const w = window as any, T = await import('three/webgpu');
        w.backdrop = new T.Mesh(new T.PlaneGeometry(100, 100), new T.MeshBasicNodeMaterial({ color: w.renderer.getClearColor(new T.Color()) }));
        w.backdrop.position.z = -2; w.scene.add(w.backdrop);
    });
    const opaque = await pixel();
    for (let channel = 0; channel < 3; channel++) expect(Math.abs(opaque[channel] - lightBackground[channel])).toBeLessThanOrEqual(2);
    await page.evaluate(() => { (window as any).backdrop.visible = false; });
    await background.selectOption('dark');
    await expect(page).toHaveURL(/background=dark/);
    const dark = await pixel();
    expect(dark[1]).toBeGreaterThan(dark[0] + 30);
    expect(dark[1]).toBeGreaterThan(dark[2] + 20);
    await page.evaluate(() => { (window as any).key.intensity = 0; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const unlit = await pixel();
    expect(dark[1] - unlit[1]).toBeGreaterThan(5);
    await page.evaluate(() => { (window as any).key.intensity = 4; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: testInfo.outputPath('jade-dark-background.png') });
    expect(await page.evaluate(() => (window as any).originalDriver === (window as any).usdHydra.driver)).toBe(true);
    await page.reload();
    await expect(background).toHaveValue('dark');
    await page.screenshot({ path: testInfo.outputPath('jade-default-camera-dark.png') });
    await page.locator('a.clear-button').click();
    await expect(page.locator('#usd-background-controls')).toBeHidden();
    expect(errors).toEqual([]);
});
