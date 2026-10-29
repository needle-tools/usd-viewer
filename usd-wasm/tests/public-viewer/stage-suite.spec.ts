import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.fulfill({ contentType: 'text/css', body: '' }));
});

test('stage cameras, variants, properties and timeline use the composed USD stage', async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?viewer=three&file=/test-fixtures/coverage/lighting-mdl/studio-variants.usda', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Stage', exact: true }).click();
    const camera = page.getByRole('combobox', { name: 'Camera', exact: true });
    await camera.selectOption('/World/Camera');
    expect(await page.evaluate(() => { const w = window as any; return w.usdRenderCamera.userData.usdPath === '/World/Camera' && !w._controls.enabled; })).toBe(true);
    await camera.selectOption('');
    expect(await page.evaluate(() => { const w = window as any; return !w.usdRenderCamera && w._controls.enabled; })).toBe(true);
    const variant = page.locator('select[data-stage-variant=lighting]'); await variant.selectOption('nightNeon');
    await expect(page.locator('select[data-usd-variant-set=lighting]')).toHaveValue('nightNeon');
    await expect(page).toHaveURL(/stageVariant=/);
    await page.getByRole('searchbox', { name: 'Filter prims' }).fill('/World/Camera');
    await expect(page.locator('.usd-prim-tree button')).toHaveCount(1);
    await page.locator('.usd-prim-tree button').click();
    await expect(page.locator('#usd-suite table')).toContainText('focalLength');
    const time = page.getByRole('slider', { name: 'Time code', exact: true });
    await time.fill('24');
    await expect.poll(() => page.evaluate(() => (window as any).usdHydra.getTime())).toBe(24);
    expect(await page.evaluate(() => (window as any).usdHydra.isPlaying())).toBe(false);
    await page.getByRole('combobox', { name: 'Purpose', exact: true }).selectOption('guide');
    await expect(page.getByRole('combobox', { name: 'Purpose', exact: true })).toHaveValue('guide');
    await page.locator('a.clear-button').click();
    await expect(page.locator('#usd-suite')).toHaveCount(0);
    await expect(page.locator('.usd-timeline')).toHaveCount(0);
    expect(errors).toEqual([]);
});

test('payloads unload and load dependencies through the existing handle', async ({ page }) => {
    await page.goto('/?viewer=three&file=/test-fixtures/payloads/payload_root.usda&assetCache=0', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Stage', exact: true }).click();
    const payload = page.getByRole('checkbox', { name: 'Load /World/PayloadHolder', exact: true });
    await expect(payload).toBeChecked();
    const meshes = () => page.evaluate(() => { let count = 0; (window as any).usdRoot.traverse((object: any) => { if (object.isMesh) count++; }); return count; });
    await expect.poll(meshes).toBeGreaterThan(0);
    await payload.uncheck(); await expect(payload).not.toBeChecked(); await expect.poll(meshes).toBe(0);
    await payload.check(); await expect(payload).toBeChecked(); await expect.poll(meshes).toBeGreaterThan(0);
});
