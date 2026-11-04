import {zipSync,strToU8} from '../vendor/fflate/fflate.js';

/** Preserve entry order (the root layer is first), stored bytes and 64-byte
 * data alignment after replacing archive dependencies. */
export function writeAlignedUsdz(entries) {
  let offset=0;
  const files={};
  for(const [name,bytes] of Object.entries(entries)) {
    const header=30+strToU8(name).length;
    let padding=(64-(offset+header)%64)%64;
    if(padding>0&&padding<4)padding+=64;
    files[name]=[bytes,{level:0,...(padding?{extra:{65535:new Uint8Array(padding-4)}}:{})}];
    offset+=header+padding+bytes.length;
  }
  return zipSync(files,{level:0});
}
