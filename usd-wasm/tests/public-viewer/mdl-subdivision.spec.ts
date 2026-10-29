import { expect, test } from '@playwright/test';

// Keep these local rendering checks independent of the web-font CDN.
test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.fulfill({ contentType: 'text/css', body: '' }));
});

for (const [viewer, name] of [
  ['three', 'mdl-metal'], ['needle', 'mdl-metal'],
  ['three', 'mdl-clearcoat'], ['three', 'mdl-color-texture'],
] as const) {
  test(`${viewer}: ${name} refines its authored vessel and switches to its cage`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/?viewer=${viewer}&file=/test-fixtures/coverage/lighting-mdl/${name}.usda`);
    await page.waitForFunction(() => !!(window as any).usdHydra, null, { timeout: 120_000 });
    await page.evaluate(() => (window as any).usdWorkbench.openPanel('properties'));
    const selection = page.locator('select[data-stage-variant="surface"]');
    await expect(selection).toHaveValue('smooth');
    const meshState = () => page.evaluate(async () => {
      const handle = (window as any).usdHydra;
      await handle.ready(); await handle.materialsReady();
      let mesh: any;
      handle.scene.traverse((o: any) => { if (o.isMesh && o.userData.usdPath === '/World/MaterialRing') mesh = o; });
      return { positions: mesh.geometry.attributes.position.count, normals: mesh.geometry.attributes.normal?.count,
        uv: mesh.geometry.attributes.uv?.count, material: mesh.material.type, hasMap: !!mesh.material.map,
        mdlApproximations: handle.diagnostics().mdlApproximations,
        complexity: handle.driver.GetRefineLevelFallback() };
    });
    const smooth = await meshState();
    expect(smooth.complexity).toBeGreaterThan(0);
    expect(smooth.positions).toBeGreaterThan(2000);
    expect(smooth.normals).toBe(smooth.positions);
    expect(smooth.uv).toBe(smooth.positions);
    expect(smooth.mdlApproximations).toBeGreaterThan(0);
    if (name === 'mdl-color-texture') expect(smooth.hasMap).toBe(true);
    await page.screenshot({ path: `.cache/coverage-validation/${name}-${viewer}-smooth.png` });
    await selection.selectOption('cage');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('stageVariant')?.endsWith('|surface|cage'));
    const cage = await meshState();
    expect(cage.positions).toBeLessThan(smooth.positions / 2);
    expect(cage.uv).toBe(cage.positions);
    expect(cage.material).toBe(smooth.material);
    expect(cage.hasMap).toBe(smooth.hasMap);
    await selection.selectOption('smooth');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('stageVariant')?.endsWith('|surface|smooth'));
    expect((await meshState()).positions).toBe(smooth.positions);
    expect(errors).toEqual([]);
  });
}
