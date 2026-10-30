import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {getUsdModule,createThreeHydra} from '../../src/index.js';

test('hidden meshes defer geometry and restore the current authored data when shown',async()=>{
  const USD=await getUsdModule({print(){},printErr(){}}),scene=new Group();
  const source=`#usda 1.0
(
  startTimeCode = 1
  endTimeCode = 13
)
def Xform "World" {
  def Mesh "Subject" (prepend apiSchemas = ["PhysicsCollisionAPI"]) {
    bool physics:collisionEnabled = true
    uniform token subdivisionScheme = "none"
    int[] faceVertexCounts = [3]
    int[] faceVertexIndices = [0,1,2]
    point3f[] points = [(0,0,0),(1,0,0),(0,1,0)]
    point3f[] points.timeSamples = {
      1: [(0,0,0),(1,0,0),(0,1,0)],
      5: [(2,0,0),(3,0,0),(2,1,0)],
      9: [(4,0,0),(5,0,0),(4,1,0)],
      13: [(6,0,0),(7,0,0),(6,1,0)]
    }
    token visibility.timeSamples = {1: "invisible",5: "inherited",9: "invisible",13: "inherited"}
  }
}`;
  const handle=await createThreeHydra({USD,scene,url:'hidden-mesh.usda',buffer:new TextEncoder().encode(source)});
  const meshes=()=>{const result=[];scene.traverse(o=>{if(o.isMesh&&o.geometry.attributes.position?.count)result.push(o);});return result;};
  try{
    await handle.ready();
    assert.equal(meshes().length,0,'initially hidden meshes do not allocate render geometry');
    const physics=JSON.parse(await handle.driver.GetPhysicsSceneJson());
    assert.equal(physics.shapes[0].path,'/World/Subject','invisible collision data remains available to physics');
    assert.equal(physics.shapes[0].points.length,9);
    await handle.setTime(5);
    const mesh=meshes()[0];assert.ok(mesh);assert.equal(mesh.visible,true);
    assert.equal(mesh.geometry.attributes.position.getX(0),2);
    const positions=mesh.geometry.attributes.position;
    await handle.setTime(9);
    assert.equal(mesh.visible,false);assert.equal(mesh.geometry.attributes.position,positions);
    assert.equal(mesh.geometry.attributes.position.getX(0),2,'hidden point changes are deferred');
    await handle.setTime(13);
    assert.equal(mesh.visible,true);assert.equal(mesh.geometry.attributes.position.getX(0),6,'show applies the latest points');
    await handle.setTime(1);await handle.setTime(5);
    assert.equal(mesh.visible,true);assert.equal(mesh.geometry.attributes.position.getX(0),2,'backward seeking restores earlier points');
  }finally{await handle.dispose();}
});
