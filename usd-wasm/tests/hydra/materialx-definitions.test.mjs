import {test} from 'node:test';
import assert from 'node:assert/strict';
import {materialXDefinitionsFor} from '../../src/hydra/materialxDefinitions.js';

test('custom MaterialX source assets use typed asset paths, including embedded @ characters',async()=>{
  const parser=globalThis.DOMParser,serializer=globalThis.XMLSerializer;
  globalThis.DOMParser=class {parseFromString(){return {querySelector:()=>null,documentElement:{children:[]}};}};
  globalThis.XMLSerializer=class {};
  const reads=[],deleted=[];
  const asset='materials/paint@v2.mtlx';
  const registry={
    disposed:false,materialXDefinitionCache:new Map(),allPaths:['unrelated.mtlx'],
    config:{driver:()=>({GetStage:()=>({GetPrimAtPath:path=>({
      GetAttribute:name=>({IsValid:()=>true,Get:time=>{assert.equal(name,'info:mtlx:sourceAsset');assert.ok(Number.isNaN(time));return asset;},delete:()=>deleted.push('attribute')}),
      delete:()=>deleted.push(path),
    })})})},
    getResourceExtension:path=>path.split('.').at(-1),readResourceText:async path=>{reads.push(path);return '<materialx/>';},
  };
  try {
    assert.equal(await materialXDefinitionsFor(registry,['ND_custom'],['/Looks/Surface']),'');
    assert.deepEqual(reads,[asset]);assert.deepEqual(deleted,['attribute','/Looks/Surface']);
  }finally{
    if(parser===undefined)delete globalThis.DOMParser;else globalThis.DOMParser=parser;
    if(serializer===undefined)delete globalThis.XMLSerializer;else globalThis.XMLSerializer=serializer;
  }
});
