import {test, expect, type Page} from './test';
import {stageReady} from './workbench-menus';

const glasses = 'https://huggingface.co/datasets/nvidia/simready-assets/resolve/4763fbfaa4f8e97658e68b57d01b4c86659e08b5/accessory_eyeglasses_a01/simready_usd/sm_accessory_eyeglasses_a01_01.usd';

async function load(page: Page, viewer: string) {
	await page.goto(`/?workspace=studio&render=beauty&viewer=${viewer}&file=${encodeURIComponent(glasses)}`);
	await stageReady(page);
	await page.evaluate(() => (window as any).usdHydra.materialsReady());
}

for (const viewer of ['three', 'needle']) {
	test(`${viewer}: joint controls are enabled when Interact becomes active`, async ({page}) => {
		await load(page, viewer);
		await page.evaluate(() => {
			const w = window as any; w.usdWorkbench.openPanel('simulation');
			const controls = document.querySelector('#usd-physics-controls')!;
			const button = [...controls.querySelectorAll('button')].find(button => button.textContent === 'Interact')!;
			const observer = new MutationObserver(() => {
				if (button.getAttribute('aria-pressed') !== 'true') return;
				w.glassesControlReadiness = [...controls.querySelectorAll<HTMLInputElement>('.usd-joint-controls input')].map(input => input.disabled);
				observer.disconnect();
			});
			observer.observe(button, {attributes: true, attributeFilter: ['aria-pressed']});
		});
		await page.getByRole('button', {name: 'Interact', exact: true}).click();
		await expect.poll(() => page.evaluate(() => (window as any).glassesControlReadiness)).toEqual([false, false]);
	});

	test(`${viewer}: textured lenses transmit the scene behind them in Beauty`, async ({page}, info) => {
		const errors: string[] = [];
		page.on('pageerror', error => errors.push(error.message));
		await load(page, viewer);
		const point = await page.evaluate(async () => {
			const w = window as any;
			const {Vector3,Mesh,PlaneGeometry,MeshBasicMaterial,CanvasTexture,DoubleSide} = await import('three');
			const root = w.usdHydra.scene, context = w.needleEngineContext;
			const camera = w.usdRenderCamera || context?.mainCamera || w.camera;
			root.updateWorldMatrix(true, true);
			camera.position.copy(root.localToWorld(new Vector3(.35, .18, .14)));
			const target = root.localToWorld(new Vector3(.04, 0, .025));
			camera.lookAt(target);
			if (context) context.scene.traverse((object: any) => {
				for (const component of object.userData.components || []) if (component.controls?.object === camera) {
					component.controls.target.copy(target); component.controls.update();
				}
			});
			else {w._controls.target.copy(target); w._controls.update();}
			const pattern = document.createElement('canvas'); pattern.width = pattern.height = 128;
			const ctx = pattern.getContext('2d')!;
			for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
				ctx.fillStyle = (x + y) % 2 ? '#ff0055' : '#00c8ff'; ctx.fillRect(x * 16, y * 16, 16, 16);
			}
			const plane = new Mesh(new PlaneGeometry(.18, .24), new MeshBasicMaterial({map: new CanvasTexture(pattern), side: DoubleSide}));
			plane.rotation.y = Math.PI / 2; plane.position.set(-.05, 0, .025); root.add(plane);
			let lens: any;
			root.traverse((object: any) => {
				for (const material of [object.material].flat()) if (material?.userData.usdMdlApproximation === 'OmniGlass') lens = {object, material};
			});
			if (!lens) throw new Error('Glasses have no OmniGlass surface');
			w.glassesLensProbe = lens;
			const canvas = context?.renderer.domElement || w.renderer.domElement;
			canvas.dataset.glassesCapture = '';
			camera.updateMatrixWorld();
			const p = root.localToWorld(new Vector3(.048, .04, .027)).project(camera);
			return {x: (p.x + 1) / 2, y: (1 - p.y) / 2, color: lens.material.color.isColor,
				transmission: lens.material.transmission, opacity: lens.material.opacity};
		});
		expect(point.color).toBe(true);
		expect(point.transmission).toBe(1);
		expect(point.opacity).toBe(1);
		await page.waitForTimeout(700);
		const canvas = page.locator('canvas[data-glasses-capture]');
		const through = await canvas.screenshot({path: info.outputPath(`${viewer}-transmission.png`)});
		await page.evaluate(() => { (window as any).glassesLensProbe.object.visible = false; });
		await page.waitForTimeout(500);
		const reference = await canvas.screenshot();
		const colors = await page.evaluate(async ({images, point}) => {
			const values = [];
			for (const image of images) {
				const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + image)).blob());
				const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d')!;
				ctx.drawImage(bitmap, 0, 0);
				const bytes = ctx.getImageData(Math.round(point.x * bitmap.width) - 3, Math.round(point.y * bitmap.height) - 3, 7, 7).data;
				const color = [0, 0, 0];
				for (let i = 0; i < bytes.length; i += 4) for (let channel = 0; channel < 3; channel++) color[channel] += bytes[i + channel] / 49;
				values.push(color);
			}
			return values;
		}, {images: [through.toString('base64'), reference.toString('base64')], point});
		expect(Math.max(...colors[1]) - Math.min(...colors[1])).toBeGreaterThan(100);
		expect(Math.max(...colors[0]) - Math.min(...colors[0])).toBeGreaterThan(60);
		expect(colors[0].reduce((sum, value, channel) => sum + Math.abs(value - colors[1][channel]), 0)).toBeLessThan(160);
		await page.evaluate(() => { (window as any).glassesLensProbe.object.visible = true; });
		expect(errors).toEqual([]);
	});

	test(`${viewer}: the two thin glasses arms collide without passing through one another`, async ({page}, info) => {
		const errors: string[] = [];
		page.on('pageerror', error => errors.push(error.message));
		await load(page, viewer);
		await page.evaluate(() => (window as any).usdWorkbench.openPanel('simulation'));
		await page.getByRole('button', {name: 'Simulate', exact: true}).click();
		await expect.poll(() => page.evaluate(() => !!(window as any).usdPhysics?.simulation)).toBe(true);
		const state = await page.evaluate(async () => {
			const w = window as any, sim = w.usdPhysics.simulation;
			const {Vector3} = await import('three');
			const engine = w.needleEngineContext?.physics.getOrCreatePhysicsEngine();
			const world = engine?.world || sim.world;
			const arms = [...sim.bodies.values()].filter((record: any) => record.data.path.includes('/arm_')) as any[];
			const colliders = [...sim.colliders.values()].filter((record: any) => record.data.body?.includes('/arm_')) as any[];
			const native = colliders.map(record => engine ? engine.getBody(sim.colliderComponents.get(record.data.path)) : record.collider);
			for (const record of arms) {
				const sign = record.data.path.includes('/arm_01') ? 1 : -1;
				record.body.setAngvel(new Vector3(0, 0, sign * Math.PI).applyQuaternion(record.body.rotation()), true);
			}
			let contacts = 0, deepest = 0, peak = 0;
			for (let frame = 0; frame < 210; frame++) {
				await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
				world.contactPair(native[0], native[1], (manifold: any) => {if (manifold.numContacts()) contacts++;});
				const contact = native[0].contactCollider(native[1], .002);
				if (contact) deepest = Math.min(deepest, contact.distance);
				const angles = ['01', '02'].map(id => Math.abs(sim.getJointValue(`/RootNode/Joints/joint_arm_${id}_joint_00`)));
				peak = Math.max(peak, angles[0] + angles[1]);
			}
			return {contacts, deepest, peak, flags: native.map(collider => collider.shape.flags), unsupported: sim.unsupported};
		});
		await info.attach('arm-contact', {body: JSON.stringify(state), contentType: 'application/json'});
		expect(state.contacts).toBeGreaterThan(0);
		expect(state.deepest).toBeGreaterThan(-.00075);
		expect(state.peak).toBeGreaterThan(50);
		expect(state.peak).toBeLessThan(85);
		expect(state.flags).toEqual([0, 0]);
		expect(state.unsupported).toEqual([]);
		await page.screenshot({path: info.outputPath(`${viewer}-arm-contact.png`)});
		expect(errors).toEqual([]);
	});
}
