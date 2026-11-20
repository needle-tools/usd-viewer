import {expect, test, type Page} from './test';
import {openSettings, stageReady} from './workbench-menus';

const source = `#usda 1.0
(upAxis = "Y"
 metersPerUnit = 1)
def Xform "World" {
 def Material "Glow" {
  token outputs:surface.connect = </World/Glow/Surface.outputs:surface>
  def Shader "Surface" {
   uniform token info:id = "UsdPreviewSurface"
   color3f inputs:diffuseColor = (0,0,0)
   color3f inputs:emissiveColor = (8,2,0.2)
   token outputs:surface
  }
 }
 def Cube "Emitter" (prepend apiSchemas = ["MaterialBindingAPI"]) {
  double size = 1
  rel material:binding = </World/Glow>
 }
}`;

async function setup(page: Page, mode: string, backend = '') {
  await page.route(url => url.pathname === '/emission.usda', route => route.fulfill({contentType: 'text/plain', body: source}));
  await page.goto(`/?viewer=three&file=/emission.usda&render=${mode}${backend}`);
  await stageReady(page);
  await page.evaluate(async () => {
    const w = window as any;
    await w.usdHydra.materialsReady(); w.usdHydra.setPlaying(false);
    w.scene.environment = null; w.scene.background = null; w.renderer.setClearColor(0x000000, 1);
    w._controls.enableDamping = false; w._controls.target.set(0,0,0); w.camera.position.set(0,0,6); w._controls.update();
  });
}

async function haloPixels(page: Page, png: Buffer) {
  return page.evaluate(async encoded => {
    const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + encoded)).blob());
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0,0,canvas.width,canvas.height).data;
    const w = window as any;
    const extent = 0.5 / (6 - 0.5) / Math.tan(w.camera.fov * Math.PI / 360) * canvas.height / 2;
    let count = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (Math.abs(x - canvas.width / 2) < extent + 5 && Math.abs(y - canvas.height / 2) < extent + 5) continue;
      const i = (y * canvas.width + x) * 4;
      if (pixels[i] + pixels[i+1] + pixels[i+2] > 50) count++;
    }
    return count;
  }, png.toString('base64'));
}

for (const mode of ['basic', 'beauty']) for (const backend of ['', '&backend=webgl']) {
  test(`${mode} HDR bloom, ${backend ? 'WebGL fallback' : 'WebGPU'}: halo, threshold and resize`, async ({page}, info) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {if (m.type() === 'error' && !m.text().includes('net::')) errors.push(m.text());});
    await setup(page, mode, backend);
    expect(await page.evaluate(() => {
      let color: number[] | undefined;
      (window as any).usdRoot.traverse((o: any) => {if(o.userData.usdPath === '/World/Emitter') color = o.material.emissive.toArray();});
      return color;
    })).toEqual([8,2,expect.closeTo(0.2)]);
    const canvas = page.locator('canvas.usd-viewer-three-canvas');
    await page.waitForTimeout(600);
    const off = await haloPixels(page, await canvas.screenshot());
    await openSettings(page);
    await page.getByRole('combobox', {name:'Bloom', exact:true}).selectOption('on');
    const strength = page.getByRole('spinbutton', {name:'Bloom strength', exact:true});
    await strength.fill('1'); await strength.press('Tab');
    await page.locator('[data-usd-menu=view] > summary').click();
    await page.waitForTimeout(800);
    const on = await haloPixels(page, await canvas.screenshot({path:info.outputPath('bloom.png')}));
    expect(on - off).toBeGreaterThan(500);
    await openSettings(page);
    const threshold = page.getByRole('spinbutton', {name:'Bloom threshold', exact:true});
    await threshold.fill('100'); await threshold.press('Tab');
    await page.locator('[data-usd-menu=view] > summary').click(); await page.waitForTimeout(400);
    expect(await haloPixels(page, await canvas.screenshot())).toBeLessThan(off + 50);
    await page.setViewportSize({width:960,height:640}); await page.waitForTimeout(400);
    expect(errors).toEqual([]);
    await page.goto('/?viewer=three&file=/emission.usda'); await stageReady(page); await openSettings(page);
    await expect(page.getByRole('combobox', {name:'Bloom',exact:true})).toHaveValue('on');
    await expect(page.getByRole('spinbutton', {name:'Bloom threshold',exact:true})).toHaveValue('100');
  });
}

test('Beauty occlusion does not darken a purely emissive surface', async ({page}) => {
  await setup(page, 'basic');
  await page.evaluate(async () => {
    const w = window as any, T = await import('three');
    w.usdRoot.traverse((o: any) => {if(o.userData.usdPath === '/World/Emitter') o.material.emissive.setRGB(0.4,0.1,0.02);});
    const material = new w.usdWebGpuSupport.SurfaceMaterial({color:0,roughness:1});
    for (const [x,y,sx,sy] of [[-.75,0,.4,2],[.75,0,.4,2],[0,-.75,2,.4],[0,.75,2,.4]]) {
      const mesh = new T.Mesh(new T.BoxGeometry(sx,sy,1.3),material); mesh.position.set(x,y,.3); w.scene.add(mesh);
    }
  });
  const canvas = page.locator('canvas.usd-viewer-three-canvas');
  async function sample() {
    await page.waitForTimeout(600);
    const png = await canvas.screenshot();
    return page.evaluate(async encoded => {
      const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,'+encoded)).blob());
      const canvas = document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
      const ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0);
      return Array.from(ctx.getImageData(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1).data).slice(0,3);
    },png.toString('base64'));
  }
  const before = await sample();
  await page.evaluate(async () => {await (window as any).usdRenderModes.setMode('beauty');});
  const after = await sample();
  expect(before[0]).toBeGreaterThan(80);
  for (let i=0;i<3;i++) expect(Math.abs(after[i]-before[i]), JSON.stringify({before,after})).toBeLessThan(4);
});

test('Beauty leaves the host camera aspect and authored view offset intact', async ({page}) => {
  await setup(page, 'beauty');
  const state = await page.evaluate(() => {
    const w=window as any, camera=w.camera;
    camera.setViewOffset(1700,1000,20,30,1500,900);
    const view=camera.view, before={aspect:camera.aspect,view:{...view}};
    w.usdRenderModes.render(camera);
    return {before,after:{aspect:camera.aspect,view:{...camera.view}},sameView:camera.view===view};
  });
  expect(state.after).toEqual(state.before); expect(state.sameView).toBe(true);
});
