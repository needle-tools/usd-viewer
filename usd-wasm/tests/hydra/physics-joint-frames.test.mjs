import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {Group,Mesh,InstancedMesh,BoxGeometry,MeshBasicMaterial,Matrix4,Quaternion,Vector3} from 'three';
import {createUsdPhysics} from '../../src/physics/createPhysics.js';
const R=createRequire(new URL('../../../package.json',import.meta.url))('@dimforge/rapier3d-compat');
await R.init();
const identity=[0,0,0,1],rot=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2).toArray();
const handle=root=>({scene:root,ready:async()=>{},setPlaying(){},isPlaying:()=>false});
const body=(path,position,rotation=identity)=>({path,position,rotation,scale:[1,1,1],mass:1,diagonalInertia:[1,1,1],rigidBodyEnabled:true});
const snapshot=bodies=>({bodies,scenes:[{path:'/Scene',gravityMagnitude:0,gravityDirection:[0,-1,0]}],metersPerUnit:1,shapes:[],joints:[],unsupported:[]});
const step=(sim,seconds=1)=>{for(let i=0;i<seconds*120;i++)sim.update(1/120);};

test('independent slider frames retain their authored axis, orientation and travel limits',async()=>{
 const root=new Group(),s=snapshot([body('/Slider',[0,0,0],rot)]);
 s.joints=[{path:'/Slide',type:'prismatic',body0:'',body1:'/Slider',axis:'X',position0:[0,0,0],position1:[0,0,0],rotation0:rot,rotation1:identity,limit:{enabled:true,lower:0,upper:1}}];
 const sim=await createUsdPhysics({handle:handle(root),snapshot:s,rapier:R});
 try{
  assert.deepEqual(sim.unsupported,[]);sim.play();sim.beginDrag('/Slider',new Vector3());sim.moveDrag(new Vector3(2,3,0));step(sim);
  const slider=sim.bodies.get('/Slider').body;
  assert.ok(Math.abs(slider.translation().x)<.02,'slider stays on rotated Y axis');
  assert.ok(slider.translation().y>.9&&slider.translation().y<1.02,'travel stops at authored limit');
  assert.ok(new Quaternion().copy(slider.rotation()).angleTo(new Quaternion().fromArray(rot))<.02,'independent local frame preserves orientation');
 }finally{sim.dispose();}
});

test('independent hinge frames enforce angle limits instead of skipping the joint',async()=>{
 const root=new Group(),s=snapshot([body('/Door',[0,0,0],rot)]);
 s.joints=[{path:'/Hinge',type:'revolute',body0:'',body1:'/Door',axis:'Z',position0:[0,0,0],position1:[0,0,0],rotation0:rot,rotation1:identity,limit:{enabled:true,lower:0,upper:45}}];
 const sim=await createUsdPhysics({handle:handle(root),snapshot:s,rapier:R});
 try{
  assert.deepEqual(sim.unsupported,[]);sim.play();sim.beginDrag('/Door',new Vector3(0,1,0));sim.moveDrag(new Vector3(-2,0,0));step(sim);
  const door=sim.bodies.get('/Door').body;
  const angle=new Quaternion().fromArray(rot).invert().multiply(new Quaternion().copy(door.rotation())).angleTo(new Quaternion());
  assert.ok(angle>.5&&angle<Math.PI/4+.03,'hinge turns but stops at 45 degrees');
  assert.ok(new Vector3().copy(door.translation()).length()<.02,'hinge anchor stays fixed');
 }finally{sim.dispose();}
});

