import {clearStage,openSettings,stageReady} from './workbench-menus';
import {expect,test,type Page} from './test';
import {openAppMenu} from './workbench-menus';

const asset='/test-fixtures/coverage/lighting-mdl/studio-variants.usda';
async function loaded(page:Page) {await stageReady(page);await page.evaluate(()=>(window as any).usdHydra.setPlaying(false));}
async function switchViewer(page:Page,viewer:'three'|'needle') {
  await openAppMenu(page,'view');
  await Promise.all([page.waitForURL(url=>url.searchParams.get('viewer')===viewer),page.locator(`[data-viewer-mode="${viewer==='needle'?'needle-loader':'three'}"]`).click()]);
}
async function capturePixel(page:Page,viewer:string) {
  await page.keyboard.press('Escape');
  const png=await page.locator(viewer==='needle'?'needle-engine canvas':'canvas.usd-viewer-three-canvas').first().screenshot();
  return page.evaluate(async data=>{const bitmap=await createImageBitmap(await(await fetch('data:image/png;base64,'+data)).blob());const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d')!;ctx.drawImage(bitmap,0,0);return [...ctx.getImageData(2,2,1,1).data];},png.toString('base64'));
}

test('cold startup never paints the old standalone UI while the workbench module loads',async({page},info)=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/viewer-workbench.js',async route=>{const response=await route.fetch();await gate;await route.fulfill({response});});
  await page.goto('/?viewer=three&assetCache=0',{waitUntil:'commit'});
  await page.locator('#top-center').waitFor({state:'attached'});
  const before=await page.evaluate(()=>({boot:document.documentElement.dataset.workbench,legacy:[...document.querySelectorAll('body > #top-center,body > .footer,body > #dropzone')].map(el=>({display:getComputedStyle(el).display,visible:el.getClientRects().length>0}))}));
  expect(before.boot).toBe('loading');expect(before.legacy.length).toBe(3);for(const item of before.legacy){expect(item.visible).toBe(false);expect(item.display).toBe('none');}
  await page.screenshot({path:info.outputPath('cold-before-shell.png')});release();
  await expect(page.locator('html')).toHaveAttribute('data-workbench','ready');await expect(page.locator('[data-usd-menu=file]')).toBeVisible();await expect(page.locator('body > #top-center')).toHaveCount(0);
});

for(const theme of ['light','dark'])test(`empty viewport retains its ${theme} theme through three/Needle switches and clear`,async({page},info)=>{
  await page.addInitScript(theme=>localStorage.setItem('needle-usd-theme',JSON.stringify(theme)),theme);
  await page.goto('/?viewer=three&assetCache=0');await page.waitForFunction(()=>!!(window as any).renderer);
  const background=await page.locator('#usd-viewport').evaluate(el=>getComputedStyle(el).backgroundColor);
  for(const viewer of ['three','needle','three'] as const){
    if(viewer!=='three'||new URL(page.url()).searchParams.get('viewer')==='needle')await switchViewer(page,viewer);
    await page.waitForFunction(()=>!!(window as any).renderer);
    await expect(page.locator('#dropzone')).toBeVisible();expect(await page.locator('#usd-viewport').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(background);
    expect(await page.locator('canvas.usd-viewer-three-canvas').evaluate(el=>getComputedStyle(el).visibility)).toBe('hidden');
    expect(await page.locator('body > #top-center').count()).toBe(0);
    await page.screenshot({path:info.outputPath(`empty-${theme}-${viewer}.png`)});
  }
  await page.goto(`/?viewer=three&assetCache=0&file=${asset}`);await loaded(page);await clearStage(page);await expect(page.locator('#dropzone')).toBeVisible();expect(await page.locator('#usd-viewport').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(background);
});

test('Needle and Three preserve the chosen backdrop and exposure when switching renderers',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('needle-usd-render-settings',JSON.stringify({exposure:1.3})));
  const results:any[]=[];
  await page.goto(`/?viewer=three&assetCache=0&background=light&file=${asset}`);await loaded(page);
  for(const background of ['light','dark']) {
    if(background==='dark'){await openSettings(page);await page.getByRole('combobox',{name:'Background',exact:true}).selectOption('dark');}
    const three=await capturePixel(page,'three');await switchViewer(page,'needle');await loaded(page);
    expect(await page.evaluate(()=>(window as any).needleEngineContext.renderer.toneMappingExposure)).toBe(1.3);
    await openSettings(page);
    await expect(page.getByRole('combobox',{name:'Background',exact:true})).toHaveValue(background);
    const needle=await capturePixel(page,'needle');
    for(let i=0;i<3;i++)expect(Math.abs(three[i]-needle[i]),JSON.stringify({background,three,needle})).toBeLessThanOrEqual(2);
    const environment=await page.evaluate(()=>(window as any).needleEngineContext.scene.environment);expect(environment).toBeNull();
    results.push({background,three,needle});await page.screenshot({path:info.outputPath(`needle-${background}.png`)});
    await switchViewer(page,'three');await loaded(page);const again=await capturePixel(page,'three');for(let i=0;i<3;i++)expect(Math.abs(again[i]-three[i])).toBeLessThanOrEqual(1);
  }
  await info.attach('backdrop-comparison',{body:JSON.stringify(results,null,2),contentType:'application/json'});expect(errors).toEqual([]);
});
