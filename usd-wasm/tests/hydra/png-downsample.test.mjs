import assert from 'node:assert/strict';
import {test} from 'node:test';
import {zlibSync,Unzlib} from '../../src/vendor/fflate/fflate.js';
import {downsamplePng} from '../../src/hydra/pngDownsample.js';

const u32=n=>[n>>>24,n>>>16&255,n>>>8&255,n&255];
function chunk(tag,data){const type=new TextEncoder().encode(tag),body=new Uint8Array([...type,...data]);let crc=0xffffffff;for(const b of body){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return new Uint8Array([...u32(data.length),...body,...u32((crc^0xffffffff)>>>0)]);}
function png(width,height,depth,type,raw,{palette,alpha,interlace=0}={}){
 const parts=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',[...u32(width),...u32(height),depth,type,0,0,interlace])];
 if(palette)parts.push(chunk('PLTE',palette));if(alpha)parts.push(chunk('tRNS',alpha));
 parts.push(chunk('IDAT',zlibSync(new Uint8Array(raw))),chunk('IEND',[]));const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;
}
test('RGBA downsampling interpolates premultiplied alpha without a full-size bitmap',()=>{
 const image=png(2,2,8,6,[0,255,0,0,255,0,255,0,0,0,0,0,255,255,255,255,255,255]);
 const out=downsamplePng(image,1,Unzlib);assert.equal(out.width,1);assert.deepEqual([...out.data],[170,85,170,191]);
});
test('every scanline filter preserves RGB samples',()=>{
 const width=3,rows=Array.from({length:5},(_,y)=>Uint8Array.from({length:9},(_,i)=>20+y*13+i*7)),raw=[];
 for(let y=0;y<rows.length;y++){const filter=y;raw.push(filter);for(let i=0;i<9;i++){const a=i>=3?rows[y][i-3]:0,b=y?rows[y-1][i]:0,c=y&&i>=3?rows[y-1][i-3]:0;let p=0;if(filter===1)p=a;else if(filter===2)p=b;else if(filter===3)p=Math.floor((a+b)/2);else if(filter===4){const q=a+b-c,pa=Math.abs(q-a),pb=Math.abs(q-b),pc=Math.abs(q-c);p=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}raw.push((rows[y][i]-p+256)%256);}}
 const out=downsamplePng(png(width,5,8,2,raw),5,Unzlib);for(let y=0;y<5;y++)for(let x=0;x<3;x++)assert.deepEqual([...out.data.slice((y*3+x)*4,(y*3+x+1)*4)],[...rows[y].slice(x*3,x*3+3),255]);
});
test('packed palette transparency and 16-bit grayscale are decoded correctly',()=>{
 const palette=downsamplePng(png(4,1,2,3,[0,0b00011011],{palette:[255,0,0,0,255,0,0,0,255,255,255,255],alpha:[255,128,0,255]}),4,Unzlib);
 assert.deepEqual([...palette.data],[255,0,0,255,0,255,0,128,0,0,0,0,255,255,255,255]);
 const gray=downsamplePng(png(2,1,16,0,[0,0,0,255,255]),2,Unzlib);assert.deepEqual([...gray.data],[0,0,0,255,255,255,255,255]);
});
test('Adam7 passes produce the same resized pixels as noninterlaced data',()=>{
 const width=9,height=7,pixel=(x,y)=>[x*23,y*31,100,255],plain=[];
 for(let y=0;y<height;y++){plain.push(0);for(let x=0;x<width;x++)plain.push(...pixel(x,y));}
 const raw=[];for(const [x0,y0,dx,dy]of [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]])for(let y=y0;y<height;y+=dy){if(x0>=width)continue;raw.push(0);for(let x=x0;x<width;x+=dx)raw.push(...pixel(x,y));}
 const a=downsamplePng(png(width,height,8,6,plain),5,Unzlib),b=downsamplePng(png(width,height,8,6,raw,{interlace:1}),5,Unzlib);assert.deepEqual(b.data,a.data);
});
test('truncated images and invalid filters fail instead of yielding partial textures',()=>{
 const valid=png(1,1,8,6,[0,10,20,30,255]);assert.throws(()=>downsamplePng(valid.subarray(0,valid.length-6),1,Unzlib),/Truncated|Incomplete/);
 assert.throws(()=>downsamplePng(png(1,1,8,6,[9,10,20,30,255]),1,Unzlib),/filter/);
});
