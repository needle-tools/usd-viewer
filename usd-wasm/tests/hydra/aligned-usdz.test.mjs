import assert from 'node:assert/strict';
import {test} from 'node:test';
import {unzipSync} from '../../src/vendor/fflate/fflate.js';
import {writeAlignedUsdz} from '../../src/scene/alignedUsdz.js';

test('rewritten USDZ keeps root order, stored entries, CRC and 64-byte data alignment',()=>{
 const entries={'root.usda':new TextEncoder().encode('#usda 1.0\n'), 'textures/ä image.png':new Uint8Array(93).fill(123), 'short':new Uint8Array(1), 'sub/layer.usda':new Uint8Array(128).fill(42)};
 const bytes=writeAlignedUsdz(entries),view=new DataView(bytes.buffer);let offset=0,names=[];
 while(view.getUint32(offset,true)===0x04034b50){
  assert.equal(view.getUint16(offset+8,true),0);const nameLength=view.getUint16(offset+26,true),extraLength=view.getUint16(offset+28,true);
  names.push(new TextDecoder().decode(bytes.subarray(offset+30,offset+30+nameLength)));
  const data=offset+30+nameLength+extraLength;assert.equal(data%64,0);offset=data+view.getUint32(offset+18,true);
 }
 assert.deepEqual(names,Object.keys(entries));assert.deepEqual(unzipSync(bytes),entries);
});
