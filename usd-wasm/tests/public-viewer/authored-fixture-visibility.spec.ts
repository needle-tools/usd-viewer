import {test, expect, type Page} from './test';
import {stageReady} from './workbench-menus';

async function coloredPixels(page: Page, png: Buffer) {
  return page.evaluate(async base64 => {
    const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + base64)).blob());
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0, warm = 0, cool = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b] = pixels.slice(i, i + 3);
      if (Math.max(r, g, b) > 45 && Math.max(r, g, b) - Math.min(r, g, b) > 30) colored++;
      if (r > b + 40 && r > 45) warm++;
      if (b > r + 30 && b > g + 10) cool++;
    }
    return {colored, warm, cool};
  }, png.toString('base64'));
}

for (const id of ['cameras-and-lights', 'fixture-camera-light', 'generic-prims']) {
  test(`Beauty: ${id} is illuminated by its authored lights`, async ({page}, info) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?viewer=three&render=beauty&assetCache=0&file=' + encodeURIComponent('/test-fixtures/api/examples.js#' + id));
    await stageReady(page); await page.evaluate(async () => await (window as any).usdHydra.materialsReady());
    await page.mouse.move(0, 0); await page.waitForTimeout(600);
    const png = await page.locator('canvas.usd-viewer-three-canvas').screenshot({path: info.outputPath('authored-light.png')});
    expect((await coloredPixels(page, png)).colored).toBeGreaterThan(500);
    expect(errors).toEqual([]);
  });
}

for (const [viewer, file] of [
  ['three', 'custom_geomprops_usdshade'], ['needle', 'custom_geomprops_usdshade'],
  ['three', 'custom_vertex_geomprops'], ['three', 'referenced_geomprop_overrides'],
]) {
  test(`${viewer}: ${file} shows the authored warm and cool primvars in Beauty`, async ({page}, info) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/?viewer=${viewer}&render=beauty&assetCache=0&file=/test-fixtures/usd-concepts/${file}.usda`);
    await stageReady(page); await page.evaluate(async () => await (window as any).usdHydra.materialsReady());
    await page.mouse.move(0, 0); await page.waitForTimeout(600);
    const png = await page.locator('#usd-viewport').screenshot({path: info.outputPath('primvar-colors.png')});
    const pixels = await coloredPixels(page, png);
    expect(pixels.warm).toBeGreaterThan(200); expect(pixels.cool).toBeGreaterThan(200);
    expect(errors).toEqual([]);
  });
}

test('unmaterialed triangle remains unbound and visibly contrasts with its plinth', async ({page}, info) => {
  await page.goto('/?viewer=three&render=beauty&assetCache=0&file=' + encodeURIComponent('/test-fixtures/api/examples.js#fixture-unmaterialed-empty-subset'));
  await stageReady(page); await page.evaluate(async () => await (window as any).usdHydra.materialsReady());
  const contract = await page.evaluate(() => {
    const prim = (window as any).usdStage.GetPrimAtPath('/World/PlainTriangle');
    return {bound:prim.GetRelationship('material:binding').IsValid(), colored:prim.GetAttribute('primvars:displayColor').HasAuthoredValueOpinion()};
  });
  expect(contract).toEqual({bound:false,colored:false});
  await page.mouse.move(0,0); await page.waitForTimeout(500);
  const canvas = page.locator('canvas.usd-viewer-three-canvas'), visible = await canvas.screenshot({path:info.outputPath('triangle.png')});
  await page.evaluate(async () => { const {setPrimVisible}=await import('/usd/scene/index.js'); await setPrimVisible((window as any).usdHydra,'/World/PlainTriangle',false); });
  await page.waitForTimeout(500); const hidden = await canvas.screenshot();
  const contrasted = await page.evaluate(async ([a,b]) => {
    async function pixels(text:string) { const bitmap=await createImageBitmap(await(await fetch('data:image/png;base64,'+text)).blob());const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d')!;ctx.drawImage(bitmap,0,0);return ctx.getImageData(0,0,c.width,c.height).data; }
    const [left,right]=await Promise.all([a,b].map(pixels));let count=0;
    for(let i=0;i<left.length;i+=4)if(left[i]-right[i]>50&&left[i+1]-right[i+1]>50&&left[i+2]-right[i+2]>50)count++;
    return count;
  },[visible.toString('base64'),hidden.toString('base64')]);
  expect(contrasted).toBeGreaterThan(500);
});

test('grove separates fifteen shared instances from its editable hero tree', async ({page}, info) => {
  await page.goto('/?viewer=three&render=beauty&assetCache=0&file=' + encodeURIComponent('/test-fixtures/api/examples.js#instanced-grove'));
  await stageReady(page);
  const result=await page.evaluate(()=>{
    const stage=(window as any).usdStage, instances=[];
    for(const row of ['Summer','Autumn','Winter'])for(let i=0;i<5;i++)instances.push(stage.GetPrimAtPath('/World/Orchard/'+row+i).IsInstance());
    return {instances,hero:stage.GetPrimAtPath('/World/HeroTree').IsInstance(),birdhouse:stage.GetPrimAtPath('/World/HeroTree/Birdhouse').IsValid()};
  });
  expect(result.instances).toEqual(Array(15).fill(true));expect(result.hero).toBe(false);expect(result.birdhouse).toBe(true);
  await page.screenshot({path:info.outputPath('grove.png')});
});
