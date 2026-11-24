import {test, expect} from './test';
import {openSamples, selectExampleFolder} from './workbench-menus';

test.use({storageState: {cookies: [], origins: []}});

for (const theme of ['light', 'dark']) {
	test(`${theme}: Viewer controls, search and catalog totals remain readable`, async ({page}, info) => {
		await page.addInitScript(theme => localStorage.setItem('needle-usd-theme', JSON.stringify(theme)), theme);
		await page.goto('/?viewer=three');
		const mode = page.getByRole('group', {name: 'Workspace mode'});
		await expect(mode.getByRole('button', {name: 'USD Viewer', exact: true})).toHaveAttribute('aria-pressed', 'true');
		await page.waitForFunction(() => (window as any).__usdViewerUiReady);
		const appearance = await mode.evaluate(element => {
			const track = getComputedStyle(element);
			const buttons = [...element.querySelectorAll('button')];
			return {
				border: parseFloat(track.borderTopWidth),
				selected: getComputedStyle(buttons.find(button => button.getAttribute('aria-pressed') === 'true')!).backgroundColor,
				other: getComputedStyle(buttons.find(button => button.getAttribute('aria-pressed') === 'false')!).backgroundColor,
			};
		});
		expect(appearance.border).toBeGreaterThanOrEqual(1);
		expect(appearance.selected).not.toBe(appearance.other);
		for (const width of [1280, 390, 320]) {
			await page.setViewportSize({width, height: 800});
			await openSamples(page);
			const dialog = page.getByRole('dialog', {name: 'Examples', exact: true});
			const geometry = await dialog.evaluate(element => {
				const title = element.querySelector('.usd-examples-dialog-header strong')!.getBoundingClientRect();
				const search = element.querySelector('#examples-search')!.getBoundingClientRect();
				const close = element.querySelector('.usd-tab-close')!.getBoundingClientRect();
				return {gap: search.left-title.right, width: search.width, overlap: search.right-close.left,
					offset: Math.abs((search.top+search.bottom-title.top-title.bottom)/2)};
			});
			expect(geometry.gap).toBeGreaterThanOrEqual(8);
			expect(geometry.width).toBeGreaterThanOrEqual(80);
			expect(geometry.overlap).toBeLessThan(0);
			expect(geometry.offset).toBeLessThanOrEqual(1);
			for (const group of ['needle', 'simready', 'usd-wg', 'gltf', 'gltf-samples']) {
				await expect(page.locator(`[data-sample-group="${group}"] > small`)).toHaveText(/^\d+$/);
			}
			await selectExampleFolder(page, 'needle');
			const count = Number(await page.locator('[data-sample-group="needle"] > small').textContent());
			expect(count).toBe(await page.locator('.gallery-card').count());
			const children = await page.locator('#needle-group-tree .sample-group-button > small').allTextContents();
			expect(children.reduce((sum, value) => sum+Number(value), 0)).toBe(count);
			await page.screenshot({path: info.outputPath(`${theme}-examples-${width}.png`)});
			await page.keyboard.press('Escape');
			await page.screenshot({path: info.outputPath(`${theme}-viewer-${width}.png`)});
		}
	});
}

test('a Khronos model without a USD conversion can be found and opened', async ({page}) => {
	const errors: string[] = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.context().route('**/Models/model-index.json', route => route.fulfill({json: [{
		name: 'Triangle', label: 'Catalog triangle', tags: ['core'], variants: {'glTF': 'Triangle.gltf'},
	}]}));
	await page.goto('/?viewer=three');
	await page.waitForFunction(() => (window as any).__usdViewerUiReady);
	await openSamples(page);
	await expect(page.locator('[data-sample-group="gltf"]')).toContainText('glTF → USD conversions');
	await expect(page.locator('[data-sample-group="gltf-samples"]')).toContainText('glTF Sample Assets');
	await selectExampleFolder(page, 'gltf');
	await expect(page.locator('.gallery-card[data-name="Catalog triangle"]')).toHaveCount(0);
	await selectExampleFolder(page, 'gltf-samples');
	const card = page.locator('.gallery-card[data-name="Catalog triangle"]');
	await expect(card).toBeVisible();
	await expect(card).toHaveAttribute('href', /Triangle%2FglTF%2FTriangle.gltf/);
	await page.getByRole('searchbox', {name: 'Search examples'}).fill('Catalog triangle');
	await expect(page.locator('.gallery-card:visible')).toHaveCount(1);
	await card.click();
	await expect(page.getByRole('dialog', {name: 'Examples', exact: true})).toBeHidden();
	await expect(page.locator('#loading-overlay')).toBeHidden();
	await expect.poll(() => page.evaluate(() => {
		let meshes = 0;
		(window as any).usdRoot?.traverse((object: {isMesh?: boolean}) => { if (object.isMesh) meshes++; });
		return meshes;
	})).toBeGreaterThan(0);
	await expect(page.getByRole('group', {name: 'Workspace mode'}).getByRole('button', {name: 'USD Viewer', exact: true})).toHaveAttribute('aria-pressed', 'true');
	expect(errors).toEqual([]);
});
