import {test, expect} from './test';
import {stageReady} from './workbench-menus';

const injector = 'https://huggingface.co/datasets/nvidia/simready-assets/resolve/4763fbfaa4f8e97658e68b57d01b4c86659e08b5/CT_injection_system_a01/simready_usd/sm_CT_injection_system_a01_01.usd';

for (const viewer of ['three', 'needle']) test(`${viewer}: undriven injector casters keep their clearance and remain stable`, async ({page}, info) => {
	// The complete injector and its referenced materials are large cold-cache inputs.
	test.setTimeout(120_000);
	const errors: string[] = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.goto(`/?viewer=${viewer}&workspace=studio&render=beauty&textures=preview&file=${encodeURIComponent(injector)}`);
	await stageReady(page);
	await page.evaluate(() => (window as any).usdHydra.materialsReady());
	await page.evaluate(() => (window as any).usdWorkbench.openPanel('simulation'));
	await page.getByRole('button', {name: 'Simulate', exact: true}).click();
	await expect.poll(() => page.evaluate(() => !!(window as any).usdPhysics?.simulation?.isPlaying())).toBe(true);
	const state = await page.evaluate(async () => {
		const w = window as any, sim = w.usdPhysics.simulation;
		const {Vector3, Quaternion} = await import('three');
		const {readUsdPhysics} = await import('/usd/physics/readPhysics.js');
		const source = await readUsdPhysics(w.usdHydra, {meshGeometry: false});
		const chassis = sim.bodies.get('/RootNode/Geometry/body_01_obj_00');
		const wheels = [...sim.bodies.values()].filter((record: any) => /\/wheel(?:Base)?_/.test(record.data.path)) as any[];
		const origin = new Vector3().copy(chassis.body.translation());
		let peakAngular = 0, drift = 0, minimumClearance = .02, clearanceQueries = 0, jointError = 0, limitError = 0;
		const engine = w.needleEngineContext?.physics.getOrCreatePhysicsEngine();
		const inverseRotation = sim.root.getWorldQuaternion(new Quaternion()).invert();
		const anchor = (joint: any, end: number) => {
			const body = sim.bodies.get(joint[`body${end}`])?.body;
			const p = new Vector3().copy(body?.translation() || {x: 0, y: 0, z: 0});
			const q = new Quaternion().copy(body?.rotation() || {x: 0, y: 0, z: 0, w: 1});
			if (engine) {sim.root.worldToLocal(p); q.premultiply(inverseRotation);}
			p.add(new Vector3(...(joint[`position${end}`] || [0, 0, 0])).applyQuaternion(q));
			q.multiply(new Quaternion(...(joint[`rotation${end}`] || [0, 0, 0, 1])));
			return {p, q};
		};
		const colliders = [...sim.colliders.values()] as any[];
		const native = (record: any) => engine ? engine.getBody(sim.colliderComponents.get(record.data.path)) : record.collider;
		const bodyCollider = native(colliders.find(record => record.data.body === chassis.data.path));
		for (let frame = 0; frame < 120; frame++) {
			await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
			drift = Math.max(drift, new Vector3().copy(chassis.body.translation()).distanceTo(origin));
			for (const wheel of wheels) peakAngular = Math.max(peakAngular, new Vector3().copy(wheel.body.angvel()).length());
			for (const joint of source.joints) {
				const a = anchor(joint, 0), b = anchor(joint, 1), delta = b.p.sub(a.p);
				if (joint.type === 'prismatic') {
					const axis = new Vector3(...(joint.axis === 'X' ? [1, 0, 0] : joint.axis === 'Y' ? [0, 1, 0] : [0, 0, 1])).applyQuaternion(a.q);
					delta.addScaledVector(axis, -delta.dot(axis));
				}
				jointError = Math.max(jointError, delta.length());
				if (joint.limit?.enabled) {
					const value = sim.getJointValue(joint.path);
					limitError = Math.max(limitError, (joint.limit.lower ?? -Infinity) - value, value - (joint.limit.upper ?? Infinity));
				}
			}
			if (frame === 0) for (const collider of colliders.filter(record => /\/wheel_/.test(record.data.body))) {
				clearanceQueries++;
				const contact = native(collider).contactCollider(bodyCollider, .02);
				if (contact) minimumClearance = Math.min(minimumClearance, contact.distance);
			}
		}
		return {peakAngular, drift, minimumClearance, clearanceQueries, jointError, limitError, held: chassis.data.kinematicBody, wheels: wheels.length,
			dynamic: wheels.every(wheel => wheel.body.isDynamic()), unsupported: sim.unsupported};
	});
	expect(state.wheels).toBe(8);
	expect(state.dynamic).toBe(true);
	expect(state.held).toBe(true);
	expect(state.drift).toBeLessThan(.00001);
	expect(state.peakAngular).toBeLessThan(.1);
	expect(state.clearanceQueries).toBe(4);
	expect(state.minimumClearance).toBeGreaterThan(-.001);
	expect(state.jointError).toBeLessThan(.001);
	expect(state.limitError).toBeLessThan(.001);
	expect(state.unsupported).toEqual([]);
	await page.screenshot({path: info.outputPath(`${viewer}-stable-casters.png`)});
	expect(errors).toEqual([]);
});
