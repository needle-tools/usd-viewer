import {test,expect} from './test';
import {stageReady} from './workbench-menus';

for(const viewer of ['three','needle']) test(`${viewer}: decorative clock ticks share a mesh with finite smooth normals`,async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`/?viewer=${viewer}&render=beauty&assetCache=0&file=${encodeURIComponent('/test-fixtures/api/examples.js#stage-metadata')}`);
  await stageReady(page);
  const result=await page.evaluate(()=>{
    const w=window as any, ticks=w.usdStage.GetPrimAtPath('/World/Clock/Ticks');
    const objects:any[]=[];w.usdHydra.scene.traverse((object:any)=>{
      if(object.isMesh && object.userData.usdPath?.includes('/Clock/Tick')) objects.push(object);
    });
    return {type:ticks.GetTypeName(), old:w.usdStage.GetPrimAtPath('/World/Clock/Tick0').IsValid(),
      drawables:objects.length, vertices:objects[0]?.geometry.attributes.position.count,
      normals:objects.every(object=>Array.from(object.geometry.attributes.normal.array).every(Number.isFinite))};
  });
  expect(result.type).toBe('Mesh');expect(result.old).toBe(false);expect(result.drawables).toBe(1);
  expect(result.vertices).toBeGreaterThan(24);expect(result.normals).toBe(true);
  await page.locator('#usd-viewport').screenshot({path:info.outputPath(`${viewer}-clock.png`)});
  expect(errors).toEqual([]);
});
