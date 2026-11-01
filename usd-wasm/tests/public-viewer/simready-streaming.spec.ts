import {expect,test} from '@playwright/test';
import {stageReady,openAppMenu} from './workbench-menus';
const base='https://huggingface.co/datasets/nvidia/simready-assets/resolve/4763fbfaa4f8e97658e68b57d01b4c86659e08b5/';
const assetUrl=(asset:string)=>`${base}${asset}/simready_usd/sm_${asset}_01.usd`;
const viewerUrl=(asset:string)=>`/?viewer=three&workspace=studio&file=${encodeURIComponent(assetUrl(asset))}&render=beauty&assetCache=0`;
async function loaded(page:any){return page.evaluate(()=>(window as any).usdHydra.readStage((stage:any)=>{const prim=stage.GetPrimAtPath('/RootNode');try{return prim.IsLoaded();}finally{prim.delete();}}));}
async function visibleMeshes(page:any){return page.evaluate(()=>{let n=0;(window as any).usdHydra.scene.traverse((object:any)=>{if(object.isMesh&&object.visible&&object.geometry?.attributes.position?.count)n++;});return n;});}

test('glasses remain visible and editable while textures download; worker fetches report progress',async({page},info)=>{
  const errors:string[]=[],warnings:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
  let releaseTextures!:()=>void,releaseVariant!:()=>void;
  const textures=new Promise<void>(resolve=>releaseTextures=resolve),variant=new Promise<void>(resolve=>releaseVariant=resolve);
  const requests:string[]=[];
  await page.context().route('**/Textures/**',async route=>{requests.push(route.request().url());await textures;await route.continue().catch(()=>{});});
  await page.context().route('**/payloads/instances_mujoco.usda',async route=>{await variant;await route.continue().catch(()=>{});});
  await page.goto(viewerUrl('accessory_eyeglasses_a01'));
  try {
    await stageReady(page);
    expect(await visibleMeshes(page)).toBeGreaterThan(0);
    await expect(page.locator('.usd-asset-progress')).toContainText('Downloading');
    expect(requests.length).toBeGreaterThan(0);expect(requests.every(url=>url.includes('accessory_eyeglasses_a01'))).toBe(true);
    await page.screenshot({path:info.outputPath('glasses-before-textures.png')});
    await page.evaluate(()=>(window as any).usdWorkbench.openPanel('code'));
    await expect(page.locator('[data-panel=code] .usd-code-view')).toBeVisible();
    await page.evaluate(()=>{(window as any).__compositionNotices=0;(window as any).__noticeListener=(window as any).usdStage.RegisterObjectsChanged(()=>(window as any).__compositionNotices++);(window as any).usdWorkbench.openPanel('properties');});
    const select=page.locator('select[data-stage-variant="MuJoCo"]');
    await select.selectOption('Enabled');
    await expect(select).toBeDisabled();
    await expect(page.locator('.usd-asset-progress')).toHaveAttribute('title',/instances_mujoco\.usda/);
    await page.evaluate(()=>{(window as any).__editHeartbeat=0;(window as any).__editTimer=setInterval(()=>(window as any).__editHeartbeat++,20);});
    await expect.poll(()=>page.evaluate(()=>(window as any).__editHeartbeat)).toBeGreaterThan(3);
    await page.evaluate(()=>clearInterval((window as any).__editTimer));
    releaseVariant();
    await expect(select).toBeEnabled();await expect(select).toHaveValue('Enabled');
    for(const value of ['Disabled','Enabled','Disabled']){await select.selectOption(value);await expect(select).toBeEnabled();await expect(select).toHaveValue(value);}
    const payload=page.getByRole('checkbox',{name:'Load /RootNode',exact:true});
    await payload.uncheck();await expect(payload).toBeEnabled();await expect.poll(()=>loaded(page)).toBe(false);
    await payload.check();await expect(payload).toBeEnabled();await expect.poll(()=>loaded(page)).toBe(true);
    await expect.poll(()=>visibleMeshes(page)).toBeGreaterThan(0);
    await expect.poll(()=>page.evaluate(()=>(window as any).__compositionNotices)).toBeGreaterThan(0);
    await page.evaluate(()=>(window as any).usdStage.RevokeObjectsChanged((window as any).__noticeListener));
    releaseTextures();await page.evaluate(()=>(window as any).usdHydra.materialsReady());
    await expect(page.locator('.usd-asset-progress')).toBeHidden();
    await page.screenshot({path:info.outputPath('glasses-after-edits.png')});
    expect(errors).toEqual([]);expect(warnings.filter(message=>/no supported Hydra surface|Error loading USD material texture/.test(message))).toEqual([]);
  }finally{releaseTextures();releaseVariant();}
});

