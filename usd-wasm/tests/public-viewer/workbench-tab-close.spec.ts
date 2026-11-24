import {test, expect, type Page} from './test';
import {stageReady} from './workbench-menus';

// Every closable tab keeps its close button and the same size, whichever tab is
// active. The button stays hidden until the tab is hovered or focused from the keyboard.
async function closeButtons(page: Page) {
	return page.locator('.dv-tab').evaluateAll(tabs => tabs.map(tab => {
		const close = tab.querySelector('.usd-tab-close');
		const style = close && getComputedStyle(close);
		return {title: tab.textContent!.trim(), width: Math.round(tab.getBoundingClientRect().width),
			present: !!close && style!.display !== 'none' && close.getBoundingClientRect().width > 0,
			shown: !!close && Number(style!.opacity) > 0 && style!.visibility === 'visible'};
	}));
}

test('tab close buttons keep their place, appear on hover and do not depend on the active tab', async ({page}) => {
	const errors: string[] = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.goto('/?workspace=studio&viewer=three&file=/test-fixtures/physics/body-damping.usda');
	await stageReady(page);
	const stageActive = await closeButtons(page);
	const closable = stageActive.filter(tab => tab.title !== 'Viewport');
	expect(closable.map(tab => tab.title)).toEqual(expect.arrayContaining(['Stage', 'Layers', 'Examples']));
	expect(closable.every(tab => tab.present && !tab.shown)).toBe(true);

	await page.locator('.dv-tab', {hasText: 'Examples'}).click();
	await page.mouse.move(640, 600);
	const examplesActive = await closeButtons(page);
	for (const title of ['Stage', 'Layers', 'Examples']) {
		const before = stageActive.find(tab => tab.title === title)!, after = examplesActive.find(tab => tab.title === title)!;
		expect(after.present, `${title} keeps its close button`).toBe(true);
		expect(after.width, `${title} keeps its width`).toBe(before.width);
	}

	// The search field narrows the strip; the active tab must stay fully visible.
	await expect.poll(() => page.locator('.dv-tab.dv-active-tab', {hasText: 'Examples'}).evaluate(tab => {
		const strip = tab.closest('.dv-scrollable')!.getBoundingClientRect(), box = tab.getBoundingClientRect();
		return box.left >= strip.left - .5 && box.right <= strip.right + .5;
	})).toBe(true);

	const layers = page.locator('.dv-tab', {hasText: 'Layers'});
	await layers.hover();
	await expect.poll(async () => (await closeButtons(page)).find(tab => tab.title === 'Layers')!.shown).toBe(true);
	await layers.getByRole('button', {name: 'Close Layers'}).click();
	await expect(page.locator('.dv-tab', {hasText: 'Layers'})).toHaveCount(0);

	// Keyboard users reach the hidden button too.
	await page.mouse.move(640, 600);
	await page.keyboard.press('Shift');
	await page.locator('.dv-tab', {hasText: 'Stage'}).getByRole('button', {name: 'Close Stage'}).focus();
	await expect.poll(async () => (await closeButtons(page)).find(tab => tab.title === 'Stage')!.shown).toBe(true);
	expect(errors).toEqual([]);
});
