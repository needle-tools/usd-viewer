// Classic-worker entry uses the library's browser UMD distribution. Three's URL
// comes from the host import map; workers do not inherit document import maps.
let dependencies;
self.onmessage = async ({data}) => {
  try {
    dependencies ||= (async()=>{
      self.THREE=await import(data.threeUrl);
      importScripts(data.bvhUrl);
    })();
    await dependencies;
    const {BufferGeometry,BufferAttribute}=self.THREE,{MeshBVH}=self.MeshBVHLib;
    const geometry=new BufferGeometry();
    geometry.setAttribute('position',new BufferAttribute(data.position,3,data.normalized));
    if(data.index)geometry.setIndex(new BufferAttribute(data.index,1));
    for(const group of data.groups)geometry.addGroup(group.start,group.count,group.materialIndex);
    const tree=new MeshBVH(geometry,{indirect:true,range:data.range});
    const serialized=MeshBVH.serialize(tree,{cloneBuffers:false});
    const transfers=[...serialized.roots,serialized.indirectBuffer.buffer];
    if(serialized.index)transfers.push(serialized.index.buffer);
    self.postMessage({id:data.id,serialized},transfers);
  }catch(error){self.postMessage({id:data.id,error:error.message||String(error)});}
};
