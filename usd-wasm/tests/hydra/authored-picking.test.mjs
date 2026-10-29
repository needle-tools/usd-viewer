import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group} from 'three';
import {getUsdModule} from '../../src/bindings/index.js';
import {createThreeHydra} from '../../src/create.three.js';
import {createInstanceMaskCache} from '../../src/viewer/instanceSelection.js';

test('Hydra maps mixed/masked prototype draw indices to authored point indices and back',async()=>{
  const USD=await getUsdModule({print(){},printErr(){}}),scene=new Group();
  const source=`#usda 1.0
def Xform "World" {
 def PointInstancer "PI" {
  rel prototypes = [</World/PI/A>, </World/PI/B>]
  int[] protoIndices = [1,0,1,0]
  int64[] ids = [10,20,30,40]
  int64[] invisibleIds = [20]
  point3f[] positions = [(1,0,0),(2,0,0),(3,0,0),(4,0,0)]
  def Cube "A" {}
  def Sphere "B" {}
 }
}`;
  const handle=await createThreeHydra({USD,scene,url:'mixed-picking.usda',buffer:new TextEncoder().encode(source)});
  try{
    await handle.ready();const meshes=[];scene.traverse(o=>{if(o.isInstancedMesh)meshes.push(o);});assert.equal(meshes.length,2);
    for(const mesh of meshes){
      const selections=[];
      for(let i=0;i<mesh.count;i++){
        const result=await handle.resolvePick(mesh.userData.usdPath,i);assert.ok(result.path.startsWith('/World/PI/'));
        const authored=result.instances[0].index;assert.notEqual(authored,1,'invisible authored instance is not drawn');
        assert.equal(result.instances[0].id,String([10,20,30,40][authored]));
        selections.push(authored);assert.deepEqual(await handle.resolveSelection(mesh.userData.usdPath,mesh.count,[result]),[i]);
      }
      assert.deepEqual(selections,mesh.count===1?[3]:[0,2]);
    }
    assert.equal(await handle.resolvePick('/not-a-render-prim',0),null);
  }finally{await handle.dispose();}
  assert.equal(await handle.resolvePick('/World/PI',0),null);
});

test('failed edits synchronize authored state and leave the edit queue usable',async()=>{
  const USD=await getUsdModule({print(){},printErr(){}}),scene=new Group();
  const handle=await createThreeHydra({USD,scene,url:'failed-edit.usda',buffer:new TextEncoder().encode('#usda 1.0\ndef Cube "Cube" {}')});
  const visible=()=>scene.children.filter(o=>o.isMesh&&o.visible).length;
  try{
    await handle.ready();assert.equal(visible(),1);const revision=handle.revision;
    await assert.rejects(handle.editStage(stage=>{const p=stage.GetPrimAtPath('/Cube');try{p.SetActive(false);}finally{p.delete();}throw new Error('after mutation');}),/after mutation/);
    assert.equal(visible(),0);assert.ok(handle.revision>revision);
    await handle.editStage(stage=>{const p=stage.GetPrimAtPath('/Cube');try{p.SetActive(true);}finally{p.delete();}});assert.equal(visible(),1);
    const events=[];
    await Promise.all([handle.editStage(async()=>{events.push(1);await new Promise(resolve=>setTimeout(resolve,10));events.push(2);}),handle.editStage(()=>events.push(3))]);
    assert.deepEqual(events,[1,2,3]);
  }finally{await handle.dispose();}
});

test('authored 64-bit point IDs are exact and selections follow an ID through array reordering',async()=>{
  const USD=await getUsdModule({print(){},printErr(){}}),scene=new Group();
  const source=`#usda 1.0
(startTimeCode=1; endTimeCode=2)
def PointInstancer "PI" {
 rel prototypes = </Cube>
 int[] protoIndices = [0,0]
 int64[] ids.timeSamples = {1:[9007199254740993,9007199254740995],2:[9007199254740995,9007199254740993]}
 point3f[] positions = [(1,0,0),(2,0,0)]
}
def Cube "Cube" {}`;
  const handle=await createThreeHydra({USD,scene,url:'stable-point-ids.usda',buffer:new TextEncoder().encode(source)});
  try{
    await handle.ready();let mesh;scene.traverse(o=>{if(o.isInstancedMesh)mesh=o;});
    const pick=await handle.resolvePick(mesh.userData.usdPath,0);assert.equal(pick.instances[0].id,'9007199254740993');
    await handle.setTime(2);
    assert.deepEqual(await handle.resolveSelection(mesh.userData.usdPath,mesh.count,[pick]),[1]);
    assert.equal((await handle.resolvePick(mesh.userData.usdPath,1)).instances[0].id,pick.instances[0].id);
  }finally{await handle.dispose();}
});

