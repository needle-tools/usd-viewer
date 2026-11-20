import {test, expect} from './test';
import {stageReady} from './workbench-menus';

const airFilter = 'https://huggingface.co/datasets/nvidia/simready-assets/resolve/4763fbfaa4f8e97658e68b57d01b4c86659e08b5/airSystem_air_filter_box_a01/simready_usd/sm_airSystem_air_filter_box_a01_01.usd';

for (const viewer of ['three', 'needle']) test(`${viewer}: isolated air filter stays held and displays source and solver colliders`, async ({page}, info) => {
	const errors: string[] = [], physicsRequests: string[] = [];
	page.on('pageerror', error => errors.push(error.message));
	page.on('request', request => {if (/rapier.*\.(?:wasm|mjs)/.test(request.url())) physicsRequests.push(request.url());});
	await page.goto(`/?viewer=${viewer}&workspace=studio&render=beauty&textures=preview&file=${encodeURIComponent(airFilter)}`);
	await stageReady(page);
	await page.evaluate(() => (window as any).usdHydra.materialsReady());
	await page.evaluate(() => (window as any).usdWorkbench.openPanel('simulation'));
	await expect(page.getByText('Drag a movable part.', {exact: false})).toHaveCount(0);
	await expect(page.getByRole('button', {name: 'Interact', exact: true})).toBeDisabled();
	const hold = page.getByRole('checkbox', {name: 'Hold assembly bases'});
	await expect(hold).toBeChecked();
	const toggle = page.getByRole('checkbox', {name: 'Colliders', exact: true});
	await toggle.check();
	const count = () => page.evaluate(() => {
		let count = 0;
		const root = (window as any).usdHydra.scene.getObjectByName('Collision geometry')
			|| (window as any).needleEngineContext?.scene.getObjectByName('Collision geometry');
		root?.traverse((object: any) => {if (object.isMesh) count++;});
		return count;
	});
	await expect.poll(count).toBe(1);
	expect(physicsRequests).toEqual([]);
	await page.screenshot({path: info.outputPath(`${viewer}-source-colliders.png`)});
	await page.getByRole('button', {name: 'Simulate', exact: true}).click();
	await expect.poll(count).toBeGreaterThan(1);
	const state = await page.evaluate(async () => {
		const sim = (window as any).usdPhysics.simulation, record = [...sim.bodies.values()][0] as any;
		const origin = {...record.body.translation()};
		let drift = 0;
		for (let frame = 0; frame < 45; frame++) {
			await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
			const p = record.body.translation();
			drift = Math.max(drift, Math.hypot(p.x - origin.x, p.y - origin.y, p.z - origin.z));
		}
		return {drift, dynamic: record.body.isDynamic(), kinematic: record.data.kinematicBody};
	});
	expect(state).toEqual({drift: 0, dynamic: false, kinematic: true});
	await page.screenshot({path: info.outputPath(`${viewer}-solver-colliders.png`)});
	await toggle.uncheck();
	await expect.poll(count).toBe(0);
	await hold.uncheck();
	await page.getByRole('button', {name: 'Simulate', exact: true}).click();
	await expect.poll(() => page.evaluate(() => {
		const sim = (window as any).usdPhysics?.simulation;
		const record = sim && [...sim.bodies.values()][0] as any;
		return record ? Math.hypot(...Object.values(record.body.translation()) as number[]) : 0;
	})).toBeGreaterThan(.01);
	expect(errors).toEqual([]);
});

test('physics warnings use an icon with diagnostic details in its tooltip', async ({page}) => {
	await page.goto('/?viewer=three&workspace=studio&file=/test-fixtures/coverage/advanced/physics-mass.usda');
	await stageReady(page);
	await page.evaluate(async () => {
		const w = window as any;
		w.usdPhysics.dispose();
		const {setupViewerPhysics} = await import('/viewer-physics.js');
		w.usdPhysics = await setupViewerPhysics(w.usdHydra, null, w.camera, w._controls, () => true, {
			createSimulation() {
				let playing = false;
				return {unsupported: [{path: '/Fixture/Joint', reason: 'Fixture diagnostic detail'}],
					play() {playing = true;}, pause() {playing = false;}, isPlaying: () => playing, update() {}, dispose() {}};
			},
		});
		w.usdWorkbench.openPanel('simulation');
	});
	await page.getByRole('button', {name: 'Simulate', exact: true}).click();
	const warning = page.locator('#usd-physics-controls [data-warning]');
	await expect(warning.locator('svg[data-icon="warning"]')).toHaveCount(1);
	await expect(warning).toHaveText('');
	await expect(warning).toHaveAttribute('title', '/Fixture/Joint: Fixture diagnostic detail');
	await expect(warning).toHaveAttribute('tabindex', '0');
	await page.getByRole('button', {name: 'Reset', exact: true}).click();
	await expect(warning).toHaveCount(0);
});
