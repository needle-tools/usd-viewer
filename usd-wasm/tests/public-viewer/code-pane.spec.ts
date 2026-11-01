import {selectExampleFolder, openAppMenu, openSamples, stageReady, clearStage} from './workbench-menus';
import { test, expect, type Page } from '@playwright/test';
import { replExamples, apiExampleAssets } from '../fixtures/api/examples.js';

const exampleCode = (id: string) => replExamples[apiExampleAssets.findIndex(asset => asset.executable === id)].code;
const exampleUrl = (id: string) => `/?viewer=three&file=${encodeURIComponent(`/test-fixtures/api/examples.js#${id}`)}`;
const panelIds = (page: Page) => page.evaluate(() => (window as any).usdWorkbench.dock.panels.map((panel: any) => panel.id).sort());
const paneText = (page: Page) => page.evaluate(() => (window as any).usdWorkbench.code.text);
const revision = (page: Page) => page.locator('.usd-code').getAttribute('data-revision');
const source = (page: Page) => page.getByRole('combobox', { name: 'Source' });

async function openCode(page: Page) {
  await openAppMenu(page, 'window');
  await page.getByRole('checkbox', { name: 'Show Code' }).check();
  await expect(page.locator('.usd-code')).toBeVisible();
}
async function selectLayer(page: Page, role: string, name?: string) {
  const value = await page.locator('.usd-code-source option').evaluateAll((options, [role, name]) =>
    (options as HTMLOptionElement[]).find(option => option.dataset.role === role && (!name || option.textContent === name))?.value, [role, name]);
  expect(value, `${role} ${name ?? ''} layer option`).toBeTruthy();
  await source(page).selectOption(value!);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []; (page as any).errors = errors;
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect((page as any).errors).toEqual([]); });

test('Window > Code adds a pane without rearranging the layout and shows the exact example source', async ({ page }) => {
  await page.goto(exampleUrl('hello-world')); await stageReady(page);
  const before = await panelIds(page);
  expect(before).not.toContain('code');
  await openAppMenu(page, 'window'); await page.getByRole('checkbox', { name: 'Show Timeline' }).check();
  const withTimeline = await panelIds(page);
  await openCode(page);
  expect(await panelIds(page)).toEqual([...withTimeline, 'code'].sort());
  await expect(source(page)).toHaveValue('example');
  await expect.poll(() => paneText(page)).toBe(exampleCode('hello-world'));
  // The example body only, never the registry entry that wraps it.
  const text = await paneText(page);
  expect(text).not.toContain('replExamples'); expect(text).not.toContain('title:');
  await expect(page.locator('.usd-code-view .usd-code-keyword').first()).toBeVisible();
  const fonts = await page.evaluate(() => ({
    code: getComputedStyle(document.querySelector('.usd-code-view')!).fontFamily,
    picker: getComputedStyle(document.querySelector('.usd-code-source')!).fontFamily,
    body: getComputedStyle(document.body).fontFamily,
  }));
  expect(fonts.code).toMatch(/mono/i); expect(fonts.picker).toBe(fonts.body);
  // Code scrolls inside the pane; the dock panel itself does not.
  const geometry = await page.evaluate(() => {
    const view = document.querySelector('.usd-code-view') as HTMLElement, panel = document.querySelector('.usd-panel-code') as HTMLElement;
    return { overflow: getComputedStyle(view).overflow, panelScroll: panel.scrollHeight - panel.clientHeight, inside: view.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom + 1 };
  });
  expect(geometry).toEqual({ overflow: 'auto', panelScroll: 0, inside: true });
  await page.getByRole('button', { name: 'Copy source' }).focus();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy source' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(exampleCode('hello-world'));

  // Layout and pane choices survive a reload.
  await page.reload(); await stageReady(page);
  expect(await panelIds(page)).toEqual([...withTimeline, 'code'].sort());
  await expect.poll(() => paneText(page)).toBe(exampleCode('hello-world'));
});

