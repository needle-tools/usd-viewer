import {test, expect} from './test';
import {stageReady} from './workbench-menus';

// Six disjoint UV charts on a fully sharp cube. Averaging edge normals or
// refining face-varying data as vertex data breaks this deliberately simple case.
const cage = `#usda 1.0
(upAxis = "Y")
def Mesh "Cube" {
 point3f[] points = [(-.5,-.5,.5),(.5,-.5,.5),(-.5,.5,.5),(.5,.5,.5),(-.5,.5,-.5),(.5,.5,-.5),(-.5,-.5,-.5),(.5,-.5,-.5)]
 int[] faceVertexCounts = [4,4,4,4,4,4]
 int[] faceVertexIndices = [0,1,3,2,2,3,5,4,4,5,7,6,6,7,1,0,1,7,5,3,6,0,2,4]
 int[] creaseIndices = [0,1,1,3,3,2,2,0,2,4,4,5,5,3,5,7,7,6,6,4,6,0,7,1]
 int[] creaseLengths = [2,2,2,2,2,2,2,2,2,2,2,2]
 float[] creaseSharpnesses = [10,10,10,10,10,10,10,10,10,10,10,10]
 texCoord2f[] primvars:st = [(0,0),(1,0),(1,1),(0,1),(2,0),(3,0),(3,1),(2,1),(4,0),(5,0),(5,1),(4,1),(6,0),(7,0),(7,1),(6,1),(8,0),(9,0),(9,1),(8,1),(10,0),(11,0),(11,1),(10,1)] (interpolation = "faceVarying")
 color3f[] primvars:displayColor = [(1,.1,.1),(.1,1,.1),(.1,.1,1),(1,1,.1),(1,.1,1),(.1,1,1)] (interpolation = "uniform")
 uniform token subdivisionScheme = "catmullClark"
}`;
for (const viewer of ['three','needle']) test(`${viewer}: adaptive keeps sharp normals, UV charts and colors through detail changes`, async ({page}) => {
  const errors: string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route(url=>url.pathname==='/adaptive-cube.usda',route=>route.fulfill({body:cage,contentType:'text/plain'}));
  await page.goto(`/?viewer=${viewer}&render=beauty&complexity=adaptive&file=/adaptive-cube.usda`);
  await stageReady(page);
  const snapshot=()=>page.evaluate(()=>{
    const w=window as any,h=w.usdHydra;let mesh:any;
    h.setPlaying(false); if(w._controls){w._controls.autoRotate=false;w._controls.enableDamping=false;}
    h.scene.traverse((o:any)=>{if(o.isMesh&&o.userData.usdPath==='/Cube')mesh=o;});
    const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,c=g.attributes.color;
    let wrongNormals=0,wrongUVs=0;
    const index=(i:number)=>g.index?.getX(i)??i, count=g.index?.count??p.count;
    for(let i=0;i<count;i+=3){
      const ids=[index(i),index(i+1),index(i+2)], a=ids[0];
      const faceNormal=[n.getX(a),n.getY(a),n.getZ(a)];
      if(Math.max(...faceNormal.map(Math.abs))<.9999)wrongNormals++;
      // All triangle UVs belong to one separated chart.
      const chart=Math.floor((uv.getX(a)+1e-5)/2);
      for(const j of ids){if(uv.getX(j)<chart*2-1e-4||uv.getX(j)>chart*2+1.0001||uv.getY(j)<-1e-4||uv.getY(j)>1.0001)wrongUVs++;}
    }
    return {adaptive:h.driver.GetAdaptiveSubdivision(),triangles:count/3,wrongNormals,wrongUVs,
      finite:[p,n,uv,c].every(a=>a?.array.every(Number.isFinite)),colorCount:c?.count,vertices:p.count,
      camera:w.camera.position.toArray(),revision:h.revision};
  });
  const initial=await snapshot(); expect(initial.adaptive).toBe(true);expect(initial.triangles).toBe(12);
  expect(initial).toMatchObject({wrongNormals:0,wrongUVs:0,finite:true}); expect(initial.colorCount).toBe(initial.vertices);
  await page.evaluate(()=>(window as any).usdHydra.setComplexity('high'));
  const high=await snapshot();expect(high.adaptive).toBe(false);expect(high.triangles).toBeGreaterThan(initial.triangles);
  expect(high.camera).toEqual(initial.camera);expect(high.revision).toBeGreaterThan(initial.revision);
  await page.evaluate(()=>(window as any).usdHydra.setComplexity('adaptive'));
  const restored=await snapshot();expect(restored.adaptive).toBe(true);expect(restored.triangles).toBe(initial.triangles);
  expect(restored).toMatchObject({wrongNormals:0,wrongUVs:0,finite:true});expect(restored.camera).toEqual(initial.camera);
  expect(errors).toEqual([]);
});

