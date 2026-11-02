import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getUsdModule} from '../runtime.mjs';
import {inspectPrimAsync} from '../../src/scene/index.js';

test('native attribute pages bound transfers, preserve types and never modify the composed value',async()=>{
 const USD=await getUsdModule({print(){},printErr(){}});
 const source='#usda 1.0\ndef Xform "Data" {\n int[] values = ['+Array.from({length:10000},(_,i)=>i).join(',')+']\n point3f[] points = [(1,2,3),(4,5,6),(7,8,9)]\n token[] names = ["one","two","three"]\n float scalar = 2\n}\n';
 USD.FS_createDataFile('/','pages.usda',new TextEncoder().encode(source),true,true,true);
 const stage=await USD.OpenStage('/pages.usda'),prim=stage.GetPrimAtPath('/Data');
 try{
  const attr=prim.GetAttribute('values');
  try{
   assert.deepEqual(await attr.GetValuePage(0,9998,64),{value:[9998,9999],total:10000,offset:9998});
   assert.deepEqual(await attr.GetValuePage(0,10000,64),{value:[],total:10000,offset:10000});
   const page=await attr.GetValuePage(0,0,2);page.value[0]=-100;
   assert.deepEqual((await attr.GetValuePage(0,0,2)).value,[0,1]);
   assert.deepEqual((await attr.GetValuePage(0,0,0)).value,[]);
   assert.equal((await attr.Get(0)).length,10000);
  }finally{attr.delete();}
  for(const [name,value,total] of [['points',[[4,5,6]],3],['names',['two'],3],['scalar',2,null]]){
   const attr=prim.GetAttribute(name);try{assert.deepEqual(await attr.GetValuePage(0,1,1),{value,total,offset:1});}finally{attr.delete();}
  }
  const bounded=await inspectPrimAsync(stage,'/Data',0,{arrayLimit:2});
  assert.equal(bounded.attributes.find(a=>a.name==='values').arraySize,10000);
  assert.deepEqual(bounded.attributes.find(a=>a.name==='values').value,[0,1]);
  const full=await inspectPrimAsync(stage,'/Data');assert.equal(full.attributes.find(a=>a.name==='values').value.length,10000);
 }finally{prim.delete();USD.ReleaseStage(stage);USD.FS_unlink('/pages.usda');}
});
