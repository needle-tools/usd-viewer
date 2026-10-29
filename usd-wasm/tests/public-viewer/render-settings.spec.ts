import {openSettings,stageReady} from './workbench-menus';
import {expect,test} from '@playwright/test';
const stage='/?viewer=three&file=/test-fixtures/coverage/lighting-mdl/studio-variants.usda';
test.beforeEach(async({page})=>{await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//,r=>r.fulfill({contentType:'text/css',body:''}));});

test('MuTracer resumes after a camera drag, rests without drift and persists render settings',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(stage);await stageReady(page);await openSettings(page);
  await page.evaluate(()=>{const w=window as any;w.usdHydra.setPlaying(false);w._controls.enableDamping=true;});
  await page.getByRole('combobox',{name:'Render mode',exact:true}).selectOption('pathtraced');
  await expect.poll(()=>page.evaluate(()=>(window as any).usdRenderModes.samples)).toBeGreaterThan(3);
  await page.keyboard.press('Escape');
  const before=await page.evaluate(()=>(window as any).camera.position.toArray());
  const box=(await page.locator('canvas.usd-viewer-three-canvas').boundingBox())!;
  await page.mouse.move(box.x+box.width*.45,box.y+box.height*.45);await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.55,{steps:14});await page.waitForTimeout(100);await page.mouse.up();
  const release=Date.now();await expect.poll(()=>page.evaluate(()=>(window as any).usdRenderModes.samples),{timeout:1500,intervals:[50]}).toBeGreaterThan(1);
  await info.attach('warm-resume',{body:JSON.stringify({warmResumeMs:Date.now()-release}),contentType:'application/json'});
  const settled=await page.evaluate(()=>(window as any).camera.position.toArray());expect(settled).not.toEqual(before);await page.waitForTimeout(300);expect(await page.evaluate(()=>(window as any).camera.position.toArray())).toEqual(settled);
  const samples=await page.evaluate(()=>(window as any).usdRenderModes.samples);await page.mouse.down();await page.waitForTimeout(150);await page.mouse.up();expect(await page.evaluate(()=>(window as any).usdRenderModes.samples)).toBeGreaterThanOrEqual(samples);
  await openSettings(page);
  for(const [name,value] of [['Samples','24'],['Bounces','4'],['Exposure','1.3']]){const input=page.getByRole('spinbutton',{name,exact:true});await input.fill(value);await input.press('Tab');}
  await page.getByRole('combobox',{name:'Denoiser',exact:true}).selectOption('none');
  await expect.poll(()=>page.evaluate(()=>(window as any).usdRenderModes.samples)).toBe(24);
  expect(await page.evaluate(()=>(window as any).usdRenderModes.settings)).toMatchObject({maxSamples:24,bounces:4,denoiser:null,gkDenoiser:'oidn-fast'});
  await page.reload();await stageReady(page);await openSettings(page);for(const [name,value] of [['Samples','24'],['Bounces','4'],['Exposure','1.3']])await expect(page.getByRole('spinbutton',{name,exact:true})).toHaveValue(value);
  await expect(page.getByRole('combobox',{name:'Denoiser',exact:true})).toHaveValue('none');expect(errors).toEqual([]);
});

test('Basic, Beauty and MuTracer share clear-color backgrounds and retain authored backgrounds',async({page},info)=>{
  await page.goto(stage);await stageReady(page);await openSettings(page);
  await page.evaluate(()=>{const w=window as any;w.usdHydra.setPlaying(false);w._controls.enableDamping=false;});
  const pixel=async(path=false)=>{
    const locator=path?page.locator('canvas').last():page.locator('canvas.usd-viewer-three-canvas');
    const image=await locator.screenshot();return page.evaluate(async encoded=>{const b=await createImageBitmap(await(await fetch('data:image/png;base64,'+encoded)).blob());const c=document.createElement('canvas');c.width=b.width;c.height=b.height;const ctx=c.getContext('2d')!;ctx.drawImage(b,0,0);return Array.from(ctx.getImageData(2,2,1,1).data);},image.toString('base64'));
  };
  const colors:any[]=[];
  for(const background of ['light','dark','light']) {
    await page.getByRole('combobox',{name:'Background',exact:true}).selectOption(background);const results:any={background};
    for(const mode of ['basic','beauty','pathtraced']){await page.evaluate(mode=>(window as any).usdRenderModes.setMode(mode),mode);if(mode==='pathtraced')await expect.poll(()=>page.evaluate(()=>(window as any).usdRenderModes.samples)).toBeGreaterThan(3);else await page.waitForTimeout(250);results[mode]=await pixel(mode==='pathtraced');}
    for(const mode of ['beauty','pathtraced'])for(let i=0;i<3;i++)expect(Math.abs(results.basic[i]-results[mode][i]),JSON.stringify(results)).toBeLessThanOrEqual(3);colors.push(results);
  }
  await page.getByRole('combobox',{name:'Background',exact:true}).selectOption('dark');
  await expect.poll(()=>page.evaluate(()=>(window as any).usdRenderModes.samples)).toBeGreaterThan(3);
  const changed=await pixel(true);for(let i=0;i<3;i++)expect(Math.abs(changed[i]-colors[1].basic[i])).toBeLessThanOrEqual(3);
  await page.evaluate(async()=>{const w=window as any,T=await import('three');w.scene.background=new T.Color(0x4c83ba);w.renderer.setClearColor(0xff0000);});
  await expect.poll(()=>page.evaluate(()=>(window as any).usdRenderModes.samples)).toBeGreaterThan(3);const path=await pixel(true);await page.evaluate(()=>(window as any).usdRenderModes.setMode('basic'));await page.waitForTimeout(150);const basic=await pixel();
  for(let i=0;i<3;i++)expect(Math.abs(path[i]-basic[i])).toBeLessThanOrEqual(3);
  await page.evaluate(async()=>{const w=window as any;w.renderer.toneMappingExposure=2;await w.usdRenderModes.setMode('pathtraced');});
  await expect.poll(()=>page.evaluate(()=>(window as any).usdRenderModes.samples)).toBeGreaterThan(3);const exposedPath=await pixel(true);
  await page.evaluate(()=>(window as any).usdRenderModes.setMode('beauty'));await page.waitForTimeout(200);const exposedBeauty=await pixel();
  for(let i=0;i<3;i++)expect(Math.abs(exposedPath[i]-exposedBeauty[i])).toBeLessThanOrEqual(3);
  await page.evaluate(()=>(window as any).usdRenderModes.setMode('pathtraced-gk'));
  await expect.poll(()=>page.evaluate(()=>(window as any).usdRenderModes.samples)).toBeGreaterThan(3);const exposedGk=await pixel();
  for(let i=0;i<3;i++)expect(Math.abs(exposedGk[i]-exposedBeauty[i])).toBeLessThanOrEqual(3);
  await info.attach('background-pixels' ,{body:JSON.stringify({colors,authored:{path,basic},exposure2:{path:exposedPath,beauty:exposedBeauty,gkjohnson:exposedGk}},null,2),contentType:'application/json'});
});