test('independent and nested point-instancer contexts use valid authored prim paths',async()=>{
  const USD=await getUsdModule({print(){},printErr(){}}),scene=new Group();
  const source=`#usda 1.0
def PointInstancer "Outer" {
 rel prototypes = </Inner>
 int[] protoIndices = [0,0]
 point3f[] positions = [(100,0,0),(200,0,0)]
}
def PointInstancer "Inner" {
 rel prototypes = </Cube>
 int[] protoIndices = [0,0]
 point3f[] positions = [(1,0,0),(2,0,0)]
}
def Cube "Cube" {}`;
  const handle=await createThreeHydra({USD,scene,url:'nested-independent.usda',buffer:new TextEncoder().encode(source)});
  try{
    await handle.ready();const stage=handle.driver.GetStage(),meshes=[];scene.traverse(o=>{if(o.isInstancedMesh)meshes.push(o);});
    assert.ok(meshes.some(o=>o.userData.usdPath.includes('{instance=')));
    for(const mesh of meshes)for(let i=0;i<mesh.count;i++){
      const pick=await handle.resolvePick(mesh.userData.usdPath,i);
      for(const context of pick.instances){const p=stage.GetPrimAtPath(context.path);try{assert.equal(p.IsValid(),true,context.path);}finally{p.delete();}}
      assert.deepEqual(await handle.resolveSelection(mesh.userData.usdPath,mesh.count,[pick]),[i]);
    }
  }finally{await handle.dispose();}
});

test('outline masks follow animated prototype remaps while playback stays active',async()=>{
  const USD=await getUsdModule({print(){},printErr(){}}),scene=new Group();
  const source=`#usda 1.0
(startTimeCode=1; endTimeCode=3; timeCodesPerSecond=1)
def PointInstancer "PI" {
 rel prototypes = [</A>, </B>]
 int[] protoIndices.timeSamples = {1:[1,0,1,0], 2:[0,1,0,1]}
 point3f[] positions = [(1,0,0),(2,0,0),(3,0,0),(4,0,0)]
}
def Cube "A" {}
def Sphere "B" {}`;
  const handle=await createThreeHydra({USD,scene,url:'animated-pick-masks.usda',buffer:new TextEncoder().encode(source)}),cache=createInstanceMaskCache();
  const wait=async(read,predicate)=>{for(let i=0;i<100;i++){const value=read();if(predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,2));}assert.fail('mask did not settle');};
  try{
    await handle.ready();let mesh;scene.traverse(o=>{if(o.isInstancedMesh&&o.userData.usdPath.includes('proto0_'))mesh=o;});
    const selected=[{path:'/PI',instances:[{path:'/PI',index:3}]}];
    await wait(()=>cache.get(mesh,selected,handle),mask=>mask.size===1);assert.deepEqual([...cache.get(mesh,selected,handle)],[1]);
    handle.setPlaying(true);handle.update(1);await handle.resolvePick(mesh.userData.usdPath,0);
    assert.equal(handle.isPlaying(),true);assert.equal(handle.renderedTime,2);
    await wait(()=>cache.get(mesh,selected,handle),mask=>mask.size===0);assert.deepEqual([...cache.get(mesh,selected,handle)],[]);
  }finally{cache.dispose();await handle.dispose();}
});

test('point glyph instance indices map to their USD parent instance, including outline masks',async()=>{
  const USD=await getUsdModule({print(){},printErr(){}}),scene=new Group();
  const source=`#usda 1.0
def PointInstancer "PI" {
 rel prototypes = </Points>
 int[] protoIndices = [0,0]
 point3f[] positions = [(0,0,0),(10,0,0)]
}
def Points "Points" {
 point3f[] points = [(0,0,0),(2,0,0),(4,0,0)]
 float[] widths = [0.5]
}`;
  const handle=await createThreeHydra({USD,scene,url:'instanced-point-glyphs.usda',buffer:new TextEncoder().encode(source)});
  try{
    await handle.ready();let mesh;scene.traverse(o=>{if(o.isInstancedMesh&&o.count===6)mesh=o;});assert.ok(mesh);
    for(let i=0;i<6;i++){
      const pick=await handle.resolvePick(mesh.userData.usdPath,i);assert.equal(pick.instances[0].index,Math.floor(i/3));
      assert.deepEqual(await handle.resolveSelection(mesh.userData.usdPath,6,[pick]),i<3?[0,1,2]:[3,4,5]);
    }
  }finally{await handle.dispose();}
});

test('nested point instance contexts resolve in both directions without flatten-index guesses',async()=>{
  const USD=await getUsdModule({print(){},printErr(){}}),scene=new Group();
  const source=`#usda 1.0
def PointInstancer "Outer" {
 rel prototypes = </Outer/Inner>
 int[] protoIndices = [0,0]
 point3f[] positions = [(-3,0,0),(3,0,0)]
 def PointInstancer "Inner" {
  rel prototypes = </Outer/Inner/Shape>
  int[] protoIndices = [0,0]
  point3f[] positions = [(0,0,0),(0,2,0)]
  def Cube "Shape" {}
 }
}`;
  const handle=await createThreeHydra({USD,scene,url:'nested-picking.usda',buffer:new TextEncoder().encode(source)});
  try{
    await handle.ready();let mesh;scene.traverse(o=>{if(o.isInstancedMesh)mesh=o;});assert.equal(mesh.count,4);
    const keys=new Set();
    for(let i=0;i<mesh.count;i++){
      const pick=await handle.resolvePick(mesh.userData.usdPath,i);assert.equal(pick.instances.length,2);
      keys.add(JSON.stringify(pick.instances));assert.deepEqual(await handle.resolveSelection(mesh.userData.usdPath,mesh.count,[pick]),[i]);
    }assert.equal(keys.size,4);
  }finally{await handle.dispose();}
});
