import {expect, test} from '@playwright/test';
import {openAppMenu, openSamples, selectExampleFolder, stageReady} from './workbench-menus';

const initial='/test-fixtures/coverage/lighting-mdl/studio-variants.usda';
test('folder changes retain previews until their replacement is ready and prevent opening stale results',async({page})=>{
  await page.goto('/?viewer=three');await openSamples(page);await selectExampleFolder(page,'needle');
  const count=await page.locator('.gallery-card').count();
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  let blocked=false;
  await page.context().route('**/data/usd-samples.json',async route=>{blocked=true;await gate;await route.continue();});
  try {
    await page.locator('[data-sample-group="usd-assets"]').click();
    await expect.poll(()=>blocked,{timeout:3000}).toBe(true);
    await expect(page.locator('#gallery-grid')).toHaveAttribute('aria-busy','true');
    await expect(page.locator('.gallery-card')).toHaveCount(count);
    await page.locator('.gallery-card').first().dispatchEvent('click',{button:0});
    expect(new URL(page.url()).searchParams.get('file')).toBeNull();
  } finally {release();}
  await expect(page.locator('#gallery-grid')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('.gallery-card')).toHaveCount(14);
});

for (const viewer of ['three','needle']) test(`${viewer}: replacing an example retains the last frame without a drop-prompt flash`, async ({page}, info) => {
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`/?viewer=${viewer}&file=${initial}`); await stageReady(page);
  await openSamples(page); await selectExampleFolder(page,'needle');
  await page.locator('[data-sample-group="needle:Lights"]').click();
  const card=page.locator('.gallery-card[data-name="Shaped spotlight"]');
  const file=new URL((await card.getAttribute('href'))!,page.url()).searchParams.get('file')!;
  let release!:()=>void; const gate=new Promise<void>(resolve=>{release=resolve;});
  let blocked=false; const requests:string[]=[];
  page.on('request',request=>requests.push(request.url()));
  await page.context().route(url=>url.pathname===file,async route=>{blocked=true;await gate;await route.continue();});
  await page.evaluate(()=>{
    const w=window as any; w.__oldDriver=w.usdHydra.driver; w.__loadFrames=[]; w.__recordLoad=true;
    function record(){if(!w.__recordLoad)return;w.__loadFrames.push({loaded:document.querySelector('#container')!.classList.contains('have-custom-file'),drop:getComputedStyle(document.querySelector('#dropzone')!).display,cover:document.querySelectorAll('.usd-load-frame').length});requestAnimationFrame(record);}record();
  });
  try {
    await card.click(); await expect(page.locator('.usd-load-frame')).toBeVisible();
    await expect(page.locator('#loading-overlay')).toBeVisible();
    await expect.poll(()=>blocked,{timeout:3000,message:JSON.stringify({file,requests,errors})}).toBe(true);
    await page.waitForTimeout(120);
    expect(errors).toEqual([]);
    const colors=await page.locator('.usd-load-frame').evaluate((el:HTMLCanvasElement)=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
      const context=canvas.getContext('2d')!;context.drawImage(el,0,0,32,32);
      const data=context.getImageData(0,0,32,32).data;const colors=new Set();
      for(let i=0;i<data.length;i+=4)colors.add(`${data[i]>>4},${data[i+1]>>4},${data[i+2]>>4}`);
      return colors.size;
    });
    expect(colors).toBeGreaterThan(8);
    await page.screenshot({path:info.outputPath(`${viewer}-replacing.png`)});
  } finally { release(); }
  await page.waitForFunction(()=>(window as any).usdHydra?.driver && (window as any).usdHydra.driver!==(window as any).__oldDriver);
  await stageReady(page); await expect(page.locator('.usd-load-frame')).toHaveCount(0);
  const frames=await page.evaluate(()=>{const w=window as any;w.__recordLoad=false;return w.__loadFrames;});
  expect(frames.length).toBeGreaterThan(3);
  expect(frames.every((frame:any)=>frame.loaded && frame.drop==='none' && frame.cover<=1)).toBe(true);
  expect(errors).toEqual([]);
});

for (const theme of ['light','dark']) test(`${theme}: tooltip delay, menu placement and modal positioning`, async ({page}, info) => {
  await page.addInitScript(theme=>localStorage.setItem('needle-usd-theme',JSON.stringify(theme)),theme);
  await page.goto('/?viewer=three'); await page.waitForFunction(()=>(window as any).__usdViewerUiReady);
  await openAppMenu(page,'file');
  const share=page.locator('#usd-download');await share.hover();
  const tip=page.getByRole('tooltip');
  await page.waitForTimeout(180);await expect(tip).toBeHidden();
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText('Open a file first');
  const [anchor,box]=await Promise.all([share.boundingBox(),tip.boundingBox()]);
  expect(box!.x).toBeGreaterThanOrEqual(8);expect(box!.x+box!.width).toBeLessThanOrEqual(1280-8);
  expect(box!.width).toBeLessThanOrEqual(240);
  expect(await tip.evaluate(el=>getComputedStyle(el).fontSize)).toBe('11px');
  await page.screenshot({path:info.outputPath(`${theme}-menu-tooltip.png`)});
  await page.keyboard.press('Escape');await expect(tip).toBeHidden();
  await page.getByRole('combobox',{name:'Workspace mode'}).selectOption('viewer');
  await page.setViewportSize({width:390,height:700});await openSamples(page);
  await selectExampleFolder(page,'needle');
  const details=page.getByRole('button',{name:'Details',exact:true});await details.hover();
  await expect(tip).toBeVisible();
  const [button,modalTip]=await Promise.all([details.boundingBox(),tip.boundingBox()]);
  expect(modalTip!.y+modalTip!.height).toBeLessThanOrEqual(button!.y-7);
  expect(modalTip!.x).toBeGreaterThanOrEqual(8);expect(modalTip!.x+modalTip!.width).toBeLessThanOrEqual(382);
  expect(await tip.evaluate(el=>el.matches(':popover-open'))).toBe(true);
  await page.screenshot({path:info.outputPath(`${theme}-modal-tooltip.png`)});
  await details.click();await expect(tip).toBeHidden();
});
