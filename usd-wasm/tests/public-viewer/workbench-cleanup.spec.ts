import {expect,test} from '@playwright/test';
import {openAppMenu} from './workbench-menus';
const asset='/test-fixtures/coverage/lighting-mdl/studio-variants.usda';
const ready=(page:any)=>page.waitForFunction(()=>!!(window as any).usdStagePanel,null,{timeout:15000});
for(const theme of ['light','dark'])test(`${theme} menus fit without scrollbars and Examples opens directly`,async({page},info)=>{
  await page.addInitScript(theme=>localStorage.setItem('needle-usd-theme',JSON.stringify(theme)),theme);
  await page.goto('/?viewer=three');await expect(page.getByRole('button',{name:'Examples',exact:true})).toBeEnabled();
  await expect(page.locator('.usd-status,.usd-viewport-toolbar')).toHaveCount(0);
  for(const width of [1280,390]){
    await page.setViewportSize({width,height:850});
    for(const name of ['file','view','window','help'] as const){
      await openAppMenu(page,name);const menu=page.locator(`[data-usd-menu=${name}] .usd-menu-body`);
      const box=await menu.evaluate(el=>({sw:el.scrollWidth,cw:el.clientWidth,sh:el.scrollHeight,ch:el.clientHeight,rect:el.getBoundingClientRect().toJSON()}));
      expect(box.sw,`${name} at ${width}`).toBeLessThanOrEqual(box.cw);expect(box.sh,`${name} at ${width}`).toBeLessThanOrEqual(box.ch);
      expect(box.rect.left).toBeGreaterThanOrEqual(0);expect(box.rect.right).toBeLessThanOrEqual(width);
      await page.screenshot({path:info.outputPath(`${theme}-${name}-${width}.png`)});await page.keyboard.press('Escape');
    }
    await page.locator('[data-usd-menu=file] > summary').focus();await page.keyboard.press('ArrowRight');await expect(page.getByRole('button',{name:'Examples',exact:true})).toBeFocused();await page.keyboard.press('ArrowDown');await expect(page.locator('#sample-group-list')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('combobox',{name:'Example library'})).toBeFocused();
    const header=await page.locator('#container').evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth}));expect(header.scroll).toBeLessThanOrEqual(header.width);
  }
});
const source=`#usda 1.0
(
 startTimeCode=1
 endTimeCode=241
 upAxis="Y"
)
def Xform "World" (
 variants={string motion="still"}
 prepend variantSets="motion"
) {
 def Cube "Cube" {
  double size=1
 }
 uniform token[] xformOpOrder=["xformOp:translate"]
 variantSet "motion" = {
  "still" {
   double3 xformOp:translate=(0,0,0)
  }
  "animated" {
   double3 xformOp:translate.timeSamples={1:(0,0,0),241:(2,0,0)}
  }
 }
}`;
test('explicit Timeline stays open across animation changes and uses regular frame ticks',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?viewer=three');
  await expect(page.locator('input[type=file]')).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles({name:'ui-time.usda',mimeType:'text/plain',buffer:Buffer.from(source)});await ready(page);
  expect(await page.evaluate(()=>(window as any).usdWorkbench.dock.getPanel('timeline')?.id)).toBeUndefined();
  await page.evaluate(()=>(window as any).usdWorkbench.openPanel('properties'));
  await openAppMenu(page,'window'); await page.getByRole('checkbox',{name:'Show Timeline',exact:true}).check();
  await expect(page.locator('[data-panel=timeline]')).toContainText('No animation');
  await page.locator('[data-stage-variant=motion]').selectOption('animated');await expect(page.getByRole('slider',{name:'Time code',exact:true})).toBeVisible({timeout:5000});
  await page.evaluate(()=>(window as any).usdHydra.setPlaying(false));
  for(const width of [1440,1000]){
    await page.setViewportSize({width,height:850});await expect.poll(()=>page.locator('.usd-time-ticks span').count()).toBeGreaterThan(1);
    await page.waitForTimeout(80);const labels=await page.locator('.usd-time-ticks span').allTextContents();const values=labels.map(Number);const step=values[1]-values[0];
    expect(step).toBeGreaterThan(0);expect([1,2,5,10]).toContain(step/10**Math.floor(Math.log10(step)));
    for(let i=1;i<values.length;i++)expect(values[i]-values[i-1]).toBeCloseTo(step,6);
    expect(values.every(Number.isInteger)).toBe(true);
    const track=await page.getByRole('slider',{name:'Time code',exact:true}).boundingBox(),panel=await page.locator('[data-panel=timeline]').boundingBox();
    expect(track!.y+track!.height).toBeLessThanOrEqual(panel!.y+panel!.height);
    expect(await page.locator('.usd-timeline').evaluate(el=>el.scrollHeight<=el.clientHeight && el.scrollWidth<=el.clientWidth)).toBe(true);
    await page.screenshot({path:info.outputPath(`timeline-${width}.png`)});
  }
  const frame=page.getByRole('spinbutton',{name:'Current frame',exact:true});await frame.fill('100');await frame.press('Tab');await expect.poll(()=>page.evaluate(()=>(window as any).usdHydra.getTime())).toBe(100);
  await page.locator('[data-stage-variant=motion]').selectOption('still');await expect(page.getByRole('slider',{name:'Time code',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).usdWorkbench.dock.getPanel('timeline')?.id)).toBe('timeline');
  await expect(page.locator('[data-panel=timeline]')).toContainText('No animation'); expect(errors).toEqual([]);
});
for(const mode of ['basic','beauty'])test(`${mode}: resize keeps drawn frames and performs no layout writes in observer delivery`,async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    const Original=ResizeObserver;(window as any).__insideResize=false;
    window.ResizeObserver=class extends Original{constructor(callback:ResizeObserverCallback){super((entries,observer)=>{(window as any).__insideResize=true;try{callback(entries,observer);}finally{(window as any).__insideResize=false;}});}};
  });
  await page.goto(`/?viewer=three&background=dark&file=${asset}`);await ready(page);await page.evaluate(mode=>(window as any).usdRenderModes.setMode(mode),mode);await page.waitForTimeout(200);await page.evaluate(()=>{
    const w=window as any;w.usdHydra.setPlaying(false);w.__resizeWrites=[];w.__pixels=[];
    for(const [object,key] of [[w.renderer,'setSize'],[w.usdWorkbench.dock,'layout']]){const fn=object[key];object[key]=function(...args:any[]){w.__resizeWrites.push({key,inside:w.__insideResize,args});return fn.apply(this,args);};}
    const out=document.createElement('canvas');out.width=out.height=1;const ctx=out.getContext('2d')!;w.__audit=true;
    function audit(){if(!w.__audit)return;const canvas=w.renderer.domElement;if(canvas.width>20&&canvas.height>20){ctx.clearRect(0,0,1,1);ctx.drawImage(canvas,12,12,1,1,0,0,1,1);w.__pixels.push([...ctx.getImageData(0,0,1,1).data]);}requestAnimationFrame(audit);}requestAnimationFrame(audit);
  });
  for(const width of [1400,1150,1300,900,1050,1440]){await page.setViewportSize({width,height:850});await page.evaluate(async()=>{const w=window as any;for(const width of [280,330,250]){w.usdWorkbench.dock.getPanel('stage').api.setSize({width});await new Promise(requestAnimationFrame);}});}
  await page.waitForTimeout(100);const result=await page.evaluate(()=>{const w=window as any;w.__audit=false;return{writes:w.__resizeWrites,pixels:w.__pixels};});
  expect(result.writes.some((w:any)=>w.inside)).toBe(false);expect(result.pixels.length).toBeGreaterThan(10);
  for(const pixel of result.pixels){expect(pixel[3],JSON.stringify(pixel)).toBe(255);expect(Math.max(...pixel.slice(0,3))-Math.min(...pixel.slice(0,3))).toBeLessThanOrEqual(6);}
  expect(errors).toEqual([]);await info.attach('resize-frames',{body:JSON.stringify(result),contentType:'application/json'});await page.screenshot({path:info.outputPath('resized.png')});
});
