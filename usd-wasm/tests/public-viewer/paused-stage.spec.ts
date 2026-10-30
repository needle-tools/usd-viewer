import {expect, test, type Page} from '@playwright/test';
import {stageReady} from './workbench-menus';

test.use({video: 'on'});
const light = '/test-fixtures/coverage/lighting-mdl/animated-light.usda';
const visibility = '/test-fixtures/coverage/core/animated-visibility.usda';
const property = (page: Page, name: string) => page.locator('[data-panel=properties] tr').filter({has: page.getByRole('rowheader', {name, exact: true})}).locator('td');
async function pause(page: Page) {
  await page.evaluate(() => (window as any).usdWorkbench.openPanel('timeline'));
  const play = page.getByRole('button', {name: 'Play or pause'});
  if (await play.getAttribute('aria-pressed') === 'true') await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'false');
}
// Match USD's linear interpolation between the authored cosine samples.
function lightIntensity(time: number) {
  const index = Math.max(0, Math.min(23, Math.floor((time - 1) / 4)));
  const sample = (i: number) => 100 + 250 * (1 - Math.cos(2 * Math.PI * i / 24));
  return sample(index) + (sample(index + 1) - sample(index)) * (time - 1 - index * 4) / 4;
}

for (const viewer of ['three', 'needle']) {
  test(`${viewer}: pausing refreshes sampled properties without replacing inspector state`, async ({page}, info) => {
    await page.goto(`/?viewer=${viewer}&render=basic&file=${light}`);
    await stageReady(page); await pause(page);
    await page.locator('[data-prim-path="/World/Lights/Animated"]').click();
    await page.getByRole('button', {name: 'Last frame', exact: true}).click();
    await expect(property(page, 'inputs:intensity')).toHaveText('100');
    const matrix = property(page, 'xformOp:transform');
    await matrix.dblclick(); await expect(matrix).toHaveClass(/expanded/);
    await property(page, 'inputs:intensity').scrollIntoViewIfNeeded();
    const scroll = await page.locator('[data-panel=properties]').evaluate(el => el.scrollTop);
    const originalTable = await page.locator('[data-panel=properties] table').elementHandle();
    const originalCell = await matrix.elementHandle();
    await page.screenshot({path: info.outputPath('last-frame.png')});
    const play = page.getByRole('button', {name: 'Play or pause'});
    await play.click();
    await expect.poll(() => page.getByRole('spinbutton', {name: 'Current frame'}).inputValue()).not.toBe('97');
    await page.waitForTimeout(650);
    // No heavy inspector replacement while animation is running.
    expect(await originalTable!.evaluate(el => el.isConnected)).toBe(true);
    await expect(property(page, 'inputs:intensity')).toHaveText('100');
    await play.click(); await expect(play).toHaveAttribute('aria-pressed', 'false');
    const time = await page.evaluate(() => (window as any).usdHydra.getTime());
    expect(time).toBeGreaterThan(1); expect(time).toBeLessThan(97);
    const expected = lightIntensity(time);
    await page.waitForTimeout(250); await page.screenshot({path: info.outputPath('paused.png')});
    await expect.poll(async () => Math.abs(Number(await property(page, 'inputs:intensity').textContent()) - expected), {timeout: 5000}).toBeLessThan(0.02);
    await expect(play).toBeFocused();
    expect(await originalTable!.evaluate(el => el.isConnected)).toBe(true);
    expect(await originalCell!.evaluate(el => el.isConnected)).toBe(true);
    await expect(matrix).toHaveClass(/expanded/);
    expect(await page.locator('[data-panel=properties]').evaluate(el => el.scrollTop)).toBe(scroll);
    // The same preservation applies to keyboard-driven manual seeks.
    const frame = page.getByRole('spinbutton', {name: 'Current frame'});
    await frame.fill('12'); await frame.press('Enter');
    await expect.poll(async () => Math.abs(Number(await property(page, 'inputs:intensity').textContent()) - lightIntensity(12))).toBeLessThan(0.02);
    await expect(frame).toBeFocused(); await expect(matrix).toHaveClass(/expanded/);
  });

  test(`${viewer}: paused hierarchy visibility matches sampled visibility after playback and seeking`, async ({page}, info) => {
    await page.goto(`/?viewer=${viewer}&render=basic&file=${visibility}`);
    await stageReady(page); await pause(page);
    const prim = page.locator('[data-prim-path="/World/Animated"]');
    await prim.click();
    await prim.press('ArrowLeft');
    await expect(prim).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', {name: 'First frame', exact: true}).click();
    await expect(property(page, 'visibility')).toHaveText('inherited');
    const play = page.getByRole('button', {name: 'Play or pause'});
    await play.click();
    await page.waitForFunction(() => { const t = (window as any).usdHydra.getTime(); return t > 27 && t < 43; });
    await play.click(); await expect(play).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(250); await page.screenshot({path: info.outputPath('paused-visibility.png')});
    await expect(property(page, 'visibility')).toHaveText('invisible', {timeout: 5000});
    await expect(prim.locator('..')).toHaveAttribute('data-visible', 'false');
    await expect(page.getByRole('button', {name: 'Show /World/Animated', exact: true})).toHaveAttribute('aria-pressed', 'false');
    await expect(prim).toHaveAttribute('aria-expanded', 'false');
    await expect(play).toBeFocused();
    await page.getByRole('button', {name: 'First frame', exact: true}).click();
    await expect(prim.locator('..')).toHaveAttribute('data-visible', 'true');
    await expect(property(page, 'visibility')).toHaveText('inherited');
    await page.getByRole('button', {name: 'Last frame', exact: true}).click();
    await expect(prim.locator('..')).toHaveAttribute('data-visible', 'true');
    const frame = page.getByRole('spinbutton', {name: 'Current frame'});
    await frame.fill('48'); await frame.press('Enter');
    await expect(prim.locator('..')).toHaveAttribute('data-visible', 'false');
    // A refreshed visibility button must act on the displayed state, rather
    // than the state captured when its row was first created.
    await page.getByRole('button', {name: 'Show /World/Animated', exact: true}).click();
    await expect(property(page, 'visibility')).toHaveText('inherited');
    await expect(page.getByRole('button', {name: 'Hide /World/Animated', exact: true})).toHaveAttribute('aria-pressed', 'true');
  });
}
