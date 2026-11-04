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
    for(const method of ['GetPhysicsSceneJson','GetPhysicsSceneMetadataJson'])if(h.driver[method]){
      const original=h.driver[method].bind(h.driver);
      h.driver[method]=()=>{w.physicsExtractions++;return original();};
    }
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
  test(`${viewer}: authored USD bodies simulate, drag, stop and reset`, async ({ page }) => {
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
    await expect(page.getByRole('button', { name: viewer === 'needle' ? 'Stop' : 'Pause', exact: true })).toBeVisible();
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
    if (viewer === 'needle') {
      await page.getByRole('button', { name: 'Stop', exact: true }).click();
      expect(await page.evaluate(() => (window as any).usdPhysics.simulation)).toBeNull();
    } else {
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      const resting = await page.evaluate(() => (window as any).usdPhysics.simulation.bodies.get('/World/BodyA').body.translation().y);
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => (window as any).usdPhysics.simulation.bodies.get('/World/BodyA').body.translation().y)).toBe(resting);
    }
    await simulate.click();
    await expect(page.getByRole('button', { name: viewer === 'needle' ? 'Stop' : 'Pause', exact: true })).toBeVisible();
    const point = await page.evaluate(() => {
      const simulation = (window as any).usdPhysics.simulation;
      const camera = (window as any).needleEngineContext?.mainCamera || (window as any).camera;
      const canvas = (window as any).needleEngineContext?.renderer.domElement || (window as any).renderer.domElement;
      const body = simulation.bodies.get('/World/BodyA').body;
      const position = simulation.root.position.clone().copy(body.translation());
      if (!(window as any).needleEngineContext) simulation.root.localToWorld(position);
      position.project(camera);
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
 await expect.poll(helpers).toEqual([{visible:false,points:0,excluded:true}]);
 await openAppMenu(page,'view');const details=page.locator('[data-usd-menu=view] .usd-settings-section').filter({hasText:'Helpers'});await details.locator('summary').click();
 await page.getByRole('checkbox',{name:'Show joint constraints',exact:true}).check();
 await expect.poll(helpers).toEqual([{visible:true,points:20,excluded:true}]);
 await page.getByRole('checkbox',{name:'Show joint constraints',exact:true}).uncheck();await expect.poll(async()=>(await helpers())[0].visible).toBe(false);
 await page.getByRole('checkbox',{name:'Show joint constraints',exact:true}).check();await expect.poll(async()=>(await helpers())[0].visible).toBe(true);
 await page.keyboard.press('Escape');
 await page.evaluate(()=>{const sim=(window as any).usdPhysics.simulation;sim.setJointValue([...sim.joints.keys()][0],.25);});
 await page.locator('#usd-physics-controls').getByRole('button',{name:'Reset',exact:true}).click();
 await expect.poll(helpers).toEqual([]);expect(rapier).toEqual([]);expect(errors).toEqual([]);
});

for(const existing of [false,true])test(`viewer joins the actual ${existing?'existing':'lazy'} Engine world and stops only its own asset`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/?viewer=needle&physics=off&assetCache=0&file=/test-fixtures/coverage/advanced/physics-mass.usda');await stageReady(page);
 await page.evaluate(async existing=>{
  const w=window as any,h=w.usdHydra,context=w.needleEngineContext,url=new URL(location.href);url.searchParams.delete('physics');history.replaceState({},'',url);
  const {NEEDLE_ENGINE_MODULES}=await import('@needle-tools/engine');
  const engine=context.physics.getOrCreatePhysicsEngine();
  if(!engine||engine.world)throw new Error('Expected the real, uninitialized Engine backend.');
  let world:any,ground:any,initializations=0,activeExtensions=0,steps=0;
  const initialize=engine.initialize.bind(engine),register=engine.registerWorldExtension.bind(engine);
  engine.initialize=async()=>{
   const result=await initialize();
   if(!world){
    initializations++;world=engine.world;
    const R=NEEDLE_ENGINE_MODULES.RAPIER_PHYSICS.MODULE;
    ground=world.createCollider(R.ColliderDesc.cuboid(10,.1,10));
    const step=world.step.bind(world);world.step=(...args:any[])=>{steps++;return step(...args);};
   }
   if(engine.world!==world)throw new Error('Engine replaced its active world.');
   return result;
  };
  engine.registerWorldExtension=(extension:any)=>{
   const detach=register(extension);activeExtensions++;let detached=false;
   return()=>{if(!detached){detached=true;activeExtensions--;detach();}};
  };
  if(existing)await engine.initialize();
  h.scene.position.set(3,0,1);h.scene.rotation.y=.4;h.scene.updateWorldMatrix(true,true);
  const original=h.scene.matrixWorld.toArray();
  const {setupViewerPhysics}=await import('/viewer-physics.js');
  const controls=await setupViewerPhysics(h,context,w.camera,w._controls,()=>true,{loadRapier(){throw new Error('A borrowed world must ignore standalone runtime injection.');}});
  w.hostPhysicsProbe={controls,engine,original,stats:()=>({initializations,activeExtensions,steps,hostValid:ground.isValid()}),step(){engine.step(1/60);engine.postStep();},cleanup(){controls.dispose();world.removeCollider(ground,true);}};
  w.usdWorkbench.openPanel('simulation');
 },existing);
 await page.locator('#usd-physics-controls').getByRole('button',{name:'Simulate',exact:true}).click();
 await expect(page.locator('#usd-physics-controls').getByRole('button',{name:'Stop',exact:true})).toBeVisible();
 const result=await page.evaluate(async()=>{
  const {getComponent,Rigidbody,Collider}=await import('@needle-tools/engine');
  const w=window as any,p=w.hostPhysicsProbe,sim=p.controls.simulation;
  const shared=sim.world===p.engine.world,placement=sim.root.matrixWorld.toArray();
  const initial=p.stats().steps;p.controls.update(.1);const afterUpdate=p.stats().steps;
  for(let i=0;i<300;i++)p.step();
  const components=[...sim.rigidbodies.values()].every((body:any)=>getComponent(body.gameObject,Rigidbody)===body);
  const colliders=[...sim.colliderComponents.entries()].every(([handle,component]:any)=>component instanceof Collider&&p.engine.getComponent(p.engine.world.getCollider(handle))===component);
  return {shared,components,colliders,placement,original:p.original,initial,afterUpdate,height:sim.bodies.get('/World/BodyA').body.translation().y,stats:p.stats()};
 });
 expect(result.shared).toBe(true);expect(result.components).toBe(true);expect(result.colliders).toBe(true);expect(result.afterUpdate).toBe(result.initial);
 result.placement.forEach((value:number,index:number)=>expect(value).toBeCloseTo(result.original[index],5));
 expect(result.height).toBeGreaterThan(.5);expect(result.height).toBeLessThan(1);
 expect(result.stats.initializations).toBe(1);expect(result.stats.hostValid).toBe(true);expect(result.stats.activeExtensions).toBeGreaterThan(0);
 await page.locator('#usd-physics-controls').getByRole('button',{name:'Stop',exact:true}).click();
 const stopped=await page.evaluate(()=>{const p=(window as any).hostPhysicsProbe;return {simulation:p.controls.simulation,colliders:p.engine.world.colliders.len(),bodies:p.engine.world.bodies.len(),...p.stats()};});
 expect(stopped.simulation).toBeNull();expect(stopped.colliders).toBe(1);expect(stopped.bodies).toBe(0);expect(stopped.activeExtensions).toBe(0);expect(stopped.hostValid).toBe(true);expect(stopped.initializations).toBe(1);
 await page.evaluate(()=>(window as any).hostPhysicsProbe.cleanup());expect(errors).toEqual([]);
});