test('multiple render instances follow independent bodies and reset without moving their shared prototype',async()=>{
 const root=new Group(),mesh=new InstancedMesh(new BoxGeometry(),new MeshBasicMaterial(),2);mesh.userData.usdPath='/Prototype';
 mesh.setMatrixAt(0,new Matrix4().makeTranslation(0,3,0));mesh.setMatrixAt(1,new Matrix4().makeTranslation(3,3,0));root.add(mesh);
 const h=handle(root);h.resolvePick=async(_path,index)=>({path:index?'/B/Shape':'/A/Shape',instances:[]});
 const sim=await createUsdPhysics({handle:h,snapshot:snapshot([body('/A',[0,3,0]),body('/B',[3,3,0])]),rapier:R});
 try{
  assert.equal(sim.bodyForObject(mesh,1).data.path,'/B');assert.equal(sim.bodyForObject(mesh,0).data.path,'/A');
  sim.play();sim.beginDrag('/B',new Vector3(3,3,0));sim.moveDrag(new Vector3(5,3,0));step(sim);
  const a=new Matrix4(),b=new Matrix4();mesh.getMatrixAt(0,a);mesh.getMatrixAt(1,b);
  assert.ok(Math.abs(a.elements[12])<.001);assert.ok(b.elements[12]>4.9);assert.equal(mesh.position.x,0);
  sim.reset();mesh.getMatrixAt(1,b);assert.equal(b.elements[12],3);
 }finally{sim.dispose();mesh.geometry.dispose();mesh.material.dispose();}
});

test('interaction holds the assembly base and solves a dependent fixed link while dragging its hinge',async()=>{
 const root=new Group(),s=snapshot([body('/Base',[0,0,0]),body('/Door',[0,0,0]),body('/Handle',[1,0,0])]);
 s.joints=[{path:'/Hinge',type:'revolute',body0:'/Base',body1:'/Door',axis:'Z',position0:[0,0,0],position1:[0,0,0],rotation0:identity,rotation1:identity,limit:{enabled:true,lower:0,upper:90}},
 {path:'/Attached',type:'fixed',body0:'/Door',body1:'/Handle',position0:[1,0,0],position1:[0,0,0],rotation0:identity,rotation1:identity}];
 const sim=await createUsdPhysics({handle:handle(root),snapshot:s,rapier:R,mode:'interaction'});
 try{
  sim.play();sim.beginDrag('/Handle',new Vector3(1,0,0));sim.moveDrag(new Vector3(0,1,0));step(sim,2);
  const base=sim.bodies.get('/Base').body,door=sim.bodies.get('/Door').body,knob=sim.bodies.get('/Handle').body;
  assert.ok(new Vector3().copy(base.translation()).length()<1e-5);assert.ok(knob.translation().y>.9);
  const attached=new Vector3(1,0,0).applyQuaternion(new Quaternion().copy(door.rotation())).add(door.translation());
  assert.ok(attached.distanceTo(new Vector3().copy(knob.translation()))<.02,'dependent link remains attached');
  sim.endDrag();assert.equal(base.isDynamic(),true,'temporary base hold is released');
 }finally{sim.dispose();}
});

test('off-axis dragging yields to a slider limit instead of pulling the mechanism apart',async()=>{
 const root=new Group(),base=body('/Base',[0,0,0]);base.mass=40;base.diagonalInertia=[9,6,5];
 const s=snapshot([base,body('/Drawer',[.3,0,.8]),body('/Other',[.3,0,.6])]);
 s.joints=['Drawer','Other'].map((name,i)=>({path:'/Slide'+i,type:'prismatic',body0:'/Base',body1:'/'+name,axis:'X',position0:[.3,0,i?.6:.8],position1:[0,0,0],rotation0:identity,rotation1:identity,limit:{enabled:true,lower:0,upper:.46}}));
 const sim=await createUsdPhysics({handle:handle(root),snapshot:s,rapier:R,mode:'interaction'});
 try{
  sim.play();sim.beginDrag('/Drawer',new Vector3(.4,-.3,.7));sim.moveDrag(new Vector3(2,3,1));
  for(let frame=0;frame<240;frame++){
   sim.update(1/120);const drawer=sim.bodies.get('/Drawer').body.translation();
   assert.ok(drawer.x<=.761&&drawer.x>=.299,'drag does not override the authored travel range');
  }
  assert.ok(sim.bodies.get('/Drawer').body.translation().x>.74,'drawer reaches its stop');
  assert.ok(new Vector3().copy(sim.bodies.get('/Base').body.translation()).length()<1e-5);
  assert.ok(new Vector3().copy(sim.bodies.get('/Other').body.translation()).distanceTo(new Vector3(.3,0,.6))<.001);
 }finally{sim.dispose();}
});
