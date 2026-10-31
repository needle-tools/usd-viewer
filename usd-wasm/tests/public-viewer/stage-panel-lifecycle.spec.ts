import { test, expect, type Page } from '@playwright/test';

async function mount(page: Page, gate: 'before' | 'driver') {
  await page.route('**/stage-panel-lifecycle.html', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><div id="host"></div>',
  }));
  await page.goto('/stage-panel-lifecycle.html');
  await page.evaluate(async gate => {
    const path = '/usd/viewer/stagePanel.js';
    const { mountStagePanel } = await import(path);
    const state = (window as any).lifecycle = {
      live: true, started: false, writes: 0, handleCalls: 0, refreshed: 0, afterEdits: 0,
    };
    const hold = new Promise<void>(resolve => { state.release = resolve; });
    const wait = async () => { state.started = true; await hold; };
    const stage = {
      TraverseAll: () => ({ size: () => 0, delete() {} }),
      GetLayerStack: () => [], GetCompositionErrors: () => [],
    };
    const handle = {
      driver: {}, getTime: () => 0,
      readStage: async (action: (stage: unknown) => unknown) => action(stage),
      editStage: async (action: (stage: unknown, driver: unknown) => unknown) => {
        state.handleCalls++;
        if (gate === 'driver') await wait();
        return action(stage, handle.driver);
      },
      materialsReady: () => { state.refreshed++; },
    };
    state.panel = await mountStagePanel({
      handle, stage, scene: { traverse() {} }, camera: {}, controls: { enabled: true },
      container: document.getElementById('host'), style: false,
      isCurrent: () => state.live,
      beforeEdit: gate === 'before' ? wait : () => {},
      afterEdit: () => { state.afterEdits++; },
    });
    state.result = state.panel.edit(() => { state.writes++; return 42; })
      .then((value: number) => ({ value }), (error: Error) => ({ error: error.message }));
  }, gate);
  await expect.poll(() => page.evaluate(() => (window as any).lifecycle.started)).toBe(true);
}

for (const gate of ['before', 'driver'] as const) {
  for (const lifecycle of ['replaced', 'disposed'] as const) {
    test(`stage panel rejects ${lifecycle} document after waiting for ${gate}`, async ({ page }) => {
      await mount(page, gate);
      const result = await page.evaluate(async lifecycle => {
        const state = (window as any).lifecycle;
        if (lifecycle === 'disposed') state.panel.dispose();
        else state.live = false;
        state.release();
        return { result: await state.result, writes: state.writes, handleCalls: state.handleCalls,
          refreshed: state.refreshed, afterEdits: state.afterEdits };
      }, lifecycle);
      expect(result).toEqual({
        result: { error: 'USD stage is no longer current.' }, writes: 0,
        handleCalls: gate === 'driver' ? 1 : 0, refreshed: 0, afterEdits: 0,
      });
    });
  }
}

test('stage panel commits and refreshes a current document after waiting', async ({ page }) => {
  await mount(page, 'driver');
  const result = await page.evaluate(async () => {
    const state = (window as any).lifecycle;
    state.release();
    return { result: await state.result, writes: state.writes, refreshed: state.refreshed, afterEdits: state.afterEdits };
  });
  expect(result).toEqual({ result: { value: 42 }, writes: 1, refreshed: 1, afterEdits: 1 });
});
