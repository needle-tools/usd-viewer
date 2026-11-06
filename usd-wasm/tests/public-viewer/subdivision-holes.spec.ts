import {test, expect} from './test';
import {stageReady} from './workbench-menus';

const holes = [5,7,13,15,21,23,29,31,37,39,45,47,69,71,77,79,85,87,93,95];
for(const viewer of ['three','needle']) test(`${viewer}: lantern holes survive refinement and live topology edits`, async ({page}, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/?viewer=${viewer}&file=%2Ftest-fixtures%2Fcoverage%2Fcurved-surfaces%2Fhole-lantern.usda&render=beauty&complexity=very-high`);
  await stageReady(page);
  const opening = () => page.evaluate(async () => {
    const {Vector3, Raycaster} = await import('three');
    const w = window as any; let mesh: any;
    w.usdHydra.scene.updateMatrixWorld(true);
    w.usdHydra.scene.traverse((object: any) => {if(object.isMesh && object.userData.usdPath === '/World/holes') mesh = object;});
    // Through the center of authored hole face 5 on the positive-X side.
    // Stop inside the lantern so its opposite surface cannot count as a hit.
    const origin = new Vector3(3, .0802, .2679).applyMatrix4(mesh.matrixWorld);
    const end = new Vector3(.2, .0802, .2679).applyMatrix4(mesh.matrixWorld);
    const ray = new Raycaster(origin,end.clone().sub(origin).normalize(),0,origin.distanceTo(end));
    return {hits:ray.intersectObject(mesh,false).length, triangles:(mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count)/3,
      level:w.usdHydra.driver.GetRefineLevelFallback()};
  });
  const setHoles = (indices: number[]) => page.evaluate(indices => (window as any).usdHydra.editStage((stage: any) => {
    const prim = stage.GetPrimAtPath('/World/holes'), attr = prim.GetAttribute('holeIndices');
    try { attr.Set(indices,NaN); } finally {attr.delete();prim.delete();}
  }),indices);
  for(const detail of ['low','very-high','adaptive']) {
    await page.evaluate(detail => (window as any).usdHydra.setComplexity(detail),detail);
    const before = await opening();
    expect(before.hits,`${detail}: opening must be empty`).toBe(0);
    if(detail === 'adaptive') expect(before.triangles).toBeLessThanOrEqual((96-holes.length)*2*4**before.level);
    else expect(before.triangles).toBe((96-holes.length)*2*4**before.level);
    await setHoles([]);
    expect((await opening()).hits,`${detail}: clearing holes must close the opening`).toBeGreaterThan(0);
    await setHoles(holes);
    expect((await opening()).hits,`${detail}: restoring holes must reopen it`).toBe(0);
  }
  await page.locator('#usd-viewport').screenshot({path:info.outputPath('refined-lantern.png')});
  expect(errors).toEqual([]);
});
