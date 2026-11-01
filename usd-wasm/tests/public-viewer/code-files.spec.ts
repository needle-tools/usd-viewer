import {test,expect,type Page} from '@playwright/test';
import {openAppMenu,stageReady} from './workbench-menus';
import {replExamples} from '../fixtures/api/examples.js';

const sample = (path:string) => `/?viewer=three&render=beauty&assetCache=0&file=${encodeURIComponent('/test-fixtures/'+path)}`;
const text = (page:Page) => page.evaluate(()=>(window as any).usdWorkbench.code.text);
const sources = (page:Page) => page.evaluate(()=>(window as any).usdWorkbench.code.sources);
async function openCode(page:Page) {
  await openAppMenu(page,'window'); await page.getByRole('checkbox',{name:'Show Code'}).check();
}
async function wide(page:Page) {
  await page.evaluate(()=>(window as any).usdWorkbench.dock.getPanel('code').api.maximize());
  await expect(page.locator('.usd-code')).toHaveAttribute('data-sidebar','true');
}
async function choose(page:Page,suffix:string) {
  const entry = (await sources(page)).find((source:any)=>source.path.endsWith(suffix));
  expect(entry, suffix).toBeTruthy();
  await page.evaluate(key=>(window as any).usdWorkbench.code.select(key),entry.key);
  return entry;
}

test.beforeEach(async({page})=>{
  const errors:string[]=[];(page as any).errors=errors;
  page.on('pageerror',error=>errors.push(error.message));
});
test.afterEach(async({page})=>expect((page as any).errors).toEqual([]));

test('files sidebar adjusts, persists and falls back to a picker without changing the stage',async({page},info)=>{
  await page.addInitScript(()=>localStorage.setItem('needle-usd-theme',JSON.stringify('dark')));
  await page.goto(sample('api/examples.js#referenced-layer'));await stageReady(page);await openCode(page);await wide(page);
  const root=await page.evaluate(()=>(window as any).usdWorkbench.code.sources.find((s:any)=>s.role==='root').identifier);
  await expect(page.getByRole('tree',{name:'Sample files'})).toBeVisible();
  await page.getByRole('treeitem',{name:'scene-helpers.js',exact:true}).click();
  await expect.poll(()=>text(page)).toContain('export function createSceneHelpers');
  expect(await page.evaluate(()=>(window as any).usdWorkbench.code.sources.find((s:any)=>s.role==='root').identifier)).toBe(root);
  const divider=page.getByRole('separator',{name:'Files width'});
  await divider.focus();const before=Number(await divider.getAttribute('aria-valuenow'));
  await page.keyboard.press('Shift+ArrowRight');await expect(divider).toHaveAttribute('aria-valuenow',String(before+40));
  const box=(await divider.boundingBox())!;await page.mouse.move(box.x+2,box.y+40);await page.mouse.down();await page.mouse.move(box.x+62,box.y+40);await page.mouse.up();
  const width=Number(await divider.getAttribute('aria-valuenow'));expect(width).toBe(before+100);
  await page.getByRole('searchbox',{name:'Filter files'}).fill('scene-helpers');
  await expect(page.locator('.usd-code-files [data-source-key]')).toHaveCount(1);
  await page.screenshot({path:info.outputPath('files-wide-dark.png')});
  await page.evaluate(()=>{const panel=(window as any).usdWorkbench.dock.getPanel('code');panel.api.exitMaximized();panel.api.setSize({width:420});});
  await expect(page.locator('.usd-code')).toHaveAttribute('data-sidebar','false');
  await expect(page.getByRole('combobox',{name:'Source'})).toBeVisible();
  await expect.poll(()=>text(page)).toContain('export function createSceneHelpers');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('files-narrow.png')});
  await wide(page);
  await expect(divider).toHaveAttribute('aria-valuenow',String(width));
  await page.reload();await stageReady(page);await wide(page);
  await expect(page.getByRole('searchbox',{name:'Filter files'})).toHaveValue('scene-helpers');
  await expect(divider).toHaveAttribute('aria-valuenow',String(width));
  await expect.poll(()=>text(page)).toContain('export function createSceneHelpers');
  await page.getByRole('searchbox',{name:'Filter files'}).clear();
  // Tree keyboard focus roves and does not trigger global viewport shortcuts.
  const row=page.getByRole('treeitem',{name:'scene-helpers.js',exact:true});await row.focus();await page.keyboard.press('ArrowUp');
  expect(await row.evaluate(el=>document.activeElement!==el)).toBe(true);
  expect(await page.locator('.usd-code-files [tabindex="0"]').count()).toBe(1);
  const folder=page.getByRole('treeitem',{name:'api',exact:true});await folder.focus();
  await page.keyboard.press('ArrowLeft');await expect(folder).toHaveAttribute('aria-expanded','false');
  await page.keyboard.press('ArrowRight');await expect(folder).toHaveAttribute('aria-expanded','true');
});

