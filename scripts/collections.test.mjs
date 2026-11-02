import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCollectionLibrary,parseCollection} from '../public/viewer-collections.js';

test('collection inventory paginates, pins roots and uses only published previews',async()=>{
 const revision='a'.repeat(40),requests=[];
 const paths=['robot/com.nvidia.simready.packaging.json','robot/.metadata/com.nvidia.simready.root_usds.json','robot/simready_usd/root.usda','robot/simready_usd/payloads/mesh.usd','robot/simready_usd/.thumbs/256x256/root.usda.png'];
 const next=`https://huggingface.co/api/datasets/maker/assets/tree/${revision}?cursor=next`;
 const request=async url=>{requests.push(url);let data,headers={};
  if(url.includes('/revision/'))data={sha:revision};
  else if(url===next)data=paths.slice(2).map(path=>({type:'file',path}));
  else if(url.includes('/tree/')){data=paths.slice(0,2).map(path=>({type:'file',path}));headers.Link=`<${next}>; rel="next"`;}
  else data={entries:['simready_usd/root.usda']};
  return new Response(JSON.stringify(data),{headers});
 };
 const library=createCollectionLibrary('https://huggingface.co/datasets/maker/assets',{request});
 const [first,second]=await Promise.all([library.load(),library.load()]);assert.equal(first,second);
 assert.equal(first.cards.length,1);assert.match(first.cards[0].url,new RegExp(`/resolve/${revision}/robot/simready_usd/root.usda$`));
 assert.match(first.cards[0].thumbnail,/\.thumbs\/256x256\/root.usda.png$/);assert.equal(requests.length,4);
});

test('folder and revision URLs are preserved; unrelated URLs are rejected',()=>{
 assert.deepEqual(parseCollection('https://huggingface.co/datasets/maker/assets/tree/release/robots'),{repository:'maker/assets',revision:'release',folder:'robots',url:'https://huggingface.co/datasets/maker/assets/tree/release/robots'});
 assert.throws(()=>parseCollection('https://example.com/datasets/maker/assets'));
});
