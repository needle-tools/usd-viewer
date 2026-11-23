import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DataTexture,DataUtils,FloatType,HalfFloatType,NoColorSpace,RGBAFormat,SRGBColorSpace,UnsignedShortType} from 'three';
import {portableTexture,textureCanonicalizer} from '../../src/gltf/textures.js';

test('raw color maps become sRGB without changing alpha, source pixels or UV settings',()=>{
 const source=new DataTexture(new Uint8Array([128,64,16,96]),1,1);source.channel=2;source.offset.set(.2,.3);
 const copy=portableTexture(source,'map');
 assert.deepEqual([...copy.image.data],[188,137,71,96]);assert.equal(copy.colorSpace,SRGBColorSpace);
 assert.deepEqual([...source.image.data],[128,64,16,96]);assert.equal(source.colorSpace,NoColorSpace);
 assert.equal(copy.channel,2);assert.equal(copy.flipY,false);assert.deepEqual(copy.offset.toArray(),[.2,.3]);
 assert.notEqual(copy.source,source.source);
});

// GLTFExporter writes DataTexture pixels with putImageData, which ignores its flipY
// canvas transform. A baked copy must therefore store flipped textures bottom row
// first with flipY off: it renders identically and exports in glTF orientation.
test('baked copies of flipY textures store bottom-first rows instead of relying on flipY',()=>{
 const source=new DataTexture(new Uint8Array([0,0,0,255, 255,255,255,255]),1,2);source.flipY=true;
 const copy=portableTexture(source,'map');
 assert.notEqual(copy,source);assert.equal(copy.flipY,false);
 assert.deepEqual([...copy.image.data],[255,255,255,255, 0,0,0,255]);
 assert.equal(source.flipY,true);assert.deepEqual([...source.image.data],[0,0,0,255, 255,255,255,255]);
});

test('packed ORM clones share an export texture only when sampling and channel settings agree',()=>{
 const canonical=textureCanonicalizer(),source=new DataTexture(new Uint8Array([40,80,160,255]),1,1);
 const roughness=source.clone(),metalness=source.clone();
 assert.equal(canonical(roughness),roughness);assert.equal(canonical(metalness),roughness);
 const transformed=source.clone();transformed.repeat.set(2,2);assert.equal(canonical(transformed),transformed);
 const otherUv=source.clone();otherUv.channel=1;assert.equal(canonical(otherUv),otherUv);
 const otherPixels=source.clone();otherPixels.source=new (source.source.constructor)({...source.image,data:new Uint8Array([0,0,0,255])});assert.equal(canonical(otherPixels),otherPixels);
});

test('sRGB scalar maps decode RGB while preserving alpha and correctly encoded color maps stay shared',()=>{
 const source=new DataTexture(new Uint8Array([188,137,71,96]),1,1);source.colorSpace=SRGBColorSpace;
 assert.equal(portableTexture(source,'emissiveMap'),source);
 const copy=portableTexture(source,'roughnessMap');
 assert.deepEqual([...copy.image.data],[128,64,16,96]);assert.equal(copy.colorSpace,NoColorSpace);
});

for(const [type,data] of [[FloatType,new Float32Array([.5,.25,0,1])],[HalfFloatType,new Uint16Array([.5,.25,0,1].map(DataUtils.toHalfFloat))],[UnsignedShortType,new Uint16Array([32768,16384,0,65535])]])test(`typed texture samples normalize before PNG encoding (${type})`,()=>{
 const source=new DataTexture(data,1,1,RGBAFormat,type);
 assert.deepEqual([...portableTexture(source,'map').image.data],[188,137,0,255]);
 assert.deepEqual([...portableTexture(source,'normalMap').image.data],[128,64,0,255]);
 assert.equal(source.image.data,data);
});
