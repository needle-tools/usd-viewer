import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {collectPackages,projectAsset} from './generate-simready-manifest.mjs';
import {createSimreadyLibrary,loadSimreadyResources} from '../public/viewer-simready.js';

test('inventory excludes payload USDs and preserves unusual declared entry points',()=>{
  const paths=['nested/chair/com.nvidia.simready.packaging.json','nested/chair/simready_usd/seat.usdc','nested/chair/simready_usd/payloads/base.usda','nested/chair/simready_usd/.thumbs/256x256/seat.usdc.png','nested/chair/simready_usd/.thumbs/256x256/seat.usdc_light.png'];
  const [item]=collectPackages(paths.map(path=>({type:'file',path,size:123})));
  assert.deepEqual(item.candidates,['nested/chair/simready_usd/seat.usdc']);
  const asset=projectAsset(item.package,item.candidates[0],item.files);
  assert.equal(asset.lightThumbnail,paths[4]);
  assert.throws(()=>projectAsset(item.package,'missing.usd',item.files),/Missing declared root/);
});

test('the complete catalog has unique entry points, valid pinned URLs and exhaustive category counts',async()=>{
  const manifest=JSON.parse(await fs.readFile('public/data/nvidia-simready.json','utf8'));
  let requests=0;
  const library=createSimreadyLibrary({fetchCatalog:async()=>{requests++;return {ok:true,json:async()=>manifest};}});
  const [catalog,again]=await Promise.all([library.load(),library.load()]);
  assert.equal(catalog,again);assert.equal(requests,1);
  assert.ok(catalog.cards.length>2000);assert.equal(catalog.cards.length,manifest.packageCount);
  assert.equal(new Set(catalog.cards.map(card=>card.url)).size,catalog.cards.length);
  assert.equal(catalog.categories.reduce((sum,category)=>sum+category.count,0),catalog.cards.length);
  for(const card of catalog.cards){
    assert.ok(card.url.startsWith(`https://huggingface.co/datasets/nvidia/simready-assets/resolve/${manifest.revision}/`));
    assert.ok(card.thumbnail.endsWith('.png'));assert.ok(card.source.includes(`/blob/${manifest.revision}/`));
  }
  const category=catalog.categories.find(category=>category.name==='Kitchenware');
  assert.equal((await library.cards(category.name)).length,category.count);
});

test('failed catalog downloads can be retried',async()=>{
  const manifest=JSON.parse(await fs.readFile('public/data/nvidia-simready.json','utf8'));let attempts=0;
  const library=createSimreadyLibrary({fetchCatalog:async()=>++attempts===1?{ok:false,status:503}:{ok:true,json:async()=>manifest}});
  await assert.rejects(library.load(),/503/);assert.equal((await library.load()).cards.length,manifest.assets.length);
});

test('resource indexes only offer existing texture previews and bounded USD prefetches',async()=>{
  const {collectResources,resourceShard}=await import('./generate-simready-manifest.mjs');
  const entries=[
    ['asset/simready_usd/Textures/a.png',100000000],
    ['asset/simready_usd/Textures/b.png',200],
    ['asset/simready_usd/Textures/.thumbs/512x512/a.png.png',50],
    ['asset/simready_usd/payloads/base.usda',150],
    ['asset/simready_usd/payloads/huge.usda',9000000],
    ['asset/source_assets/Textures/b.png',300],
  ].map(([path,size])=>({type:'file',path,size}));
  const data=collectResources(entries).asset;
  assert.deepEqual(data.textures,['Textures/a.png']);assert.equal(data.textureBytes,100000200);
  assert.deepEqual(data.layers,['payloads/base.usda']);assert.ok(resourceShard('asset')<16);
  const manifest=JSON.parse(await fs.readFile('public/data/nvidia-simready.json','utf8'));
  const indexed=new Set();
  for(let n=0;n<16;n++){
    const shard=JSON.parse(await fs.readFile(`public/data/simready-resources/${n}.json`,'utf8'));
    assert.equal(shard.revision,manifest.revision);
    for(const [name,data] of Object.entries(shard.assets)){
      assert.equal(resourceShard(name),n);indexed.add(name);
      assert.equal(Object.hasOwn(data,'textureOverrides'),false);
    }
  }
  for(const asset of manifest.assets)assert.ok(indexed.has(asset.package),asset.package);
});

test('texture URL selection uses published previews or the original asset URL',async()=>{
  const revision='4763fbfaa4f8e97658e68b57d01b4c86659e08b5';
  const base=`https://huggingface.co/datasets/nvidia/simready-assets/resolve/${revision}/generic_asset/simready_usd/`;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>({ok:true,json:async()=>({revision,assets:{generic_asset:{textures:['Textures/published.png']}}})});
  try {
    const resources=await loadSimreadyResources(base+'scene.usda');
    assert.equal(resources.resolveTextureUrl(base+'Textures/published.png'),base+'Textures/.thumbs/512x512/published.png.png');
    assert.equal(resources.resolveTextureUrl(base+'Textures/original.png'),base+'Textures/original.png');
    assert.equal(resources.resolveTextureUrl('https://other.test/image.png'),'https://other.test/image.png');
  } finally {globalThis.fetch=originalFetch;}
});
