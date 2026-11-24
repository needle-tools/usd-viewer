import {test, expect, type Page} from './test';
import {readFile} from 'node:fs/promises';
import {unzipSync} from 'three/addons/libs/fflate.module.js';
import {stageReady, clearStage} from './workbench-menus';

test('a direct USD link with download=zip exports without a click', async ({page,context,baseURL}) => {
  await context.route(url => url.origin !== new URL(baseURL!).origin, route => route.abort());
  await page.addInitScript(() => localStorage.setItem('needle-usd-download-format', JSON.stringify('usdz')));
  const pending = page.waitForEvent('download');
  await page.goto('/?viewer=three&render=basic&file=/test-fixtures/api/examples.js%23department-layers&download=zip');
  const zip = await pending;
  expect(zip.suggestedFilename()).toMatch(/\.zip$/);
  expect(Object.keys(unzipSync(new Uint8Array(await readFile((await zip.path())!)))).length).toBeGreaterThan(1);
  expect(await page.evaluate(() => localStorage.getItem('needle-usd-download-format'))).toBe(JSON.stringify('usdz'));
});

async function expectedCreator(page: Page) {
  const build = await (await page.request.get('/viewer-build.json')).json();
  const revision = build.revision ? ` (${build.revision.slice(0,12)})` : '';
  return `USD Viewer ${build.viewerVersion}${revision} / @needle-tools/usd ${build.sdkVersion}`;
}

for (const viewer of ['three', 'needle']) test(`${viewer}: Download menu packages dependencies and live edits; closing disables it`, async ({page}, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(theme => localStorage.setItem('needle-usd-theme', JSON.stringify(theme)), viewer === 'three' ? 'dark' : 'light');
  await page.goto(`/?viewer=${viewer}&render=basic&file=/test-fixtures/api/examples.js%23department-layers`);
  await stageReady(page);
  const download = page.getByRole('button', {name:'Download', exact:true});
  await expect(download).toBeEnabled();
  await page.evaluate(async () => {
    await (window as any).usdHydra.editStage(stage => stage.DefinePrim('/World/DownloadEdit', 'Xform').delete());
  });
  await download.click();
  const zipEvent = page.waitForEvent('download');
  await page.getByRole('menuitem', {name:'ZIP', exact:true}).click();
  const zip = await zipEvent;
  expect(zip.suggestedFilename()).toMatch(/\.zip$/);
  const entries = unzipSync(new Uint8Array(await readFile((await zip.path())!)));
  expect(Object.keys(entries).length).toBeGreaterThan(1);
  expect(Object.values(entries).some(bytes => new TextDecoder().decode(bytes).includes('DownloadEdit'))).toBe(true);

  await download.click();
  const packageEvent = page.waitForEvent('download');
  await page.getByRole('menuitem', {name:'USDZ', exact:true}).click();
  const usdz = await packageEvent;
  expect(usdz.suggestedFilename()).toMatch(/\.usdz$/);
  const usdzBytes = new Uint8Array(await readFile((await usdz.path())!));
  // USDZ stores every member uncompressed, on a 64-byte boundary.
  const view = new DataView(usdzBytes.buffer); let cursor = 0, count = 0;
  while (view.getUint32(cursor, true) === 0x04034b50) {
    expect(view.getUint16(cursor + 8, true)).toBe(0);
    const data = cursor + 30 + view.getUint16(cursor + 26, true) + view.getUint16(cursor + 28, true);
    expect(data % 64).toBe(0); count++; cursor = data + view.getUint32(cursor + 18, true);
  }
  expect(count).toBeGreaterThan(1);
  await page.locator('#container').screenshot({path:info.outputPath('download-dark.png')});
  await page.reload(); await stageReady(page);
  const formatTrigger = download;
  await formatTrigger.click();
  await page.locator('[data-usd-menu=view] > summary').hover();
  await expect(formatTrigger).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('[data-usd-menu=view]')).toHaveAttribute('open','');
  await formatTrigger.hover(); await expect(formatTrigger).toHaveAttribute('aria-expanded','true');
  await formatTrigger.focus(); await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-usd-menu=help] > summary')).toBeFocused();
  await page.keyboard.press('ArrowRight'); await expect(formatTrigger).toBeFocused();
  await expect(formatTrigger).toHaveAttribute('aria-expanded','true'); await page.keyboard.press('Escape');
  await clearStage(page); await expect(download).toBeDisabled();
  await expect(page.locator('[data-usd-menu=download]')).not.toHaveAttribute('open', '');
  expect(errors).toEqual([]);
});

