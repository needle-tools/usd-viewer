const {createHash} = require('node:crypto');
const {readdir,stat,readFile} = require('node:fs/promises');
const path = require('node:path');

// Unbundled deployments need changing module URLs too: revalidating the HTML
// alone does not invalidate a previously cached dependency of a lazy import.
function createModuleVersions(root) {
  const cached = new Map();
  async function files(directory, recursive) {
    const entries = await readdir(directory,{withFileTypes:true});
    const nested = await Promise.all(entries.map(async entry=>{
      const file = path.join(directory,entry.name);
      if(entry.isDirectory())return recursive?files(file,true):[];
      return /\.(?:m?js|wasm)$/.test(entry.name)?[file]:[];
    }));
    return nested.flat();
  }
  return async function moduleVersions() {
    const sdk=path.join(root,'usd-wasm/src'),publicRoot=path.join(root,'public');
    const [sdkFiles,appFiles]=await Promise.all([files(sdk,true),files(publicRoot,false)]);
    const entries=await Promise.all([...sdkFiles,...appFiles].map(async file=>{
      const info=await stat(file),stamp=`${info.size}:${info.mtimeMs}:${info.ctimeMs}`,previous=cached.get(file);
      let hash=previous?.stamp===stamp?previous.hash:undefined;
      if(!hash){hash=createHash('sha256').update(await readFile(file)).digest('hex').slice(0,20);cached.set(file,{stamp,hash});}
      const relative=file.startsWith(sdk+path.sep)?'/usd/'+path.relative(sdk,file):'/'+path.relative(publicRoot,file);
      const url=relative.split(path.sep).join('/');return [url,`${url}?v=${hash}`];
    }));
    return Object.fromEntries(entries.sort(([a],[b])=>a.localeCompare(b)));
  };
}

module.exports={createModuleVersions};
