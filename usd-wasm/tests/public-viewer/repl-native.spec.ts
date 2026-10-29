import { expect, test } from '@playwright/test';
import { clearStage, stageReady } from './workbench-menus';

test('REPL reads real embind objects and invalidates them when the viewer closes', async ({ page }) => {
  await page.goto('/?viewer=three&file=/test-fixtures/coverage/lighting-mdl/studio-variants.usda');
  await stageReady(page);
  await page.evaluate(async () => {
    const w = window as any;
    const { mountRepl } = await import(/* @vite-ignore */ '/usd/viewer/repl.js');
    // A detached host isolates module behavior from parent-owned Console layout.
    w.testRepl = mountRepl({ container: document.createElement('div'), style: false,
      getContext: () => w.usdHydra && w.usdStage ? { handle: w.usdHydra, stage: w.usdStage } : null,
      edit: (callback: any) => w.usdHydra.editStage(callback),
    });
  });
  expect(await page.evaluate(() => (window as any).testRepl.run('scratch.prim = stage.GetPrimAtPath("/World"); return scratch.prim.GetName();'))).toBe('World');
  expect(await page.evaluate(() => (window as any).testRepl.run('await Promise.resolve(); return scratch.prim.GetPath();'))).toBe('/World');
  await page.evaluate(async () => {
    const w = window as any;
    await w.testRepl.run('globalThis.replSavedPrim = scratch.prim');
    w.replPending = w.testRepl.run('await new Promise(() => {})').catch((e: Error) => e.message);
  });
  await clearStage(page);
  expect(await page.evaluate(() => (window as any).replPending)).toContain('no longer current');
  expect(await page.evaluate(() => { try { (window as any).replSavedPrim.GetName(); return 'unsafe'; } catch (e) { return (e as Error).message; } })).toContain('no longer current');
  await page.evaluate(() => (window as any).testRepl.dispose());
});
