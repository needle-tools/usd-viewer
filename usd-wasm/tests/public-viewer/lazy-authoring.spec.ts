import {expect, test} from '@playwright/test';
import {stageReady} from './workbench-menus';

const asset = '/?viewer=three&file=/test-fixtures/coverage/core/analytic-primitives.usda';
const optional = /\/(?:viewer-code\.js|usd\/viewer\/(?:repl|arrayEditor)\.js|usd\/editing\/)/;

test.beforeEach(({page}) => {
  (page as any).errors = [];
  page.on('pageerror', error => (page as any).errors.push(error.message));
});
test.afterEach(({page}) => { expect((page as any).errors).toEqual([]); });

test('viewing omits authoring modules; opening and restoring Code and Console loads them', async ({page}) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  await page.goto(asset); await stageReady(page);
  expect(requests.filter(path => optional.test(path))).toEqual([]);
  await expect(page.locator('.usd-code, .usd-repl')).toHaveCount(0);
  await page.evaluate(() => (window as any).usdWorkbench.openPanel('code'));
  await expect(page.locator('.usd-code')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).usdWorkbench.code.text)).toContain('#usda');
  expect(requests).toContain('/viewer-code.js');
  expect(requests).not.toContain('/usd/viewer/repl.js');
  await page.evaluate(() => (window as any).usdWorkbench.openPanel('console'));
  await expect(page.locator('.usd-repl')).toBeVisible();
  expect(await page.evaluate(() => (window as any).usdRepl.run('2 + 3'))).toBe(5);
  // Wait for the workspace debounce so reload tests the saved visible panels.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('needle-usd-workspace-v2'))).toContain('console');
  requests.length = 0;
  await page.reload(); await stageReady(page);
  await expect(page.locator('.usd-code')).toBeVisible();
  await expect(page.locator('.usd-repl')).toBeVisible();
  expect(requests).toContain('/viewer-code.js');
  expect(requests).toContain('/usd/viewer/repl.js');
});

test('programmatic REPL run lazily mounts without opening Console', async ({page}) => {
  await page.goto(asset); await stageReady(page);
  await expect(page.locator('.usd-repl')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).usdRepl.run('6 * 7'))).toBe(42);
  expect(await page.evaluate(() => (window as any).usdWorkbench.isPanelVisible('console'))).toBe(false);
  await expect(page.locator('.usd-repl')).toHaveCount(1);
});

for (const action of ['close', 'dispose'] as const) {
  test(`${action} while authoring imports are pending does not mount editors`, async ({page}) => {
    const released: (() => void)[] = [];
    const pending: string[] = [];
    await page.route(/\/(viewer-code\.js|usd\/viewer\/repl\.js)$/, async route => {
      pending.push(new URL(route.request().url()).pathname);
      await new Promise<void>(resolve => released.push(resolve));
      await route.continue();
    });
    await page.goto(asset); await stageReady(page);
    await page.evaluate(() => { (window as any).usdWorkbench.openPanel('code'); (window as any).usdWorkbench.openPanel('console'); });
    await expect.poll(() => pending.length).toBe(2);
    await page.evaluate(action => {
      const workbench = (window as any).usdWorkbench;
      if (action === 'dispose') workbench.dispose();
      else { workbench.dock.getPanel('code').api.close(); workbench.dock.getPanel('console').api.close(); }
    }, action);
    released.forEach(resolve => resolve());
    // Import completion is the barrier, including the modules' dependencies.
    await page.evaluate(async () => { await Promise.all([import('/viewer-code.js'), import('/usd/viewer/repl.js')]); });
    await expect(page.locator('.usd-code, .usd-repl')).toHaveCount(0);
    if (action === 'close') {
      await page.evaluate(() => { (window as any).usdWorkbench.openPanel('code'); (window as any).usdWorkbench.openPanel('console'); });
      await expect(page.locator('.usd-code')).toBeVisible();
      await expect(page.locator('.usd-repl')).toBeVisible();
    } else {
      const error = await page.evaluate(() => (window as any).usdRepl.run('1').then(() => '', (error: Error) => error.message));
      expect(error).toBe('REPL is disposed.');
    }
  });
}

test('Code retains only the latest stage binding during import and rejects stale generations', async ({page}) => {
  await page.route('**/lazy-code-test', route => route.fulfill({contentType:'text/html', body:'<main></main>'}));
  await page.goto('/lazy-code-test');
  const result = await page.evaluate(async () => {
    const {mountLazyCodePane} = await import('/viewer-lazy-code.js');
    const bindings: unknown[] = [], calls: string[] = [];
    let release: (value: unknown) => void;
    const loaded = new Promise(resolve => { release = resolve; });
    const fake = {mountCodePane: () => {
      calls.push('mount');
      return {show: (binding: unknown) => bindings.push(binding), refreshVisibility() {}, select() {}, dispose() {calls.push('dispose');}};
    }};
    const pane = mountLazyCodePane(document.querySelector('main'), {load:() => loaded});
    pane.show({stage:'old'}); pane.show({stage:'latest'}); pane.invalidate();
    release!(fake); await loaded; await Promise.resolve();
    pane.dispose();
    const stale = mountLazyCodePane(document.querySelector('main'), {load:() => Promise.resolve(fake)});
    stale.show({stage:'stale', isCurrent:() => false});
    await Promise.resolve(); await Promise.resolve(); stale.dispose();
    const disposed = mountLazyCodePane(document.querySelector('main'), {load:() => Promise.resolve(fake)});
    disposed.show({stage:'disposed'}); disposed.dispose();
    await Promise.resolve(); await Promise.resolve();
    return {bindings, calls};
  });
  expect(result.bindings).toEqual([{stage:'latest'}, null]);
  expect(result.calls).toEqual(['mount','dispose','mount','dispose']);
});
