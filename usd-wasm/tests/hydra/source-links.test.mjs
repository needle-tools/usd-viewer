import {test} from 'node:test';
import assert from 'node:assert/strict';
import {absolutePrimPath,sourceLocations,referencePaths,referencedSource} from '../../../public/viewer-source-links.js';

test('references resolve from the containing layer without confusing duplicate filenames',()=>{
  const source={identifier:'/needle/7/shot/layers/root.usda',path:'shot/layers/root.usda'};
  const geo={path:'shot/geo/shared.usda'},looks={path:'shot/looks/shared.usda'};
  assert.equal(referencedSource('../looks/shared.usda',source,[geo,looks]),looks);
  assert.equal(referencedSource('../geo/shared.usda',source,[geo,looks]),geo);
  assert.equal(referencedSource('shared.usda',source,[geo,looks]),undefined);
  assert.ok(referencePaths('../looks/shared.usda',source).includes('/needle/7/shot/looks/shared.usda'));
  assert.deepEqual(referencePaths('../geo.usda',{identifier:'https://example.com/shot/layers/root.usda'}),['https://example.com/shot/geo.usda']);
  assert.deepEqual(referencePaths('../geo.usda',{identifier:'/needle/7/asset.usdz[shot/layers/root.usda]'}),['/needle/7/asset.usdz[shot/geo.usda]']);
});

test('prim/property locations include metadata targets and skip comments and strings',()=>{
  const source=`#usda 1.0
 # def Cube "Wrong" { rel target = </Wrong> }
 def Xform "World" {
   def Xform "Copy" (prepend references = @model.usda@</Asset>) {}
   def Material "Mat" {
     token outputs:surface.connect = <Shader.outputs:surface>
     string note = "def Shader Fake {}"
     def Shader "Shader" { token outputs:surface }
   }
 }`;
  const {links,definitions}=sourceLocations(source,'usda');
  assert.deepEqual([...definitions.values()],['/World','/World/Copy','/World/Mat','/World/Mat.outputs:surface','/World/Mat.note','/World/Mat/Shader','/World/Mat/Shader.outputs:surface']);
  assert.equal(links.get(source.indexOf('</Asset>')).asset,'model.usda');
  assert.equal(links.get(source.indexOf('<Shader.outputs:surface>')).target,'/World/Mat/Shader.outputs:surface');
  assert.equal([...links.values()].some(link=>link.target==='/Wrong'),false);
  assert.equal(absolutePrimPath('../Looks/Mat','/World/Cube'),'/World/Looks/Mat');
  assert.equal(absolutePrimPath('.inputs:color','/World/Shader'),'/World/Shader.inputs:color');
});

test('JavaScript imports and literal targets are found without evaluating template expressions',()=>{
  const source="import { kit } from './scene-helpers.js'; const prim = '/World/Cube'; const url = 'https://example.com/docs'; const unsafe = `./${run()}.js`; // '/Wrong'";
  const links=[...sourceLocations(source,'javascript').links.values()];
  assert.deepEqual(links,[{kind:'file',target:'./scene-helpers.js'},{kind:'prim',target:'/World/Cube'},{kind:'url',target:'https://example.com/docs'}]);
});
