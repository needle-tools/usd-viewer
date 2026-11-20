import {test, expect, type Page} from './test';
import {stageReady} from './workbench-menus';

const glasses = 'https://huggingface.co/datasets/nvidia/simready-assets/resolve/4763fbfaa4f8e97658e68b57d01b4c86659e08b5/accessory_eyeglasses_a01/simready_usd/sm_accessory_eyeglasses_a01_01.usd';
const armPath = '/RootNode/Geometry/arm_01_obj_00';
const jointPath = '/RootNode/Joints/joint_arm_01_joint_00';

async function simulate(page: Page, viewer: string, file: string) {
	await page.goto(`/?workspace=studio&viewer=${viewer}&render=beauty&file=${encodeURIComponent(file)}`);
	await stageReady(page);
	await page.evaluate(() => (window as any).usdWorkbench.openPanel('simulation'));
	await page.getByRole('button', {name: 'Simulate', exact: true}).click();
	await expect.poll(() => page.evaluate(() => !!(window as any).usdPhysics?.simulation)).toBe(true);
}

for (const viewer of ['three', 'needle']) {
	test(`${viewer}: authored damping and viewer defaults reach the running bodies`, async ({page}) => {
		await simulate(page, viewer, '/test-fixtures/physics/body-damping.usda');
		const rates = await page.evaluate(() => [...(window as any).usdPhysics.simulation.bodies].map(([path, record]: any) =>
			[path, record.body.linearDamping(), record.body.angularDamping()]));
		expect(rates).toEqual([['/World/Default', 0, 1], ['/World/Zero', 0, 0], ['/World/Damped', .5, 2]]);
		const speeds = await page.evaluate(async () => {
			const bodies = [...(window as any).usdPhysics.simulation.bodies.values()] as any[];
			for (const {body} of bodies) body.setAngvel({x: 0, y: 1, z: 0}, true);
			for (let frame = 0; frame < 45; frame++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
			return bodies.map(({body}) => body.angvel().y);
		});
		expect(speeds[1]).toBeCloseTo(1, 2);
		expect(speeds[0]).toBeLessThan(speeds[1] * .9);
		expect(speeds[2]).toBeLessThan(speeds[0] * .9);
	});

	test(`${viewer}: dragging the visible glasses arm settles without oscillation or a release kick`, async ({page}, info) => {
		const errors: string[] = [];
		page.on('pageerror', error => errors.push(error.message));
		await simulate(page, viewer, glasses);
		const gesture = await page.evaluate(async path => {
			const w = window as any, sim = w.usdPhysics.simulation;
			const {Matrix4, Vector3, Vector2, Quaternion, Raycaster} = await import('three');
			const camera = w.usdRenderCamera || w.needleEngineContext?.mainCamera || w.camera;
			const canvas = w.needleEngineContext?.renderer.domElement || w.renderer.domElement;
			const rect = canvas.getBoundingClientRect();
			const candidates: any[] = [];
			sim.root.updateWorldMatrix(true, true);
			sim.root.traverseVisible((object: any) => { if (object.isMesh && !object.userData.usdHelperFor) candidates.push(object); });
			const body = sim.bodies.get(path).body;
			const hinge = new Vector3().copy(body.translation());
			const orientation = new Quaternion().copy(body.rotation());
			if (!sim.rigidbodies) {
				sim.root.localToWorld(hinge);
				orientation.premultiply(sim.root.getWorldQuaternion(new Quaternion()));
			}
			const axis = new Vector3(0, 0, 1).applyQuaternion(orientation);
			const ray = new Raycaster();
			let best: any, lever = 0;
			for (const object of candidates) for (let instance = 0; instance < (object.isInstancedMesh ? object.count : 1); instance++) {
				if (sim.bodyForObject(object, instance)?.data.path !== path) continue;
				const matrix = new Matrix4();
				if (object.isInstancedMesh) object.getMatrixAt(instance, matrix);
				matrix.premultiply(object.matrixWorld);
				const {position} = object.geometry.attributes, index = object.geometry.index;
				const count = index?.count || position.count, stride = Math.max(1, Math.floor(count / 600)) * 3;
				for (let triangle = 0; triangle + 2 < count; triangle += stride) {
					const point = new Vector3();
					for (let v = 0; v < 3; v++) point.add(new Vector3().fromBufferAttribute(position, index ? index.getX(triangle + v) : triangle + v));
					point.multiplyScalar(1 / 3).applyMatrix4(matrix).project(camera);
					if (Math.abs(point.x) > .95 || Math.abs(point.y) > .95) continue;
					ray.setFromCamera(new Vector2(point.x, point.y), camera);
					const hit = ray.intersectObjects(candidates, false)[0];
					if (hit?.object !== object || object.isInstancedMesh && hit.instanceId !== instance) continue;
					const radius = hit.point.distanceTo(hinge);
					if (radius <= lever) continue;
					lever = radius;
					const target = hit.point.clone().sub(hinge).applyAxisAngle(axis, Math.PI / 4).add(hinge).project(camera);
					best = {x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2,
						x2: rect.left + (target.x + 1) * rect.width / 2, y2: rect.top + (1 - target.y) * rect.height / 2};
				}
			}
			if (!best) throw new Error('No visible surface on the movable glasses arm');
			return best;
		}, armPath);
		await page.mouse.move(gesture.x, gesture.y);
		await page.mouse.down();
		await expect.poll(() => page.evaluate(() => {
			const w = window as any;
			return (w.needleEngineContext?.renderer.domElement || w.renderer.domElement).style.cursor;
		})).toBe('grabbing');
		await page.mouse.move(gesture.x2, gesture.y2, {steps: 12});
		const held = await page.evaluate(async ({armPath, jointPath}) => {
			const sim = (window as any).usdPhysics.simulation, body = sim.bodies.get(armPath).body;
			const angles: number[] = [];
			for (let frame = 0; frame < 150; frame++) {
				await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
				if (frame >= 120) angles.push(sim.getJointValue(jointPath));
			}
			return {range: Math.max(...angles) - Math.min(...angles), angle: angles.at(-1), speed: Math.hypot(...Object.values(body.angvel()) as number[])};
		}, {armPath, jointPath});
		await info.attach('held-drag', {body: JSON.stringify(held), contentType: 'application/json'});
		expect(held.angle).toBeGreaterThan(5);
		expect(held.angle).toBeLessThan(91);
		expect(held.range).toBeLessThan(1);
		expect(held.speed).toBeLessThan(.1);
		await page.mouse.up();
		const released = await page.evaluate(path => {
			const body = (window as any).usdPhysics.simulation.bodies.get(path).body;
			return {linear: body.linearDamping(), angular: body.angularDamping(), speed: Math.hypot(...Object.values(body.angvel()) as number[])};
		}, armPath);
		expect(released.linear).toBe(0);
		expect(released.angular).toBe(1);
		expect(released.speed).toBeLessThan(.2);
		await page.screenshot({path: info.outputPath(`${viewer}-glasses-drag.png`)});
		expect(errors).toEqual([]);
	});
}
