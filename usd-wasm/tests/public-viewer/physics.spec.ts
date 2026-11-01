import {clearStage,openAppMenu,stageReady} from './workbench-menus';
import { expect, test } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.fulfill({ contentType: 'text/css', body: '' }));
});

for(const dynamic of [false,true])test(`collider extraction waits for simulation (${dynamic?'dynamic':'static'} scene)`,async({page})=>{
  const file=dynamic?'coverage/advanced/physics-mass.usda':'coverage/core/analytic-primitives.usda';
  await page.goto('/?viewer=three&physics=off&assetCache=0&file='+encodeURIComponent('/test-fixtures/'+file));
  await stageReady(page);
  await page.evaluate(async()=>{
    const w=window as any,h=w.usdHydra,url=new URL(location.href);url.searchParams.delete('physics');history.replaceState({},'',url);
    w.physicsExtractions=0;
    const original=h.driver.GetPhysicsSceneJson.bind(h.driver);
    h.driver.GetPhysicsSceneJson=()=>{w.physicsExtractions++;return original();};
    const {setupViewerPhysics}=await import('/viewer-physics.js');
    w.testPhysics=await setupViewerPhysics(h,null,w.camera,w._controls,()=>true,{createSimulation:async({snapshot}:any)=>{
      w.physicsShapes=snapshot.shapes.length;let playing=false;
      return {isPlaying:()=>playing,play(){playing=true;},pause(){playing=false;},dispose(){}};
    }});
    w.usdWorkbench.openPanel('simulation');
  });
  expect(await page.evaluate(()=>(window as any).physicsExtractions)).toBe(0);
  if(dynamic){
    await expect(page.getByRole('button',{name:'Interact',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:'Simulate',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>(window as any).physicsExtractions)).toBe(1);
    await expect.poll(()=>page.evaluate(()=>(window as any).physicsShapes)).toBeGreaterThan(0);
    await page.evaluate(()=>(window as any).testPhysics.dispose());
  }else await expect(page.locator('#usd-physics-controls')).toBeHidden();
});

for (const viewer of ['three', 'needle']) {
  test(`${viewer}: authored USD bodies simulate, drag, pause and reset`, async ({ page }) => {
    const errors: string[] = [];
    const initializationWarnings: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (/deprecated parameters.*initialization/i.test(message.text())) initializationWarnings.push(message.text());
    });
    await page.goto(`/?viewer=${viewer}&file=/test-fixtures/coverage/advanced/physics-mass.usda`);
    const simulate = page.getByRole('button', { name: 'Simulate', exact: true });
    await openAppMenu(page,'window');await page.getByRole('checkbox',{name:'Show Simulation',exact:true}).check();
    await expect(simulate).toBeVisible();
    await simulate.click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    if (viewer === 'needle') expect(await page.evaluate(async () => {
      const engine = await import('@needle-tools/engine');
      return (window as any).usdPhysics.simulation.world instanceof engine.NEEDLE_ENGINE_MODULES.RAPIER_PHYSICS.MODULE.World;
    })).toBe(true);
    await page.screenshot({ path: `.cache/coverage-validation/physics-${viewer}.png` });
    await expect.poll(() => page.evaluate(() => {
      const simulation = (window as any).usdPhysics?.simulation;
      const body = simulation?.bodies.get('/World/BodyA');
      return body ? body.body.translation().y < body.data.position[1] - .1 : false;
    })).toBe(true);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const resting = await page.evaluate(() => (window as any).usdPhysics.simulation.bodies.get('/World/BodyA').body.translation().y);
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => (window as any).usdPhysics.simulation.bodies.get('/World/BodyA').body.translation().y)).toBe(resting);
    await simulate.click();
    const point = await page.evaluate(() => {
      const simulation = (window as any).usdPhysics.simulation;
      const camera = (window as any).needleEngineContext?.mainCamera || (window as any).camera;
      const canvas = (window as any).needleEngineContext?.renderer.domElement || (window as any).renderer.domElement;
      const body = simulation.bodies.get('/World/BodyA').body;
      const position = simulation.root.position.clone().copy(body.translation());
      simulation.root.localToWorld(position); position.project(camera);
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + (position.x + 1) * rect.width / 2, y: rect.top + (1 - position.y) * rect.height / 2 };
    });
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    await expect.poll(() => page.evaluate(() => (window as any).usdPhysics.simulation.world.impulseJoints.len())).toBe(1);
    await page.mouse.move(point.x + 100, point.y - 100, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => (window as any).usdPhysics.simulation.world.impulseJoints.len())).toBe(0);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(simulate).toBeVisible();
    expect(await page.evaluate(() => (window as any).usdPhysics.simulation)).toBeNull();
    await clearStage(page);
    await expect(page.locator('#usd-physics-controls')).toBeHidden();
    expect(await page.evaluate(() => (window as any).usdPhysics)).toBeUndefined();
    expect(errors).toEqual([]);
    expect(initializationWarnings).toEqual([]);
  });
}

