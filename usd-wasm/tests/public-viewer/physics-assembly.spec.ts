import {test, expect} from './test';
import {stageReady} from './workbench-menus';

for (const viewer of ['three', 'needle']) test(`${viewer}: hold assembly bases while movable parts simulate`, async ({page}) => {
	const errors: string[] = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.goto(`/?viewer=${viewer}&file=/test-fixtures/physics/floating-assembly.usda`);
	await stageReady(page);
	await page.evaluate(() => (window as any).usdWorkbench.openPanel('simulation'));
	const hold = page.getByRole('checkbox', {name: 'Hold assembly bases'});
	await expect(hold).toBeChecked();
	await page.getByRole('button', {name: 'Simulate', exact: true}).click();
	await expect.poll(() => page.evaluate(() => {
		const simulation = (window as any).usdPhysics?.simulation;
		const base = simulation?.bodies.get('/World/Base')?.body;
		const loose = simulation?.bodies.get('/World/Loose')?.body;
		return !!base && !!loose && Math.abs(base.translation().y - 3) < .01 && loose.translation().y < 2.8;
	})).toBe(true);
	const grab = await page.evaluate(() => {
		const simulation = (window as any).usdPhysics.simulation;
		const base = simulation.beginDrag('/World/Base', {x: 0, y: 3, z: 0});
		const arm = simulation.bodies.get('/World/Arm').body;
		const accepted = simulation.beginDrag('/World/Arm', arm.translation());
		simulation.moveDrag({x: .5, y: 4, z: 0});
		return {base, accepted, dynamic: arm.isDynamic()};
	});
	expect(grab).toEqual({base: false, accepted: true, dynamic: true});
	await expect.poll(() => page.evaluate(() => Math.abs((window as any).usdPhysics.simulation.getJointValue('/World/Hinge')))).toBeGreaterThan(20);
	await page.evaluate(() => (window as any).usdPhysics.simulation.endDrag());
	await hold.uncheck();
	await page.getByRole('button', {name: 'Simulate', exact: true}).click();
	await expect.poll(() => page.evaluate(() => (window as any).usdPhysics?.simulation?.bodies.get('/World/Base')?.body.translation().y ?? 3)).toBeLessThan(2.8);
	expect(errors).toEqual([]);
});

for (const viewer of ['three', 'needle']) test(`${viewer}: SimReady glasses keep their frame mounted during contact simulation`, async ({page}, info) => {
	const errors: string[] = [];
	page.on('pageerror', error => errors.push(error.message));
	const source = 'https://huggingface.co/datasets/nvidia/simready-assets/resolve/4763fbfaa4f8e97658e68b57d01b4c86659e08b5/accessory_eyeglasses_a01/simready_usd/sm_accessory_eyeglasses_a01_01.usd';
	await page.goto(`/?viewer=${viewer}&file=${encodeURIComponent(source)}`);
	await stageReady(page);
	await page.evaluate(() => (window as any).usdWorkbench.openPanel('simulation'));
	await page.getByRole('button', {name: 'Simulate', exact: true}).click();
	await expect.poll(() => page.evaluate(() => !!(window as any).usdPhysics?.simulation)).toBe(true);
	const state = await page.evaluate(async () => {
		const {Vector3} = await import('three');
		const sim = (window as any).usdPhysics.simulation;
		const base = sim.bodies.get('/RootNode/Geometry/base_01_obj_00').body;
		const lens = sim.bodies.get('/RootNode/Geometry/glass_01_obj_00').body;
		const arm = sim.bodies.get('/RootNode/Geometry/arm_01_obj_00').body;
		const origin = {...base.translation()}, lensOffset = {...lens.translation()};
		const held = sim.beginDrag('/RootNode/Geometry/base_01_obj_00', origin);
		const movable = sim.beginDrag('/RootNode/Geometry/arm_01_obj_00', arm.translation());
		sim.endDrag();
		arm.setAngvel(new Vector3(0, 0, 2).applyQuaternion(arm.rotation()), true);
		let drift = 0, separation = 0, angle = 0;
		for (let frame = 0; frame < 120; frame++) {
			await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
			const p = base.translation(), q = lens.translation();
			drift = Math.max(drift, Math.hypot(p.x-origin.x, p.y-origin.y, p.z-origin.z));
			separation = Math.max(separation, Math.hypot(q.x-p.x-(lensOffset.x-origin.x), q.y-p.y-(lensOffset.y-origin.y), q.z-p.z-(lensOffset.z-origin.z)));
			angle = Math.max(angle, Math.abs(sim.getJointValue('/RootNode/Joints/joint_arm_01_joint_00')));
		}
		return {held, movable, drift, separation, unsupported: sim.unsupported,
			angle,
			adapted: sim.backend.adaptations.some((item: any) => item.source === 'sdf' && item.target === 'convex decomposition')};
	});
	expect(state.held).toBe(false);
	expect(state.movable).toBe(true);
	expect(state.drift).toBeLessThan(.001);
	expect(state.separation).toBeLessThan(.001);
	expect(state.angle).toBeGreaterThan(1);
	expect(state.angle).toBeLessThan(92);
	expect(state.unsupported).toEqual([]);
	expect(state.adapted).toBe(true);
	await page.screenshot({path: info.outputPath(`${viewer}-glasses-simulated.png`)});
	expect(errors).toEqual([]);
});
