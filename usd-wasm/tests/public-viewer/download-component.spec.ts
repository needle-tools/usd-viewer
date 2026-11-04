import {test, expect, type Page} from '@playwright/test';
import {zipSync, unzipSync} from 'three/addons/libs/fflate.module.js';
import {readFile} from 'node:fs/promises';

const archive = [...zipSync({'scene.usda':new TextEncoder().encode('#usda 1.0\ndef Sphere "Ball" {}\n')}, {level:0})];
async function mount(page: Page) {
  await page.route('**/download-component.html', route => route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width"><script type="importmap">{"imports":{"three/addons/":"/three/examples/jsm/"}}</script><div id="host" style="width:180px;height:32px;overflow:hidden;transform:translateX(10px);--surface-panel:rgb(20,24,20);--text-primary:rgb(240,244,239)"></div><button id="after">After</button>'}));
  await page.goto('/download-component.html');
  await page.evaluate(async bytes => {
    const w = window as any, path = '/usd/viewer/downloadButton.js';
    w.source = {handle:{exportUsdz:async()=>new Uint8Array(bytes)}, filename:'/files/special%20sample.usda'};
    w.errors = [];
    w.component = (await import(path)).mountDownloadButton({container:document.getElementById('host'),getSource:()=>w.source,stateKey:'standalone-download',onError:error=>w.errors.push(error.message)});
  }, archive);
  await expect.poll(() => page.locator('.usd-download').evaluate(el=>getComputedStyle(el).display)).toBe('inline-flex');
}

test('standalone split button styles, unclipped popup, keyboard controls, downloads and persistence', async ({page}, info) => {
  await mount(page);
  const button = page.getByRole('button',{name:'Download',exact:true});
  const event = page.waitForEvent('download', {timeout:10000}); await button.click(); const file = await event;
  expect(file.suggestedFilename()).toBe('special sample.zip');
  const entries = unzipSync(new Uint8Array(await readFile((await file.path())!)));
  expect(new TextDecoder().decode(entries['scene.usda'])).toContain('Sphere');
  const trigger = page.getByLabel('Download format',{exact:true});
  await trigger.focus(); await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitemradio',{name:'ZIP',exact:true})).toBeFocused();
  const menu = page.getByRole('menu',{name:'Download formats'});
  const popup = await menu.evaluate(el=>{const rect=el.getBoundingClientRect();return{unclipped:el.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height-10)),background:getComputedStyle(el).backgroundColor};});
  expect(popup).toEqual({unclipped:true,background:'rgb(20, 24, 20)'});
  await menu.screenshot({path:info.outputPath('standalone-popup.png')});
  await page.keyboard.press('End'); await expect(page.getByRole('menuitemcheckbox',{name:'Full-resolution textures'})).toBeFocused();
  await page.keyboard.press('ArrowUp'); await expect(page.getByRole('menuitemradio',{name:'USDZ',exact:true})).toBeFocused();
  await page.keyboard.press('Enter'); await expect(menu).toBeHidden();
  await expect(button).toHaveAttribute('title','Download USDZ');
  await trigger.click(); await page.keyboard.press('Escape'); await expect(trigger).toBeFocused(); await expect(menu).toBeHidden();
  await mount(page); await expect(button).toHaveAttribute('title','Download USDZ');
  await page.evaluate(()=>{const w=window as any;w.source.formats=['zip'];w.component.refresh();});
  await trigger.click(); await expect(page.getByRole('menuitemradio',{name:'USDZ',exact:true})).toBeDisabled();
  await page.mouse.click(300, 300); await expect(menu).toBeHidden();
});