test('URL texture dependencies are localized and the resulting USDZ opens offline', async ({page}) => {
  // A non-catalog URL exercises the HTTP resolver, rather than preloaded files.
  await page.route('**/download-test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/download-test/')) { await route.fallback(); return; }
    const source = path.endsWith('root.usda') ? `#usda 1.0
(
    subLayers = [@child.usda@]
    customLayerData = {
        string creator = "Fixture author"
        int fixtureKey = 42
    }
)
def Xform "World" {
 custom asset data=@palette.bin@
}` : path.endsWith('child.usda') ? '#usda 1.0\ndef Xform "World" {\n def Sphere "Ball" {}\n}\n' : new Uint8Array([7, 12, 23]);
    await route.fulfill({body: typeof source === 'string' ? source : Buffer.from(source)});
  });
  await page.goto('/?viewer=three&render=basic&file=/download-test/root.usda'); await stageReady(page);
  await page.evaluate(async () => (window as any).usdHydra.editStage(stage => stage.DefinePrim('/World/HttpEdit', 'Xform').delete()));
  await page.getByRole('button',{name:'Download',exact:true}).click();
  const event = page.waitForEvent('download');
  await page.getByRole('menuitem', {name:'USDZ', exact:true}).click();
  const file = await event, bytes = new Uint8Array(await readFile((await file.path())!)), entries = unzipSync(bytes);
  expect(Object.keys(entries).some(name => name.endsWith('child.usda'))).toBe(true);
  expect(Object.keys(entries).some(name => name.endsWith('palette.bin'))).toBe(true);
  expect(Object.values(entries).some(data => data.length === 3 && data[0] === 7)).toBe(true);
  const originalCreator = await page.evaluate(() => (window as any).usdHydra.readStage(stage => {
    const root = stage.GetPseudoRoot();
    try { return root.GetMetadataByDictKey('customLayerData', 'creator'); }
    finally { root.delete(); }
  }));
  expect(originalCreator).toBe('Fixture author');
  const creator = await expectedCreator(page);
  await page.context().setOffline(true);
  const exported = await page.evaluate(async data => {
    const path = '/tmp/offline-download.usdz', modulePath = '/usd/bindings/index.js';
    const USD = await (await import(modulePath)).getUsdModule();
    USD.FS_createDataFile('/tmp', 'offline-download.usdz', new Uint8Array(data), true, true, true);
    const stage = await USD.OpenStage(path);
    const root = stage.GetPseudoRoot();
    try {
      return {
        composed: stage.GetPrimAtPath('/World/Ball').IsValid() && stage.GetPrimAtPath('/World/HttpEdit').IsValid(),
        provenance: root.GetMetadata('customLayerData'),
      };
    } finally { root.delete(); USD.ReleaseStage(stage); USD.FS_unlink(path); }
  }, [...bytes]);
  expect(exported.composed).toBe(true);
  expect(exported.provenance).toEqual({
    creator,
    needleSourceCreator: 'Fixture author',
    fixtureKey: 42,
  });
});

test('closing a stage during a dependency fetch safely cancels its download', async ({page}) => {
  let release: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const errors: string[] = [], downloads: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('download', file => downloads.push(file.suggestedFilename()));
  await page.route('**/delayed-download/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/delayed-download/')) { await route.fallback(); return; }
    if (path.endsWith('.bin')) await gate;
    await route.fulfill({body: path.endsWith('.usda') ? '#usda 1.0\ndef Sphere "Ball" {\n custom asset data=@later.bin@\n}\n' : 'asset'});
  });
  await page.goto('/?viewer=three&render=basic&file=/delayed-download/root.usda'); await stageReady(page);
  const button = page.getByRole('button',{name:'Download',exact:true});
  const fetch = page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/later.bin'));
  try {
    await button.click();
    await page.getByRole('menuitem', {name:'ZIP', exact:true}).click();
    await fetch;
    await clearStage(page); await expect(button).toBeDisabled();
  } finally { release!(); }
  await expect(button).toHaveAttribute('aria-busy','false');
  expect(downloads).toEqual([]); expect(errors).toEqual([]);
});