test('timeline transports and frame entry stay in sync and Space toggles stage playback',async({page},info)=>{
  await page.goto(stage.replace('studio-variants','animated-light'));await stageReady(page);await page.evaluate(()=>(window as any).usdWorkbench.openPanel('timeline'));await expect(page.getByRole('spinbutton',{name:'Current frame',exact:true})).toBeVisible();
  const bounds=await page.evaluate(()=>{const w=window as any;w.usdHydra.setPlaying(false);return w.usdHydra.stageMetadata();});const time=()=>page.evaluate(()=>(window as any).usdHydra.getTime());
  for(const [name,value] of [['Last frame',bounds.endTimeCode],['Previous frame',bounds.endTimeCode-1],['First frame',bounds.startTimeCode],['Next frame',bounds.startTimeCode+1]] as const){await page.getByRole('button',{name,exact:true}).click();await expect.poll(time).toBe(value);}
  const frame=page.getByRole('spinbutton',{name:'Current frame',exact:true});await frame.fill('24');await frame.press('Tab');await expect.poll(time).toBe(24);await page.getByRole('slider',{name:'Time code',exact:true}).fill('30');await expect.poll(time).toBe(30);
  await openSettings(page);await expect(page.getByRole('combobox',{name:'Render mode',exact:true})).toBeVisible();await page.keyboard.press('Escape');await page.getByRole('button',{name:'Play or pause',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).usdHydra.isPlaying())).toBe(true);
  await page.locator('canvas.usd-viewer-three-canvas').click();await page.keyboard.press('Space');await expect.poll(()=>page.evaluate(()=>(window as any).usdHydra.isPlaying())).toBe(false);
  const dimensions=await page.locator('.usd-timeline').evaluate(el=>({overflow:el.scrollWidth>el.clientWidth,height:el.getBoundingClientRect().height}));expect(dimensions.overflow).toBe(false);expect(dimensions.height).toBeLessThanOrEqual(64);await page.screenshot({path:info.outputPath('timeline-settings.png')});
});

test('wide layouts compact on narrow screens and restore; settings remain accessible',async({page},info)=>{
  await page.setViewportSize({width:1440,height:960});await page.goto(stage);await stageReady(page);await openSettings(page);await expect(page.locator('[data-panel=properties]')).toBeVisible();await page.setViewportSize({width:390,height:700});
  await expect.poll(()=>page.locator('#usd-viewport').evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(380);await openSettings(page);await expect(page.getByRole('combobox',{name:'Render mode',exact:true})).toBeVisible();
  await expect(page.getByRole('combobox',{name:'Camera',exact:true})).toBeVisible();
  const logo=await page.locator('.needle-logo').evaluate((el:HTMLImageElement)=>({image:el.getBoundingClientRect().toJSON(),link:el.parentElement!.getBoundingClientRect().toJSON()}));
  expect(logo.image.width).toBeGreaterThanOrEqual(65);expect(logo.link.width).toBeGreaterThanOrEqual(logo.image.width);
  expect(logo.link.left).toBeGreaterThanOrEqual(8);
  expect(logo.link.left).toBeGreaterThanOrEqual(0);expect(logo.link.right).toBeLessThanOrEqual(390);
  const rect=await page.locator('[data-usd-menu=view] .usd-menu-body').evaluate(el=>el.getBoundingClientRect().toJSON());expect(rect.left).toBeGreaterThanOrEqual(0);expect(rect.right).toBeLessThanOrEqual(390);await page.screenshot({path:info.outputPath('settings-narrow.png')});
  await page.setViewportSize({width:1440,height:960});await expect(page.locator('[data-panel=stage]')).toBeVisible();await expect(page.locator('[data-panel=properties]')).toBeVisible();
});
