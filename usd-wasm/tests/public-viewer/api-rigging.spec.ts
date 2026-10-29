import {test, expect} from '@playwright/test';
import {stageReady} from './workbench-menus';

const rigs = [
  ['weighted-skinning', '/World/Frond/Body'],
  ['rigid-skinning', '/World/Mast/Dish'],
];
for (const viewer of ['three', 'needle']) for (const [id, path] of rigs) {
  test(`${viewer}: ${id} deforms and seeks reversibly`, async ({page}) => {
    await page.goto(`/?viewer=${viewer}&render=beauty&file=${encodeURIComponent('/test-fixtures/api/examples.js#' + id)}`);
    await stageReady(page);
    const pose = (time: number) => page.evaluate(async ({time, path}) => {
      const handle = (window as any).usdHydra;
      handle.setPlaying(false);
      await handle.setTime(time);
      const {Vector3, Matrix4} = await import('three');
      handle.scene.updateMatrixWorld(true);
      const values: number[] = [];
      handle.scene.traverse((object: any) => {
        if (!object.isMesh || object.userData.usdPath !== path) return;
        // Hydra can express rigid skinning as an object transform rather than
        // changing its local vertex buffer. Compare the rendered world points.
        const position = object.geometry.attributes.position;
        const point = new Vector3(), matrix = new Matrix4();
        if (object.isInstancedMesh) object.getMatrixAt(0, matrix);
        matrix.premultiply(object.matrixWorld);
        for (let i = 0; i < position.count; i++)
          values.push(...point.fromBufferAttribute(position, i).applyMatrix4(matrix).toArray());
      });
      return values;
    }, {time, path});
    const initial = await pose(1), extended = await pose(20), restored = await pose(1);
    expect(initial.length).toBeGreaterThan(0);
    expect(initial.every(Number.isFinite) && extended.every(Number.isFinite)).toBe(true);
    expect(initial.length).toBe(extended.length);
    expect(Math.max(...initial.map((value, i) => Math.abs(value - extended[i])))).toBeGreaterThan(.2);
    expect(restored).toEqual(initial);
  });
}
