import {selectExampleFolder, openAppMenu, openSamples, stageReady} from './workbench-menus';
import {expect, test} from './test';

const animated = '/test-fixtures/coverage/core/animated-translation.usda';

for (const viewer of ['three', 'needle']) {
  test(`${viewer}: malformed local USD reports a read failure and permits recovery`, async ({page}) => {
    const probes: string[] = [];
    page.on('request', request => { if (request.method() === 'HEAD') probes.push(request.url()); });
    await page.goto(`/?viewer=${viewer}&file=${animated}`);
    await stageReady(page);
    await openAppMenu(page, 'file');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', {name: 'Open…', exact: true}).click();
    await (await chooser).setFiles({
      name: 'invalid.usda', mimeType: 'text/plain',
      buffer: Buffer.from('#usda 1.0\ndef Xform "Broken" { totally invalid syntax\n'),
    });
    const error = page.locator('#load-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('Couldn\'t read “invalid.usda”');
    await expect(error).not.toContainText('404');
    expect(probes.filter(url => url.includes('invalid.usda'))).toEqual([]);
    await openSamples(page);
    await selectExampleFolder(page,'needle');
    await page.getByRole('searchbox', {name: 'Search examples'}).fill('animated translation');
    await page.getByRole('link', {name: /Animated translation/}).click();
    await stageReady(page);
    await expect(error).not.toBeVisible();
    await page.evaluate(()=>(window as any).usdWorkbench.openPanel('timeline'));
    await expect(page.getByRole('spinbutton', {name: 'Current frame'})).toBeVisible();
  });
}

test('missing URL retains the HTTP 404 diagnosis', async ({page}) => {
  await page.route(url => url.pathname === '/audit-missing.usda', route => route.fulfill({status: 404, body: 'Not found'}));
  await page.goto('/?viewer=three&file=/audit-missing.usda');
  await expect(page.locator('#load-error')).toBeVisible();
  await expect(page.locator('#load-error')).toContainText('was not found (404)');
});
