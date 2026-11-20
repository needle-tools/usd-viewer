import {expect, test} from './test';
import {openAppMenu, openSamples} from './workbench-menus';

test.use({actionTimeout: 15_000});

for (const workspace of ['viewer', 'studio']) {
  test(`${workspace} retains light defaults, Help dialogs and example links`, async ({page}, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.emulateMedia({colorScheme: 'dark'});
    await page.goto(`/?viewer=three&workspace=${workspace}&assetCache=0`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('button', {name: 'Examples', exact: true})).toBeEnabled();

    await openAppMenu(page, 'help');
    await page.locator('#about-link').click();
    const about = page.locator('#about-dialog');
    await expect(about).toBeVisible();
    await expect(about.getByRole('heading', {name: 'About USD Viewer'})).toBeVisible();
    await expect(about.getByRole('link', {name: 'View USD Viewer on GitHub'})).toHaveAttribute('href', /github.com\/needle-tools\/usd-viewer/);
    await expect(about.getByRole('link', {name: 'Explore Needle Cloud'})).toBeVisible();
    await expect(about.getByRole('link', {name: 'OpenUSD', exact: true})).toBeVisible();
    await about.getByRole('button', {name: 'Close', exact: true}).click();

    // Exercise the form without sending a test message to the team.
    let feedback: Record<string, string> | undefined;
    await page.route('**/api/feedback', async route => {
      feedback = route.request().postDataJSON();
      await route.fulfill({json: {ok: true}});
    });
    await openAppMenu(page, 'help');
    await page.locator('#feedback-link').click();
    const form = page.locator('#feedback-dialog');
    await expect(form).toBeVisible();
    await form.getByRole('textbox', {name: 'Your message'}).fill('Check the feedback form.');
    await form.getByRole('textbox', {name: /Email/}).fill('test@example.com');
    await form.getByRole('button', {name: 'Send feedback'}).click();
    await expect(form.getByRole('status')).toHaveText('Thanks! Your feedback was sent.');
    expect(feedback?.message).toBe('Check the feedback form.');
    expect(feedback?.email).toBe('test@example.com');
    await form.getByRole('button', {name: 'Close', exact: true}).click();

    await openSamples(page);
    const links = page.getByRole('region', {name: 'More examples'});
    await expect(links.getByRole('link', {name: 'Needle Asset Explorer'})).toHaveAttribute('href', 'https://asset-explorer.needle.tools');
    await expect(links.getByRole('link', {name: 'Browse usd-wg/assets'})).toHaveAttribute('href', 'https://github.com/usd-wg/assets');
    await links.scrollIntoViewIfNeeded();
    await expect(links.getByRole('link', {name: 'Needle Asset Explorer'})).toBeVisible();
    await page.screenshot({path: info.outputPath(`${workspace}-light-examples.png`)});
    if (workspace === 'viewer') await page.getByRole('button', {name: 'Close examples', exact: true}).click();

    await openAppMenu(page, 'view');
    await page.getByRole('combobox', {name: 'Color theme'}).selectOption('dark');
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await openAppMenu(page, 'view');
    await expect(page.getByRole('combobox', {name: 'Color theme'})).toHaveValue('dark');
    await page.getByRole('combobox', {name: 'Color theme'}).selectOption('system');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({colorScheme: 'light'});
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(errors).toEqual([]);
  });

  test(`${workspace} loads What's New and remembers dismissal`, async ({page}, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    // Cover the ordinary visitor path; automation normally disables announcements.
    await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', {get: () => false}));
    await page.route('**/api/script.js', route => route.fulfill({contentType: 'application/javascript', body: ''}));
    await page.route('https://marketer.needle.tools/whatsnew.js', route => route.fulfill({
      contentType: 'application/javascript', headers: {'Cross-Origin-Resource-Policy': 'cross-origin'},
      body: 'window.needleWhatsNew = {impression() {}, hover() {}};',
    }));
    let feedRequests = 0;
    await page.route('https://marketer.needle.tools/api/whats-new?**', route => {
      feedRequests++;
      return route.fulfill({headers: {'Access-Control-Allow-Origin': '*'}, json: {items: [{
        id: 'feature-check', kind: 'feature', url: 'https://needle.tools/',
        banner: {title: 'Needle news', subtitle: 'Updates from Needle', cta: 'Learn more'},
      }]}});
    });
    await page.goto(`/?viewer=three&workspace=${workspace}&assetCache=0`);
    const banner = page.getByRole('complementary', {name: "What's new at Needle"});
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Needle news');
    await expect(banner.getByRole('link')).toHaveAttribute('href', 'https://needle.tools/');
    await page.screenshot({path: info.outputPath(`${workspace}-whats-new.png`)});
    await banner.getByRole('button', {name: 'Dismiss', exact: true}).click();
    await expect(banner).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', {name: 'Examples', exact: true})).toBeEnabled();
    await expect(banner).toHaveCount(0);
    expect(feedRequests).toBe(1);
    expect(await page.evaluate(() => Number(localStorage.getItem('needle-whats-new-dismissed-at')))).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}
