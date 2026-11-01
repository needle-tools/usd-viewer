import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

for(const name of ['emHdBindings','emHdBindings.jspi'])test(`${name} worker progress reaches the main module's existing handler`,async()=>{
  const source=await readFile(new URL(`../../src/bindings/${name}.js`,import.meta.url),'utf8');
  const start=source.indexOf('if(ENVIRONMENT_IS_PTHREAD){Module["onAssetFetchProgress"]');
  assert.ok(start>0);
  const bridge=source.slice(start,source.indexOf('var arguments_=[];',start));
  let message;
  const worker={ENVIRONMENT_IS_PTHREAD:true,Module:{},postMessage:value=>{message=value;}};
  vm.runInNewContext(bridge,worker);
  const progress={url:'https://example.com/layer.usda',state:'start',loaded:0,total:0};
  worker.Module.onAssetFetchProgress(progress);
  assert.equal(message.cmd,'callHandler');assert.equal(message.handler,'onAssetFetchProgress');assert.equal(message.args[0],progress);
  let received;
  const main={ENVIRONMENT_IS_PTHREAD:false,Module:{onAssetFetchProgress:value=>{received=value;}}};
  vm.runInNewContext(bridge,main);main.Module[message.handler](...message.args);
  assert.equal(received,progress);
  const bare={ENVIRONMENT_IS_PTHREAD:false,Module:{}};vm.runInNewContext(bridge,bare);
  assert.doesNotThrow(()=>bare.Module.onAssetFetchProgress(progress));
});
