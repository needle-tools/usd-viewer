import {clearStage,openSettings,stageReady} from './workbench-menus';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.fulfill({ contentType: 'text/css', body: '' }));
});

test('stage cameras, variants and properties use composition; static stages hide the timeline', async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?viewer=three&file=/test-fixtures/coverage/lighting-mdl/studio-variants.usda', { waitUntil: 'domcontentloaded' });
    await stageReady(page);
    await openSettings(page);
    const camera = page.getByRole('combobox', { name: 'Camera', exact: true });
    await camera.selectOption('/World/Camera');
    expect(await page.evaluate(() => { const w = window as any; return w.usdRenderCamera.userData.usdPath === '/World/Camera' && !w._controls.enabled; })).toBe(true);
    await camera.selectOption('');
    expect(await page.evaluate(() => { const w = window as any; return !w.usdRenderCamera && w._controls.enabled; })).toBe(true);
    await page.keyboard.press('Escape');await page.locator('[data-prim-path="/World/Lights"]').click();
    const variant = page.locator('select[data-stage-variant=lighting]'); await variant.selectOption('nightNeon');
    await expect(page.locator('select[data-usd-variant-set=lighting]')).toHaveValue('nightNeon');
    await expect(page).toHaveURL(/stageVariant=/);
    await page.getByRole('searchbox', { name: 'Filter prims' }).fill('/World/Camera');
    await expect(page.getByRole('treeitem')).toHaveCount(2);
    await page.locator('.usd-prim-tree button[data-prim-path="/World/Camera"]').click();
    await expect(page.locator('[data-panel=properties] table')).toContainText('focalLength');
    await expect(page.locator('.usd-timeline')).toHaveCount(0);
    await openSettings(page);
    await page.getByRole('combobox', { name: 'Purpose', exact: true }).selectOption('guide');
    await expect(page.getByRole('combobox', { name: 'Purpose', exact: true })).toHaveValue('guide');
    await clearStage(page);
    await expect(page.locator('#usd-suite')).toHaveCount(0);
    await expect(page.locator('.usd-timeline')).toHaveCount(0);
    expect(errors).toEqual([]);
});

test('payloads unload and load dependencies through the existing handle', async ({ page }) => {
    await page.goto('/?viewer=three&file=/test-fixtures/payloads/payload_root.usda&assetCache=0', { waitUntil: 'domcontentloaded' });
    await stageReady(page);
    await page.evaluate(() => (window as any).usdWorkbench.openPanel('properties'));
    const payload = page.getByRole('checkbox', { name: 'Load /World/PayloadHolder', exact: true });
    await expect(payload).toBeChecked();
    const meshes = () => page.evaluate(() => { let count = 0; (window as any).usdRoot.traverse((object: any) => { if (object.isMesh) count++; }); return count; });
    await expect.poll(meshes).toBeGreaterThan(0);
    await payload.uncheck(); await expect(payload).not.toBeChecked(); await expect.poll(meshes).toBe(0);
    await payload.check(); await expect(payload).toBeChecked(); await expect.poll(meshes).toBeGreaterThan(0);
});