test('physics runtime is downloaded only when simulation starts', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/rapier/')) requests.push(request.url()); });
  await page.goto('/?viewer=three&file=/test-fixtures/coverage/core/subdivision-catmullclark.usda');
  await page.waitForFunction(() => !!(window as any).usdHydra);
  await expect(page.locator('#usd-physics-controls')).toBeHidden();
  expect(requests).toEqual([]);
  await page.goto('/?viewer=three&file=/test-fixtures/coverage/advanced/physics-dominoes.usda');
  await openAppMenu(page,'window');await page.getByRole('checkbox',{name:'Show Simulation',exact:true}).check();
  await expect(page.getByRole('button', { name: 'Simulate', exact: true })).toBeVisible();
  expect(requests).toEqual([]);
  await page.getByRole('button', { name: 'Simulate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  expect(requests.length).toBe(1);
});

for (const viewer of ['three', 'needle']) {
  test(`${viewer}: physics can be disabled without downloading or initializing a runtime`, async ({ page }) => {
    const physicsRequests: string[] = [];
    page.on('request', request => { if (/rapier/i.test(request.url())) physicsRequests.push(request.url()); });
    await page.goto(`/?viewer=${viewer}&physics=off&file=/test-fixtures/coverage/advanced/physics-dominoes.usda`);
    await page.waitForFunction(() => !!(window as any).usdHydra);
    await expect(page.locator('#usd-physics-controls')).toBeHidden();
    expect(physicsRequests).toEqual([]);
    expect(await page.evaluate(() => (window as any).usdPhysics)).toBeFalsy();
  });
}

test('host configuration can disable physics without a URL parameter', async ({ page }) => {
  await page.addInitScript(() => { (window as any).usdViewerOptions = { physics: false }; });
  const physicsRequests: string[] = [];
  page.on('request', request => { if (/rapier/i.test(request.url())) physicsRequests.push(request.url()); });
  await page.goto('/?viewer=three&file=/test-fixtures/coverage/advanced/physics-dominoes.usda');
  await page.waitForFunction(() => !!(window as any).usdHydra);
  await expect(page.locator('#usd-physics-controls')).toBeHidden(); expect(physicsRequests).toEqual([]);
});

test('selecting a joint or movable body offers Interact without opening Simulation first',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?workspace=studio&viewer=three&render=basic&file=/test-fixtures/coverage/advanced/physics-prismatic-joint.usda');await stageReady(page);
  const joint=await page.evaluate(async()=>{
    const w=window as any,{inspectUsdPhysics}=await import('/usd/physics/createPhysics.js'),overview=await inspectUsdPhysics(w.usdHydra);
    w.usdStagePanel.selectPrim(overview.joints[0]);return overview.joints[0];
  });
  expect(joint).toBeTruthy();
  const shortcut=page.locator('.usd-physics-shortcut').getByRole('button',{name:'Interact',exact:true});
  await expect(shortcut).toBeVisible();await shortcut.click();
  await expect(page.locator('#usd-physics-controls').getByRole('button',{name:'Interact',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect.poll(()=>page.evaluate(()=>(window as any).usdPhysics?.simulation?.joints.size)).toBeGreaterThan(0);
  // Repeated use of the shortcut must not pause an already active interaction.
  await page.evaluate(()=>(window as any).usdStagePanel.selectPrim('/World/BodyB/Visual'));
  await shortcut.click();expect(await page.evaluate(()=>(window as any).usdPhysics.simulation.isPlaying())).toBe(true);
  await page.evaluate(()=>(window as any).usdStagePanel.selectPrim('/World/Floor'));
  await expect(shortcut).toBeHidden();
  await clearStage(page);await expect(page.locator('.usd-physics-shortcut')).toBeHidden();
  expect(errors).toEqual([]);
});

for(const viewer of ['three','needle'])test(`${viewer}: Interact uses kinematics without Rapier and exposes joint axes and limits in View helpers`,async({page})=>{
 const rapier:string[]=[],errors:string[]=[];page.on('request',r=>{if(r.url().includes('/rapier/'))rapier.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`/?workspace=studio&viewer=${viewer}&render=beauty&file=/test-fixtures/coverage/advanced/physics-prismatic-joint.usda`);await stageReady(page);
 await page.evaluate(()=>(window as any).usdWorkbench.openPanel('simulation'));
 await page.locator('#usd-physics-controls').getByRole('button',{name:'Interact',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).usdPhysics?.simulation?.mode)).toBe('interaction');
 const helpers=()=>page.evaluate(()=>{const values:any[]=[];(window as any).usdHydra.scene.traverse((o:any)=>{if(o.userData.usdJointPath)values.push({visible:o.visible,points:o.geometry.attributes.position.count,excluded:o.userData.usdExcludeFromBounds});});return values;});
 await expect.poll(helpers).toEqual([{visible:true,points:20,excluded:true}]);
 await openAppMenu(page,'view');const details=page.locator('[data-usd-menu=view] .usd-settings-section').filter({hasText:'Helpers'});await details.locator('summary').click();
 await page.getByRole('checkbox',{name:'Show joint constraints',exact:true}).uncheck();await expect.poll(async()=>(await helpers())[0].visible).toBe(false);
 await page.getByRole('checkbox',{name:'Show joint constraints',exact:true}).check();await expect.poll(async()=>(await helpers())[0].visible).toBe(true);
 await page.keyboard.press('Escape');
 await page.evaluate(()=>{const sim=(window as any).usdPhysics.simulation;sim.setJointValue([...sim.joints.keys()][0],.25);});
 await page.locator('#usd-physics-controls').getByRole('button',{name:'Reset',exact:true}).click();
 await expect.poll(helpers).toEqual([]);expect(rapier).toEqual([]);expect(errors).toEqual([]);
});
