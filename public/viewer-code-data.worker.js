import {analyzeSource,parseNumericArray,sourcePage} from './viewer-code-data.js';
let source=new Uint8Array(),analysis;const encoder=new TextEncoder(),decoder=new TextDecoder();
self.onmessage=({data:{id,op,...data}})=>{
  try{
    let result;
    if(op==='analyze'){source=data.bytes||encoder.encode(data.source);analysis=analyzeSource(source,data.language);result=analysis;}
    else if(op==='array'){
      const array=analysis.arrays[data.index];
      result=parseNumericArray(decoder.decode(source.subarray(array.originalStart,array.originalEnd)),array.language);
      if(array.type==='bool[]')result=result.map(value=>{if(value!==0&&value!==1)throw new Error('Invalid bool array.');return !!value;});
    }
    else if(op==='blob')result=new Blob([source],{type:'text/plain'});
    else if(op==='page')result=sourcePage(source,data.start);
    else throw new Error('Unknown source operation.');
    self.postMessage({id,result});
  }catch(error){self.postMessage({id,error:error.message||String(error)});}
};
