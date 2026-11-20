import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getUsdModule} from '../runtime.mjs';

test('shared glTF vertex accessors and aliased UV sets survive native import without repeated V flips',async()=>{
 const USD=await getUsdModule();
 const points=[0,0,0,1,0,0,0,1,0],normals=[0,0,1,0,0,1,0,0,1],uvs=[0,.25,1,.5,.2,1];
 const bytes=new Uint8Array(new Float32Array([...points,...normals,...uvs]).buffer);
 const primitive={attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2,TEXCOORD_1:2}};
 const gltf={asset:{version:'2.0'},buffers:[{byteLength:bytes.length,uri:'data:application/octet-stream;base64,'+Buffer.from(bytes).toString('base64')}],
  bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:36},{buffer:0,byteOffset:72,byteLength:24}],
  accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5126,count:3,type:'VEC3'},{bufferView:2,componentType:5126,count:3,type:'VEC2'}],
  meshes:[{primitives:[primitive,primitive]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
 const file='/tmp/shared-accessors.gltf';
 USD.FS_createDataFile('/tmp','shared-accessors.gltf',new TextEncoder().encode(JSON.stringify(gltf)),true,true);
 const stage=await USD.OpenStage(file),prims=stage.TraverseAll();let meshes=0;
 try{
  assert.deepEqual(stage.GetCompositionErrors(),[]);
  for(let i=0;i<prims.size();i++){
   const prim=prims.get(i);
   try{
    if(prim.GetTypeName()!=='Mesh')continue;meshes++;
    for(const [name,expected] of [['points',points],['primvars:normals',normals],['primvars:st',[0,.75,1,.5,.2,0]],['primvars:st1',[0,.75,1,.5,.2,0]]]){
     const attribute=prim.GetAttribute(name);
     try{const values=(await attribute.Get(NaN)).flat();assert.deepEqual(values.map(v=>Math.round(v*1e5)/1e5),expected,name);}finally{attribute.delete();}
    }
   }finally{prim.delete();}
  }
  assert.equal(meshes,2);
 }finally{prims.delete();USD.ReleaseStage(stage);USD.FS_unlink(file);}
});
