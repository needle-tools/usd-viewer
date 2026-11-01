import {expect, type Page} from '@playwright/test';

async function showMenubar(page:Page) {
  const toggle=page.getByRole('button',{name:'Application menus',exact:true});
  if(await toggle.isVisible() && await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
}
export async function openAppMenu(page:Page,name:'file'|'view'|'window'|'help') {
  await showMenubar(page);
  const menu=page.locator(`[data-usd-menu=${name}]`);
  if(await menu.getAttribute('open')===null){await menu.locator(':scope > summary').hover();if(await menu.getAttribute('open')===null)await menu.locator(':scope > summary').click();}
}
export async function openSamples(page:Page) {
  await showMenubar(page);
  await page.getByRole('button',{name:'Examples',exact:true}).click();
}
export async function selectExampleFolder(page:Page,library:string) {
  await page.waitForFunction(()=>(window as any).__usdViewerUiReady);
  const folder=page.locator(`[data-library="${library}"]`);
  const expandable=await folder.evaluate(el=>el.tagName==='DETAILS');
  const trigger=expandable?folder.locator(':scope > summary'):folder;
  await trigger.click();
  if(expandable && await folder.getAttribute('open')===null)await trigger.click();
  await expect(trigger).toHaveAttribute('aria-selected','true');
  await expect(page.locator('#gallery-grid')).toHaveAttribute('data-example-group',library);
}
export async function openSettings(page:Page) {
  await openAppMenu(page,'view');
  const scene=page.locator('[data-usd-menu=view] .usd-settings-section').filter({hasText:'Scene'});
  if(await scene.getAttribute('open')===null)await scene.locator(':scope > summary').click();
}
export async function clearStage(page:Page) {
  await openAppMenu(page,'file');
  await page.getByRole('link',{name:'Close file',exact:true}).click();
}
export async function stageReady(page:Page) {
  await page.waitForFunction(()=>!!(window as any).usdStagePanel);
  // Panel creation precedes asynchronous render-mode initialization. Wait for
  // the app's actual load barrier before projecting pick/framing coordinates.
  await expect(page.locator('#loading-overlay')).toBeHidden();
}
