import {test,expect} from '@playwright/test';

test('concurrent download rows expose totals, percentages and ETA in both themes',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?workspace=studio&viewer=three&render=basic');await page.waitForFunction(()=>!!(window as any).usdWorkbench?.viewport);
  await expect(page.locator('.usd-asset-progress:visible')).toHaveCount(0);
  await page.evaluate(async()=>{
    const {createDownloadProgress}=await import('/viewer-download-progress.js');
    const w=window as any;w.downloadTime=0;
    w.testDownloads=createDownloadProgress({getHost:()=>w.usdWorkbench.viewport,now:()=>w.downloadTime});
    for(const url of ['model.usdc','brushed-steel-normal.png','studio.exr'])w.testDownloads.update({url:'https://assets.test/'+url,state:'start'});
    w.downloadTime=2000;
    w.testDownloads.update({url:'https://assets.test/model.usdc',state:'progress',loaded:8000000,total:32000000});
    w.testDownloads.update({url:'https://assets.test/brushed-steel-normal.png',state:'progress',loaded:2000000,total:4000000});
    w.testDownloads.update({url:'https://assets.test/studio.exr',state:'progress',loaded:2000000,total:12000000});
  });
  const panel=page.locator('.usd-asset-progress:visible'),files=panel.locator('.usd-download-file');
  await expect(panel).toContainText('12.0 MB / 48.0 MB · 25%');
  await expect(panel).toContainText('6.0 MB/s · ~6 s left');
  await expect(files).toHaveCount(3);await expect(files.first()).toContainText('8.0 MB / 32.0 MB · 25%');
  for(const theme of ['light','dark']){
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    await panel.screenshot({path:info.outputPath(`downloads-${theme}.png`)});
    expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  }
  const toggle=panel.getByRole('button',{name:'Downloading 3 files'});await toggle.click();
  await expect(panel.locator('.usd-download-files')).toBeHidden();await toggle.click();await expect(files.first()).toBeVisible();
  await page.evaluate(()=>(window as any).testDownloads.update({url:'https://assets.test/extra-texture.png',state:'progress',loaded:500000,total:0}));
  await expect(panel).toContainText('1 size unknown');await expect(panel.locator(':scope > progress')).not.toHaveAttribute('value');
  await expect(files.first().getByRole('progressbar')).toHaveAttribute('value','0.25');
  await page.setViewportSize({width:390,height:700});
  await expect.poll(()=>panel.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})).toBe(true);
  await panel.screenshot({path:info.outputPath('downloads-narrow-unknown.png')});
  await page.evaluate(()=>(window as any).testDownloads.reset());await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});
