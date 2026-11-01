import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {collectPackages,projectAsset} from './generate-simready-manifest.mjs';
import {createSimreadyLibrary} from '../public/viewer-simready.js';

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
    for(const name of Object.keys(shard.assets)){assert.equal(resourceShard(name),n);indexed.add(name);}
  }
  for(const asset of manifest.assets)assert.ok(indexed.has(asset.package),asset.package);
});

test('generated missing texture previews are attributed, pinned, and match their recorded bytes',async()=>{
  const {createHash}=await import('node:crypto');
  const index=JSON.parse(await fs.readFile('public/data/simready-textures/index.json','utf8'));
  assert.equal(index.author,'NVIDIA');assert.equal(index.license,'CC-BY-4.0');assert.equal(index.images.length,8);
  for(const image of index.images){
    assert.ok(image.source.includes(`/resolve/${index.revision}/`));
    assert.match(image.sourceSha256,/^[a-f0-9]{64}$/);
    const bytes=await fs.readFile('public/'+image.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),image.sha256);
    assert.equal(bytes.readUInt32BE(16),512);assert.ok(bytes.readUInt32BE(20)<=512);
  }
});
