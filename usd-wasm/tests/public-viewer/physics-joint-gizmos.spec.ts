import {test, expect} from './test';
import {openAppMenu, stageReady} from './workbench-menus';

const glasses = 'https://huggingface.co/datasets/nvidia/simready-assets/resolve/4763fbfaa4f8e97658e68b57d01b4c86659e08b5/misc_eyeGlasses_b01/simready_usd/sm_misc_eyeGlasses_b01_01.usd';
const hinge = '/RootNode/Joints/joint_leftHinge_01_joint_00';

for (const viewer of ['three', 'needle']) test(`${viewer}: glasses with a misaligned lens weld remain draggable and show live simulation joints`, async ({page}, info) => {
    const errors: string[] = [], rapier: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {if (/\/rapier\//.test(request.url())) rapier.push(request.url());});
    await page.goto(`/?viewer=${viewer}&workspace=studio&render=beauty&file=${encodeURIComponent(glasses)}`);
    await stageReady(page);
    await page.evaluate(() => (window as any).usdHydra.materialsReady());
    await page.evaluate(() => (window as any).usdWorkbench.openPanel('simulation'));
    await page.locator('#usd-physics-controls').getByRole('button', {name: 'Interact', exact: true}).click();
    await expect(page.locator('#usd-physics-controls').getByRole('button', {name: 'Interact', exact: true})).toHaveAttribute('aria-pressed', 'true');
    const warning = page.locator('#usd-physics-controls [data-warning]');
    await expect(warning).toHaveAttribute('title', /joint_lenses.*preserves its rest offset/);
    const slider = page.getByRole('slider', {name: `Joint ${hinge}`, exact: true});
    await expect(slider).toBeEnabled();
    const point = await page.evaluate(async () => {
        const w = window as any, sim = w.usdPhysics.simulation;
        const {Matrix4, Vector3, Vector2, Raycaster} = await import('three');
        const arm = '/RootNode/Geometry/leftHinge_01_obj_00';
        let object: any;
        sim.root.traverseVisible((o: any) => {if (o.isMesh && sim.bodyForObject(o, 0)?.data.path === arm) object = o;});
        if (!object) throw new Error('No movable glasses arm');
        const instance = new Matrix4(); if (object.isInstancedMesh) object.getMatrixAt(0, instance);
        sim.root.updateWorldMatrix(true, true);
        const context = w.needleEngineContext, camera = w.usdRenderCamera || context?.mainCamera || w.camera;
        const canvas = context?.renderer.domElement || w.renderer.domElement, rect = canvas.getBoundingClientRect();
        canvas.dataset.jointDragProbe = '';
        const ray = new Raycaster(), position = object.geometry.attributes.position, index = object.geometry.index;
        const candidates: any[] = []; sim.root.traverseVisible((o: any) => {if (o.isMesh && !o.userData.usdHelperFor) candidates.push(o);});
        const count = index?.count || position.count, step = Math.max(1, Math.floor(count / 300)) * 3;
        const pivot = new Vector3().copy(sim.bodies.get(arm).body.translation());
        let best: any, lever = 0;
        for (let triangle = 0; triangle + 2 < count; triangle += step) {
            const p = new Vector3();
            for (let vertex = 0; vertex < 3; vertex++) p.add(new Vector3().fromBufferAttribute(position, index ? index.getX(triangle + vertex) : triangle + vertex));
            p.multiplyScalar(1 / 3).applyMatrix4(instance).applyMatrix4(object.matrixWorld).project(camera);
            if (Math.abs(p.x) > .95 || Math.abs(p.y) > .95) continue;
            ray.setFromCamera(new Vector2(p.x, p.y), camera);
            const hit = ray.intersectObjects(candidates, false)[0]; if (hit?.object !== object) continue;
            const local = sim.root.worldToLocal(hit.point.clone()), radius = local.clone().sub(pivot).length();
            if (radius <= lever) continue; lever = radius;
            const target = sim.root.localToWorld(local.sub(pivot).applyAxisAngle(new Vector3(0, 0, 1), Math.PI / 3).add(pivot)).project(camera);
            best = {x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2,
                endX: rect.left + (target.x + 1) * rect.width / 2, endY: rect.top + (1 - target.y) * rect.height / 2};
        }
        if (!best) throw new Error('No unobstructed triangle on the glasses arm');
        return best;
    });
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    await expect(page.locator('canvas[data-joint-drag-probe]')).toHaveCSS('cursor', 'grabbing');
    await page.mouse.move(point.endX, point.endY, {steps: 20}); await page.mouse.up();
    await expect.poll(() => page.evaluate(hinge => (window as any).usdPhysics.simulation.getJointValue(hinge), hinge)).toBeGreaterThan(10);
    const lens = await page.evaluate(() => ({...(window as any).usdPhysics.simulation.bodies.get('/RootNode/Geometry/lenses_01_obj_00').body.translation()}));
    expect(lens.z).toBeCloseTo(-.000602543354, 7);
    expect(rapier).toEqual([]);
    await page.screenshot({path: info.outputPath(`${viewer}-interact.png`)});

    await page.getByRole('button', {name: 'Simulate', exact: true}).click();
    await expect.poll(() => page.evaluate(() => ((window as any).usdPhysics.simulation?.colliders?.size || 0))).toBeGreaterThan(0);
    const toggle = page.getByRole('checkbox', {name: 'Joints', exact: true});
    await toggle.check();
    const helpers = () => page.evaluate(() => {
        const objects: any[] = [];
        (window as any).usdHydra.scene.traverse((o: any) => {if (o.userData.usdJointPath) objects.push({visible: o.visible, points: o.geometry.attributes.position.count, key: o.userData.geometryKey});});
        return objects;
    });
    await expect.poll(async () => (await helpers()).filter(o => o.visible && o.points > 0).length).toBe(3);
    const before = (await helpers()).map(o => o.key);
    await page.evaluate(async () => {
        const {Vector3} = await import('three'), sim = (window as any).usdPhysics.simulation;
        const body = sim.bodies.get('/RootNode/Geometry/leftHinge_01_obj_00').body;
        body.setAngvel(new Vector3(0, 0, 2).applyQuaternion(body.rotation()), true);
    });
    await expect.poll(async () => (await helpers()).map(o => o.key)).not.toEqual(before);
    await page.screenshot({path: info.outputPath(`${viewer}-simulate-joints.png`)});
    await toggle.uncheck();
    await expect.poll(async () => (await helpers()).some(o => o.visible)).toBe(false);
    await openAppMenu(page, 'view');
    await page.locator('[data-usd-menu=view] .usd-settings-section').filter({hasText: 'Helpers'}).locator('summary').click();
    // The View menu and Simulation panel share one visibility preference.
    await expect(page.getByRole('checkbox', {name: 'Show joint constraints', exact: true})).not.toBeChecked();
    await page.getByRole('checkbox', {name: 'Show joint constraints', exact: true}).check();
    await expect(toggle).toBeChecked();
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await helpers()).every(o => o.visible)).toBe(true);
    await page.getByRole('button', {name: 'Reset', exact: true}).click();
    await expect.poll(helpers).toEqual([]);
    expect(errors).toEqual([]);
});
