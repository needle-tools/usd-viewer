import {test, expect} from '@playwright/test';
import {stageReady} from './workbench-menus';
import {writeFile} from 'node:fs/promises';

const file = '/test-fixtures/coverage/advanced/skel-weighted.usda';
const path = '/World/Rig/Surface';

for (const [viewer, backend] of [['three', ''], ['needle', ''], ['three', 'webgl']]) {
  test(`${viewer} ${backend}: outline follows deformed buffers without a pointer or camera change`, async ({page}, info) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/?viewer=${viewer}&backend=${backend}&render=beauty&file=${encodeURIComponent(file)}`);
    await stageReady(page);
    await page.evaluate(async path => {
      const w = window as any; w.usdHydra.setPlaying(false); await w.usdHydra.setTime(1);
      w.usdWorkbench.viewport.style.setProperty('--usd-selection-color', '#ff00ff');
      w.usdViewportInteraction.select(path);
    }, path);
    await page.mouse.move(5, 5);
    const overlay = page.locator('.usd-selection-overlay');
    await expect(overlay).toBeVisible(); await page.waitForTimeout(300);
    const first = await overlay.screenshot();
    await page.evaluate(() => (window as any).usdHydra.setTime(25));
    await page.waitForTimeout(200);
    const second = await overlay.screenshot();
    const difference = await page.evaluate(async ([a, b]) => {
      async function mask(encoded: string) {
        const image = await createImageBitmap(await (await fetch('data:image/png;base64,' + encoded)).blob());
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
        const {data} = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return Array.from({length: data.length / 4}, (_, i) => data[i*4] > 180 && data[i*4+1] < 100 && data[i*4+2] > 180);
      }
      const left = await mask(a), right = await mask(b);
      return {first: left.filter(Boolean).length, second: right.filter(Boolean).length,
        changed: left.reduce((count, value, i) => count + Number(value !== right[i]), 0)};
    }, [first.toString('base64'), second.toString('base64')]);
    await info.attach('outline-movement', {body: JSON.stringify(difference), contentType: 'application/json'});
    await writeFile(info.outputPath('outline-movement.json'), JSON.stringify(difference));
    expect(difference.first).toBeGreaterThan(50); expect(difference.second).toBeGreaterThan(50);
    expect(difference.changed).toBeGreaterThan(100);
    await page.screenshot({path: info.outputPath('animated-outline.png')});
    expect(errors).toEqual([]);
  });
}

test('animated hover coalesces pointer bursts and excludes hidden geometry', async ({page}, info) => {
  await page.goto(`/?viewer=three&render=beauty&file=${encodeURIComponent(file)}`); await stageReady(page);
  const metrics = await page.evaluate(async path => {
    const w = window as any, T = await import('three'), h = w.usdHydra;
    h.setPlaying(false); await h.setTime(1);
    const viewport = w.usdWorkbench.viewport, camera = w.usdRenderCamera || w.camera;
    const scene = w.scene; scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    let mesh: any; scene.traverse((o: any) => {if (o.isMesh && o.visible && o.userData.usdPath === path) mesh = o;});
    const box = new T.Box3().setFromObject(mesh), center = box.getCenter(new T.Vector3()), ray = new T.Raycaster();
    let point: any;
    for (let y = 0; y < 5 && !point; y++) for (let x = 0; x < 5 && !point; x++) {
      const p = new T.Vector3(center.x + (x-2)*.1, center.y + (y-2)*.1, center.z).project(camera);
      ray.setFromCamera(new T.Vector2(p.x, p.y), camera);
      if (ray.intersectObject(scene, true).find((hit: any) => hit.object.visible)?.object.userData.usdPath === path) point = p;
    }
    if (!point) throw new Error('No visible kelp hit');
    const rect = viewport.getBoundingClientRect(), x = rect.x + (point.x+1)*rect.width/2, y = rect.y + (1-point.y)*rect.height/2;
    let calls = 0, active = 0, maxActive = 0, hiddenRays = 0;
    const original = h.resolvePick.bind(h);
    h.resolvePick = async (...args: any[]) => {
      calls++; active++; maxActive = Math.max(maxActive, active);
      try {await new Promise(resolve => setTimeout(resolve, 40)); return await original(...args);}
      finally {active--;}
    };
    const hidden = new T.Mesh(mesh.geometry, mesh.material); hidden.visible = false;
    hidden.userData.usdPath = '/Hidden'; hidden.raycast = () => {hiddenRays++;}; scene.add(hidden);
    h.setPlaying(true);
    const begin = performance.now();
    for (let i = 0; i < 120; i++) viewport.dispatchEvent(new PointerEvent('pointermove', {clientX:x, clientY:y, bubbles:true}));
    const burstMs = performance.now()-begin;
    await new Promise(resolve => setTimeout(resolve, 350));
    scene.remove(hidden);
    return {burstMs, calls, maxActive, hiddenRays, playing: h.isPlaying(), hovered: w.usdViewportInteraction.hoveredPath};
  }, path);
  await info.attach('hover-cost', {body: JSON.stringify(metrics), contentType: 'application/json'});
  await writeFile(info.outputPath('hover-cost.json'), JSON.stringify(metrics));
  expect(metrics.maxActive).toBeLessThanOrEqual(1);
  expect(metrics.calls).toBeGreaterThan(1); // Animation rechecks a stationary cursor.
  expect(metrics.calls).toBeLessThan(20);
  expect(metrics.hiddenRays).toBe(0);
  expect(metrics.burstMs).toBeLessThan(75);
  expect(metrics.playing).toBe(true);
});
