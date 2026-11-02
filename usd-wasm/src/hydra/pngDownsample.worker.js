import {downsamplePng} from './pngDownsample.js';
import {Unzlib} from '../vendor/fflate/fflate.js';
self.onmessage=({data:{id,bytes,limit}})=>{
  try{
    const result=downsamplePng(bytes,limit,Unzlib);self.postMessage({id,result},[result.data.buffer]);
  }
  catch(error){self.postMessage({id,error:String(error?.message||error)});}
};
