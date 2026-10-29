import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createSelection, selectionKey} from '../../src/viewer/selection.js';

test('selection toggles, range anchor and active prim are shared immutable identities',()=>{
  const s=createSelection();s.choose('/A');s.choose('/C',{toggle:true});assert.deepEqual(s.items.map(x=>x.path),['/A','/C']);
  s.choose('/C',{toggle:true});assert.equal(s.primary.path,'/A');
  s.choose('/D',{range:true,order:['/A','/B','/C','/D']});assert.deepEqual(s.items.map(x=>x.path),['/A','/B','/C','/D']);
  s.choose('/B',{range:true,order:['/A','/B','/C','/D']});assert.deepEqual(s.items.map(x=>x.path),['/A','/B']);assert.equal(s.anchor,'/A');
  assert.throws(()=>s.items.push({path:'/X'}));assert.throws(()=>{s.primary.path='/X';});
});
test('point identities distinguish instances while native pick metadata does not duplicate tree selection',()=>{
  const s=createSelection();s.choose({path:'/Native/Geom',renderPath:'/Native/proto_Geom_id0',renderInstanceIndex:0,instances:[]});
  s.choose('/Native/Geom',{toggle:true});assert.equal(s.items.length,0);
  const a={path:'/PI/Proto',instances:[{path:'/PI',index:2}]},b={path:'/PI/Proto',instances:[{path:'/PI',index:4}]};
  s.choose(a);s.choose(b,{toggle:true});assert.equal(s.items.length,2);assert.notEqual(selectionKey(s.items[0]),selectionKey(s.items[1]));
  a.instances[0].index=6;assert.equal(s.items[0].instances[0].index,2);
});
test('modified background clicks retain selection and pruning keeps only valid authored entities',()=>{
  let changes=0;const s=createSelection({onChange:()=>changes++});s.replace(['/A','/A','/B']);assert.equal(changes,1);
  s.choose(null,{toggle:true});assert.equal(changes,1);s.prune(item=>item.path!=='/A');assert.deepEqual(s.items.map(x=>x.path),['/B']);
  s.clear();assert.equal(s.primary,null);assert.equal(s.items.length,0);
});
