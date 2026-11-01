import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group,InstancedMesh,Mesh,BoxGeometry,MeshBasicMaterial,Matrix4,Quaternion,Vector3} from 'three';
import {createUsdMechanism,createJointHelpers} from '../../src/physics/kinematics.js';
const id=[0,0,0,1],body=(path,position=[0,0,0],rotation=id)=>({path,position,rotation,scale:[1,1,1],rigidBodyEnabled:true});
const joint=(path,type,body0,body1,position0=[0,0,0],position1=[0,0,0])=>({path,type,body0,body1,axis:'Z',position0,position1,rotation0:id,rotation1:id,limit:{enabled:true,lower:0,upper:type==='revolute'?90:1}});
const create=async(bodies,joints,extra={})=>{const root=extra.root||new Group(),handle={scene:root,ready:async()=>{},setPlaying(){},isPlaying:()=>false,...extra.handle};return createUsdMechanism({...extra,handle,snapshot:{bodies,joints,metersPerUnit:1}});};
const close=(a,b,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);

test('exact sliders hold the base, survive extreme drags, and remain still after release',async()=>{
 const slide=joint('/Slide','prismatic','/Base','/Drawer',[0,0,.8]);slide.axis='X';slide.limit.upper=.46;
 const sim=await create([body('/Base'),body('/Drawer',[0,0,.8])],[slide]);
 try{assert.deepEqual(sim.unsupported,[]);sim.play();assert.equal(sim.beginDrag('/Base',new Vector3()),false);assert.equal(sim.beginDrag('/Drawer',new Vector3(0,-.3,.8)),true);
  for(let i=0;i<50;i++){sim.moveDrag(new Vector3(100,100,100));close(sim.bodies.get('/Drawer').body.translation().x,.46);close(sim.bodies.get('/Base').body.translation().length(),0);}
  sim.endDrag();for(let i=0;i<100;i++)sim.update(1);close(sim.bodies.get('/Drawer').body.translation().x,.46);sim.reset();close(sim.bodies.get('/Drawer').body.translation().x,0);
 }finally{sim.dispose();}
});

test('rotated independent joint frames and fixed attachments use physics relationships rather than prim ancestry',async()=>{
 const rot=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2).toArray();
 const hinge=joint('/Hinge','revolute','/Base','/Elsewhere/Door');hinge.rotation0=rot;
 const attached=joint('/Attached','fixed','/Elsewhere/Door','/Separate/Handle',[1,0,0]);
 const sim=await create([body('/Base'),body('/Elsewhere/Door',[0,0,0],rot),body('/Separate/Handle',[0,1,0],rot)],[hinge,attached]);
 try{assert.deepEqual(sim.unsupported,[]);sim.play();assert.ok(sim.beginDrag('/Separate/Handle',new Vector3(0,1,0)));sim.moveDrag(new Vector3(-1,0,0));
  close(sim.getJointValue('/Hinge'),90);const handle=sim.bodies.get('/Separate/Handle').body.translation();close(handle.x,-1);close(handle.y,0);
 }finally{sim.dispose();}
});

test('shared geometry instances and nested render parents retain independent composed body ownership',async()=>{
 const root=new Group(),parent=new Group(),mesh=new InstancedMesh(new BoxGeometry(),new MeshBasicMaterial(),2);parent.position.set(3,0,0);parent.userData.usdPath='/Base';root.add(parent);parent.add(mesh);mesh.userData.usdPath='/SharedPrototype';mesh.setMatrixAt(0,new Matrix4().makeTranslation(-3,0,0));mesh.setMatrixAt(1,new Matrix4().makeTranslation(-3,1,0));
 const a=joint('/A','prismatic','/Base','/PartA'),b=joint('/B','prismatic','/Base','/PartB',[0,1,0]);a.axis=b.axis='X';
 const sim=await create([body('/Base'),body('/PartA'),body('/PartB',[0,1,0])],[a,b],{root,handle:{resolvePick:async(_,i)=>({path:i?'/PartB/Shape':'/PartA/Shape'})}});
 try{assert.equal(sim.bodyForObject(mesh,1).data.path,'/PartB');sim.setJointValue('/B',.7);root.updateWorldMatrix(true,true);const m=new Matrix4();mesh.getMatrixAt(1,m);m.premultiply(mesh.matrixWorld);close(m.elements[12],.7);close(m.elements[13],1);mesh.getMatrixAt(0,m);m.premultiply(mesh.matrixWorld);close(m.elements[12],0);sim.reset();close(parent.position.x,3);}
 finally{sim.dispose();mesh.geometry.dispose();mesh.material.dispose();}
});

test('mimic joints follow their reference and can be manipulated from either body',async()=>{
 const a=joint('/A','prismatic','/Base','/Left'),b=joint('/B','prismatic','/Base','/Right',[0,1,0]);a.axis=b.axis='X';a.limit={enabled:true,lower:-1,upper:1};b.limit={...a.limit};b.mimic={joint:'/A',multiplier:-1,offset:0};
 const sim=await create([body('/Base'),body('/Left'),body('/Right',[0,1,0])],[a,b]);
 try{sim.setJointValue('/A',.4);close(sim.getJointValue('/B'),-.4);sim.setJointValue('/B',.7);close(sim.getJointValue('/A'),-.7);close(sim.getJointValue('/B'),.7);}finally{sim.dispose();}
});