test('layers export through USD: root, session and referenced layers, including live edits', async ({ page }) => {
  await page.goto(exampleUrl('referenced-layer')); await stageReady(page);
  await openCode(page);
  const roles = await page.locator('.usd-code-source option').evaluateAll(options => (options as HTMLOptionElement[]).map(option => option.dataset.role));
  expect(roles).toEqual(expect.arrayContaining(['example', 'root', 'session', 'layer']));

  await selectLayer(page, 'root');
  const exported = await page.evaluate(() => (window as any).usdStage.GetRootLayer().ExportToString());
  await expect.poll(() => paneText(page)).toBe(exported);
  expect(exported.startsWith('#usda 1.0')).toBe(true);
  await expect(page.locator('.usd-code-view')).toHaveAttribute('data-language', 'usda');

  await selectLayer(page, 'layer', 'reference-base.usda');
  await expect.poll(() => paneText(page)).toContain('def Xform "Mushroom"');
  await selectLayer(page, 'session');
  await expect.poll(() => paneText(page)).toMatch(/^#usda 1\.0/);

  // Authored edits reach the shown layer once, after the edit, not per frame.
  await selectLayer(page, 'root');
  await expect.poll(() => paneText(page)).toBe(exported);
  const idle = await revision(page);
  await page.waitForTimeout(800);
  expect(await revision(page)).toBe(idle);
  await page.evaluate(() => (window as any).usdStagePanel.edit((stage: any) => { stage.DefinePrim('/World/CodePaneProbe', 'Xform'); }));
  await expect.poll(() => paneText(page)).toContain('def Xform "CodePaneProbe"');
  expect(await paneText(page)).toBe(await page.evaluate(() => (window as any).usdStage.GetRootLayer().ExportToString()));
  const edited = Number(await revision(page));
  expect(edited).toBe(Number(idle) + 1);

  // A hidden pane does not export; it catches up when it becomes visible.
  await page.evaluate(() => (window as any).usdWorkbench.openPanel('properties'));
  await expect(page.locator('.usd-code')).toBeHidden();
  await page.evaluate(() => (window as any).usdStagePanel.edit((stage: any) => { stage.DefinePrim('/World/HiddenProbe', 'Xform'); }));
  await page.waitForTimeout(400);
  expect(Number(await revision(page))).toBe(edited);
  await page.evaluate(() => (window as any).usdWorkbench.openPanel('code'));
  await expect.poll(() => paneText(page)).toContain('def Xform "HiddenProbe"');
});

test('switching, stale loads and closing keep the pane consistent and release the stage', async ({ page }) => {
  await page.goto(exampleUrl('hello-world')); await stageReady(page);
  await openCode(page);
  await selectLayer(page, 'root');
  // Load two examples back to back; only the second may populate the pane.
  await openSamples(page);
  await selectExampleFolder(page,'needle');
  await page.locator('[data-sample-group="needle:JavaScript%20API"]').click();
  const label = (id: string) => apiExampleAssets.find(asset => asset.executable === id)!.label;
  await page.locator(`.gallery-card[data-name="${label('referenced-layer')}"]`).click();
  await page.locator(`.gallery-card[data-name="${label('schema-shapes')}"]`).click();
  await expect.poll(() => page.evaluate(() => !!(window as any).usdStage?.GetPrimAtPath('/World/Ball').IsValid())).toBe(true);
  await stageReady(page);
  await page.evaluate(() => (window as any).usdWorkbench.openPanel('code'));
  // The layer choice persists across stages; the JS source follows the example.
  await expect.poll(() => paneText(page)).toBe(await page.evaluate(() => (window as any).usdStage.GetRootLayer().ExportToString()));
  await source(page).selectOption('example');
  await expect.poll(() => paneText(page)).toBe(exampleCode('schema-shapes'));
  expect(await page.locator('.usd-code-source option[data-role=layer]').allTextContents()).not.toContain('reference-base.usda');

  await clearStage(page);
  await expect(page.locator('.usd-code .usd-panel-empty')).toBeVisible();
  await expect(source(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Copy source' })).toBeDisabled();
  expect(await paneText(page)).toBe('');

  // Reopening after close shows the next stage, and closing the pane leaves nothing behind.
  await page.goto(exampleUrl('hello-world')); await stageReady(page);
  await expect.poll(() => paneText(page)).toBe(exampleCode('hello-world'));
  await openAppMenu(page, 'window'); await page.getByRole('checkbox', { name: 'Show Code' }).uncheck();
  expect(await panelIds(page)).not.toContain('code');
  await page.evaluate(() => (window as any).usdStagePanel.edit((stage: any) => { stage.DefinePrim('/World/ClosedProbe', 'Xform'); }));
});

test('Sun Cycle highlights both lesson code and large USDA without dropping source text', async ({page}) => {
  await page.goto(exampleUrl('sun-cycle'));await stageReady(page);await openCode(page);
  await source(page).selectOption('example');
  await expect.poll(()=>paneText(page)).toBe(exampleCode('sun-cycle'));
  await expect(page.locator('.usd-code-keyword').first()).toBeVisible();
  await selectLayer(page,'root');
  const exported=await page.evaluate(()=>(window as any).usdStage.GetRootLayer().ExportToString());
  expect(exported.length).toBeGreaterThan(300_000);
  await expect.poll(()=>paneText(page)).toBe(exported);
  await expect(page.locator('.usd-code-keyword').first()).toBeVisible();
  expect(await page.locator('.usd-code-view code').textContent()).toBe(exported);
  // Dense point/normal arrays should not create a DOM node for every component.
  expect(await page.locator('.usd-code-view span').count()).toBeLessThan(5_000);
});
