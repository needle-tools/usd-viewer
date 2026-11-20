import { expect, test } from './test';

for (const viewer of ['three', 'needle']) {
  test(`${viewer}: native glTF loading retains its fallback environment`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/?viewer=${viewer}&file=/test-fixtures/asset-explorer/DamagedHelmet.glb`);
    await page.waitForFunction(viewer => {
      const w = window as any;
      const scene = viewer === 'needle' ? w.needleEngineContext?.scene : w.scene;
      const root = viewer === 'needle' ? scene?.getObjectByName('Scene') : w.usdRoot;
      let meshes = 0;
      root?.traverse((object: any) => { if (object.isMesh) meshes++; });
      return scene?.environment?.isTexture && meshes > 0
        && !document.getElementById('loading-overlay')?.classList.contains('visible');
    }, viewer);
    expect(await page.evaluate(() => !!(window as any).usdHydra)).toBe(false);
    expect(errors).toEqual([]);
  });

  test(`${viewer}: authored rectangular lights illuminate the featured MaterialX graph`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (/Unsupported light type: RectAreaLight|Shader Error/.test(message.text())) errors.push(message.text());
    });
    await page.goto(`/?viewer=${viewer}&file=/test-fixtures/coverage/shading/mx_nested_nodegraph.usda`);
    await page.waitForFunction(() => !!(window as any).usdHydra);
    const setup = await page.evaluate(async () => {
      const w = window as any;
      await w.usdHydra.ready(); await w.usdHydra.materialsReady();
      w.usdHydra.setPlaying(false);
      await w.usdHydra.setTime(w.usdHydra.getTime());
      const scene = w.needleEngineContext?.scene || w.scene;
      scene.environment = null;
      let materialX = false, rectangles = 0;
      w.usdHydra.scene.traverse((object: any) => {
        if (object.isMesh) {
          object.visible = object.userData.usdPath === '/World/Display/Artifact';
          if (object.visible) materialX = object.material.constructor.name === 'MaterialXMaterial' || !!(object.material.isNodeMaterial && object.material.userData.usdMaterialX);
        }
        if (object.isRectAreaLight && object.intensity > 0) rectangles++;
      });
      return { materialX, rectangles };
    });
    expect(setup).toEqual({ materialX: true, rectangles: 2 });
    await page.waitForTimeout(300);
    const canvas = page.locator(viewer === 'three' ? 'canvas.usd-viewer-three-canvas' : 'needle-engine canvas').first();
    const lit = await canvas.screenshot({ path: `.cache/coverage-validation/materialx-area-${viewer}.png` });
    await page.evaluate(() => {
      (window as any).usdHydra.scene.traverse((object: any) => { if (object.isLight) object.intensity = 0; });
    });
    await page.waitForTimeout(300);
    const dark = await canvas.screenshot();
    const changed = await page.evaluate(async ([a, b]) => {
      async function pixels(base64: string) {
        const image = await createImageBitmap(await (await fetch('data:image/png;base64,' + base64)).blob());
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      }
      const lit = await pixels(a), dark = await pixels(b); let changed = 0;
      for (let i = 0; i < lit.length; i += 4) {
        if (lit[i] + lit[i + 1] + lit[i + 2] > dark[i] + dark[i + 1] + dark[i + 2] + 30) changed++;
      }
      return changed;
    }, [lit.toString('base64'), dark.toString('base64')]);
    expect(changed).toBeGreaterThan(1000);
    expect(errors).toEqual([]);
  });

  test(`${viewer}: an uncatalogued stage with its own light does not load the viewer HDR`, async ({ page }) => {
    const environments: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/environments/neutral.hdr')) environments.push(request.url());
    });
    await page.route(url => url.pathname === '/authored-light.usda', route => route.fulfill({ contentType: 'text/plain', body: `#usda 1.0
(metersPerUnit = 1)
def Xform "World" {
    def Sphere "Subject" {
        double radius = 1
    }
    def DistantLight "Sun" {
        float inputs:intensity = 50
        color3f inputs:color = (1, 0.15, 0.05)
        float xformOp:rotateY = 30
        uniform token[] xformOpOrder = ["xformOp:rotateY"]
    }
}` }));
    await page.goto(`/?viewer=${viewer}&file=/authored-light.usda`);
    await page.waitForFunction(() => !!(window as any).usdHydra);
    await page.evaluate(async () => {
      await (window as any).usdHydra.ready(); await (window as any).usdHydra.materialsReady();
    });
    await expect.poll(() => page.evaluate(() => {
      const w = window as any, scene = w.needleEngineContext?.scene || w.scene;
      return scene.environment === null;
    })).toBe(true);
    expect(environments).toEqual([]);
    const lights = await page.evaluate(() => {
      const w = window as any, root = w.usdHydra.scene, scene = w.needleEngineContext?.scene || w.scene;
      const authored: any[] = [], defaults: any[] = [];
      scene.traverse((o: any) => {
        if (!o.isLight || !o.visible || !o.intensity) return;
        if (o.userData.usdPath) authored.push(o.userData.usdPath); else defaults.push(o.type);
      });
      return { authored, defaults };
    });
    expect(lights.authored).toContain('/World/Sun'); expect(lights.defaults).toEqual([]);
  });

  test(`${viewer}: splat rendering uses Timer without deprecated Clock construction`, async ({ page }) => {
    const warnings: string[] = [];
    page.on('console', message => { if (message.type() === 'warning' && /THREE.Clock.*deprecated/.test(message.text())) warnings.push(message.text()); });
    await page.goto(`/?viewer=${viewer}&file=/test-fixtures/coverage/advanced/splat-harmonics.usda`);
    await page.waitForFunction(() => !!(window as any).usdHydra);
    await page.evaluate(async () => { await (window as any).usdHydra.ready(); await (window as any).usdHydra.materialsReady(); });
    expect(warnings).toEqual([]);
    await expect.poll(() => page.evaluate(() => {
      const w = window as any; let renderer: any; let gaussian: any;
      (w.needleEngineContext?.scene || w.scene).traverse((o: any) => { if (o.userData.usdParticleFieldRenderer) renderer = o; if (o.isGaussianSplat) gaussian = o; });
      return w.renderer?.isWebGPURenderer ? gaussian?._sortInitialized === true : renderer?.timer?.getElapsed() > 0;
    })).toBe(true);
  });
}
