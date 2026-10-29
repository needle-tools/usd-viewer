import {expect,test} from '@playwright/test';
import {stageReady} from './workbench-menus';
for(const backend of ['webgpu','webgl'])test(`${backend}: selected silhouettes show dashed hidden edges without occluder intersections`,async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1280,height:900});
  await page.goto(`/?viewer=three&backend=${backend}&file=/test-fixtures/coverage/lighting-mdl/studio-variants.usda`);await stageReady(page);
  const points=await page.evaluate(async()=>{
    const w=window as any,T=await import('three');w.usdHydra.setPlaying(false);w.scene.clear();
    const floor=new T.Mesh(new T.PlaneGeometry(8,6),new T.MeshBasicMaterial({color:0x888888,side:T.DoubleSide}));floor.userData.usdPath='/SelectedFloor';w.scene.add(floor);
    const occluder=new T.Mesh(new T.BoxGeometry(2,7,.2),new T.MeshBasicMaterial({color:0x444444}));occluder.position.z=1;occluder.userData.usdPath='/Occluder';w.scene.add(occluder);
    const camera=w.usdRenderCamera=new T.OrthographicCamera(-5,5,4,-4,.1,100);camera.position.z=10;camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
    const rect=w.usdWorkbench.viewport.getBoundingClientRect();
    function project(x:number,y:number){const p=new T.Vector3(x,y,0).project(camera);return{x:(p.x+1)*rect.width/2,y:(1-p.y)*rect.height/2};}
    w.usdViewportInteraction.select('/SelectedFloor');
    return{topLeft:project(-4,3),topRight:project(4,3),hiddenLeft:project(-1,3),hiddenRight:project(1,3),insideLeft:project(-1,2),insideBottom:project(-1,-2)};
  });
  await page.mouse.move(10,10);await expect(page.locator('.usd-selection-overlay')).toBeVisible();await page.waitForTimeout(300);
  const png=await page.locator('.usd-selection-overlay').screenshot();
  const result=await page.evaluate(async({png,points})=>{
    const image=await createImageBitmap(await(await fetch('data:image/png;base64,'+png)).blob()),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);const {data,width}=ctx.getImageData(0,0,canvas.width,canvas.height);
    const green=(x:number,y:number)=>{const i=(Math.round(y)*width+Math.round(x))*4;return data[i+1]>data[i]+15&&data[i+1]>data[i+2]+20;};
    function band(x0:number,x1:number,y:number){let ink=0,total=0;for(let x=Math.ceil(x0);x<x1;x++){total++;if([-2,-1,0,1,2].some(dy=>green(x,y+dy)))ink++;}return ink/total;}
    let interior=0;for(let y=Math.ceil(points.insideLeft.y);y<points.insideBottom.y;y++)for(let x=-3;x<=3;x++)if(green(points.insideLeft.x+x,y))interior++;
    return{visible:band(points.topLeft.x+8,points.hiddenLeft.x-8,points.topLeft.y),hidden:band(points.hiddenLeft.x+8,points.hiddenRight.x-8,points.topLeft.y),interior};
  },{png:png.toString('base64'),points});
  await info.attach('contour-bands',{body:JSON.stringify(result),contentType:'application/json'});
  expect(result.visible).toBeGreaterThan(.9);expect(result.hidden).toBeGreaterThan(.2);expect(result.hidden).toBeLessThan(.85);expect(result.interior).toBe(0);
  await page.screenshot({path:info.outputPath('silhouette.png')});expect(errors).toEqual([]);
});
