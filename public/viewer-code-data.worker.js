import {analyzeSource,parseNumericArray,parseNumericTimeSamples,sourcePage} from './viewer-code-data.js';
let source=new Uint8Array(),analysis;const encoder=new TextEncoder(),decoder=new TextDecoder();
function boolValue(value){
  if(Array.isArray(value))return value.map(boolValue);
  if(![0,1,true,false].includes(value))throw new Error('Invalid bool value.');
  return !!value;
}
self.onmessage=({data:{id,op,...data}})=>{
  try{
    let result;
    if(op==='analyze'){source=data.bytes||encoder.encode(data.source);analysis=analyzeSource(source,data.language);result=analysis;}
    else if(op==='samples'){
      const array=analysis.arrays[data.index];
      result=parseNumericTimeSamples(decoder.decode(source.subarray(array.originalStart,array.originalEnd)));
      if(/^bool(?:\[\])?$/.test(array.sampleType))result=result.map(sample=>({...sample,value:boolValue(sample.value)}));
    }
    else if(op==='array'){
      const array=analysis.arrays[data.index];
      result=parseNumericArray(decoder.decode(source.subarray(array.originalStart,array.originalEnd)),array.language);
      if(array.type==='bool[]')result=boolValue(result);
    }
    else if(op==='blob')result=new Blob([source],{type:'text/plain'});
    else if(op==='page')result=sourcePage(source,data.start);
    else throw new Error('Unknown source operation.');
    self.postMessage({id,result});
  }catch(error){self.postMessage({id,error:error.message||String(error)});}
};
