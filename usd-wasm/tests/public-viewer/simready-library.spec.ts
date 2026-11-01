import {expect,test} from '@playwright/test';
import {openSamples,selectExampleFolder,stageReady,openAppMenu} from './workbench-menus';

test('SimReady is a lazy, complete folder catalog with searchable IDs and NVIDIA theme previews',async({page},info)=>{
  const requests:string[]=[];page.context().on('request',request=>requests.push(request.url()));
  await page.goto('/?viewer=three&workspace=studio');await openSamples(page);
  expect(requests.some(url=>url.includes('/data/nvidia-simready.json'))).toBe(false);
  await selectExampleFolder(page,'simready');
  const manifest=await page.evaluate(async()=>await(await fetch('/data/nvidia-simready.json')).json());
  await expect(page.locator('.gallery-card')).toHaveCount(manifest.assets.length);
  await expect(page.locator('#simready-count')).toHaveText(String(manifest.assets.length));
  await expect(page.locator('#examples-source')).toHaveAttribute('href','https://huggingface.co/datasets/nvidia/simready-assets');
  expect(requests.filter(url=>/huggingface\.co.*\.usd(?:[acz])?(?:\?|$)/.test(url))).toEqual([]);
  await page.getByRole('searchbox',{name:'Search examples'}).fill('kitchenware_spoon_b01');
  await expect(page.locator('.gallery-card:visible')).toHaveCount(1);
  const image=page.locator('.gallery-card:visible img');
  await expect.poll(()=>image.evaluate((image:HTMLImageElement)=>image.complete && image.naturalWidth>0)).toBe(true);
  for(const theme of ['dark','light']){
    await openAppMenu(page,'view');await page.getByRole('combobox',{name:'Color theme'}).selectOption(theme);await page.keyboard.press('Escape');
    await expect(image).toHaveAttribute('src',theme==='light'?/_light\.png$/:/\.usd\.png$/);
    await expect.poll(()=>image.evaluate((image:HTMLImageElement)=>image.complete && image.naturalWidth>0)).toBe(true);
    await page.screenshot({path:info.outputPath(`simready-${theme}.png`)});
  }
  await page.getByRole('searchbox',{name:'Search examples'}).fill('');
  await page.locator('[data-sample-group="simready:Kitchenware"]').click();
  await expect(page.locator('#gallery-grid')).toHaveAttribute('data-example-group','simready:Kitchenware');
  expect(await page.locator('.gallery-card').count()).toBeGreaterThan(100);
  for(const width of [390,320]){
    await page.setViewportSize({width,height:700});
    await expect(page.locator('.usd-examples-browser')).toBeVisible();
    expect(await page.locator('.usd-examples-footer').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await page.screenshot({path:info.outputPath(`simready-compact-${width}.png`)});
  }
  await page.reload();await openSamples(page);
  await expect(page.locator('[data-sample-group="simready:Kitchenware"]')).toHaveClass(/active/);
});

for(const [viewer,asset] of [['three','kitchenware_spoon_b01'],['needle','kitchenware_spoon_b01'],['three','box_corrugated_brown_b20']])test(`${viewer}: SimReady ${asset} loads remote composition and geometry`,async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const requests:string[]=[];page.context().on('request',request=>requests.push(request.url()));
  await page.goto(`/?viewer=${viewer}&workspace=studio&assetCache=0`);await openSamples(page);await selectExampleFolder(page,'simready');
  await page.getByRole('searchbox',{name:'Search examples'}).fill(asset);
  await page.locator('.gallery-card:visible').click();await stageReady(page);
  await expect(page.locator('#examples-source')).toHaveAttribute('href',new RegExp(`/blob/[a-f0-9]{40}/${asset}/simready_usd/`));
  const meshes=await page.evaluate(()=>{
    let meshes=0;(window as any).usdHydra.scene.traverse((object:any)=>{if(object.isMesh && object.geometry?.attributes.position?.count)meshes++;});return meshes;
  });
  expect(meshes).toBeGreaterThan(0);
  expect(requests.some(url=>url.includes(`${asset}/simready_usd/payloads/`))).toBe(true);
  if(asset.startsWith('box_'))expect(requests.some(url=>url.includes(`${asset}/simready_usd/Textures/`))).toBe(true);
  await expect.poll(async()=>{
    const shot=await page.locator('#usd-viewport').screenshot();
    return page.evaluate(async data=>{
      const image=await createImageBitmap(await(await fetch('data:image/png;base64,'+data)).blob());
      const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
      const context=canvas.getContext('2d')!;context.drawImage(image,0,0,64,64);
      const pixels=context.getImageData(0,0,64,64).data;const colors=new Set();
      for(let i=0;i<pixels.length;i+=4)colors.add(`${pixels[i]>>4},${pixels[i+1]>>4},${pixels[i+2]>>4}`);
      return colors.size;
    },shot.toString('base64'));
  },{timeout:15000}).toBeGreaterThan(5);
  expect(errors).toEqual([]);await page.screenshot({path:info.outputPath(`simready-${asset}-${viewer}.png`)});
});
