import {test, expect} from './test';

// Files dropped onto the docked viewport load. Dock panels prevent the default
// of every drop, which once made the viewer ignore them.
for (const viewer of ['three', 'needle']) test(`${viewer}: a USDZ dropped onto the viewport loads`, async ({page}) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/?viewer=${viewer}`);
  await page.waitForFunction(() => (window as any).__usdViewerRuntimeReady === true);
  await page.evaluate(async () => {
    const blob = await (await fetch('/test-fixtures/usdz-nested-material.usdz')).blob();
    const data = new DataTransfer(); data.items.add(new File([blob], 'usdz-nested-material.usdz', {type: 'model/vnd.usdz+zip'}));
    const box = document.querySelector('#usd-viewport')!.getBoundingClientRect();
    const x = box.left + box.width / 2, y = box.top + box.height / 2, target = document.elementFromPoint(x, y)!;
    for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, {bubbles: true, cancelable: true, dataTransfer: data, clientX: x, clientY: y}));
  });
  await page.waitForFunction(() => (window as any).__usdViewerLoaded?.generation >= 1);
  expect(errors).toEqual([]);
});
