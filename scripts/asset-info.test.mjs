import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assetSourceLinks,nvidiaAssetLink} from '../public/viewer-asset-info.js';

test('source links preserve HF revisions and reject non-web sources',()=>{
 const path='cabinet/simready_usd/model.usd',source=`https://huggingface.co/datasets/nvidia/simready-assets/resolve/abc/${path}?download=true`;
 assert.deepEqual(assetSourceLinks(source),{source:source.replace('/resolve/','/blob/').split('?')[0],huggingface:true,simreadyPath:path,simreadyRepository:'nvidia/simready-assets'});
 assert.equal(assetSourceLinks('javascript:alert(1)'),null);
 assert.equal(assetSourceLinks('https://example.org/asset.usdz').source,'https://example.org/asset.usdz');
 assert.equal(assetSourceLinks('https://huggingface.co/datasets/other/assets/resolve/main/a.usd').simreadyPath,null);
});

test('NVIDIA links filter the exact asset path across catalog revisions',()=>{
 const path='test-cabinet/simready_usd/model.usd';
 const result=new URL(nvidiaAssetLink(path));
 assert.equal(result.origin,'https://nvidia-simready-central.hf.space');
 assert.equal(result.searchParams.get('filter_url_regexp'),'.*/datasets/nvidia/simready-assets/(resolve|blob)/[^/]+/test-cabinet/simready_usd/model\\.usd');
 assert.equal(result.searchParams.has('asset'),false);
});

const {assetFileTotals}=await import('../public/viewer-asset-stats.js');
test('file totals deduplicate aliases, keep unknown sizes, and separate geometry and texture source bytes',()=>{
 assert.deepEqual(assetFileTotals([
  {path:'root.usda',size:100},{path:'root.usda'},
  {path:'mesh.usdc',size:200},{path:'mesh.usdc',size:200},
  {path:'textures/color.exr',size:400},{path:'textures/normal.ktx2',size:500},
  {path:'material.mdl',size:50},{path:'pending.png'},{path:'anon:session',size:999},
 ]),{count:6,total:1250,unknown:1,geometry:300,textures:900,other:50});
 assert.deepEqual(assetFileTotals([{path:'model.usdz',size:100},{path:'model.usdz[root.usdc]',size:60},{path:'model.usdz[textures/a.png]',size:70}]),{count:1,total:100,unknown:0,geometry:100,textures:0,other:0});
});
