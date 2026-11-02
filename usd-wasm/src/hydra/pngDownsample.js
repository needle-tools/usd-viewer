/** Inspect PNG dimensions without decoding its pixels. */
export function pngSize(bytes) {
  if(bytes.length<33 || bytes[0]!==137 || bytes[1]!==80 || bytes[2]!==78 || bytes[3]!==71) return null;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  return {width:view.getUint32(16),height:view.getUint32(20)};
}

/** Decode a PNG scanline at a time, retaining only the resized RGBA image.
 * Accepts fflate's streaming Unzlib constructor to keep the worker standalone.
 * Supports all standard PNG color types/depths and Adam7 interlacing.
 */
export function downsamplePng(bytes, limit, Unzlib) {
  const size=pngSize(bytes);if(!size || !Number.isInteger(limit)||limit<1)throw new Error('Invalid PNG or texture limit');
  const {width,height}=size,view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const depth=bytes[24],type=bytes[25],interlace=bytes[28],channels={0:1,2:3,3:1,4:2,6:4}[type];
  if(!width||!height||width>0x7fffffff||height>0x7fffffff||!channels||![1,2,4,8,16].includes(depth)||([2,4,6].includes(type)&&depth<8)||(type===3&&depth===16)||bytes[26]||bytes[27]||interlace>1)throw new Error('Unsupported PNG header');
  const scale=Math.min(1,limit/Math.max(width,height)),w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
  const output=new Uint8ClampedArray(w*h*4),accum=new Float32Array(output.length),xs=[],ys=new Map();
  function taps(count,extent,emit){for(let out=0;out<count;out++){const p=Math.max(0,Math.min(extent-1,(out+.5)*extent/count-.5)),lo=Math.floor(p),fraction=p-lo;emit(lo,out,1-fraction);if(fraction)emit(lo+1,out,fraction);}}
  taps(w,width,(x,out,weight)=>xs.push({x,out,weight}));
  taps(h,height,(y,out,weight)=>{if(!ys.has(y))ys.set(y,[]);ys.get(y).push({out,weight});});
  const passes=interlace?[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]]:[[0,0,1,1]];
  let palette,alpha,pass=-1,rowY,rowBytes,row,previous,at=0,filter=0,pw,ph,x0,y0,dx,dy,columns;
  const bpp=Math.max(1,Math.ceil(channels*depth/8));
  function nextPass(){
    do{pass++;if(pass>=passes.length){row=null;return;}[x0,y0,dx,dy]=passes[pass];pw=Math.max(0,Math.ceil((width-x0)/dx));ph=Math.max(0,Math.ceil((height-y0)/dy));}while(!pw||!ph);
    rowBytes=Math.ceil(pw*channels*depth/8);if(rowBytes>32*1024*1024)throw new Error('PNG scanline exceeds decoder limit');
    row=new Uint8Array(rowBytes);previous=new Uint8Array(rowBytes);rowY=0;at=0;
    columns=xs.filter(v=>v.x>=x0&&(v.x-x0)%dx===0).map(v=>({...v,x:(v.x-x0)/dx}));
  }
  function sample(index){
    if(depth===16)return (row[index*2]<<8)|row[index*2+1];
    if(depth===8)return row[index];
    const bit=index*depth;return (row[bit>>3]>>(8-depth-(bit&7)))&((1<<depth)-1);
  }
  const u8=v=>Math.round(v*255/((1<<depth)-1));
  function finishRow(){
    const rows=ys.get(y0+rowY*dy);
    if(rows)for(const {x,out,weight}of columns){
      const i=x*channels,a=sample(i),b=sample(i+1),c=sample(i+2);
      let r,g,bl,opacity=255;
      if(type===3){if(!palette||a*3+2>=palette.length)throw new Error('Invalid PNG palette');r=palette[a*3];g=palette[a*3+1];bl=palette[a*3+2];opacity=alpha?.[a]??255;}
      else if(type===0||type===4){r=g=bl=u8(a);if(type===4)opacity=u8(b);else if(alpha&&a===((alpha[0]<<8)|alpha[1]))opacity=0;}
      else{r=u8(a);g=u8(b);bl=u8(c);if(type===6)opacity=u8(sample(i+3));else if(alpha&&a===((alpha[0]<<8)|alpha[1])&&b===((alpha[2]<<8)|alpha[3])&&c===((alpha[4]<<8)|alpha[5]))opacity=0;}
      for(const target of rows){const dst=(target.out*w+out)*4,k=weight*target.weight;accum[dst]+=r*opacity/255*k;accum[dst+1]+=g*opacity/255*k;accum[dst+2]+=bl*opacity/255*k;accum[dst+3]+=opacity*k;}
    }
    const old=previous;previous=row;row=old;at=0;rowY++;if(rowY===ph)nextPass();
  }
  function decoded(chunk){
    for(let offset=0;offset<chunk.length;){
      if(!row)throw new Error('Excess PNG pixel data');
      if(at===0){filter=chunk[offset++];if(filter>4)throw new Error('Invalid PNG filter');at=1;continue;}
      const start=at-1,count=Math.min(rowBytes-start,chunk.length-offset),end=start+count,base=offset-start;
      // Reconstruct complete spans instead of dispatching on every pixel byte.
      if(filter===0)row.set(chunk.subarray(offset,offset+count),start);
      else if(filter===1)for(let i=start;i<end;i++)row[i]=(chunk[base+i]+(i>=bpp?row[i-bpp]:0))&255;
      else if(filter===2)for(let i=start;i<end;i++)row[i]=(chunk[base+i]+previous[i])&255;
      else if(filter===3)for(let i=start;i<end;i++)row[i]=(chunk[base+i]+(((i>=bpp?row[i-bpp]:0)+previous[i])>>1))&255;
      else for(let i=start;i<end;i++){
        const left=i>=bpp?row[i-bpp]:0,up=previous[i],corner=i>=bpp?previous[i-bpp]:0,p=left+up-corner,a=Math.abs(p-left),b=Math.abs(p-up),c=Math.abs(p-corner);
        row[i]=(chunk[base+i]+(a<=b&&a<=c?left:b<=c?up:corner))&255;
      }
      offset+=count;at+=count;if(end===rowBytes)finishRow();
    }
  }
  nextPass();const inflate=new Unzlib(decoded);let ended=false;
  for(let offset=8;offset+12<=bytes.length;){
    const length=view.getUint32(offset),tag=String.fromCharCode(...bytes.subarray(offset+4,offset+8)),start=offset+8,end=start+length;
    if(end+4>bytes.length)throw new Error('Truncated PNG chunk');
    if(tag==='PLTE')palette=bytes.subarray(start,end);else if(tag==='tRNS')alpha=bytes.subarray(start,end);
    else if(tag==='IDAT')for(let p=start;p<end;p+=4096)inflate.push(bytes.subarray(p,Math.min(p+4096,end)),false);
    else if(tag==='IEND'){inflate.push(new Uint8Array(),true);ended=true;break;}
    offset=end+4;
  }
  if(!ended||row)throw new Error('Incomplete PNG image');
  for(let i=0;i<output.length;i+=4){const a=accum[i+3];output[i]=a?accum[i]*255/a:0;output[i+1]=a?accum[i+1]*255/a:0;output[i+2]=a?accum[i+2]*255/a:0;output[i+3]=a;}
  return {data:output,width:w,height:h,sourceWidth:width,sourceHeight:height};
}
