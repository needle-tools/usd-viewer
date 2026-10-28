import { expect, test } from '@playwright/test';

for (const viewer of ['three', 'needle']) {
  test(`${viewer}: detail changes subdivision in place and survives reload`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/?viewer=${viewer}&complexity=low&file=/test-fixtures/coverage/lighting-mdl/mdl-metal.usda`);
    const detail = page.getByRole('combobox', { name: 'USD detail', exact: true });
    await expect(detail).toHaveValue('low');
    const state = () => page.evaluate(async () => {
      const w = window as any, h = w.usdHydra;
      await h.ready(); await h.materialsReady(); h.setPlaying(false);
      if (w._controls) { w._controls.autoRotate = false; w._controls.enableDamping = false; }
      let mesh: any;
      h.scene.traverse((o: any) => { if (o.isMesh && o.userData.usdPath === '/World/MaterialRing') mesh = o; });
      return { vertices: mesh.geometry.attributes.position.count, color: mesh.material.color.toArray(),
        complexity: h.driver.GetComplexity(), camera: w.camera.position.toArray() };
    });
    const low = await state();
    await page.evaluate(() => { (window as any).originalDriver = (window as any).usdHydra.driver; });
    await detail.selectOption('high');
    await expect(detail).toBeEnabled();
    await expect(page).toHaveURL(/complexity=high/);
    const high = await state();
    expect(high.vertices).toBeGreaterThan(low.vertices * 2);
    expect(high.complexity).toBeCloseTo(1.2);
    expect(high.color).toEqual(low.color);
    expect(high.camera).toEqual(low.camera);
    expect(await page.evaluate(() => (window as any).originalDriver === (window as any).usdHydra.driver)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('high-detail.png') });
    await page.reload();
    await expect(detail).toHaveValue('high');
    expect((await state()).vertices).toBe(high.vertices);
    await page.locator('a.clear-button').click();
    await expect(page.locator('#usd-detail-controls')).toBeHidden();
    expect(errors).toEqual([]);
  });
}
