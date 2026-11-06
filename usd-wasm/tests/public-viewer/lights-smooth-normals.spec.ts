import { expect, test } from './test';

for (const viewer of ['three', 'needle']) {
  test(`${viewer}: light-scene torus has continuous analytic vertex normals`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/?viewer=${viewer}&file=/test-fixtures/coverage/lighting-mdl/studio-variants.usda`);
    await page.waitForFunction(() => !!(window as any).usdHydra);
    const normals = await page.evaluate(async () => {
      const handle = (window as any).usdHydra;
      await handle.ready(); await handle.materialsReady();
      let mesh: any;
      handle.scene.traverse((object: any) => { if (object.isMesh && object.userData.usdPath === '/World/Ring') mesh = object; });
      const positions = mesh.geometry.attributes.position, normals = mesh.geometry.attributes.normal;
      let maxError = 0, maxLengthError = 0;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i) - 1.45, z = positions.getZ(i);
        const radial = Math.hypot(x, y);
        const expected = [(radial - .75) / .18 * x / radial, (radial - .75) / .18 * y / radial, z / .18];
        const actual = [normals.getX(i), normals.getY(i), normals.getZ(i)];
        maxError = Math.max(maxError, Math.hypot(...actual.map((value, axis) => value - expected[axis])));
        maxLengthError = Math.max(maxLengthError, Math.abs(Math.hypot(...actual) - 1));
      }
      return { vertices: positions.count, maxError, maxLengthError, flatShading: mesh.material.flatShading === true };
    });
    expect(normals.vertices).toBeGreaterThan(3000);
    expect(normals.maxError).toBeLessThan(1e-4);
    expect(normals.maxLengthError).toBeLessThan(1e-6);
    expect(normals.flatShading).toBe(false);
    await page.screenshot({ path: `.cache/coverage-validation/smooth-torus-${viewer}.png` });
    expect(errors).toEqual([]);
  });
}
