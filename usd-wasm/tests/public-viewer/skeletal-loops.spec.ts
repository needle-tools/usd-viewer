import {test, expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {stageReady} from './workbench-menus';

const fixtures = ['skel-rest', 'skel-bind', 'skel-joint-names', 'skel-weighted',
  'skel-dual-quaternion', 'skel-translation', 'skel-rotation',
  'blendshape', 'blendshape-sparse', 'blendshape-inbetween'];

for (const viewer of ['three', 'needle']) {
  test(`${viewer}: skeletal performances loop and seek without losing their pose`, async ({page}, info) => {
    test.setTimeout(300_000);
    const results: any[] = [], errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const name of fixtures) await test.step(name, async () => {
      const root = `coverage/advanced/${name}.usda`;
      await page.goto(`/?viewer=${viewer}&render=beauty&file=${encodeURIComponent('/test-fixtures/' + root)}`);
      await stageReady(page);
      const range = await page.evaluate(() => {
        const h = (window as any).usdHydra; h.setPlaying(false);
        return [h.driver.GetStageStartTimeCode(), h.driver.GetStageEndTimeCode()];
      });
      const times = [0, .125, .25, .375, .5, .625, .75, .875, 1]
        .map(t => range[0] + t * (range[1] - range[0]));
      const samples: {time: number; positions: number[]}[] = [];
      for (const time of [...times, times[2], times[0]]) {
        const positions = await page.evaluate(async time => {
          const h = (window as any).usdHydra; await h.setTime(time);
          const {Vector3, Matrix4} = await import('three');
          h.scene.updateMatrixWorld(true);
          const values: number[] = [], point = new Vector3();
          h.scene.traverse((object: any) => {
            if (!object.isMesh || object.userData.usdPath !== '/World/Rig/Surface') return;
            const position = object.geometry.attributes.position;
            for (let instance = 0; instance < (object.isInstancedMesh ? object.count : 1); instance++) {
              const matrix = new Matrix4();
              if (object.isInstancedMesh) object.getMatrixAt(instance, matrix);
              matrix.premultiply(object.matrixWorld);
              for (let i = 0; i < position.count; i++)
                values.push(...point.fromBufferAttribute(position, i).applyMatrix4(matrix).toArray());
            }
          });
          return values;
        }, time);
        expect(positions.length).toBeGreaterThan(0);
        expect(positions.every(Number.isFinite)).toBe(true);
        samples.push({time, positions});
      }
      const initial = samples[0].positions;
      for (const sample of samples) expect(sample.positions.length).toBe(initial.length);
      const distance = (a: number[], b: number[]) => a.reduce((max, v, i) => Math.max(max, Math.abs(v - b[i])), 0);
      expect(distance(initial, samples[8].positions), 'end pose equals start').toBeLessThan(1e-5);
      expect(distance(initial, samples[10].positions), 'backward seek restores start').toBeLessThan(1e-5);
      expect(distance(samples[2].positions, samples[9].positions), 'backward seek restores intermediate pose').toBeLessThan(1e-5);
      expect(Math.max(...samples.slice(1, 8).map(sample => distance(initial, sample.positions))), 'actual skinned motion').toBeGreaterThan(.03);
      // Reference comparison uses positions rather than triangle ordering.
      // Avoid writing the same expanded triangle corner six times to disk.
      const uniquePoints = (positions: number[]) => {
        const seen = new Set<string>(), values: number[] = [];
        for (let i = 0; i < positions.length; i += 3) {
          const point = positions.slice(i, i + 3), key = point.join(',');
          if (!seen.has(key)) { seen.add(key); values.push(...point); }
        }
        return values;
      };
      results.push({id: 'advanced-' + name, root,
        samples: samples.slice(0, 9).map(sample => ({time: sample.time, positions: uniquePoints(sample.positions)}))});
      await writeFile(info.outputPath('positions.json'), JSON.stringify({viewer, results}));
      await page.evaluate(() => (window as any).usdHydra.setTime(25));
      await page.screenshot({path: info.outputPath(name + '.png')});
    });
    expect(errors).toEqual([]);
  });
}
