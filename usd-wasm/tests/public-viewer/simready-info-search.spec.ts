import {expect,test} from '@playwright/test';
import {openSamples,selectExampleFolder,stageReady} from './workbench-menus';

test('AGIBOT folder search and Info use shared controls and authored metadata',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/?workspace=studio&viewer=three&render=basic');await openSamples(page);await selectExampleFolder(page,'collection:'+encodeURIComponent('https://huggingface.co/datasets/agibot-assets/simready-assets'));
 await page.getByRole('searchbox',{name:'Search examples'}).fill('g2_swiftpicker');
 const card=page.locator('.gallery-card:visible').filter({hasText:'g2 swiftpicker'});
 await expect(card).toHaveCount(1,{timeout:25000});await expect(card.locator('img')).toBeVisible();
 await expect.poll(()=>card.locator('img').evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBeGreaterThan(0);
 await page.screenshot({path:info.outputPath('swiftpicker-search.png')});
 await card.click();await stageReady(page);await page.evaluate(()=>(window as any).usdWorkbench.openPanel('properties'));
 const section=page.locator('.usd-asset-info');await section.locator(':scope > summary').click();
 const value=(label:string)=>section.locator('.property-row-head').filter({has:page.locator('label').filter({hasText:new RegExp('^'+label+'$')})}).locator('output');
 await expect(value('SimReady profile')).toHaveText('Robot-Body');await expect(value('Moving parts')).toHaveText('42');await expect(value('Independent joints')).toHaveText('32');
 await expect(value('Mass')).toHaveText('164.784 kg');await expect(value('Dimensions')).toHaveText('0.756 × 2.311 × 1.795 m');
 await expect(value('Meshes')).not.toHaveText('0');await expect(value('Materials')).not.toHaveText('0');
 const toggle=page.locator('.usd-section-toggle');await expect(toggle).toHaveClass(/section-rail-group-summary/);
 await expect(section.getByRole('link',{name:'NVIDIA SimReady'})).toHaveClass(/header-tool-button/);
 const target=new URL((await section.getByRole('link',{name:'NVIDIA SimReady'}).getAttribute('href'))!);
 expect(target.searchParams.get('filter_url_regexp')).toContain('agibot-assets/simready-assets');
 for(const theme of ['dark','light']){
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  if(await toggle.getAttribute('aria-expanded')==='true')await toggle.click();
  await section.evaluate(el=>el.scrollTop=0);
  await expect(section.getByRole('link',{name:'NVIDIA SimReady'})).toHaveCSS('display','inline-flex');
  const styles=await page.evaluate(()=>[...document.querySelectorAll<HTMLLinkElement>('link[rel=stylesheet]')].filter(link=>/workbench\.css|brand\.css|viewer\/style\.css/.test(link.href)).map(link=>link.href));
  expect(styles).toHaveLength(3);expect(styles.every(href=>href.includes('?v='))).toBe(true);
  await page.screenshot({path:info.outputPath(`swiftpicker-info-${theme}.png`)});
 }
 const opened=page.context().waitForEvent('page');await section.getByRole('link',{name:'NVIDIA SimReady'}).click();const nvidia=await opened;
 await expect(nvidia.getByText('g2_swiftpicker',{exact:true}).last()).toBeVisible({timeout:25000});
 await expect(nvidia.getByRole('button',{name:'Interactive USD',exact:true})).toBeVisible();
 await expect(nvidia.getByText('Robot-Body',{exact:true}).last()).toBeVisible();
 await nvidia.screenshot({path:info.outputPath('nvidia-swiftpicker-link.png')});await nvidia.close();
 expect(errors).toEqual([]);
});

test('search filters the selected NVIDIA collection without external search dependencies',async({page})=>{
 await page.goto('/?workspace=studio&viewer=three&render=basic');await openSamples(page);await selectExampleFolder(page,'simready');
 await page.getByRole('searchbox',{name:'Search examples'}).fill('fixture_cabinet_b01');
 await expect(page.getByRole('searchbox',{name:'Search examples'})).not.toHaveAttribute('aria-busy','true');
 await expect(page.locator('.gallery-card:visible')).toHaveCount(1);
 const file=new URL((await page.locator('.gallery-card:visible').getAttribute('href'))!,page.url()).searchParams.get('file')!;
 expect(file).toContain('/4763fbfaa4f8e97658e68b57d01b4c86659e08b5/');
 await page.getByRole('searchbox',{name:'Search examples'}).fill('');
 await expect(page.locator('.gallery-card')).toHaveCount(2677);
});