test('a closed four-bar linkage remains closed while changing its input hinge',async()=>{
 const a=joint('/AB','revolute','/A','/B',[1,0,0]),b=joint('/BC','revolute','/B','/C',[0,1,0]),c=joint('/CD','revolute','/C','/D',[-1,0,0]),d=joint('/DA','revolute','/D','/A',[0,-1,0]);
 for(const j of[a,b,c,d])j.limit={enabled:true,lower:-170,upper:170};
 const sim=await create([body('/A'),body('/B',[1,0,0]),body('/C',[1,1,0]),body('/D',[0,1,0])],[a,b,c,d]);
 try{assert.deepEqual(sim.unsupported,[]);assert.ok(sim.setJointValue('/AB',20));close(sim.getJointValue('/AB'),20,.001);
  for(const{joint,closure}of sim.joints.values())if(closure){const p=new Float64Array(3),r=new Float64Array(3);joint.getClosureError(p,r);assert.ok(Math.hypot(...p)<.0001);assert.ok(Math.hypot(...r)<.0001);}
 }finally{sim.dispose();}
});

test('inconsistent authored frames cannot snap rendered parts apart; helpers are display-only and disposable',async()=>{
 const root=new Group(),mesh=new Mesh(new BoxGeometry(),new MeshBasicMaterial());mesh.userData.usdPath='/Door/Mesh';root.add(mesh);const original=mesh.matrix.clone();
 const sim=await create([body('/Base'),body('/Door',[1,0,0])],[joint('/Broken','revolute','/Base','/Door')],{root});
 try{assert.ok(sim.unsupported.some(issue=>issue.reason.includes('frames')));sim.play();assert.equal(sim.beginDrag('/Door',new Vector3(1,0,0)),false);assert.equal(sim.setJointValue('/Broken',45),false);assert.deepEqual(mesh.matrix.elements,original.elements);
  const helpers=createJointHelpers(sim);assert.equal(helpers.objects.length,1);const helper=helpers.objects[0];assert.equal(helper.userData.usdExcludeFromBounds,true);assert.equal(helper.userData.usdJointPath,'/Broken');helpers.update();helpers.dispose();assert.equal(helper.parent,null);
 }finally{sim.dispose();mesh.geometry.dispose();mesh.material.dispose();}
});

test('a dependent joint limit also bounds its reference instead of breaking the coupling',async()=>{
 const a=joint('/A','prismatic','/Base','/Left'),b=joint('/B','prismatic','/Base','/Right',[0,1,0]);a.axis=b.axis='X';a.limit={enabled:true,lower:-1,upper:1};b.limit={enabled:true,lower:-.2,upper:.2};b.mimic={joint:'/A',multiplier:-2,offset:0};
 const sim=await create([body('/Base'),body('/Left'),body('/Right',[0,1,0])],[a,b]);
 try{sim.setJointValue('/A',1);close(sim.getJointValue('/A'),.1);close(sim.getJointValue('/B'),-.2);}finally{sim.dispose();}
});

test('constraint helpers follow moving parent joint frames',async()=>{
 const hinge=joint('/Hinge','revolute','/Base','/Arm'),slider=joint('/Slide','prismatic','/Arm','/Tip',[1,0,0]);slider.axis='X';
 const sim=await create([body('/Base'),body('/Arm'),body('/Tip',[1,0,0])],[hinge,slider]);let helpers;
 try{sim.play();helpers=createJointHelpers(sim);sim.root.updateMatrixWorld(true);sim.setJointValue('/Hinge',90);helpers.update();sim.root.updateMatrixWorld(true);
  const object=helpers.objects.find(o=>o.userData.usdJointPath==='/Slide'),p=object.getWorldPosition(new Vector3());close(p.x,0);close(p.y,1);
  assert.equal(object.children[0].isPoints,true);assert.equal(object.children[0].geometry.attributes.position.count,3);
 }finally{helpers?.dispose();sim.dispose();}
});

test('cyclic mimic metadata is reported and cannot recurse or corrupt poses',async()=>{
 const a=joint('/A','prismatic','/Base','/Left'),b=joint('/B','prismatic','/Base','/Right',[0,1,0]);a.axis=b.axis='X';a.mimic={joint:'/B',multiplier:1,offset:0};b.mimic={joint:'/A',multiplier:1,offset:0};
 const sim=await create([body('/Base'),body('/Left'),body('/Right',[0,1,0])],[a,b]);
 try{assert.ok(sim.unsupported.some(issue=>issue.reason.includes('cyclic')));assert.equal(sim.setJointValue('/A',.4),false);assert.equal(sim.setJointValue('/B',.4),false);close(sim.bodies.get('/Left').body.translation().x,0);}finally{sim.dispose();}
});