test('production files deduplicate composed layers and export their live USDA in light theme',async({page},info)=>{
  await page.addInitScript(()=>localStorage.setItem('needle-usd-theme',JSON.stringify('light')));
  await page.goto(sample('coverage/production/shot.usda'));await stageReady(page);await openCode(page);await wide(page);
  const entries=await sources(page);
  for(const name of ['shot.usda','layout.usda','geometry.usda','looks.usda','model.usda','lighting.usda']) {
    expect(entries.filter((entry:any)=>entry.path===name || entry.path.endsWith('/'+name)),name).toHaveLength(1);
  }
  await page.getByRole('treeitem',{name:'looks.usda',exact:true}).click();
  await expect.poll(()=>text(page)).toContain('#usda 1.0');
  expect(await text(page)).toContain('Material');
  await page.screenshot({path:info.outputPath('files-production-light.png')});
  const root=entries.find((entry:any)=>entry.role==='root');
  await page.evaluate(key=>(window as any).usdWorkbench.code.select(key),root.key);
  await page.evaluate(()=>(window as any).usdStagePanel.edit((stage:any)=>stage.DefinePrim('/World/FileBrowserProbe','Xform')));
  await expect.poll(()=>text(page)).toContain('FileBrowserProbe');
});

test('MDL sidecar text and texture previews are inspectable; compressed images stay metadata-only',async({page})=>{
  await page.goto(sample('coverage/lighting-mdl/mdl-normal-texture.usda'));await stageReady(page);await openCode(page);await wide(page);
  const entries=await sources(page),mdl=entries.find((entry:any)=>entry.path.endsWith('.mdl')),png=entries.find((entry:any)=>entry.path.endsWith('.png'));
  expect(mdl).toBeTruthy();expect(png).toBeTruthy();
  expect(entries.filter((entry:any)=>entry.path.endsWith('pattern-normal.png'))).toHaveLength(1);
  expect(JSON.stringify(entries)).not.toMatch(/needle\/\d+\//);
  await choose(page,mdl.path);await expect.poll(()=>text(page)).toContain('mdl 1.');
  await choose(page,png.path);await expect(page.locator('.usd-code-preview img')).toBeVisible();
  await expect.poll(()=>page.locator('.usd-code-preview img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole('button',{name:'Copy source'})).toBeDisabled();
  const oldImage=await page.locator('.usd-code-preview img').getAttribute('src');
  await page.evaluate(()=>(window as any).usdWorkbench.code.invalidate());
  await expect(page.locator('.usd-code-preview img')).not.toHaveAttribute('src',oldImage!);
  // Switching away and back recreates the preview, including its object URL.
  await choose(page,mdl.path);await choose(page,png.path);await expect(page.locator('.usd-code-preview img')).toBeVisible();
  await page.goto(sample('coverage/textures/ktx2-mosaic.usda'));await stageReady(page);await wide(page);
  await choose(page,'.ktx2');await expect(page.locator('.usd-code-file-info')).toContainText('KTX2');
  expect(await sources(page)).not.toEqual(expect.arrayContaining([expect.objectContaining({path:mdl.path})]));
  expect(await text(page)).toBe('');
});

test('slow sidecar reads cannot overwrite a newer selection',async({page})=>{
  await page.goto(sample('api/examples.js#hello-world'));await stageReady(page);await openCode(page);await wide(page);
  let intercepted!:()=>void;const reading=new Promise<void>(resolve=>intercepted=resolve);
  let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);
  await page.route('**/test-fixtures/api/scene-helpers.js',async route=>{intercepted();await held;await route.fulfill({contentType:'text/javascript',body:'// OLD SLOW FILE'}).catch(()=>{});});
  await choose(page,'scene-helpers.js');await reading;
  await page.evaluate(()=>(window as any).usdWorkbench.code.select('example'));
  await expect.poll(()=>text(page)).toBe(replExamples.find(example=>example.title==='Hello World')!.code);
  release();await page.waitForTimeout(200);
  expect(await text(page)).not.toContain('OLD SLOW FILE');
});

test('dropped projects retain unused root files and same-named sidecars without loading them as the stage',async({page})=>{
  await page.goto(sample('api/examples.js#hello-world'));await stageReady(page);await openCode(page);await wide(page);
  await page.evaluate(()=>{
    const data=[
      ['/root.usda','#usda 1.0\n def Cube "Original" {}'],
      ['/alternates/other.usda','#usda 1.0\n def Sphere "Alternate" {}'],
      ['/geo/note.txt','geometry note'],['/looks/note.txt','material note'],
    ];
    const items=data.map(([fullPath,content])=>{
      const name=fullPath.split('/').pop()!,file=new File([content],name);
      return {kind:'file',webkitGetAsEntry:()=>({isFile:true,isDirectory:false,name,fullPath,file:(done:any)=>done(file)})};
    });
    const event=new Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:{items}});
    window.dispatchEvent(event);
  });
  await stageReady(page);await expect.poll(()=>page.evaluate(()=>!!(window as any).usdStage?.GetPrimAtPath('/Original').IsValid())).toBe(true);
  await wide(page);
  const entries=await sources(page);expect(entries.filter((entry:any)=>entry.path.endsWith('note.txt'))).toHaveLength(2);
  await choose(page,'geo/note.txt');await expect.poll(()=>text(page)).toBe('geometry note');
  await choose(page,'looks/note.txt');await expect.poll(()=>text(page)).toBe('material note');
  const alternate=await choose(page,'alternates/other.usda');expect(alternate.canOpenAsRoot).toBe(true);
  await expect.poll(()=>text(page)).toContain('def Sphere "Alternate"');
  expect(await page.evaluate(()=>(window as any).usdStage.GetPrimAtPath('/Original').IsValid())).toBe(true);
  expect(await page.evaluate(()=>(window as any).usdStage.GetPrimAtPath('/Alternate').IsValid())).toBe(false);
});

