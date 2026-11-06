import {test,expect} from './test';
import {coverageAssetLibrary} from '../fixtures/coverage/asset-library.js';
// One test per fixture so they spread across workers.
const assets=coverageAssetLibrary.filter(a=>a.id.startsWith('curved-studio-'));
test('the curved studio library has twelve fixtures',()=>{expect(assets).toHaveLength(12);});
for(const viewer of ['three','needle'])for(const asset of assets)test(`${viewer}: curved studio fixture ${asset.id} has finite visible geometry`,async({app},info)=>{
 const {page,errors,load}=await app(`viewer=${viewer}&render=beauty&complexity=adaptive`);
 {
  await load('/test-fixtures/'+asset.root);
  const geometry=await page.evaluate(()=>{const records:any[]=[];(window as any).usdHydra.scene.traverse((o:any)=>{const g=o.geometry,p=g?.attributes.position;if(o.isMesh&&p?.count&&o.visible)records.push({path:o.userData.usdPath,vertices:p.count,finite:p.array.every(Number.isFinite)&&(!g.attributes.normal||g.attributes.normal.array.every(Number.isFinite)),uv:g.attributes.uv?.count,groups:g.groups.length});});return records;});
  expect(geometry.length,asset.id).toBeGreaterThan(0);expect(geometry.every(g=>g.finite),asset.id).toBe(true);
  await info.attach(asset.id,{body:JSON.stringify(geometry),contentType:'application/json'});
 }expect(errors).toEqual([]);
});
