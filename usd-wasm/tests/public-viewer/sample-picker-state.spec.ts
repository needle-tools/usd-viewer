import {selectExampleFolder, openAppMenu, openSamples} from './workbench-menus';
import { expect, test, type Page } from '@playwright/test';

async function openPicker(page: Page) {
  await openSamples(page);
  await expect(page.locator('.usd-examples-browser')).toHaveAttribute('data-visible','true');
  await expect(page.locator('#gallery-grid .gallery-card').first()).toBeVisible();
}

async function scrollPosition(page: Page) {
  return page.evaluate(() => ({
    grid: document.getElementById('gallery-grid')!.scrollTop,
    sidebar: document.querySelector('.usd-examples-folders')!.scrollTop,
  }));
}

test('picker preserves scroll on reopen and separately for each category', async ({ page }) => {
  await page.goto('/?viewer=three');
  await openPicker(page);
  await selectExampleFolder(page,'needle');
  await expect.poll(() => page.locator('#gallery-grid .gallery-card').count()).toBeGreaterThan(200);
  const cardCount = await page.locator('#gallery-grid .gallery-card').count();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.getElementById('gallery-grid')!.scrollTop = 900;
    document.querySelector('.usd-examples-folders')!.scrollTop = 250;
  });
  await page.waitForTimeout(180);
  const position = await scrollPosition(page);
  expect(position.grid).toBe(900); expect(position.sidebar).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Close Examples',exact:true}).click();
  await expect(page.locator('.usd-examples-browser')).toHaveAttribute('data-visible','false');
  await openPicker(page);
  await expect.poll(() => scrollPosition(page)).toEqual(position);
  await page.locator('[data-sample-group="needle:Lights"]').click();
  await expect(page.locator('#gallery-grid .gallery-card')).toHaveCount(17);
  await expect.poll(() => page.locator('#gallery-grid').evaluate(el => el.scrollTop)).toBe(0);
  await selectExampleFolder(page,'needle');
  await expect(page.locator('#gallery-grid .gallery-card')).toHaveCount(cardCount);
  await expect.poll(() => page.locator('#gallery-grid').evaluate(el => el.scrollTop)).toBe(position.grid);
});

test('picker restores its category, selected card and scroll after reload and renderer changes', async ({ page }) => {
  await page.goto('/?viewer=three');
  await openPicker(page);
  await selectExampleFolder(page,'needle');
  await page.locator('[data-sample-group="needle:Lights"]').click();
  const card = page.locator('.gallery-card[data-name="Shaped spotlight"]');
  await page.waitForTimeout(300);
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(180);
  const position = await scrollPosition(page);
  expect(position.grid).toBeGreaterThan(0);
  await card.click();
  await page.waitForFunction(() => !!(window as any).usdHydra);
  await page.reload();
  await openPicker(page);
  await expect(page.locator('#gallery-grid')).toHaveAttribute('aria-label','Lights examples');
  await expect(page.locator('[data-sample-group="needle:Lights"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.gallery-card.active')).toHaveAttribute('data-name', 'Shaped spotlight');
  await expect.poll(() => page.locator('#gallery-grid').evaluate(el => el.scrollTop)).toBe(position.grid);
  const url = new URL(page.url()); url.searchParams.set('viewer', 'needle');
  await page.goto(url.href);
  await openPicker(page);
  await expect(page.locator('#gallery-grid')).toHaveAttribute('aria-label','Lights examples');
  await expect(page.locator('.gallery-card.active')).toHaveAttribute('data-name', 'Shaped spotlight');
  await expect.poll(() => page.locator('#gallery-grid').evaluate(el => el.scrollTop)).toBe(position.grid);
});

for (const unavailable of [false, true]) {
  test(`picker remains usable with ${unavailable ? 'blocked' : 'invalid'} storage`, async ({ page }) => {
    await page.addInitScript(unavailable => {
      if (unavailable) {
        Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
        Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
      } else localStorage.setItem('needle-usd-sample-picker-v1', '{invalid');
    }, unavailable);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?viewer=three');
    // Select the local library without waiting for the remote default library.
    await openSamples(page);
    await selectExampleFolder(page,'needle');
    await expect(page.locator('#gallery-grid .gallery-card').first()).toBeVisible();
    await expect(page.locator('#gallery-grid')).toHaveAttribute('aria-label','Needle examples');
    expect(errors).toEqual([]);
  });
}
