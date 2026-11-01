import {selectExampleFolder, openSamples} from './workbench-menus';
import { test, expect, type Page } from '@playwright/test';

async function navigationSize(page: Page, axis: 'height' | 'width') {
  return page.locator('.usd-examples-folders').evaluate((element, axis) => element.getBoundingClientRect()[axis], axis);
}
async function dragDivider(page: Page, dx: number, dy: number) {
  const box = (await page.getByRole('separator', {name: 'Resize example folders'}).boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, {steps: 8}); await page.mouse.up();
}

for (const theme of ['light', 'dark']) test(`${theme}: example divider resizes both orientations and remembers each`, async ({page}, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(theme => localStorage.setItem('needle-usd-theme', JSON.stringify(theme)), theme);
  await page.setViewportSize({width: 1440, height: 1000}); await page.goto('/?viewer=three');
  await openSamples(page); await selectExampleFolder(page,'needle');
  await page.locator('[data-sample-group="needle:JavaScript%20API"]').click();
  const divider = page.getByRole('separator', {name: 'Resize example folders'});
  await expect(divider).toHaveAttribute('aria-orientation', 'horizontal');
  const initial = await navigationSize(page, 'height');
  await dragDivider(page, 0, 100);
  await expect.poll(() => navigationSize(page, 'height')).toBeGreaterThan(initial + 90);
  const narrow = await navigationSize(page, 'height');
  await page.screenshot({path: info.outputPath('stacked.png')});
  await page.reload(); await openSamples(page);
  await expect.poll(async () => Math.abs(await navigationSize(page, 'height') - narrow)).toBeLessThan(3);

  await page.evaluate(() => {
    const dock = (window as any).usdWorkbench.dock;
    dock.addFloatingGroup(dock.getPanel('examples'), {width: 860, height: 720, x: 160, y: 90});
  });
  await expect(divider).toHaveAttribute('aria-orientation', 'vertical');
  const wideInitial = await navigationSize(page, 'width');
  await dragDivider(page, 95, 0);
  await expect.poll(() => navigationSize(page, 'width')).toBeGreaterThan(wideInitial + 85);
  const wide = await navigationSize(page, 'width');
  const alignment = await page.evaluate(() => {
    const nav = document.querySelector('.usd-examples-folders')!.getBoundingClientRect();
    const results = document.querySelector('.usd-examples-results')!.getBoundingClientRect();
    return {navRight: nav.right, resultsLeft: results.left, sameTop: Math.abs(nav.top - results.top)};
  });
  expect(alignment.resultsLeft).toBeGreaterThan(alignment.navRight);
  expect(alignment.sameTop).toBeLessThan(1);
  await page.screenshot({path: info.outputPath('side-by-side.png')});

  // A single thumbnail column already warrants side-by-side navigation.
  await page.evaluate(() => (window as any).usdWorkbench.dock.getPanel('examples').group.api.setSize({width: 480}));
  await expect(divider).toHaveAttribute('aria-orientation', 'vertical');
  await expect.poll(() => page.locator('.gallery-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1);
  await page.screenshot({path: info.outputPath('one-column.png')});

  await page.evaluate(() => (window as any).usdWorkbench.dock.getPanel('examples').group.api.setSize({width: 420}));
  await expect(divider).toHaveAttribute('aria-orientation', 'horizontal');
  const ratio = await page.evaluate(() => JSON.parse(localStorage.getItem('needle-usd-examples-appearance-v1')!).split.heightRatio);
  const expectedHeight = await page.locator('.usd-examples-content').evaluate((element, ratio) => (element.clientHeight - 5) * ratio, ratio);
  await expect.poll(async () => Math.abs(await navigationSize(page, 'height') - expectedHeight)).toBeLessThan(3);
  await page.evaluate(() => (window as any).usdWorkbench.dock.getPanel('examples').group.api.setSize({width: 860}));
  await expect(divider).toHaveAttribute('aria-orientation', 'vertical');
  await expect.poll(async () => Math.abs(await navigationSize(page, 'width') - wide)).toBeLessThan(3);

  await divider.focus(); await divider.press('ArrowRight');
  await expect.poll(async () => await navigationSize(page, 'width') - wide).toBeGreaterThan(8);
  await divider.press('Home');
  await expect.poll(() => navigationSize(page, 'width')).toBeLessThan(150);
  await divider.press('End');
  expect(await page.locator('.usd-examples-results').evaluate(element => element.clientWidth)).toBeGreaterThanOrEqual(180);
  // Restore the chosen width and verify reload also restores the floating layout.
  await dragDivider(page, wide - await navigationSize(page, 'width'), 0);
  const restored = await navigationSize(page, 'width');
  await page.reload(); await openSamples(page);
  await expect(divider).toHaveAttribute('aria-orientation', 'vertical');
  await expect.poll(async () => Math.abs(await navigationSize(page, 'width') - restored)).toBeLessThan(3);
  await page.getByRole('button', {name: 'Close Examples', exact: true}).click(); await openSamples(page);
  await expect.poll(async () => Math.abs(await navigationSize(page, 'width') - restored)).toBeLessThan(3);
  expect(errors).toEqual([]);
});
