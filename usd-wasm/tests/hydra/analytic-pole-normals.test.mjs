import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {getUsdModule,createThreeHydra} from '../../src/index.js';

test('analytic cone poles retain finite unit normals at every subdivision detail',async()=>{
  const USD=await getUsdModule({print(){},printErr(){}}),scene=new Group();
  const handle=await createThreeHydra({USD,scene,url:'cone-pole.usda',buffer:new TextEncoder().encode('#usda 1.0\ndef Cone "Cone" {}')});
  try{
    await handle.ready();
    for(const detail of ['low','medium','high','very-high','adaptive']){
      await handle.setComplexity(detail);
      let mesh;scene.traverse(object=>{if(object.isMesh)mesh=object;});
      const positions=mesh.geometry.attributes.position,normals=mesh.geometry.attributes.normal;
      let tips=0;
      for(let i=0;i<positions.count;i++){
        const n=[normals.getX(i),normals.getY(i),normals.getZ(i)];
        assert.ok(n.every(Number.isFinite),detail+' finite normal');
        assert.ok(Math.abs(Math.hypot(...n)-1)<1e-4,detail+' unit normal');
        if(positions.getZ(i)>.99999){assert.ok(n[2]>.2,detail+' outward sloping pole normal');tips++;}
      }
      assert.ok(tips>0,detail+' retains sharp apex');
    }
  }finally{await handle.dispose();}
});
