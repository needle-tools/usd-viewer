import {test, expect} from './test';
import {stageReady} from './workbench-menus';

for (const viewer of ['three', 'needle']) for (const detail of ['adaptive', 'very-high']) {
  test(`${viewer}/${detail}: Pip winks, Pop changes shape, and playback seeks reversibly`, async ({page}, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/?viewer=${viewer}&render=beauty&complexity=${detail}&file=/test-fixtures/coverage/curved-surfaces/animated-subdivision-buddies.usda`);
    await stageReady(page);
    const state = (time: number) => page.evaluate(async time => {
      const w = window as any, handle = w.usdHydra;
      handle.setPlaying(false);
      await handle.setTime(time);
      const {Vector3, Raycaster} = await import('three');
      handle.scene.updateMatrixWorld(true);
      let shell: any, pop: any;
      handle.scene.traverse((object: any) => {
        if (object.isMesh && object.userData.usdPath === '/World/Pip/Shell') shell = object;
        if (object.isMesh && object.userData.usdPath === '/World/Pop/Morph') pop = object;
      });
      const from = new Vector3(-.36, .36, 2).applyMatrix4(shell.matrixWorld);
      const to = new Vector3(-.36, .36, .5).applyMatrix4(shell.matrixWorld);
      const ray = new Raycaster(from, to.clone().sub(from).normalize(), 0, from.distanceTo(to));
      const positions = Array.from(pop.geometry.attributes.position.array) as number[];
      let radius = 0;
      for(let i=0;i<positions.length;i+=3) radius=Math.max(radius,Math.hypot(positions[i],positions[i+1],positions[i+2]));
      return {
        eyeHits: ray.intersectObject(shell, false).length,
        popRadius: radius,
        positions,
        finite: [shell, pop].every(mesh => ['position', 'normal'].every(name => mesh.geometry.attributes[name].array.every(Number.isFinite))),
      };
    }, time);
    const initial = await state(1);
    expect(initial.eyeHits).toBe(0);
    await page.locator('#usd-viewport').screenshot({path: info.outputPath('smooth.png')});
    expect((await state(25)).eyeHits).toBeGreaterThan(0);
    await page.locator('#usd-viewport').screenshot({path: info.outputPath('wink.png')});
    expect((await state(33)).eyeHits).toBe(0);
    const sharp = await state(61);
    expect(sharp.popRadius).toBeGreaterThan(initial.popRadius + .2);
    expect(sharp.finite).toBe(true);
    await page.locator('#usd-viewport').screenshot({path: info.outputPath('sharp.png')});
    expect((await state(1)).positions).toEqual(initial.positions);
    expect((await state(121)).positions).toEqual(initial.positions);
    await state(1);
    await page.evaluate(() => (window as any).usdHydra.setPlaying(true));
    await expect.poll(() => page.evaluate(() => (window as any).usdHydra.renderedTime)).toBeGreaterThan(6);
    await page.evaluate(() => (window as any).usdHydra.setPlaying(false));
    expect(errors).toEqual([]);
  });
}