test('point edits recompute adaptive curvature and restore a flat cage',async({page})=>{
  // A 3x3 quad grid has a movable interior point and straight outer edges.
  const flat=Array.from({length:9},(_,i)=>[i%3-1,0,Math.floor(i/3)-1]);
  const source=`#usda 1.0\n(upAxis="Y")\ndef Mesh "Patch" {\npoint3f[] points=[${flat.map(p=>`(${p})`)}]\nint[] faceVertexCounts=[4,4,4,4]\nint[] faceVertexIndices=[0,3,4,1,1,4,5,2,3,6,7,4,4,7,8,5]\nuniform token subdivisionScheme="catmullClark"\ntoken interpolateBoundary="edgeAndCorner"\n}`;
  await page.route(url=>url.pathname==='/adaptive-patch.usda',route=>route.fulfill({body:source,contentType:'text/plain'}));
  await page.goto('/?viewer=three&render=beauty&complexity=adaptive&file=/adaptive-patch.usda');await stageReady(page);
  const geometry=()=>page.evaluate(()=>{let g:any;(window as any).usdHydra.scene.traverse((o:any)=>{if(o.isMesh&&o.userData.usdPath==='/Patch')g=o.geometry;});return {triangles:(g.index?.count??g.attributes.position.count)/3,maxY:Math.max(...g.attributes.position.array.filter((_:any,i:number)=>i%3===1)),finite:g.attributes.normal.array.every(Number.isFinite)};});
  const before=await geometry();
  const edit=(points:number[][])=>page.evaluate(points=>(window as any).usdHydra.editStage((stage:any)=>{const p=stage.GetPrimAtPath('/Patch'),a=p.GetAttribute('points');try{a.Set(points,NaN);}finally{a.delete();p.delete();}}),points);
  const curved=flat.map(p=>p.slice());curved[4][1]=2;await edit(curved);
  const after=await geometry();expect(after.triangles).toBeGreaterThan(before.triangles);expect(after.maxY).toBeGreaterThan(.5);expect(after.finite).toBe(true);expect(after.triangles).toBeLessThanOrEqual(4*2*4**3);
  await edit(flat);expect(await geometry()).toEqual(before);
});

for (const viewer of ['three','needle']) test(`${viewer}: adaptive animation keeps material subsets on their coarse faces`,async({page})=>{
  const flat=Array.from({length:9},(_,i)=>[i%3-1,0,Math.floor(i/3)-1]);
  const curved=flat.map(p=>p.slice());curved[4][1]=2;
  const points=(values:number[][])=>`[${values.map(p=>`(${p})`)}]`;
  const source=`#usda 1.0
(upAxis="Y"
 startTimeCode=1
 endTimeCode=121)
def Xform "World" {
 def Scope "Looks" {
  def Material "Red" {
   token outputs:surface.connect=</World/Looks/Red/Surface.outputs:surface>
   def Shader "Surface" {
    uniform token info:id="UsdPreviewSurface"
    color3f inputs:diffuseColor=(1,.1,.1)
    token outputs:surface
   }
  }
  def Material "Blue" {
   token outputs:surface.connect=</World/Looks/Blue/Surface.outputs:surface>
   def Shader "Surface" {
    uniform token info:id="UsdPreviewSurface"
    color3f inputs:diffuseColor=(.1,.1,1)
    token outputs:surface
   }
  }
 }
 def Mesh "Patch" {
  point3f[] points=${points(flat)}
  point3f[] points.timeSamples={1:${points(flat)},61:${points(curved)},121:${points(flat)}}
  int[] faceVertexCounts=[4,4,4,4]
  int[] faceVertexIndices=[0,3,4,1,1,4,5,2,3,6,7,4,4,7,8,5]
  color3f[] primvars:displayColor=[(1,.1,.1),(.1,.1,1),(1,.1,.1),(.1,.1,1)] (interpolation="uniform")
  uniform token subdivisionScheme="catmullClark"
  token interpolateBoundary="edgeAndCorner"
  def GeomSubset "Left" (prepend apiSchemas=["MaterialBindingAPI"]) {
   uniform token elementType="face"
   uniform token familyName="materialBind"
   int[] indices=[0,2]
   rel material:binding=</World/Looks/Red>
  }
  def GeomSubset "Right" (prepend apiSchemas=["MaterialBindingAPI"]) {
   uniform token elementType="face"
   uniform token familyName="materialBind"
   int[] indices=[1,3]
   rel material:binding=</World/Looks/Blue>
  }
 }
}`;
  await page.route(url=>url.pathname==='/animated-subsets.usda',route=>route.fulfill({body:source,contentType:'text/plain'}));
  await page.goto(`/?viewer=${viewer}&render=beauty&complexity=adaptive&file=/animated-subsets.usda`);await stageReady(page);
  const snapshot=(time:number)=>page.evaluate(async time=>{
    const h=(window as any).usdHydra;h.setPlaying(false);await h.setTime(time);await h.materialsReady();
    let mesh:any;h.scene.traverse((o:any)=>{if(o.isMesh&&o.userData.usdPath==='/World/Patch')mesh=o;});
    const g=mesh.geometry,colors=g.attributes.color;let covered=0,wrong=0;
    for(const group of g.groups){if(group.materialIndex===0)continue;
      const material=mesh.material[group.materialIndex];covered+=group.count;
      for(let i=group.start;i<group.start+group.count;i++){
        const vertex=g.index?.getX(i)??i;
        if(vertex>=colors.count||Math.abs(colors.getX(vertex)-material.color.r)>.01||Math.abs(colors.getZ(vertex)-material.color.b)>.01)wrong++;
      }
    }
    return {count:g.index?.count??g.attributes.position.count,covered,wrong};
  },time);
  const initial=await snapshot(1),deformed=await snapshot(61),restored=await snapshot(121);
  expect(initial.count).toBeGreaterThan(0);expect(deformed.count).toBeGreaterThan(initial.count);
  for(const state of [initial,deformed,restored]){expect(state.wrong).toBe(0);expect(state.covered).toBe(state.count);}
  expect(restored).toEqual(initial);
});
