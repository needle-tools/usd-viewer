import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {getUsdModule} from '../runtime.mjs';
import {createThreeHydra} from '../../src/create.three.js';

const points=[[-.65,-.65,.65],[.65,-.65,.65],[-.65,.65,.65],[.65,.65,.65],[-.65,.65,-.65],[.65,.65,-.65],[-.65,-.65,-.65],[.65,-.65,-.65]];
const tuples=values=>'['+values.map(p=>'('+p.join(',')+')').join(',')+']';
const sheared=points.map(([x,y,z])=>[x,y,z+.3*x]);
const source=`#usda 1.0
(startTimeCode=1;endTimeCode=2)
def Mesh "Cube" {
 point3f[] points.timeSamples={1:${tuples(points)},2:${tuples(sheared)}}
 int[] faceVertexCounts=[4,4,4,4,4,4]
 int[] faceVertexIndices=[0,1,3,2,2,3,5,4,4,5,7,6,6,7,1,0,1,7,5,3,6,0,2,4]
 int[] creaseIndices=[0,1,1,3,3,2,2,0,2,4,4,5,5,3,5,7,7,6,6,4,6,0,7,1]
 int[] creaseLengths=[2,2,2,2,2,2,2,2,2,2,2,2]
 float[] creaseSharpnesses=[8,8,8,8,8,8,8,8,8,8,8,8]
 int[] cornerIndices=[0,1,2,3,4,5,6,7]
 float[] cornerSharpnesses=[4,4,4,4,4,4,4,4]
 uniform token subdivisionScheme="catmullClark"
}`;

for(const complexity of ['medium','very-high','adaptive']) test(`${complexity}: generated normals follow planar creased faces through animated shear and seeking`,async()=>{
  const USD=await getUsdModule({print(){},printErr(){}}),scene=new Group();
  const h=await createThreeHydra({USD,scene,buffer:new TextEncoder().encode(source),url:`planar-normals-${complexity}.usda`,complexity});
  try {
    await h.ready();
    for(const [time,shear]of [[1,0],[2,.3],[1,0]]){
      await h.setTime(time);let mesh;scene.traverse(o=>{if(o.isMesh)mesh=o;});
      const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal,scale=Math.hypot(shear,1);
      let checked=0;
      for(let i=0;i<p.count;i++){
        if(Math.abs(p.getZ(i)-shear*p.getX(i)-.65)>.001||Math.abs(p.getX(i))>.52||Math.abs(p.getY(i))>.52)continue;
        const dot=(-shear*n.getX(i)+n.getZ(i))/scale/Math.hypot(n.getX(i),n.getY(i),n.getZ(i));
        assert.ok(dot>.99999,`${complexity} time ${time}: flat face normal tilted by ${Math.acos(Math.min(1,dot))*180/Math.PI} degrees`);checked++;
      }
      assert.ok(checked>0,'front-face interior is actually sampled');
    }
  }finally{await h.dispose();}
});