test('viewer respects a disabled Engine physics backend',async({page})=>{
 await page.goto('/?viewer=needle&physics=off&assetCache=0&file=/test-fixtures/coverage/advanced/physics-mass.usda');await stageReady(page);
 await page.evaluate(async()=>{
  const w=window as any,context=w.needleEngineContext,url=new URL(location.href);url.searchParams.delete('physics');history.replaceState({},'',url);
  const previous=context.physics.engine;context.physics.engine=null;
  let loads=0;
  const {setupViewerPhysics}=await import('/viewer-physics.js');
  const controls=await setupViewerPhysics(w.usdHydra,context,w.camera,w._controls,()=>true,{loadRapier(){loads++;throw new Error('Do not override disabled host physics.');}});
  w.disabledHostProbe={stats:()=>({loads,simulation:controls.simulation,engine:context.physics.engine}),cleanup(){controls.dispose();context.physics.engine=previous;}};
  w.usdWorkbench.openPanel('simulation');
 });
 await page.locator('#usd-physics-controls').getByRole('button',{name:'Simulate',exact:true}).click();
 await expect(page.locator('#usd-physics-controls [role=status]')).toContainText('Needle physics is disabled or unavailable');
 expect(await page.evaluate(()=>(window as any).disabledHostProbe.stats())).toEqual({loads:0,simulation:undefined,engine:null});
 await page.evaluate(()=>(window as any).disabledHostProbe.cleanup());
});

test('viewer refuses a second simulation world when the active Engine lacks registration support',async({page})=>{
 await page.goto('/?viewer=needle&physics=off&assetCache=0&file=/test-fixtures/coverage/advanced/physics-mass.usda');await stageReady(page);
 await page.evaluate(async()=>{
  const w=window as any,context=w.needleEngineContext,url=new URL(location.href);url.searchParams.delete('physics');history.replaceState({},'',url);
  const engine=context.physics.getOrCreatePhysicsEngine();await engine.initialize();
  const {NEEDLE_ENGINE_MODULES}=await import('@needle-tools/engine'),R=NEEDLE_ENGINE_MODULES.RAPIER_PHYSICS.MODULE;
  const world=engine.world,ground=world.createCollider(R.ColliderDesc.cuboid(10,.1,10));
  const register=engine.registerExternalPhysics;engine.registerExternalPhysics=undefined;
  w.hostRuntimeLoads=0;
  const {setupViewerPhysics}=await import('/viewer-physics.js');
  const controls=await setupViewerPhysics(w.usdHydra,context,w.camera,w._controls,()=>true,{loadRapier(){w.hostRuntimeLoads++;throw new Error('Do not load another runtime.');}});
  w.oldHostProbe={controls,stats:()=>({loads:w.hostRuntimeLoads,simulation:controls.simulation,shared:engine.world===world,hostValid:ground.isValid(),colliders:world.colliders.len(),bodies:world.bodies.len()}),cleanup(){controls.dispose();engine.registerExternalPhysics=register;world.removeCollider(ground,true);}};
  w.usdWorkbench.openPanel('simulation');
 });
 await page.locator('#usd-physics-controls').getByRole('button',{name:'Simulate',exact:true}).click();
 await expect(page.locator('#usd-physics-controls [role=status]')).toContainText('does not support external physics registration');
 expect(await page.evaluate(()=>(window as any).oldHostProbe.stats())).toEqual({loads:0,simulation:undefined,shared:true,hostValid:true,colliders:1,bodies:0});
 await page.evaluate(()=>(window as any).oldHostProbe.cleanup());
});
