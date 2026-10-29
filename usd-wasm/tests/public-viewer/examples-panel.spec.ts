import {test,expect} from '@playwright/test';
import {openSamples,stageReady} from './workbench-menus';
for(const theme of ['light','dark'])test(`${theme}: Examples docks left, resizes, filters and persists preview controls`,async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(theme=>localStorage.setItem('needle-usd-theme',JSON.stringify(theme)),theme);
  await page.setViewportSize({width:1440,height:900});await page.goto('/?viewer=three');await expect(page.getByRole('combobox',{name:'Example library'})).toBeEnabled();
  await expect(page.locator('[data-panel=examples]')).toBeVisible();
  const position=await page.evaluate(()=>{const a=document.querySelector('[data-panel=examples]')!.getBoundingClientRect(),b=document.querySelector('#usd-viewport')!.getBoundingClientRect();return{left:a.left,right:a.right,viewport:b.left,width:a.width};});expect(position.left).toBe(0);expect(position.right).toBeLessThanOrEqual(position.viewport);expect(position.width).toBeGreaterThan(350);
  await page.getByRole('combobox',{name:'Example library'}).selectOption('needle');await expect.poll(()=>page.locator('.gallery-card').count()).toBeGreaterThan(200);
  await page.getByRole('searchbox',{name:'Search examples'}).fill('Shaped spotlight');await expect(page.locator('.gallery-card:visible')).toHaveCount(1);await expect(page.locator('#examples-count')).toHaveText(/^1 \/ /);
  await page.getByRole('searchbox',{name:'Search examples'}).fill('');
  const first=page.locator('.gallery-card').first(),before=await first.boundingBox();
  await page.getByRole('slider',{name:'Preview size'}).fill('208');await expect.poll(async()=>(await first.boundingBox())!.width).toBeGreaterThan(before!.width);
  await page.getByRole('button',{name:'Details',exact:true}).click();await expect(first.locator('.gallery-meta')).toBeHidden();
  await page.evaluate(()=>(window as any).usdWorkbench.dock.getPanel('examples').api.setSize({width:480}));await page.waitForTimeout(220);
  await page.reload();await openSamples(page);await expect(page.getByRole('combobox',{name:'Example library'})).toHaveValue('needle');await expect(page.getByRole('slider',{name:'Preview size'})).toHaveValue('208');await expect(page.getByRole('button',{name:'Details',exact:true})).toHaveAttribute('aria-pressed','false');
  expect(await page.locator('[data-panel=examples]').evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(470);
  await page.getByRole('button',{name:'Close Examples',exact:true}).click();await openSamples(page);expect(await page.locator('[data-panel=examples]').evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(470);
  await page.screenshot({path:info.outputPath('examples.png')});expect(errors).toEqual([]);
});
test('choosing an example leaves the browser open; close/reopen preserves its dock and selection',async({page},info)=>{
  await page.goto('/?viewer=three');await openSamples(page);await page.getByRole('combobox',{name:'Example library'}).selectOption('needle');await page.locator('[data-sample-group="needle:Lights"]').click();
  const card=page.locator('.gallery-card[data-name="Shaped spotlight"]');await card.click();await stageReady(page);
  await expect(page.locator('.usd-examples-browser')).toHaveAttribute('data-visible','true');await expect(card).toHaveClass(/active/);
  await page.getByRole('button',{name:'Close Examples',exact:true}).click();await expect(page.locator('.usd-examples-browser')).toHaveAttribute('data-visible','false');await openSamples(page);await expect(card).toHaveClass(/active/);await expect(page.getByRole('combobox',{name:'Example library'})).toHaveValue('needle');
  await page.evaluate(()=>(window as any).usdWorkbench.dock.addFloatingGroup((window as any).usdWorkbench.dock.getPanel('examples'),{width:800,height:600,x:400,y:150}));
  await expect(page.getByRole('dialog',{name:'Examples',exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>{const nav=document.querySelector('.usd-examples-folders')!.getBoundingClientRect(),grid=document.querySelector('.usd-examples-results')!.getBoundingClientRect();return nav.right<=grid.left+1;})).toBe(true);
  await page.screenshot({path:info.outputPath('floating-examples.png')});
});
test('compact Examples keeps controls reachable and returns to the viewport after choosing an asset',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:320,height:568});await page.goto('/?viewer=three');await openSamples(page);
  await page.getByRole('combobox',{name:'Example library'}).selectOption('needle');await page.locator('[data-sample-group="needle:Lights"]').click();
  for(const selector of ['.usd-examples-browser','.usd-examples-footer','#examples-preview-size']){const r=await page.locator(selector).boundingBox();expect(r!.x).toBeGreaterThanOrEqual(0);expect(r!.x+r!.width).toBeLessThanOrEqual(320);expect(r!.y+r!.height).toBeLessThanOrEqual(568);}
  await page.screenshot({path:info.outputPath('compact-examples.png')});await page.locator('.gallery-card[data-name="Shaped spotlight"]').click();await stageReady(page);
  await expect(page.locator('#usd-viewport')).toBeVisible();await openSamples(page);await expect(page.locator('.gallery-card.active')).toHaveAttribute('data-name','Shaped spotlight');expect(errors).toEqual([]);
});
