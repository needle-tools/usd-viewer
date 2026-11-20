import {test} from 'node:test';import assert from 'node:assert/strict';
import {selectAssets,retainsSuccessfulGlbs,canReuseReport} from '../usd-wasm/scripts/corpus/policy.mjs';
const catalogue={assets:[{id:'a',root:'a/model.usd'},{id:'b',root:'b/model.usd'},{id:'c',root:'c/unique.usd'}]};
test('exact targeted reruns accept source paths, IDs and unique basenames without broadening matches',()=>{
 for(const file of ['b','b/model.usd','b\\model.usd'])assert.deepEqual(selectAssets(catalogue,{file}).map(a=>a.id),['b']);
 assert.equal(selectAssets(catalogue,{file:'unique.usd'})[0].id,'c');
 assert.throws(()=>selectAssets(catalogue,{file:'model.usd'}),/exactly one/);
 assert.throws(()=>selectAssets(catalogue,{file:'missing.usd'}),/exactly one/);
 assert.throws(()=>selectAssets(catalogue,{file:'b',only:'a'}),/cannot be combined/);
});
test('successful GLBs are retained by default and deletion requires an explicit choice',()=>{
 assert.equal(retainsSuccessfulGlbs({}),true);assert.equal(retainsSuccessfulGlbs({'keep-success':true}),true);
 assert.equal(retainsSuccessfulGlbs({'discard-success':true}),false);
 assert.throws(()=>retainsSuccessfulGlbs({'discard-success':true,'keep-success':true}),/Choose either/);
});
test('resume regenerates missing retained artifacts instead of treating an old report as a retained GLB',()=>{
 const report={identity:'i',harness:{sha256:'h'},status:'passed',artifact:true,bytes:20};
 const options={identity:'i',harnessSha256:'h',retainSuccess:true,artifactSize:20};
 assert.equal(canReuseReport(report,options),true);
 for(const artifactSize of [undefined,0,19])assert.equal(canReuseReport(report,{...options,artifactSize}),false);
 assert.equal(canReuseReport({...report,artifact:false},options),false);
 assert.equal(canReuseReport(report,{...options,harnessSha256:'other'}),false);
 assert.equal(canReuseReport({...report,artifact:false},{...options,retainSuccess:false}),true);
 assert.equal(canReuseReport({...report,status:'failed'},options),false);
 assert.equal(canReuseReport({...report,status:'failed'},{...options,retainSuccess:false}),false);
});
