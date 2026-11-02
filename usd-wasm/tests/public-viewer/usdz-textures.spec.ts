import {test,expect} from '@playwright/test';
import {stageReady} from './workbench-menus';

for(const name of ['McUsd','CarbonFrameBike'])test(`${name}: remote USDZ textures decode with the threaded runtime`,async({page},info)=>{
 const errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(/Error loading USD material texture|failed to load its environment/.test(message.text()))errors.push(message.text());});
 const file=`https://raw.githubusercontent.com/usd-wg/assets/main/full_assets/${name}/${name}.usdz`;
 await page.goto('/?workspace=studio&viewer=three&render=beauty&complexity=low&background=dark&file='+encodeURIComponent(file));
 await stageReady(page);
 await expect.poll(()=>page.evaluate(()=>{
  const textures=new Set();(window as any).usdRoot.traverse((object:any)=>{
   for(const material of [object.material].flat())if(material)for(const value of Object.values(material) as any[])if(value?.isTexture && value.image?.width>0)textures.add(value);
  });return textures.size;
 })).toBeGreaterThan(5);
 await page.evaluate(()=>(window as any).usdWorkbench.openPanel('layers'));
 await expect(page.locator('.usd-layer').filter({hasText:'-session.usda'})).toHaveCount(0);
 if(name==='McUsd')await expect.poll(()=>page.evaluate(()=>(window as any).scene.environment?.image?.width||0)).toBeGreaterThan(0);
 await page.screenshot({path:info.outputPath(name+'.png')});expect(errors).toEqual([]);
});
