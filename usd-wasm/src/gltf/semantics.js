// Source property descriptions never cross the export boundary. The only
// non-physics values translated here are semantic labels with runtime targets.
const labelName=/^(?:semantics:labels:(.+)|simready:category)$/;
const values=value=>typeof value==='string'?[value]:Array.isArray(value)&&value.every(item=>typeof item==='string')?value:[];
async function vector(items,read=value=>value){
 if(!items)return[];const result=[];
 try{for(let i=0;i<items.size();i++){const item=items.get(i);try{result.push(await read(item));}finally{item?.delete?.();}}return result;}finally{items.delete?.();}
}
export async function readRuntimeSemanticLabels(handle){
 if(!handle.readStage)return[];
 return handle.readStage(async stage=>{
  if(!stage?.TraverseAll)return[];
  const result=[];
  await vector(stage.TraverseAllWithInstanceProxies?.(null)||stage.TraverseAll(),async prim=>{
   const path=prim.GetPath();
   await vector(prim.GetAttributes(),async attribute=>{
    const match=labelName.exec(attribute.GetName());if(!match||!attribute.HasAuthoredValueOpinion?.())return;
    const labels=[...new Set(values(await attribute.Get(handle.getTime?.()??0)).filter(Boolean))];
    if(labels.length)result.push({path,taxonomy:match[1]||'class',labels});
   });
  });return result;
 });
}
export function bindRuntimeSemanticLabels(source,bindings){
 const result=[];
 for(const path of new Set(bindings.map(binding=>binding.path))){
  const inherited=new Map();
  for(const record of source.filter(record=>path===record.path||path.startsWith(record.path+'/')).sort((a,b)=>a.path.length-b.path.length))inherited.set(record.taxonomy,record.labels);
  for(const [taxonomy,labels]of inherited)result.push({path,taxonomy,labels:[...labels]});
 }
 return result;
}
