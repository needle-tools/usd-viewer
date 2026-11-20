import {test,expect} from './test';
import {stageReady,openSettings,openAppMenu} from './workbench-menus';
const asset='/?viewer=three&file=/test-fixtures/coverage/lighting-mdl/studio-variants.usda';
for(const theme of ['light','dark'])test(`${theme}: inline menubar, direct View controls and shared UI tokens`,async({page},info)=>{
  await page.addInitScript(theme=>localStorage.setItem('needle-usd-theme',JSON.stringify(theme)),theme);
  await page.goto(asset);await stageReady(page);
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:800});await openSettings(page);
    const geometry=await page.evaluate(()=>{const header=document.querySelector('#container')!,menu=document.querySelector('.usd-menubar')!,logo=document.querySelector('.needle-logo-link')!,title=document.querySelector('.header-tool-leading')!;return{header:header.getBoundingClientRect().toJSON(),menu:menu.getBoundingClientRect().toJSON(),title:title.getBoundingClientRect().toJSON(),border:getComputedStyle(logo).borderRightWidth,overflow:header.scrollWidth>header.clientWidth};});
    // Up to 760px the menubar collapses behind the Menu toggle and opens as a dropdown below the header.
    if(width>760){expect(geometry.menu.left).toBeGreaterThan(geometry.title.right);expect(geometry.menu.top).toBeLessThan(geometry.header.bottom);}
    else{await expect(page.getByRole('button',{name:'Application menus',exact:true})).toHaveAttribute('aria-expanded','true');expect(geometry.menu.top).toBeGreaterThanOrEqual(geometry.header.bottom);}
    expect(geometry.header.height).toBe(45);expect(geometry.border).toBe('0px');expect(geometry.overflow).toBe(false);
    await expect(page.getByRole('combobox',{name:'Tone mapping',exact:true})).toHaveValue('needle-agx');
    await expect(page.getByRole('combobox',{name:'Render mode',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>(window as any).usdWorkbench.dock.getPanel('settings'))).toBeUndefined();
    await page.screenshot({path:info.outputPath(`${theme}-${width}.png`)});await page.keyboard.press('Escape');
  }
  await openAppMenu(page,'window');await expect(page.getByRole('checkbox',{name:'Show Settings',exact:true})).toHaveCount(0);await page.keyboard.press('Escape');
  await openSettings(page);await page.evaluate(()=>document.documentElement.style.setProperty('--usd-control-height','34px'));
  await expect(page.getByRole('spinbutton',{name:'Exposure',exact:true})).toHaveCSS('height','34px');
  expect(await page.locator('.usd-prim-tree').evaluate(el=>({width:getComputedStyle(el).scrollbarWidth,color:getComputedStyle(el).scrollbarColor}))).toMatchObject({width:'thin'});
});
for(const mode of ['pathtraced','pathtraced-gk'])test(`${mode}: local fast and quality OIDN finish rendering`,async({page},info)=>{
  const errors:string[]=[],weights:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('.tza'))weights.push(r.url());});
  await page.setViewportSize({width:640,height:480});await page.goto(asset);await stageReady(page);
  expect(weights).toEqual([]);
  await page.evaluate(async mode=>{const w=window as any;w.usdHydra.setPlaying(false);w.renderer.setPixelRatio(.25);await w.usdRenderModes.setSettings({maxSamples:2,bounces:2,denoiser:'oidn-fast',gkDenoiser:'oidn-fast'});await w.usdRenderModes.setMode(mode);},mode);
  await expect(page.locator('#render-mode-controls')).toHaveAttribute('data-status','finished');
  await openSettings(page);await expect(page.getByRole('combobox',{name:'Denoiser',exact:true})).toHaveValue('oidn-fast');
  await page.getByRole('combobox',{name:'Denoiser',exact:true}).selectOption('oidn');
  await expect.poll(()=>page.evaluate(mode=>(window as any).usdRenderModes.settings[mode==='pathtraced'?'denoiser':'gkDenoiser'],mode)).toBe('oidn');
  await expect(page.locator('#render-mode-controls')).toHaveAttribute('data-status','finished');
  expect(weights.some(url=>url.endsWith('/rt_hdr_alb_nrm_small.tza'))).toBe(true);expect(weights.some(url=>url.endsWith('/rt_hdr_alb_nrm.tza'))).toBe(true);
  expect(weights.every(url=>new URL(url).origin==='http://127.0.0.1:5199')).toBe(true);
  await page.screenshot({path:info.outputPath('denoised.png')});expect(errors).toEqual([]);
});
test('display transforms agree across Basic, Beauty and both tracers and persist',async({page},info)=>{
  await page.setViewportSize({width:900,height:650});await page.goto(asset);await stageReady(page);await openSettings(page);
  await page.evaluate(async()=>{const w=window as any;w.usdHydra.setPlaying(false);w.renderer.setPixelRatio(.5);w.renderer.toneMappingExposure=1.7;await w.usdRenderModes.setSettings({maxSamples:4,bounces:2,denoiser:null,gkDenoiser:null});});
  const result:any[]=[];
  for(const tone of ['needle-agx','aces','neutral','linear','reinhard','none']){
    await openSettings(page);await page.getByRole('combobox',{name:'Tone mapping',exact:true}).selectOption(tone);await page.keyboard.press('Escape');
    const pixels:any={tone};
    for(const mode of ['basic','beauty','pathtraced','pathtraced-gk']){
      await page.evaluate(mode=>(window as any).usdRenderModes.setMode(mode),mode);
      if(mode.startsWith('pathtraced'))await expect.poll(()=>page.evaluate(()=>(window as any).usdRenderModes.samples)).toBe(4);else await page.waitForTimeout(150);
      const canvas=mode==='pathtraced'?page.locator('#usd-viewport > canvas').nth(1):page.locator('canvas.usd-viewer-three-canvas');
      const png=await canvas.screenshot();pixels[mode]=await page.evaluate(async data=>{const image=await createImageBitmap(await(await fetch('data:image/png;base64,'+data)).blob()),c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);return [...ctx.getImageData(c.width-3,2,1,1).data];},png.toString('base64'));
    }
    for(const mode of ['beauty','pathtraced','pathtraced-gk'])for(let i=0;i<3;i++)expect(Math.abs(pixels.basic[i]-pixels[mode][i]),JSON.stringify(pixels)).toBeLessThanOrEqual(3);
    result.push(pixels);
  }
  await page.reload();await stageReady(page);await openSettings(page);await expect(page.getByRole('combobox',{name:'Tone mapping',exact:true})).toHaveValue('none');
  await info.attach('display-pixels',{body:JSON.stringify(result),contentType:'application/json'});
});