test('standalone busy state, stale source, error callback and disposal cancel safely', async ({page}, info) => {
  await mount(page); const downloads: string[] = []; page.on('download',file=>downloads.push(file.suggestedFilename()));
  await page.evaluate(bytes=>{const w=window as any;w.source.handle.exportUsdz=()=>new Promise(resolve=>{w.finish=()=>resolve(new Uint8Array(bytes));});},archive);
  const button = page.getByRole('button',{name:'Download',exact:true});
  const width = (await button.boundingBox())!.width;
  await button.click(); await expect(button).toBeDisabled(); await expect(button).toHaveAttribute('aria-busy','true');
  await expect(page.locator('.usd-download-spinner')).toBeVisible();
  expect((await button.boundingBox())!.width).toBe(width);
  expect(await page.locator('.usd-download-spinner').evaluate(el=>getComputedStyle(el).animationPlayState)).toBe('running');
  await expect(page.getByRole('status')).toHaveText('Preparing');
  await button.screenshot({path:info.outputPath('exporting.png')});
  await page.evaluate(()=>{const w=window as any;w.source=null;w.component.refresh();w.finish();});
  await expect(button).toHaveAttribute('aria-busy','false'); await expect(button).toBeDisabled(); expect(downloads).toEqual([]);
  await page.evaluate(()=>{const w=window as any;w.source={filename:'failed.usda',handle:{exportUsdz:async()=>{throw new Error('package failed');}}};w.component.refresh();});
  await button.click(); await expect.poll(()=>page.evaluate(()=>(window as any).errors)).toEqual(['package failed']); await expect(button).toBeEnabled();
  await page.evaluate(bytes=>{const w=window as any;w.source.handle.exportUsdz=()=>new Promise(resolve=>{w.finish=()=>{resolve(new Uint8Array(bytes));w.resolved=true;};});},archive);
  await button.click(); await page.evaluate(()=>{const w=window as any;w.component.dispose();w.finish();});
  await expect(button).toHaveCount(0); expect(downloads).toEqual([]);
});
test('glTF and Cloud share use the same split button without running an unselected action',async({page},info)=>{
 await mount(page);
 await page.evaluate(()=>{
  const w=window as any;w.exports=0;w.shares=0;
  w.source.exportGltf=async options=>{w.exportOptions=options;w.exports++;return new TextEncoder().encode('glTF fixture');};
  w.source.share=async options=>{w.shareOptions=options;w.shares++;};w.component.refresh();
 });
 const trigger=page.getByLabel('Download format',{exact:true});await trigger.click();
 await page.getByRole('menuitemradio',{name:'glTF',exact:true}).click();
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download',exact:true}).click();
 const file=await downloaded;expect(file.suggestedFilename()).toBe('special sample.glb');
 expect((await readFile((await file.path())!)).toString()).toBe('glTF fixture');
 expect(await page.evaluate(()=>(window as any).exportOptions.textureResolution)).toBe('original');
 await trigger.click();
 const quality=page.getByRole('menuitemcheckbox',{name:'Full-resolution textures'});
 await expect(quality).toBeChecked();await quality.focus();await page.keyboard.press('Space');await expect(quality).not.toBeChecked();
 await expect(page.getByRole('menu')).toBeVisible();await page.keyboard.press('Escape');
 const preview=page.waitForEvent('download');await page.getByRole('button',{name:'Download',exact:true}).click();await preview;
 expect(await page.evaluate(()=>(window as any).exportOptions.textureResolution)).toBe('preview');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('standalone-download:textures')!))).toBe('preview');
 await trigger.click();await page.getByRole('menuitemradio',{name:'Share on Needle Cloud',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).shares)).toBe(0);
 const share=page.getByRole('button',{name:'Share',exact:true});await expect(share).toHaveAttribute('title','Share on Needle Cloud');
 await share.click();await expect.poll(()=>page.evaluate(()=>(window as any).shares)).toBe(1);
 expect(await page.evaluate(()=>({format:(window as any).shareOptions.format,textures:(window as any).shareOptions.textureResolution}))).toEqual({format:'gltf',textures:'preview'});
 expect(await page.evaluate(()=>(window as any).exports)).toBe(2);
 await page.evaluate(()=>(window as any).component.share());
 expect(await page.evaluate(()=>(window as any).shares)).toBe(2);
 await trigger.click();await page.getByRole('menu').screenshot({path:info.outputPath('download-share-menu.png')});
 await page.getByRole('menuitemradio',{name:'USDZ',exact:true}).click();
 await expect(page.getByRole('button',{name:'Download',exact:true})).toHaveAttribute('title','Download USDZ');
 await trigger.click();await expect(quality).toBeEnabled();await expect(quality).not.toBeChecked();
 await page.getByRole('menuitemradio',{name:'ZIP',exact:true}).click();await trigger.click();await expect(quality).not.toBeChecked();
 await quality.click();await expect(quality).toBeChecked();await page.keyboard.press('Escape');
 await page.evaluate(()=>{const w=window as any;w.source.handle.exportUsdz=async options=>{w.archiveOptions=options;return new Uint8Array([80,75]);};w.component.setFormat('usdz');});
 const archive=page.waitForEvent('download');await page.getByRole('button',{name:'Download',exact:true}).click();await archive;
 expect(await page.evaluate(()=>(window as any).archiveOptions.textureResolution)).toBe('original');
});

test('export spinner respects reduced motion while retaining its busy status', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'}); await mount(page);
  await page.evaluate(()=>{const w=window as any;w.source.handle.exportUsdz=()=>new Promise(resolve=>w.finish=resolve);});
  await page.getByRole('button',{name:'Download',exact:true}).click();
  await expect(page.locator('.usd-download-spinner')).toBeVisible();
  expect(await page.locator('.usd-download-spinner').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await expect(page.getByRole('status')).toHaveText('Preparing');
  await page.waitForFunction(()=>typeof(window as any).finish==='function');
  await page.evaluate(()=>{const w=window as any;w.component.dispose();w.finish(new Uint8Array());});
});