test('compressor renders its instanced material subsets using bounded texture previews',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const textures:string[]=[];page.context().on('request',request=>{if(request.url().includes('/Textures/'))textures.push(request.url());});
  await page.goto(viewerUrl('airSystem_compressor_a01'));await stageReady(page);
  await expect.poll(()=>visibleMeshes(page)).toBeGreaterThan(0);
  await page.evaluate(()=>(window as any).usdHydra.materialsReady());
  expect(textures.length).toBeGreaterThan(20);expect(textures.filter(url=>!url.includes('/.thumbs/512x512/')).every(url=>/t_metal_steelStainless_a01_tile_(alb|nor)\.png/.test(url))).toBe(true);
  await expect(page.locator('.usd-asset-progress')).toBeHidden();
  await page.screenshot({path:info.outputPath('compressor.png')});
  await openAppMenu(page,'view');
  await page.locator('.usd-settings-section > summary').filter({hasText:'Scene'}).click();
  await expect(page.getByRole('combobox',{name:'Texture resolution'})).toHaveValue('preview');
  await expect(page.getByRole('combobox',{name:'Texture resolution'}).locator('option[value=original]')).toContainText('880 MB');
  expect(errors).toEqual([]);
});

for(const runtime of ['auto','asyncify'])test(`${runtime}: composition downloads report progress before a worker layer arrives`,async({page})=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  if(runtime==='asyncify')await page.route('**/viewer-startup.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace("asyncRuntime: 'auto'","asyncRuntime: 'asyncify'")});});
  await page.context().route('**/streaming-fixture/root.usda',route=>route.fulfill({body:'#usda 1.0\n\ndef "Root" (\n prepend references = @child.usda@</Asset>\n) {}\n',contentType:'text/plain'}));
  await page.context().route('**/streaming-fixture/child.usda',async route=>{await gate;await route.fulfill({body:'#usda 1.0\n\ndef Cube "Asset" {\n double size = 1\n}\n',contentType:'text/plain'});});
  await page.goto('/?viewer=three&render=beauty&file='+encodeURIComponent('http://127.0.0.1:5199/streaming-fixture/root.usda'),{waitUntil:'domcontentloaded'});
  try{
    await expect(page.locator('.usd-asset-progress')).toHaveAttribute('title',/child\.usda/);
    await expect(page.locator('#loading-overlay')).toContainText('Downloading');
    release();await stageReady(page);expect(await visibleMeshes(page)).toBeGreaterThan(0);
  }finally{release();}
});

test('an initial MuJoCo variant can replace materials before their textures finish',async({page})=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.context().route('**/Textures/**',async route=>{await held;await route.continue().catch(()=>{});});
  await page.goto(viewerUrl('accessory_eyeglasses_a01')+'&stageVariant='+encodeURIComponent('/RootNode|MuJoCo|Enabled'));
  try{
    await stageReady(page);await expect(page.locator('[data-stage-variant=MuJoCo]')).toHaveValue('Enabled');
    expect(await visibleMeshes(page)).toBeGreaterThan(0);release();
    await page.evaluate(()=>(window as any).usdHydra.materialsReady());expect(errors).toEqual([]);
  }finally{release();}
});

test('Original texture resolution reloads the asset through source URLs and persists the choice',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const requests:string[]=[];
  await page.context().route('**/Textures/**',async route=>{
    requests.push(route.request().url());
    // Exercise the original URL policy without transferring hundreds of MB.
    await route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVuoAAAAASUVORK5CYII=','base64')});
  });
  await page.goto(viewerUrl('accessory_eyeglasses_a01'));await stageReady(page);
  await page.evaluate(()=>(window as any).usdHydra.materialsReady());
  const previous=requests.length;
  await openAppMenu(page,'view');await page.locator('.usd-settings-section > summary').filter({hasText:'Scene'}).click();
  await page.getByRole('combobox',{name:'Texture resolution'}).selectOption('original');await page.keyboard.press('Escape');
  await expect.poll(()=>requests.length).toBeGreaterThan(previous);await stageReady(page);
  await page.evaluate(()=>(window as any).usdHydra.materialsReady());
  expect(requests.slice(previous).every(url=>url.startsWith(base) && !url.includes('/.thumbs/'))).toBe(true);
  expect(new URL(page.url()).searchParams.get('textures')).toBe('original');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('needle-usd-render-settings') || '{}').textures)).toBe('original');
  expect(errors).toEqual([]);
});

test('pinned SimReady roots and payloads reuse the warmed cache without revalidation',async({page})=>{
  const network:string[]=[];
  page.context().on('response',response=>{const url=response.request().url();if(url.startsWith(base) && !response.fromServiceWorker())network.push(url);});
  await page.goto(viewerUrl('accessory_eyeglasses_a01').replace('&assetCache=0',''));
  await stageReady(page);await page.evaluate(()=>(window as any).usdHydra.materialsReady());
  const root=assetUrl('accessory_eyeglasses_a01');
  await expect.poll(()=>page.evaluate(async url=>{const cache=await caches.open('usd-viewer-asset-cache-v3');return !!(await cache.match(url));},root)).toBe(true);
  expect(network.length).toBeGreaterThan(0);expect(network.filter(url=>url===root)).toHaveLength(1);
  expect(network.filter((url,index)=>network.indexOf(url)!==index)).toEqual([]);const downloaded=network.length;
  await page.reload();await stageReady(page);await page.evaluate(()=>(window as any).usdHydra.materialsReady());
  expect(network.length).toBe(downloaded);
  expect(await visibleMeshes(page)).toBeGreaterThan(0);
});
