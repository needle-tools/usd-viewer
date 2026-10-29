import {test,expect} from '@playwright/test';
import {coverageAssetLibrary} from '../fixtures/coverage/asset-library.js';
import {stageReady} from './workbench-menus';
for(const viewer of ['three','needle'])test(`${viewer}: curved studio fixtures have finite visible geometry`,async({page},info)=>{
 test.setTimeout(300_000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const assets=coverageAssetLibrary.filter(a=>a.id.startsWith('curved-studio-'));expect(assets).toHaveLength(12);
 for(const asset of assets)await test.step(asset.label,async()=>{
  await page.goto(`/?viewer=${viewer}&render=beauty&complexity=adaptive&file=${encodeURIComponent('/test-fixtures/'+asset.root)}`);await stageReady(page);
  const geometry=await page.evaluate(()=>{const records:any[]=[];(window as any).usdHydra.scene.traverse((o:any)=>{const g=o.geometry,p=g?.attributes.position;if(o.isMesh&&p?.count&&o.visible)records.push({path:o.userData.usdPath,vertices:p.count,finite:p.array.every(Number.isFinite)&&(!g.attributes.normal||g.attributes.normal.array.every(Number.isFinite)),uv:g.attributes.uv?.count,groups:g.groups.length});});return records;});
  expect(geometry.length,asset.id).toBeGreaterThan(0);expect(geometry.every(g=>g.finite),asset.id).toBe(true);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.locator('#usd-viewport').screenshot({path:info.outputPath(asset.id+'.png')});
  await info.attach(asset.id,{body:JSON.stringify(geometry),contentType:'application/json'});
 });expect(errors).toEqual([]);
});
