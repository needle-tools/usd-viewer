import {test, expect} from './test';
import {stageReady} from './workbench-menus';

// The Needle host currently uses WebGLRenderer; Three exposes both node backends.
for (const viewer of ['three', 'needle']) for (const backend of viewer === 'three' ? ['webgpu', 'webgl'] : ['webgl']) {
  test(`${viewer} ${backend}: existing FastHDR CubeUV environments render`, async ({page}, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`/?viewer=${viewer}&backend=${backend}&render=basic&env=fasthdr-studio&file=/test-fixtures/asset-explorer/DamagedHelmet.glb.three.usdz`);
    await stageReady(page);
    await expect.poll(() => page.evaluate(viewer => {
      const w = window as any, scene = viewer === 'needle' ? w.needleEngineContext?.scene : w.scene;
      return scene?.environment?.mapping;
    }, viewer)).toBe(306);
    const state = await page.evaluate(async viewer => {
      const w = window as any, T = await import('three'), context = w.needleEngineContext;
      const scene = viewer === 'needle' ? context.scene : w.scene;
      const renderer = viewer === 'needle' ? context.renderer : w.renderer;
      let meshes = 0;
      w.usdHydra.scene.traverseVisible((object: any) => { if (object.isMesh) meshes++; });
      return {
        revision: T.REVISION,
        sharedScene: scene instanceof T.Scene,
        sharedMesh: w.usdHydra.scene instanceof T.Object3D,
        sharedRenderer: viewer === 'needle' ? renderer instanceof T.WebGLRenderer : true,
        mapping: scene.environment.mapping,
        width: scene.environment.image?.width,
        meshes,
        backend: renderer.isWebGPURenderer ? (renderer.backend.isWebGLBackend ? 'webgl' : 'webgpu') : 'webgl',
      };
    }, viewer);
    // Release validation must reject an old core embedded in a prebuilt Engine bundle.
    if (process.env.USD_EXPECT_THREE_REVISION) expect(state.revision).toBe(process.env.USD_EXPECT_THREE_REVISION);
    expect(state.sharedScene).toBe(true);
    expect(state.sharedMesh).toBe(true);
    expect(state.sharedRenderer).toBe(true);
    expect(state.mapping).toBe(306);
    expect(state.width).toBeGreaterThan(0);
    expect(state.meshes).toBeGreaterThan(0);
    expect(state.backend).toBe(backend);
    const canvas = page.locator(viewer === 'three' ? 'canvas.usd-viewer-three-canvas' : 'needle-engine canvas').first();
    const png = await canvas.screenshot({path: info.outputPath(`${viewer}-${backend}-fasthdr.png`)});
    const pixels = await page.evaluate(async data => {
      const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + data)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const values = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let min = 255, max = 0, colored = 0;
      for (let i = 0; i < values.length; i += 4) {
        min = Math.min(min, values[i], values[i + 1], values[i + 2]);
        max = Math.max(max, values[i], values[i + 1], values[i + 2]);
        if (Math.max(values[i], values[i + 1], values[i + 2]) - Math.min(values[i], values[i + 1], values[i + 2]) > 20) colored++;
      }
      return {min, max, colored};
    }, png.toString('base64'));
    expect(pixels.max - pixels.min).toBeGreaterThan(40);
    expect(pixels.colored).toBeGreaterThan(500);
    await info.attach('runtime', {body: JSON.stringify({...state, pixels}), contentType: 'application/json'});
    expect(errors).toEqual([]);
  });
}
