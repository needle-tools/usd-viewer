import {expect, type Page} from '@playwright/test';

export async function openAppMenu(page:Page,name:'file'|'view'|'window'|'help') {
  const menu=page.locator(`[data-usd-menu=${name}]`);
  if(await menu.getAttribute('open')===null){await menu.locator(':scope > summary').hover();if(await menu.getAttribute('open')===null)await menu.locator(':scope > summary').click();}
}
export async function openSamples(page:Page) {
  await page.getByRole('button',{name:'Examples',exact:true}).click();
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
