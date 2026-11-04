import {unzipSync} from '../vendor/fflate/fflate.js';
import {textureFileType} from '../hydra/textureFileType.js';
import {writeAlignedUsdz} from './alignedUsdz.js';

self.onmessage=async({data:{bytes,maxTextureSize}})=>{
  try {
    const entries=unzipSync(bytes),images=Object.entries(entries).filter(([name,data])=>textureFileType(name.split('.').pop(),data)?.startsWith('image/'));
    let completed=0;
    for(const [name,data] of images) {
      const type=textureFileType(name.split('.').pop(),data);
      if(!['image/png','image/jpeg','image/webp'].includes(type))throw new Error(`Preview texture export cannot encode ${type}; choose full-resolution textures.`);
      const bitmap=await createImageBitmap(new Blob([data],{type}),{colorSpaceConversion:'none',premultiplyAlpha:'none'});
      try {
        const scale=Math.min(1,maxTextureSize/Math.max(bitmap.width,bitmap.height));
        if(scale<1) {
          const canvas=new OffscreenCanvas(Math.max(1,Math.round(bitmap.width*scale)),Math.max(1,Math.round(bitmap.height*scale)));
          canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
          const blob=await canvas.convertToBlob({type,quality:1});
          if(blob.type!==type)throw new Error('Preview texture encoder did not preserve the image format.');
          entries[name]=new Uint8Array(await blob.arrayBuffer());
        }
      } finally {bitmap.close();}
      self.postMessage({progress:{phase:'textures',completed:++completed,total:images.length}});
    }
    const result=writeAlignedUsdz(entries);self.postMessage({bytes:result},[result.buffer]);
  } catch(error) {self.postMessage({error:String(error?.message||error)});}
};