test('USDZ and GLB export the authored pose by default and the live SimReady pose on request', async ({page}) => {
  const creator = await expectedCreator(page);
  await page.goto('/?viewer=three&workspace=studio&file=/test-fixtures/simready/assembly.usda');
  await stageReady(page);
  await page.evaluate(() => (window as any).usdWorkbench.openPanel('simulation'));
  await page.locator('#usd-physics-controls').getByRole('button', {name:'Interact', exact:true}).click();
  await expect(page.locator('#usd-physics-controls').getByRole('button', {name:'Interact', exact:true})).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => (window as any).usdPhysics.simulation.setJointValue('/Assembly/Hinge', 45));
  const knob = '/Assembly/Knob';
  const live = await page.evaluate(path => {
    const sim = (window as any).usdPhysics.simulation;
    return sim.bodies.get(path).body.translation().toArray();
  }, knob);

  const trigger = page.getByRole('button', {name:'Download', exact:true});
  const pose = page.getByRole('menuitemcheckbox', {name:'Export with changed SimReady pose'});
  const exportFile = async (format: 'glTF'|'USDZ', changed: boolean) => {
    await trigger.click();
    if (await pose.getAttribute('aria-checked') !== String(changed)) await pose.click();
    const pending = page.waitForEvent('download');
    await page.getByRole('menuitem', {name:format, exact:true}).click();
    const file = await pending;
    expect(await file.failure()).toBeNull();
    return readFile((await file.path())!);
  };
  await trigger.click();
  await expect(pose).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');
  const authoredGlb = await exportFile('glTF', false);
  const changedGlb = await exportFile('glTF', true);
  const authoredUsdz = await exportFile('USDZ', false);
  const changedUsdz = await exportFile('USDZ', true);
  const readGlb = (bytes: Buffer) => {
    const json = JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    expect(json.asset.generator.startsWith(creator + ' / THREE.GLTFExporter ')).toBe(true);
    const payload = json.extensions.NEEDLE_simready;
    expect(payload.version).toBe(1);
    const body = payload.snapshot.bodies.find(body => body.path === knob);
    const visual = payload.bindings.find(binding => binding.path === knob + '/Visual');
    return {position:body.position, visual:json.nodes[visual.node].matrix};
  };
  const original = readGlb(authoredGlb), posed = readGlb(changedGlb);
  expect(original.position).toEqual([1,0,0]);
  const [x,y,z] = live;
  expect(posed.position).toEqual([x,z,-y].map(value=>expect.closeTo(value*.01,5)));
  expect(original.visual).toEqual(posed.visual.map(value=>expect.closeTo(value,5)));
  const usdTransform = async (data: Buffer) => page.evaluate(async ({data,knob}) => {
    const filename = 'export-pose-check.usdz', path = '/tmp/' + filename;
    const modulePath = '/usd/bindings/index.js';
    const USD = await (await import(modulePath)).getUsdModule();
    USD.FS_createDataFile('/tmp',filename,new Uint8Array(data),true,true,true);
    const stage = await USD.OpenStage(path);
    try{
      const body = stage.GetPrimAtPath(knob);
      try {
        const order = body.GetAttribute('xformOpOrder');
        const transform = body.GetAttribute('xformOp:transform:needleExportPose');
        try {
          return {order: await order.Get(0), matrix: transform.IsValid() ? (await transform.Get(0)).flat() : null};
        } finally { transform.delete(); order.delete(); }
      } finally { body.delete(); }
    }finally{USD.ReleaseStage(stage);USD.FS_unlink(path);}
  },{data:[...data],knob});
  expect(await usdTransform(authoredUsdz)).toEqual({order:['xformOp:translate'],matrix:null});
  const changedTransform = await usdTransform(changedUsdz);
  expect(changedTransform.order).toEqual(['!resetXformStack!', 'xformOp:transform:needleExportPose']);
  expect(changedTransform.matrix?.slice(12,15)).toEqual(live.map(value=>expect.closeTo(value,4)));
  expect(await page.evaluate(path => (window as any).usdPhysics.simulation.bodies.get(path).body.translation().toArray(), knob)).toEqual(live);
});
