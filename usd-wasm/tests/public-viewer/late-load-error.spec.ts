import {selectExampleFolder, openAppMenu, openSamples, stageReady} from './workbench-menus';
import {expect, test} from './test';

test.use({video: 'on'});
for (const viewer of ['three', 'needle']) {
  test(`${viewer}: a delayed URL diagnosis cannot obscure a newer local file`, async ({page}, info) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let probing = false;
    await page.goto(`/?viewer=${viewer}&render=basic&assetCache=0&file=/test-fixtures/coverage/lighting-mdl/studio-variants.usda`);
    await stageReady(page);
    await openSamples(page);
    await selectExampleFolder(page,'usd-assets');
    const card = page.locator('#gallery-grid a.file').first();
    await card.waitFor();
    const target = new URL(new URL((await card.getAttribute('href'))!, page.url()).searchParams.get('file')!, page.url());
    expect(target.hostname).toBe('huggingface.co');
    expect(target.pathname).toContain('vr_head.usd');
    // The native reader can fetch from its worker as well as the page.
    await page.context().route(url => url.href === target.href, async route => {
      if (route.request().method() === 'HEAD') { probing = true; await gate; }
      await route.fulfill({status: 404, headers: {'access-control-allow-origin': '*'}, body: 'Not found'});
    });
    try {
      await card.click();
      await expect.poll(() => probing, {timeout: 15000}).toBe(true);
      await page.screenshot({path: info.outputPath('waiting-for-probe.png')});
      // Gallery requests serialize; File -> Open independently starts a new load.
      await openAppMenu(page, 'file');
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', {name: 'Open…', exact: true}).click();
      await (await chooser).setFiles({name: 'recovered.usda', mimeType: 'text/plain', buffer: Buffer.from('#usda 1.0\ndef Cube "Recovered" {}\n')});
      await page.locator('[data-prim-path="/Recovered"]').waitFor({state: 'attached', timeout: 15000});
      await expect(page.locator('.usd-file-context')).toContainText('recovered');
      await expect(page.locator('#load-error')).not.toBeVisible();
      await page.screenshot({path: info.outputPath('recovered-before-probe.png')});
      const response = page.waitForResponse(response => response.url() === target.href && response.request().method() === 'HEAD');
      release(); await response;
      await page.waitForTimeout(1000);
      await page.screenshot({path: info.outputPath('after-probe.png')});
      await expect(page.locator('#load-error')).not.toBeVisible({timeout: 1500});
      await expect(page.locator('.usd-file-context')).toContainText('recovered');
      await expect(page.locator('[data-prim-path="/Recovered"]')).toHaveCount(1);
    } finally { release(); }
  });
}
