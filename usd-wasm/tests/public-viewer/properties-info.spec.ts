import {expect,test} from '@playwright/test';
import {stageReady} from './workbench-menus';

const revision='4763fbfaa4f8e97658e68b57d01b4c86659e08b5';
const asset='fixture_cabinet_b01/simready_usd/sm_fixture_cabinet_b01_01.usd';
const source=`https://huggingface.co/datasets/nvidia/simready-assets/resolve/${revision}/${asset}`;

test('Properties collapse persists, follows property links, and keeps its own scrolling',async({page},info)=>{
 const open=async()=>{await page.goto('/?viewer=three&render=basic&file=/test-fixtures/composition/liverps_all.usda');await stageReady(page);await page.evaluate(()=>(window as any).usdStagePanel.selectPrim('/World/Local/Shape'));};
 await open();
 const section=page.locator('.usd-inspector-section'),toggle=section.getByRole('button',{name:'Properties',exact:true}),scroller=section.locator('.usd-property-scroller');
 await expect(toggle).toHaveAttribute('aria-expanded','true');
 expect(await scroller.evaluate(el=>el.scrollHeight>el.clientHeight&&el.clientHeight>0)).toBe(true);
 await toggle.click();await expect(scroller).not.toBeVisible();
 await page.evaluate(()=>(window as any).usdStagePanel.refresh());await expect(toggle).toHaveAttribute('aria-expanded','false');
 await open();await expect(toggle).toHaveAttribute('aria-expanded','false');
 await page.evaluate(()=>(window as any).usdStagePanel.navigate('/World/Local/Shape.visibility'));
 await expect(toggle).toHaveAttribute('aria-expanded','true');await expect(scroller).toBeVisible();
 for(const theme of ['dark','light']){
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  await page.screenshot({path:info.outputPath(`properties-${theme}.png`)});
 }
});

test('Info links the exact HF revision and NVIDIA’s matching asset; joint helpers use Needle green',async({page},info)=>{
 await page.goto(`/?viewer=three&render=basic&file=${encodeURIComponent(source)}`);await stageReady(page);
 const section=page.locator('.usd-asset-info');await expect(section).toHaveCount(1);
 await section.locator(':scope > summary').click();
 const hf=section.getByRole('link',{name:'Hugging Face'});
 await expect(hf).toHaveAttribute('href',source.replace('/resolve/','/blob/'));
 const value=(label:string)=>section.locator('.property-row-head').filter({has:page.locator('label').filter({hasText:new RegExp('^'+label+'$')})}).locator('output');
 await expect(value('Constraints')).toHaveText('2');
 await expect(value('Colliders')).not.toHaveText('0');
 await expect(value('Total file size')).toHaveText(/MB/);
 await expect(value('Total file size')).not.toContainText('…');
 await expect(value('Meshes / USD')).not.toHaveText('0 B');
 await expect(section.locator('.usd-asset-schemas > summary')).toHaveText(/Schemas \(\d+\)/);
 await section.locator('.usd-asset-schemas > summary').click();
 await expect(section.getByRole('list',{name:'Schemas'})).toContainText('PhysicsPrismaticJoint');
 await expect(section.getByRole('list',{name:'Schemas'})).toContainText('PhysicsCollisionAPI');
 const nvidia=section.getByRole('link',{name:'NVIDIA SimReady'});
 await expect(nvidia).toHaveAttribute('href',/^https:\/\/nvidia-simready-central\.hf\.space\/\?filter_url_regexp=/,{timeout:20000});
 const target=new URL((await nvidia.getAttribute('href'))!).searchParams.get('filter_url_regexp')!;
 expect(target).toBe('.*/datasets/nvidia/simready-assets/(resolve|blob)/[^/]+/'+asset.replace(/\./g,'\\.'));
 await page.evaluate(()=>(window as any).usdWorkbench.openPanel('simulation'));
 const interact=page.locator('#usd-physics-controls').getByRole('button',{name:'Interact',exact:true});await interact.click();await expect(interact).toHaveAttribute('aria-pressed','true');
 const colors=await page.evaluate(()=>{const result:string[]=[];(window as any).usdHydra.scene.traverse((o:any)=>{if(o.userData.usdJointPath&&o.material?.color)result.push(o.material.color.getHexString());});return result;});
 expect(colors.length).toBeGreaterThan(0);expect(new Set(colors)).toEqual(new Set(['99cc33']));
 const order=await page.locator('[data-panel=properties]').evaluate(el=>el.lastElementChild?.className);expect(order).toContain('usd-asset-info');
 await page.evaluate(()=>(window as any).usdWorkbench.openPanel('properties'));
 await page.locator('.usd-inspector-section > .usd-section-toggle').click();
 await section.evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:info.outputPath('cabinet-info-green.png')});
 await page.evaluate(()=>(window as any).usdStagePanel.dispose());
 await expect(page.locator('.usd-asset-info')).toHaveCount(0);
});
