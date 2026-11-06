import {test, expect} from './test';
import {stageReady} from './workbench-menus';

for (const viewer of ['three','needle']) for (const name of ['ktx2-mosaic','image-formats','exr-neon']) {
  test(`${viewer}: ${name} renders decoded material textures`, async ({page}, info) => {
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/Error loading USD material texture/.test(m.text()))errors.push(m.text());});
    await page.goto(`/?viewer=${viewer}&render=beauty&assetCache=0&file=/test-fixtures/coverage/textures/${name}.usda`);
    await stageReady(page);await page.evaluate(async()=>await (window as any).usdHydra.materialsReady());
    const textures=await page.evaluate(async()=>{
      const w=window as any,T=await import('three'),maps:any[]=[];
      w.usdHydra.scene.traverse((o:any)=>{if(o.isMesh)for(const m of [o.material].flat())for(const slot of ['map','emissiveMap']){
        const t=m?.[slot];if(!t)continue;const values=t.image?.data;
        let maximum=0;if(values)for(let i=0;i<values.length;i++)maximum=Math.max(maximum,t.type===T.HalfFloatType?T.DataUtils.fromHalfFloat(values[i]):values[i]);
        maps.push({slot,name:t.name,compressed:!!t.isCompressedTexture,colorSpace:t.colorSpace,width:t.image?.width,maximum});
      }});return maps;
    });
    if(name==='ktx2-mosaic'){
      expect(textures.filter(t=>t.name.endsWith('.ktx2')).length).toBeGreaterThan(0);
      expect(textures.every(t=>t.compressed&&t.colorSpace==='srgb')).toBe(true);
    }else if(name==='exr-neon'){
      expect(textures.some(t=>t.slot==='emissiveMap'&&t.name.endsWith('.exr')&&t.maximum>3&&t.width===128&&t.colorSpace==='srgb-linear')).toBe(true);
    }else for(const extension of ['png','jpg','tga'])expect(textures.some(t=>t.name.endsWith('.'+extension))).toBe(true);
    await page.mouse.move(0,0);await page.waitForTimeout(600);await page.screenshot({path:info.outputPath('render.png')});
    expect(errors).toEqual([]);
  });
}

test('KTX2 scalar channel remapping decodes readable samples without disturbing its compressed color map',async({page})=>{
  await page.goto('/?viewer=three&render=beauty&assetCache=0&file=/test-fixtures/coverage/textures/ktx2-mosaic.usda');await stageReady(page);
  const result=await page.evaluate(async()=>{
    const w=window as any;await w.usdHydra.materialsReady();
    const sh=w.usdStage.GetPrimAtPath('/World/Looks/Mosaic/Surface'),rough=sh.GetAttribute('inputs:roughness');
    await w.usdStagePanel.edit(()=>{rough.AddConnection('/World/Looks/Mosaic/Texture.outputs:r');});await w.usdHydra.materialsReady();
    const values:any[]=[];w.usdHydra.scene.traverse((o:any)=>{const m=o.material;if(m?.map?.name.endsWith('.ktx2'))values.push({compressed:m.map.isCompressedTexture,readable:m.roughnessMap?.isDataTexture,data:!!m.roughnessMap?.image?.data,distinct:m.map.source!==m.roughnessMap?.source});});return values;
  });
  expect(result.length).toBeGreaterThan(0);expect(result.every(v=>v.compressed&&v.readable&&v.data&&v.distinct), JSON.stringify(result)).toBe(true);
});

for(const name of ['shot','lookdev']) test(`production ${name}: layers, payloads, variants and USDZ export compose together`,async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`/?viewer=three&render=beauty&assetCache=0&file=/test-fixtures/coverage/production/${name}.usda`);await stageReady(page);
  const result=await page.evaluate(async name=>{
    const w=window as any;await w.usdHydra.materialsReady();const {setVariant}=await import('/usd/scene/index.js');
    const path=name==='shot'?'/World/Robots/Coral':'/World/Robot';
    const layers=w.usdStage.GetUsedLayers(false).map((l:any)=>l.displayName);
    await setVariant(w.usdHydra,path,'finish','Gold');await w.usdHydra.materialsReady();
    const selection=w.usdStage.GetPrimAtPath(path).GetVariantSelection('finish');
    const bytes=await w.usdHydra.exportUsdz();const {getUsdModule}=await import('/usd/index.js'),USD=await getUsdModule();
    USD.FS_createDataFile('/tmp','composition-roundtrip.usdz',bytes,true,true,true);const reopened=await USD.OpenStage('/tmp/composition-roundtrip.usdz');
    let restored;try{restored=reopened.GetPrimAtPath(path).GetVariantSelection('finish');}finally{USD.ReleaseStage(reopened);USD.FS_unlink('/tmp/composition-roundtrip.usdz');}
    return {layers,selection,restored,bytes:bytes.length};
  },name);
  expect(result.layers).toEqual(expect.arrayContaining(['model.usda','looks.usda','geometry.usda']));
  expect(result.selection).toBe('Gold');expect(result.restored).toBe('Gold');expect(result.bytes).toBeGreaterThan(1000);
  await page.screenshot({path:info.outputPath('assembly.png')});expect(errors).toEqual([]);
});
