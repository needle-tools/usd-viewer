import {selectExampleFolder, openSamples, stageReady} from './workbench-menus';
import {expect, test} from '@playwright/test';

test('Draco overrides retain visible red and blue surfaces under authored lights', async ({page}, info) => {
  await page.goto('/?viewer=three&render=beauty&assetCache=0&file=/test-fixtures/draco/draco_mixed_overrides.usda');
  await stageReady(page);
  await page.evaluate(async () => {
    const w = window as any; await w.usdHydra.materialsReady();
    await w.usdViewportInteraction.focus({instant:true});
  });
  await page.waitForTimeout(300);
  const screenshot = await page.locator('#usd-viewport canvas').first().screenshot({path:info.outputPath('draco.png')});
  const colors = await page.evaluate(async png => {
    const image = await createImageBitmap(await (await fetch('data:image/png;base64,' + png)).blob());
    const canvas = new OffscreenCanvas(image.width,image.height), ctx = canvas.getContext('2d')!;
    ctx.drawImage(image,0,0); const p = ctx.getImageData(0,0,image.width,image.height).data;
    let red = 0, blue = 0;
    for(let i=0;i<p.length;i+=4) {
      if(p[i]>p[i+2]*1.3 && p[i]>80) red++;
      if(p[i+2]>p[i]*1.3 && p[i+2]>80) blue++;
    }
    return {red,blue};
  },screenshot.toString('base64'));
  expect(colors.red).toBeGreaterThan(300); expect(colors.blue).toBeGreaterThan(300);
});

test('Beauty and usdview previews switch in place and persist', async ({page}) => {
  await page.goto('/?viewer=three&assetCache=0'); await openSamples(page);
  await selectExampleFolder(page,'needle');
  await page.locator('[data-sample-group="needle:JavaScript%20API"]').click();
  const card=page.locator('.gallery-card[data-name="Animated Radius"]'), image=card.locator('img');
  const beauty=page.getByRole('button',{name:'Beauty',exact:true}), storm=page.getByRole('button',{name:'usdview',exact:true});
  await expect(beauty).toBeEnabled(); await beauty.click();
  await expect(image).toHaveAttribute('src',/thumbnails\/beauty\/api-animated-radius.webp$/);
  await expect.poll(()=>image.evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
  const original=await card.elementHandle();
  await storm.click(); await expect(image).toHaveAttribute('src',/thumbnails\/api-animated-radius.png$/);
  expect(await original!.evaluate(el=>el.isConnected)).toBe(true);
  await page.reload(); await openSamples(page);
  await expect(storm).toHaveAttribute('aria-pressed','true');
  await expect(image).toHaveAttribute('src',/thumbnails\/api-animated-radius.png$/);
  await beauty.click();
  await expect(image).toHaveAttribute('src',/thumbnails\/beauty\/api-animated-radius.webp$/);
});

test('a missing Beauty image falls back to its native preview', async ({page}) => {
  await page.route('**/thumbnails/beauty/api-animated-radius.webp',route=>route.fulfill({status:404}));
  await page.goto('/?viewer=three&assetCache=0'); await openSamples(page);
  await selectExampleFolder(page,'needle');
  await page.locator('[data-sample-group="needle:JavaScript%20API"]').click();
  const image=page.locator('.gallery-card[data-name="Animated Radius"] img');
  await expect(page.getByRole('button',{name:'Beauty',exact:true})).toBeEnabled();
  await expect(image).toHaveAttribute('src',/thumbnails\/api-animated-radius.png$/);
  await expect.poll(()=>image.evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
});

for(const file of ['coverage/core/value-clip.usda','coverage/core/reference-time-offset.usda','coverage/core/animated-points.usda','api/examples.js#animated-transform','api/examples.js#sun-cycle']) {
  test(`${file}: rendering returns to the same pose and playback wraps`, async ({page}) => {
    await page.goto('/?viewer=three&render=beauty&file='+encodeURIComponent('/test-fixtures/'+file));
    await stageReady(page);
    const samples=await page.evaluate(async()=>{
      const h=(window as any).usdHydra; h.setPlaying(false); await h.materialsReady();
      const start=h.driver.GetStageStartTimeCode(),end=h.driver.GetStageEndTimeCode();
      const poses=[];
      for(const t of [start,start+(end-start)*.25,end,start]) {
        await h.setTime(t); h.scene.updateMatrixWorld(true);
        const values:number[]=[];
        h.scene.traverse((o:any)=>{
          if(!o.userData.usdPath)return;
          values.push(...o.matrixWorld.elements);
          const p=o.geometry?.attributes.position;
          if(p)for(let i=0;i<p.count;i++)values.push(p.getX(i),p.getY(i),p.getZ(i));
          if(o.isLight) values.push(o.intensity,...o.color.toArray());
        });
        poses.push(values);
      }
      await h.setTime(end-.1); h.setPlaying(true);
      // Advance one known playback tick; background tabs can throttle RAF.
      h.update(.05); h.setPlaying(false);
      return {poses,start,end,wrapped:h.getTime()};
    });
    const distance=(a:number[],b:number[])=>a.reduce((m,v,i)=>Math.max(m,Math.abs(v-b[i])),0);
    const [start,middle,end,restored]=samples.poses;
    expect(end.length).toBe(start.length); expect(distance(start,end)).toBeLessThan(1e-4);
    expect(distance(start,restored)).toBeLessThan(1e-4);
    expect(distance(start,middle)).toBeGreaterThan(.02);
    expect(samples.wrapped).toBeGreaterThan(samples.start);
    expect(samples.wrapped).toBeLessThan(samples.start+2);
  });
}

test('camera aspect updates even when the drawing buffer is already sized', async ({page})=>{
  await page.goto('/?viewer=three&file=/test-fixtures/coverage/core/analytic-primitives.usda&render=beauty');
  await stageReady(page);
  const expected=await page.evaluate(()=>{
    const w=window as any,viewport=document.getElementById('usd-viewport')!;
    w.camera.aspect=.1;w.camera.updateProjectionMatrix();window.dispatchEvent(new Event('usd-viewport-resize'));
    return viewport.clientWidth/viewport.clientHeight;
  });
  await expect.poll(()=>page.evaluate(()=>(window as any).camera.aspect)).toBeCloseTo(expected,4);
});
