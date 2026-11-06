import {expect, test} from './test';
import {openAppMenu, openSamples} from './workbench-menus';

for (const width of [800, 1440]) {
  test(`application menus stay clickable above floating panels at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await page.goto('/?viewer=three');
    await openSamples(page);
    await openAppMenu(page, 'window');
    await page.getByRole('button', {name: 'Float active panel', exact: true}).click();
    await expect(page.getByRole('dialog', {name: 'Examples', exact: true})).toBeVisible();
    await openAppMenu(page, 'window');
    const reset = page.getByRole('button', {name: 'Reset layout', exact: true});
    // Visibility alone passes when a floating panel intercepts the pointer.
    await expect.poll(() => reset.evaluate(element => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
    await reset.click();
    await expect(page.getByRole('dialog', {name: 'Examples', exact: true})).toHaveCount(0);
    await openSamples(page);
    await expect(page.getByRole('region', {name: 'Example browser', exact: true})).toBeVisible();
  });
}
