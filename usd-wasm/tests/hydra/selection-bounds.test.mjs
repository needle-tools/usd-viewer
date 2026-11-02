import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group,Mesh,InstancedMesh,BoxGeometry,MeshBasicMaterial,Matrix4} from 'three';
import {getSelectionBounds} from '../../src/viewer/selectionBounds.js';

const values={points:[[0,0,0],[2,0,0],[0,2,0],[20,0,0],[22,0,0],[20,2,0]],faceVertexCounts:[3,3],faceVertexIndices:[0,1,2,3,4,5]};
function handle(root,type='face',indices=[1]) {
  const prim=(path)=>({IsValid:()=>true,GetTypeName:()=>path.endsWith('/Subset')?'GeomSubset':'Mesh',delete(){},
    GetAttribute:name=>({IsValid:()=>true,Get:()=>name==='elementType'?type:name==='indices'?indices:values[name],delete(){}})});
  return {scene:root,getTime:()=>0,readStage:cb=>cb({GetPrimAtPath:prim}),resolveSelection:async(_path,_count,items)=>items.some(i=>i.path==='/Instance/Mesh')?[1]:[]};
}
test('subset bounds use only selected faces, including unbound subsets inside composed instances',async()=>{
  const root=new Group(),mesh=new InstancedMesh(new BoxGeometry(100,100,100),new MeshBasicMaterial(),2);root.position.set(0,5,0);root.add(mesh);mesh.userData.usdPath='/PrototypeMesh';mesh.setMatrixAt(1,new Matrix4().makeTranslation(3,0,0));
  try{const box=await getSelectionBounds(handle(root),[{path:'/Instance/Mesh/Subset'}]);assert.deepEqual(box.min.toArray(),[23,5,0]);assert.deepEqual(box.max.toArray(),[25,7,0]);}
  finally{mesh.geometry.dispose();mesh.material.dispose();}
});
test('point and edge subsets interpret authored vertex indices without material groups',async()=>{
  const root=new Group(),mesh=new Mesh(new BoxGeometry(),new MeshBasicMaterial());mesh.userData.usdPath='/Mesh';root.add(mesh);
  try{for(const type of ['point','edge']){const box=await getSelectionBounds(handle(root,type,[0,4]),[{path:'/Mesh/Subset'}]);assert.deepEqual(box.min.toArray(),[0,0,0]);assert.deepEqual(box.max.toArray(),[22,0,0]);}}
  finally{mesh.geometry.dispose();mesh.material.dispose();}
});
