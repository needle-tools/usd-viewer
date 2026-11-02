import {findArrays, arrayLayout} from './usd/viewer/arrayData.js';
import {sourceLocations} from './viewer-source-links.js';

export const LARGE_SOURCE = 1_000_000;
export const SOURCE_PAGE = 48_000;
const NUMBER = /[+-]?(?:\d[\d_]*(?:\.[\d_]*)?|\.[\d_]+)(?:[eE][+-]?[\d_]+)?/y;

// Large numeric literals must not become one token object per number/punctuation.
// Decode values only when the data table is opened, independently of inspection.
export function parseNumericArray(source,language='usda') {
  let at=0;
  const whitespace=()=>{while(at<source.length&&/\s/.test(source[at]))at++;};
  function read(depth=0){
    if(depth>8)throw new TypeError('Array nesting exceeds eight dimensions.');
    whitespace();const first=source[at];
    if(first==='['||first==='('){
      at++;const end=first==='['?']':')',values=[];whitespace();
      while(source[at]!==end){values.push(read(depth+1));whitespace();if(source[at]===','){at++;whitespace();}else if(source[at]!==end)throw new TypeError('Invalid numeric array.');}
      at++;return values;
    }
    NUMBER.lastIndex=at;const match=NUMBER.exec(source);
    if(!match)throw new TypeError('Invalid numeric array.');
    at=NUMBER.lastIndex;const value=Number(match[0].replaceAll('_',''));
    if(language==='usda'&&/^[+-]?[\d_]+$/.test(match[0])&&!Number.isSafeInteger(value))throw new TypeError('Integer exceeds JavaScript precision.');
    if(!Number.isFinite(value))throw new TypeError('Enter a finite number.');
    return value;
  }
  const value=read();whitespace();if(at!==source.length||!Array.isArray(value))throw new TypeError('Invalid numeric array.');return value;
}

const encoder=new TextEncoder(),decoder=new TextDecoder();
const numeric=new Uint8Array(256);
for(const c of '0123456789+-.eE_,()[] \t\r\n')numeric[c.charCodeAt(0)]=1;
function numericBlock(bytes,start) {
  let depth=0,rows=0,content=false,firstEnd=0;
  for(let i=start;i<bytes.length;i++){
    const c=bytes[i];if(!numeric[c])return null;
    if(c===44&&depth===1){if(content)rows++;content=false;if(!firstEnd)firstEnd=i;}
    else {
      if(depth===1&&c>32&&c!==93)content=true;
      if(c===91||c===40)depth++;
      else if(c===93||c===41)depth--;
    }
    if(depth===0){if(content)rows++;return {end:i+1,rows,firstEnd:firstEnd||i};}
  }
  return null;
}
function quotedEnd(bytes,start,quote,triple=false){
  for(let i=start+(triple?3:1);i<bytes.length;i++){
    if(bytes[i]===92){i++;continue;}
    if(bytes[i]===quote&&(!triple||bytes[i+1]===quote&&bytes[i+2]===quote))return i+(triple?3:1);
  }
  return bytes.length;
}

/** Inspect UTF-8 directly. Only the small document structure becomes a string;
 * large numeric literals remain byte ranges until the data table needs them. */
export function analyzeSource(source,language) {
  const bytes=typeof source==='string'?encoder.encode(source):source;
  const blocks=[],parts=[],segments=[];let previous=0,length=0,oversize=false;
  const prefix=end=>{if(end-previous>LARGE_SOURCE){oversize=true;return;}const part=decoder.decode(bytes.subarray(previous,end));segments.push({start:length,end:length+part.length,byteStart:previous,text:part});parts.push(part);length+=part.length;};
  for(let i=0;i<bytes.length;){
    const c=bytes[i];
    if(c===34||c===39||c===96){i=quotedEnd(bytes,i,c,bytes[i+1]===c&&bytes[i+2]===c);continue;}
    if(c===35||c===47&&bytes[i+1]===47){while(i<bytes.length&&bytes[i]!==10)i++;continue;}
    if(c===47&&bytes[i+1]===42){i+=2;while(i<bytes.length&&!(bytes[i]===42&&bytes[i+1]===47))i++;i+=2;continue;}
    if(language==='usda'&&(c===64||c===60)){const end=c===64?64:62;i++;while(i<bytes.length&&bytes[i]!==end)i++;i++;continue;}
    if(c===91){
      const block=numericBlock(bytes,i);
      if(block){
        if(block.end-i>=64_000){
          prefix(i);const seed='['+decoder.decode(bytes.subarray(i+1,block.firstEnd)).trim()+']';
          blocks.push({start:length,end:length+seed.length,originalStart:i,originalEnd:block.end,rows:block.rows});
          parts.push(seed);length+=seed.length;previous=block.end;
        }
        i=block.end;continue;
      }
    }
    i++;
  }
  prefix(bytes.length);if(oversize){const page=sourcePage(bytes);return {text:page.text,arrays:[],locations:sourceLocations(page.text,language),originalLength:bytes.length,blocks:[],rawOnly:true};}const text=parts.join('');
  const originalOffset=at=>{const block=blocks.find(block=>at===block.start||at===block.end);if(block)return at===block.start?block.originalStart:block.originalEnd;const segment=segments.find(segment=>at>=segment.start&&at<=segment.end);return segment?segment.byteStart+encoder.encode(segment.text.slice(0,at-segment.start)).length:at;};
  const locations=sourceLocations(text,language);
  const arrays=findArrays(text,language,{includeSmall:true}).map(array=>{
    const block=blocks.find(block=>block.start===array.start&&block.end===array.end);
    const result={...array,originalStart:originalOffset(array.start),originalEnd:originalOffset(array.end)};
    if(block){
      const layout=arrayLayout(array.value,array.type,array.name);layout.dims[0]=block.rows;delete layout.rows;
      Object.assign(result,{large:true,originalStart:block.originalStart,originalEnd:block.originalEnd,summary:layout,count:block.rows});
    }
    return result;
  });
  if(language==='javascript'){
    const ends=[...new Set(arrays.flatMap(array=>[array.originalStart,array.originalEnd]))].sort((a,b)=>a-b),positions=new Map();let byte=0,characters=0;
    for(const end of ends){for(;byte<end;byte++){const c=bytes[byte];if(c<128||c>=192)characters+=c>=240?2:1;}positions.set(end,characters);}
    for(const array of arrays){array.originalCharacterStart=positions.get(array.originalStart);array.originalCharacterEnd=positions.get(array.originalEnd);}
  }
  return {text,arrays,locations,originalLength:bytes.length,blocks,rawOnly:blocks.some(block=>!arrays.some(array=>array.start===block.start&&array.end===block.end))};
}

export function sourcePage(source,start=0) {
  const bytes=typeof source==='string'?encoder.encode(source):source;
  start=Math.max(0,Math.min(bytes.length,start));while(start>0&&(bytes[start]&192)===128)start--;
  let end=Math.min(bytes.length,start+SOURCE_PAGE),newline=end;
  while(newline>start+SOURCE_PAGE/2&&bytes[newline-1]!==10)newline--;
  if(newline>start+SOURCE_PAGE/2)end=newline;
  while(end<bytes.length&&(bytes[end]&192)===128)end++;
  return {text:decoder.decode(bytes.subarray(start,end)),start,end,total:bytes.length};
}

