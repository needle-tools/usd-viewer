import {BufferAttribute,BufferGeometry,LessEqualDepth} from 'three';

// Fragmented USD subsets can produce many draw sections for the same surface.
// Join depth-writing opaque sections into glTF primitives; blended and
// transmissive sections keep their order. Source geometry and slots stay intact.
export function coalesceGroups(source,materials,cache=new WeakMap()) {
 const unchanged={geometry:source,materials};
 if(!Array.isArray(materials)||source.groups.length<2||source.index?.normalized)return unchanged;
 const unique=[],slots=new Map(),remap=materials.map(material=>{
  if(!slots.has(material)){slots.set(material,unique.length);unique.push(material);}return slots.get(material);
 });
 const opaque=unique.map(material=>!!material&&!material.transparent&&!material.transmission&&material.depthWrite!==false&&material.depthTest!==false&&(material.depthFunc===undefined||material.depthFunc===LessEqualDepth));
 const key=JSON.stringify(remap.map(slot=>[slot,opaque[slot]]));
 let variants=cache.get(source);
 if(variants?.has(key))return{geometry:variants.get(key),materials:unique};
 const count=source.index?.count??source.attributes.position?.count??0;
 const buckets=[],merged=new Map();let total=0;
 for(const group of source.groups){
  const slot=remap[group.materialIndex];if(slot===undefined)return unchanged;
  const start=Math.max(0,group.start,source.drawRange.start),end=Math.min(count,group.start+group.count,source.drawRange.start+source.drawRange.count);
  if(end<=start)continue;
  if(!Number.isInteger(start)||!Number.isInteger(end)||(end-start)%3)return unchanged;
  let bucket=opaque[slot]&&merged.get(slot);
  if(!bucket){bucket={slot,ranges:[],count:0};buckets.push(bucket);if(opaque[slot])merged.set(slot,bucket);}
  bucket.ranges.push({start,end});bucket.count+=end-start;total+=end-start;
 }
 if(buckets.length>=source.groups.length)return unchanged;
 const geometry=new BufferGeometry();geometry.attributes={...source.attributes};geometry.userData={...source.userData};
 geometry.morphAttributes={...source.morphAttributes};geometry.morphTargetsRelative=source.morphTargetsRelative;
 const indices=new Uint32Array(total);let offset=0;
 for(const bucket of buckets){
  geometry.addGroup(offset,bucket.count,bucket.slot);
  for(const {start,end}of bucket.ranges){
   if(source.index&&!source.index.isInterleavedBufferAttribute)indices.set(source.index.array.subarray(start,end),offset);
   else for(let i=start;i<end;i++)indices[offset+i-start]=source.index?source.index.getX(i):i;
   offset+=end-start;
  }
 }
 geometry.setIndex(new BufferAttribute(indices,1));
 if(!variants)cache.set(source,variants=new Map());variants.set(key,geometry);
 return{geometry,materials:unique};
}
