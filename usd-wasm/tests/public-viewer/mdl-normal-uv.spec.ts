import {test, expect} from '@playwright/test';
import {stageReady} from './workbench-menus';

for (const viewer of ['three', 'needle']) {
  test(`${viewer}: MDL normal texture has continuous UVs at both torus seams`, async ({page}, info) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/?viewer=${viewer}&render=beauty&file=/test-fixtures/coverage/lighting-mdl/mdl-normal-texture.usda`);
    await stageReady(page);
    const result = await page.evaluate(async () => {
      const handle = (window as any).usdHydra; await handle.materialsReady();
      let mesh: any;
      handle.scene.traverse((object: any) => {if (object.isMesh && object.visible && object.userData.usdPath === '/World/MaterialRing') mesh = object;});
      const geometry = mesh.geometry, uv = geometry.attributes.uv, index = geometry.index;
      const count = index?.count || uv.count;
      const span = [0, 0];
      for (let i = 0; i < count; i += 3) {
        const ids = [0, 1, 2].map(j => index ? index.getX(i+j) : i+j);
        for (let axis = 0; axis < 2; axis++) {
          const values = ids.map(j => axis ? uv.getY(j) : uv.getX(j));
          span[axis] = Math.max(span[axis], Math.max(...values) - Math.min(...values));
        }
      }
      return {span, positions: geometry.attributes.position.count, normals: geometry.attributes.normal.count,
        normalMap: !!mesh.material.normalMap, normalScale: mesh.material.normalScale.toArray(),
        approximations: handle.diagnostics().mdlApproximations};
    });
    await page.screenshot({path: info.outputPath('mdl-normal-texture.png')});
    expect(result.normalMap).toBe(true); expect(result.approximations).toBeGreaterThan(0);
    expect(result.normalScale[0]).toBeCloseTo(.9); expect(Math.abs(result.normalScale[1])).toBeCloseTo(.9);
    expect(result.normals).toBe(result.positions);
    expect(result.span[0]).toBeCloseTo(1/96, 6); expect(result.span[1]).toBeCloseTo(1/32, 6);
    expect(errors).toEqual([]);
  });
}
