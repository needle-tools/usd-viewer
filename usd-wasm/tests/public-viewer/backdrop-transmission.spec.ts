import {expect, screenshotPixel, test} from './test';
import {openSettings, stageReady} from './workbench-menus';

for (const [viewer, render] of [['three', 'basic'], ['three', 'beauty'], ['needle', 'basic']]) {
	test(`${viewer} ${render} transmits and tints the flat viewer backdrop`, async ({page}) => {
		const errors: string[] = [];
		page.on('pageerror', error => errors.push(error.message));
		await page.goto(`/?viewer=${viewer}&render=${render}&background=light&file=/test-fixtures/coverage/lighting-mdl/studio-variants.usda`);
		await stageReady(page);
		await page.evaluate(async () => {
			const w = window as any;
			const {AmbientLight, BoxGeometry, Mesh, MeshPhysicalMaterial, PerspectiveCamera} = await import('three');
			const context = w.needleEngineContext;
			const scene = context?.scene || w.scene;
			await w.usdHydra.materialsReady();
			w.usdHydra.setPlaying(false);
			scene.environment = null;
			for (const object of scene.children) object.visible = false;

			const glass = new Mesh(new BoxGeometry(1.5, 1.5, 0.2), new MeshPhysicalMaterial({
				color: 0x006aff, transmission: 1, thickness: 0.2, roughness: 0, specularIntensity: 0,
			}));
			scene.add(glass, new AmbientLight(0xffffff, 0.001));
			const camera = context?.mainCamera || new PerspectiveCamera(45, w.camera.aspect);
			camera.position.set(0, 0, 4);
			camera.lookAt(0, 0, 0);
			if (!context) w.usdRenderCamera = camera;
			else scene.traverse((object: any) => {
				for (const component of object.userData.components || []) if (component.controls?.object === camera) {
					component.controls.target.set(0, 0, 0);
					component.controls.update();
				}
			});
			(context?.renderer || w.renderer).domElement.dataset.transmissionCapture = '';
		});

		await openSettings(page);
		await page.getByRole('combobox', {name: 'Tone mapping', exact: true}).selectOption('none');
		await page.keyboard.press('Escape');
		const canvas = page.locator('canvas[data-transmission-capture]');
		const backdrop = () => screenshotPixel(canvas, [5, 5]);
		const throughGlass = () => screenshotPixel(canvas, 'center');
		await expect.poll(backdrop).toEqual([255, 255, 255, 255]);
		await expect.poll(async () => (await throughGlass())[2]).toBeGreaterThan(200);
		await expect.poll(async () => {
			const [red, , blue] = await throughGlass();
			return blue - red;
		}).toBeGreaterThan(50);

		await openSettings(page);
		await page.getByRole('combobox', {name: 'Background', exact: true}).selectOption('dark');
		await page.keyboard.press('Escape');
		await expect.poll(backdrop).toEqual([23, 26, 24, 255]);
		await expect.poll(async () => (await throughGlass())[2]).toBeLessThan(60);
		expect(errors).toEqual([]);
	});
}
