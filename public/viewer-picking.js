import {Mesh,Matrix4} from 'three';

// Only the app's picking queries use these trees. Geometry/index order, mesh
// raycast methods and renderer prototypes stay owned by the USD/Three consumer.
export function createPickingCache({onReady=()=>{},minimumTriangles=10000}={}) {
  let records=new WeakMap(),queue=[],worker,active,library,imports,disposed=false,serial=0;
  const proxy=new Mesh(),matrix=new Matrix4();
  const stamp=geometry=>{
    const position=geometry.attributes.position,index=geometry.index;
    return {position,index,pv:position.version??position.data?.version,iv:index?.version,
      range:`${geometry.drawRange.start}:${geometry.drawRange.count}`,groups:JSON.stringify(geometry.groups)};
  };
  const matches=(record)=>{
    const now=stamp(record.geometry),before=record.stamp;
    return now.position===before.position&&now.index===before.index&&now.pv===before.pv&&now.iv===before.iv&&now.range===before.range&&now.groups===before.groups;
  };
  const eligible=object=>object.isMesh&&!object.isSkinnedMesh&&!object.morphTexture&&!object.geometry?.morphAttributes?.position?.length
    &&!object.userData.usdPrimitiveType&&(object.geometry?.index?.count||object.geometry?.attributes.position?.count||0)/3>=minimumTriangles;
  function recordFor(object,prepare=true){
    if(!eligible(object))return null;
    const geometry=object.geometry;let record=records.get(geometry);
    if(record&&!matches(record)){record.tree=null;if(!record.pending){record.stamp=stamp(geometry);record.failed=false;}}
    if(!record){record={geometry,stamp:stamp(geometry),pending:false,failed:false,tree:null};records.set(geometry,record);}
    if(prepare&&!record.tree&&!record.pending&&!record.failed){record.pending=true;queue.push(record);void pump();}
    return record;
  }
  async function pump(){
    if(disposed||active||!queue.length)return;
    const record=queue.shift();active=record;
    try{
      library=await (imports ||= import('/three-mesh-bvh/build/index.module.js'));
      if(disposed||active!==record)return;
      if(!worker){
        worker=new Worker(new URL('./viewer-picking.worker.js',import.meta.url));
        worker.onmessage=({data})=>{
          const record=active;if(!record||record.id!==data.id)return;
          if(data.error){record.failed=true;console.warn('Picking acceleration unavailable:',data.error);}
          else if(matches(record)){
            try{record.tree=library.MeshBVH.deserialize(data.serialized,record.geometry,{setIndex:false});}
            catch(error){record.failed=true;console.warn('Picking acceleration unavailable:',error);}
          }
          else record.stamp=stamp(record.geometry);
          record.pending=false;active=null;onReady();void pump();
        };
        worker.onerror=event=>{
          event.preventDefault();console.warn('Picking worker unavailable:',event.message||'Worker could not start.');
          if(active){active.failed=true;active.pending=false;active=null;}
          for(const record of queue){record.failed=true;record.pending=false;}queue=[];
          worker?.terminate();worker=null;onReady();
        };
      }
      record.id=++serial;
      const {geometry}=record,position=geometry.attributes.position,index=geometry.index;
      let values,normalized=position.normalized;
      if(!position.isInterleavedBufferAttribute&&!position.isFloat16BufferAttribute&&position.itemSize===3)values=new position.array.constructor(position.array);
      else{values=new Float32Array(position.count*3);for(let i=0;i<position.count;i++)values.set([position.getX(i),position.getY(i),position.getZ(i)],i*3);normalized=false;}
      const indices=index?new index.array.constructor(index.array):null;
      const transfers=[values.buffer];if(indices)transfers.push(indices.buffer);
      worker.postMessage({id:record.id,position:values,index:indices,normalized,groups:geometry.groups,
        range:{...geometry.drawRange},threeUrl:import.meta.resolve('three'),bvhUrl:new URL('./modules/mesh-bvh.umd.js',import.meta.url).href},transfers);
    }catch(error){record.failed=true;record.pending=false;active=null;if(!disposed){console.warn('Picking acceleration unavailable:',error);onReady();void pump();}}
  }
  function reset(){worker?.terminate();worker=null;active=null;queue=[];records=new WeakMap();proxy.geometry=proxy.material=null;}
  return {
    prepare(scene){if(disposed)return;scene?.traverseVisible(object=>{if(eligible(object))recordFor(object);});},
    intersect(raycaster,candidates,{defer=false,accelerate=true}={}){
      const hits=[];let pending=false;
      const first=raycaster.firstHitOnly;raycaster.firstHitOnly=true;
      try{for(const object of candidates){
        const record=recordFor(object,accelerate);
        if(record?.tree&&matches(record)){
          // The tree owns fresh bounds. Three's cached mesh/instance sphere can
          // still describe the old positions immediately after a geometry edit.
          if(object.isInstancedMesh){
            proxy.geometry=object.geometry;proxy.material=object.material;
            for(let instance=0;instance<object.count;instance++){
              object.getMatrixAt(instance,matrix);proxy.matrixWorld.multiplyMatrices(object.matrixWorld,matrix);
              const found=[];record.tree.raycastObject3D(proxy,raycaster,found);
              for(const hit of found){hit.object=object;hit.instanceId=instance;hits.push(hit);}
            }
          }else record.tree.raycastObject3D(object,raycaster,hits);
        }else if(record?.pending&&defer)pending=true;
        else raycaster.intersectObject(object,false,hits);
      }}finally{if(first===undefined)delete raycaster.firstHitOnly;else raycaster.firstHitOnly=first;}
      hits.sort((a,b)=>a.distance-b.distance);return {hits,pending};
    },
    reset,
    dispose(){disposed=true;reset();},
  };
}
