import {test,expect} from './test';
import {stageReady} from './workbench-menus';
import {hierarchyFiles} from '../fixtures/hierarchy-audit.mjs';
const row=(page:any,path:string)=>page.locator(`[data-prim-path="${path}"]`);
test.beforeEach(async({page})=>{
 await page.context().route(url=>url.pathname.startsWith('/test-fixtures/hierarchy/'),async route=>{
  const file=route.request().url().split('/').at(-1)!,body=(hierarchyFiles as Record<string,string>)[file];
  if(body===undefined)return route.abort();await route.fulfill({contentType:'text/plain',body});
 });
 await page.goto('/?workspace=studio&viewer=three&render=basic&file=/test-fixtures/hierarchy/hierarchy-audit.usda');await stageReady(page);
});

test('native instances retain their schema and expose shared prototype navigation, peers and read-only children',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const a=row(page,'/World/A');await expect(a.locator('.usd-tree-icon [data-icon=transform]')).toHaveCount(1);await expect(a.locator('.usd-tree-instance-badge [data-icon=instance]')).toHaveCount(1);
 await expect(a).toHaveAttribute('aria-expanded','false');await a.locator('.usd-tree-disclosure').click();
 const nested=row(page,'/World/A/Nested');await nested.locator('.usd-tree-disclosure').click();
 const proxy=row(page,'/World/A/Nested/Ball');await expect(proxy).toBeVisible();await expect(proxy.locator('.usd-tree-instance-badge [data-icon=instance-proxy]')).toHaveCount(1);
 await a.click();const instancing=page.getByRole('group',{name:'Instancing',exact:true});
 const prototype=await instancing.getByRole('button').getAttribute('data-target');expect(prototype).toMatch(/^\/__Prototype_/);
 await instancing.getByRole('button').click();await expect(page.getByRole('button',{name:'Show prototypes',exact:true})).toHaveAttribute('aria-pressed','true');
 const master=row(page,prototype!);await expect(master).toHaveAttribute('aria-selected','true');await master.locator('.usd-tree-disclosure').click();
 const shared=row(page,prototype+'/Animated');await expect(shared).toBeVisible();await shared.click();await expect(shared.locator('..').locator('[data-prim-action=activation]')).toBeDisabled();
 await master.click();await instancing.getByText('2 instance roots',{exact:true}).click();await instancing.getByRole('button',{name:'Follow /World/B',exact:true}).click();await expect(row(page,'/World/B')).toHaveAttribute('aria-selected','true');
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>{document.documentElement.setAttribute('data-theme',theme);},theme);
  await page.screenshot({path:info.outputPath('hierarchy-'+theme+'.png')});
 }
 expect(errors).toEqual([]);
});

test('point instances and instanceable flags are distinct from native instances; classes and undefined overs remain inspectable',async({page})=>{
 const flag=row(page,'/World/FlagOnly');await expect(flag.locator('.usd-tree-instance-badge')).toHaveCount(0);await flag.click();await expect(page.getByRole('group',{name:'Instancing',exact:true})).toContainText('Instanceable; no shared prototype');
 const scatter=row(page,'/World/Scatter');await expect(scatter.locator('[data-icon=point-instancer]')).toHaveCount(1);await scatter.click();
 const instanceInfo=page.getByRole('group',{name:'Instancing',exact:true});await expect(instanceInfo).toContainText('Instances3');await instanceInfo.getByText('2 prototypes',{exact:true}).click();
 await instanceInfo.getByRole('button',{name:'Follow /World/Shapes/Red',exact:true}).click();await expect(row(page,'/World/Shapes/Red')).toHaveAttribute('aria-selected','true');
 await expect(row(page,'/Template').locator('..')).toHaveAttribute('data-abstract','true');await expect(row(page,'/World/Undefined/Deeper').locator('..')).toHaveAttribute('data-defined','false');
 await expect(row(page,'/World/Inactive')).toBeAttached();await expect(row(page,'/World/Inactive/AuthoredChild')).toHaveCount(0);
});

test('seeking preserves computed and explicitly authored visibility without changing tree expansion',async({page})=>{
 const parent='/World/HiddenParent',child=parent+'/HiddenChild',explicit=parent+'/AlwaysHidden';
 const visibility=(path:string)=>row(page,path).locator('..').locator('[data-prim-action=visibility]');
 await expect(visibility(child)).toHaveAttribute('aria-pressed','false');await expect(visibility(child)).toHaveAttribute('data-inherited','true');await expect(visibility(explicit)).toHaveAttribute('data-inherited','false');
 await page.evaluate(async()=>{const w=window as any;w.usdHydra.setPlaying(false);await w.usdHydra.setTime(10);});
 await expect(visibility(child)).toHaveAttribute('aria-pressed','true');await expect(visibility(explicit)).toHaveAttribute('aria-pressed','false');
 await page.evaluate(async()=>{const w=window as any;await w.usdHydra.setTime(1);});
 await expect(visibility(child)).toHaveAttribute('aria-pressed','false');await expect(visibility(child)).toHaveAttribute('data-inherited','true');await expect(visibility(child)).toHaveAttribute('title',new RegExp('Hidden by '+parent));
 await expect(row(page,'/World/A')).toHaveAttribute('aria-expanded','false');
});

test('deinstancing and activation refresh shared badges, editable children and prototype use counts',async({page})=>{
 const a=row(page,'/World/A');await a.locator('.usd-tree-disclosure').click();
 const child=row(page,'/World/A/Animated');await expect(child.locator('..').locator('[data-prim-action=activation]')).toBeDisabled();
 await page.evaluate(async()=>{
  const w=window as any;await w.usdStagePanel.edit(async(stage:any)=>{
   const instance=stage.GetPrimAtPath('/World/A'),inactive=stage.GetPrimAtPath('/World/Inactive');
   try{await instance.SetInstanceable(false);await inactive.SetActive(true);}finally{instance.delete();inactive.delete();}
  });
 });
 await expect(a.locator('.usd-tree-instance-badge')).toBeHidden();
 await expect(child.locator('..').locator('[data-prim-action=activation]')).toBeEnabled();
 await expect(row(page,'/World/Inactive/AuthoredChild')).toBeVisible();
 await row(page,'/World/B').click();await expect(page.getByRole('group',{name:'Instancing',exact:true})).toContainText('Instance roots1');
});