test('HTTP source inventory exposes root-relative folders and real parent dependencies',async({page},info)=>{
  const project='/source-path-project/', root=project+'models/shot/root.usda';
  await page.route('**/source-path-project/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path===root)return route.fulfill({contentType:'text/plain',body:`#usda 1.0
(subLayers = [@../../Shared/shape.usda@])
def Cube "Box" {
 rel material:binding = </Mat>
 custom asset notes = @../../Shared/notes.txt@
}
def Material "Mat" {
 token outputs:surface.connect = </Mat/Surface.outputs:surface>
 def Shader "Surface" {
  uniform token info:id = "UsdPreviewSurface"
  color3f inputs:diffuseColor.connect = </Mat/Texture.outputs:rgb>
  token outputs:surface
 }
 def Shader "Texture" {
  uniform token info:id = "UsdUVTexture"
  asset inputs:file = @Textures/pixel.png@
  float2 inputs:st = (0.5, 0.5)
  float3 outputs:rgb
 }
}`});
    if(path.endsWith('/shape.usda'))return route.fulfill({contentType:'text/plain',body:'#usda 1.0\ndef Sphere "Ball" {}'});
    if(path.endsWith('/notes.txt'))return route.fulfill({contentType:'text/plain',body:'Shared source outside the shot folder.'});
    if(path.endsWith('/pixel.png'))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});
    return route.fulfill({status:404,body:'Missing'});
  });
  await page.goto(`/?workspace=studio&viewer=three&render=basic&assetCache=0&file=${encodeURIComponent(root)}`);
  await stageReady(page);await openCode(page);await wide(page);
  await expect.poll(async()=>{await page.evaluate(()=>(window as any).usdWorkbench.code.invalidate());return (await sources(page)).map((s:any)=>s.path);}).toContain('Textures/pixel.png');
  const entries=await sources(page);
  expect(entries.map((s:any)=>s.path)).toEqual(expect.arrayContaining(['root.usda','../../Shared/shape.usda','Textures/pixel.png']));
  expect(JSON.stringify(entries)).not.toMatch(/hdEmscripten-http|\/needle\/|1\/1\/1/);
  expect(await page.evaluate(async()=>{
    const {readStageLayer}=await import('/usd/scene/sources.js');
    const {getUsdModule}=await import('/usd/bindings/index.js');
    return readStageLayer((window as any).usdHydra,await getUsdModule(),'../../Shared/shape.usda');
  })).toContain('Sphere "Ball"');
  await expect(page.getByRole('treeitem',{name:'Textures',exact:true})).toBeVisible();
  await expect(page.getByRole('treeitem',{name:'../../Shared',exact:true})).toBeVisible();
  await choose(page,'root.usda');
  await page.locator('.usd-code-view').getByRole('link',{name:'@../../Shared/notes.txt@',exact:true}).click();
  await expect.poll(()=>text(page)).toBe('Shared source outside the shot folder.');
  expect((await sources(page)).find((s:any)=>s.path.endsWith('notes.txt')).path).toBe('../../Shared/notes.txt');
  await choose(page,'Textures/pixel.png');await expect(page.locator('.usd-code-preview img')).toBeVisible();
  await page.screenshot({path:info.outputPath('relative-source-folders.png')});
});

test('file and folder labels share fixed indentation and array expansion describes its action',async({page},info)=>{
  await page.goto(sample('api/examples.js#hello-world'));await stageReady(page);await openCode(page);await wide(page);
  await page.evaluate(()=>{
    (window as any).usdWorkbench.code.show({
      example:{title:'Array example',path:'example.js',code:'const values = [1, 2, 3, 4, 5, 6, 7, 8];'},
      getFiles:()=>['payloads/index.txt','payloads/MuJoCo/disabled.usda','payloads/Newton/disabled.usda','payloads/Physics/disabled.usda'].map(path=>({path,read:async()=>path.endsWith('.txt')?'Notes':'#usda 1.0\ndef Xform "Root" {}'})),
    });
  });
  const rows=await page.locator('.usd-code-file').evaluateAll(rows=>rows.map(row=>({
    depth:Number(row.getAttribute('aria-level')),left:row.querySelector('.usd-code-file-name')!.getBoundingClientRect().left,
    icon:row.children[1].getBoundingClientRect().left,
  })));
  for(const a of rows)for(const b of rows)if(a.depth===b.depth){expect(a.left).toBeCloseTo(b.left,1);expect(a.icon).toBeCloseTo(b.icon,1);}
  const left=(depth:number)=>rows.find(row=>row.depth===depth)!.left;
  expect(left(2)-left(1)).toBeGreaterThan(0);expect(left(3)-left(2)).toBeCloseTo(left(2)-left(1),1);
  await expect(page.getByRole('button',{name:'Open values array',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Expand arrays',exact:true}).click();
  await expect(page.getByRole('button',{name:'Open values array',exact:true})).toHaveCount(0);
  await expect(page.locator('.usd-code-view')).toContainText('[1, 2, 3, 4, 5, 6, 7, 8]');
  await page.getByRole('button',{name:'Compact arrays',exact:true}).click();
  await expect(page.getByRole('button',{name:'Open values array',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('aligned-files-and-arrays.png')});
  await page.getByRole('treeitem',{name:'index.txt',exact:true}).click();
  await expect(page.locator('.usd-code-view')).toHaveText('Notes');
  await expect(page.getByRole('button',{name:'Expand arrays',exact:true})).toBeHidden();
  await page.getByRole('treeitem',{name:'disabled.usda',exact:true}).first().click();
  await expect(page.locator('.usd-code-view')).toContainText('#usda 1.0');
  await expect(page.getByRole('button',{name:'Expand arrays',exact:true})).toBeHidden();
});
