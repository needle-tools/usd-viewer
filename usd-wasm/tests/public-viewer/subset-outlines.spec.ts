import {test,expect} from './test';
import {stageReady} from './workbench-menus';

for(const viewer of ['three','needle'])test(`${viewer}: selected and hovered subsets outline their own faces`,async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.context().route(url=>url.pathname==='/outline-subsets.usda',r=>r.fulfill({contentType:'text/plain',body:`#usda 1.0
(upAxis="Y")
def Xform "World" {
 def Mesh "Panel" {
  uniform token subdivisionScheme="none"
  point3f[] points=[(-3,-1,0),(-1,-1,0),(-1,1,0),(-3,1,0),(1,-1,0),(3,-1,0),(3,1,0),(1,1,0)]
  int[] faceVertexCounts=[4,4]
  int[] faceVertexIndices=[0,1,2,3,4,5,6,7]
  def GeomSubset "Left" {
   uniform token elementType="face"
   int[] indices=[0]
  }
  def GeomSubset "Right" {
   uniform token elementType="face"
   int[] indices=[1]
  }
 }
}`}));
 await page.goto(`/?workspace=studio&viewer=${viewer}&render=beauty&complexity=low&file=/outline-subsets.usda`);await stageReady(page);
 await page.evaluate(async()=>{
  const w=window as any,{Vector3}=await import('three');w.camera.position.set(0,0,20);w._controls.target.set(0,0,0);w._controls.update();
  const viewport=document.querySelector('#usd-viewport') as HTMLElement;viewport.style.setProperty('--usd-selection-color','#ff0000');viewport.style.setProperty('--usd-hover-color','#0000ff');
  w.usdStagePanel.selectPrim('/World/Panel/Left');
 });
 const overlay=page.locator('.usd-selection-overlay');await expect(overlay).toBeVisible();
 const pixels=async()=>{
  const png=await overlay.screenshot();return page.evaluate(async b64=>{
   const im=await createImageBitmap(await(await fetch('data:image/png;base64,'+b64)).blob()),c=new OffscreenCanvas(im.width,im.height),ctx=c.getContext('2d')!;ctx.drawImage(im,0,0);const data=ctx.getImageData(0,0,im.width,im.height).data;
   let red=0,blue=0,redMax=0,blueMin=im.width;
   for(let i=0;i<data.length;i+=4){const x=(i/4)%im.width;if(data[i]>150&&data[i]>data[i+1]*2&&data[i]>data[i+2]*2){red++;redMax=Math.max(redMax,x);}if(data[i+2]>150&&data[i+2]>data[i]*2&&data[i+2]>data[i+1]*2){blue++;blueMin=Math.min(blueMin,x);}}
   return {red,blue,redMax,blueMin,width:im.width};
  },png.toString('base64'));
 };
 await expect.poll(async()=>(await pixels()).red).toBeGreaterThan(30);
 expect((await pixels()).redMax).toBeLessThan((await pixels()).width/2);
 await page.locator('[data-prim-path="/World/Panel/Right"]').hover();
 await expect.poll(async()=>(await pixels()).blue).toBeGreaterThan(30);
 const both=await pixels();expect(both.red).toBeGreaterThan(30);expect(both.blueMin).toBeGreaterThan(both.width/2);
 await page.screenshot({path:info.outputPath('subset-outlines.png')});
 const point=await page.evaluate(async()=>{
  const w=window as any,{Vector3}=await import('three');w.usdViewportInteraction.setPickMode('subset');
  const camera=w.needleEngineContext?.mainCamera||w.usdRenderCamera||w.camera;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);w.usdHydra.scene.updateWorldMatrix(true,true);
  const p=w.usdHydra.scene.localToWorld(new Vector3(-2,0,0)).project(camera),r=document.querySelector('#usd-viewport')!.getBoundingClientRect();return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};
 });
 await page.mouse.move(point.x,point.y);await expect.poll(()=>page.evaluate(()=>(window as any).usdViewportInteraction.hoveredPath),{timeout:5000}).toBe('/World/Panel/Left');
 await page.mouse.click(point.x,point.y);expect(await page.evaluate(()=>(window as any).usdStagePanel.selectedPath)).toBe('/World/Panel/Left');expect(errors).toEqual([]);
});
