import { expect, test } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.fulfill({ contentType: 'text/css', body: '' }));
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
    await page.locator('.filename-bar .clear-button').click();
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
