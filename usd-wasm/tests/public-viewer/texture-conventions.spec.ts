import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {test, expect} from './test';

// Texture orientation, UV transforms and color spaces, checked against values
// derived from the USD and MaterialX specifications (see
// scripts/generate-texture-convention-fixtures.py). Each scene is an unlit quad,
// so with tone mapping off every sample must show its expected display value.
type Sample = {uv: [number, number]; chart?: number; srgb?: number[]; label?: string};
type Entry = {id: string; label: string; root: string; expected: {samples: Sample[]}};

const manifest: Entry[] = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/coverage/texture-conventions/manifest.json', import.meta.url)), 'utf8'));
const CHART = [[230, 25, 75], [60, 180, 75], [255, 225, 25], [0, 130, 200], [245, 130, 48], [145, 30, 180], [70, 240, 240], [240, 50, 230],
  [210, 245, 60], [250, 190, 212], [0, 128, 128], [220, 190, 255], [170, 110, 40], [255, 250, 200], [128, 0, 0], [0, 0, 128]];
const NAMES = ['red', 'green', 'yellow', 'blue', 'orange', 'purple', 'cyan', 'magenta', 'lime', 'pink', 'teal', 'lavender', 'brown', 'beige', 'maroon', 'navy'];
// Exact values through an 8-bit sRGB pipeline; JPEG and filtering stay well inside this.
const VALUE_TOLERANCE = 6;

const viewers = [
  {name: 'three WebGPU', query: 'viewer=three&render=basic'},
  {name: 'three WebGL', query: 'viewer=three&render=basic&backend=webgl'},
  {name: 'needle', query: 'viewer=needle'},
];

const distance = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const nearestChart = (rgb: number[]) => CHART.reduce((best, color, i) => distance(rgb, color) < distance(rgb, CHART[best]) ? i : best, 0);

for (const viewer of viewers) for (const entry of manifest) {
  test(`${viewer.name}: ${entry.label}`, async ({app}) => {
    const {page, errors, load} = await app(viewer.query);
    await load('/' + entry.root.replace(/^coverage\//, 'test-fixtures/coverage/'));
    // Show unlit values directly, frame the quad, and sample once the camera is still.
    const positions: [number, number][] = await page.evaluate(async uvs => {
      const w = window as any, context = (document.querySelector('needle-engine') as any)?.context;
      const renderer = context?.renderer || w.renderer;
      renderer.toneMapping = 0;
      // Materials (MaterialX in particular) can still be compiling when loading finishes.
      await w.usdHydra.materialsReady?.();
      let quad: any = null;
      w.usdHydra.scene.traverse((object: any) => { if (object.isMesh && object.name === 'Quad') quad = object; });
      if (!quad) throw new Error('The quad mesh is missing');
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      if (context) {
        // Needle Engine frames content itself and can miss content that arrives late.
        context.scene.traverse((object: any) => { for (const c of object.userData?.components || []) if (typeof c.fitCamera === 'function') c.fitCamera({objects: [quad], immediate: true}); });
      }
      const camera = context?.mainCamera || w.camera;
      let previous = '', still = 0;
      for (let i = 0; i < 240 && still < 8; i++) {
        await frame(); camera.updateMatrixWorld();
        const current = camera.matrixWorld.elements.map((x: number) => x.toFixed(5)).join();
        still = current === previous ? still + 1 : 0; previous = current;
      }
      const canvas = (renderer.domElement as HTMLCanvasElement).getBoundingClientRect();
      quad.updateWorldMatrix(true, false);
      const points = uvs.map(([u, v]: [number, number]) => {
        const point = quad.localToWorld(new quad.position.constructor(u * 2 - 1, v * 2 - 1, 0)).project(camera);
        return [canvas.left + (point.x + 1) / 2 * canvas.width, canvas.top + (1 - point.y) / 2 * canvas.height] as [number, number];
      });
      const outside = points.filter(([x, y]: number[]) => x < canvas.left + 2 || x > canvas.right - 2 || y < canvas.top + 2 || y > canvas.bottom - 2);
      if (outside.length) throw new Error(`The quad is not fully in view: ${outside.length} of ${points.length} samples fall outside the canvas`);
      return points;
    }, entry.expected.samples.map(sample => sample.uv));
    const screenshot = (await page.screenshot()).toString('base64');
    const pixels: number[][] = await page.evaluate(async ({png, positions}) => {
      const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + png)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      const scale = bitmap.width / innerWidth;
      return positions.map(([x, y]) => [...context.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data].slice(0, 3));
    }, {png: screenshot, positions});

    const failures: string[] = [];
    entry.expected.samples.forEach((sample, i) => {
      const got = pixels[i], at = `uv ${sample.uv.map(v => v.toFixed(3)).join(',')}`;
      if (sample.chart !== undefined) {
        const seen = nearestChart(got);
        if (seen !== sample.chart) failures.push(`${at}: expected ${NAMES[sample.chart]}, shows ${NAMES[seen]} (${got})`);
      } else if (distance(got, sample.srgb!) > VALUE_TOLERANCE) {
        failures.push(`${at}: expected ${sample.srgb} (${sample.label ?? 'value'}), shows ${got}`);
      }
    });
    expect(failures, failures.slice(0, 12).join('\n')).toEqual([]);
    expect(errors).toEqual([]);
  });
}

// Needle Engine fits the camera when a file finishes loading, while meshes whose
// MaterialX materials are still compiling are hidden. The viewer must fit again once
// they appear. The first MaterialX scene after a UsdPreviewSurface scene shows this.
test('needle frames MaterialX content that appears after loading', async ({app}) => {
  const {page, errors, load} = await app('viewer=needle');
  await load('/test-fixtures/coverage/texture-conventions/orient-preview-identity.usda');
  await load('/test-fixtures/coverage/texture-conventions/orient-mx-image-default.usda');
  await expect.poll(() => page.evaluate(async () => {
    const w = window as any, context = (document.querySelector('needle-engine') as any)?.context;
    await w.usdHydra.materialsReady?.();
    let quad: any = null;
    w.usdHydra.scene.traverse((object: any) => { if (object.isMesh && object.name === 'Quad') quad = object; });
    if (!quad?.visible) return 'hidden';
    const camera = context.mainCamera;
    camera.updateMatrixWorld();
    quad.updateWorldMatrix(true, false);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => quad.localToWorld(new quad.position.constructor(x, y, 0)).project(camera));
    return corners.every((p: any) => Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1) ? 'in view' : 'outside';
  }), {timeout: 15_000}).toBe('in view');
  expect(errors).toEqual([]);
});
