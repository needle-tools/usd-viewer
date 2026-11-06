import {test,expect} from './test';
import {stageReady} from './workbench-menus';

test('F frames an unbound GeomSubset rather than its whole parent mesh or stage',async({page})=>{
 await page.context().route(url=>url.pathname==='/subset-focus.usda',route=>route.fulfill({contentType:'text/plain',body:`#usda 1.0
(
 upAxis = "Y"
 metersPerUnit = 1
)
def Xform "World" {
 def Mesh "Panel" {
  uniform token subdivisionScheme = "none"
  point3f[] points = [(0,0,0),(2,0,0),(2,2,0),(0,2,0),(20,0,0),(22,0,0),(22,2,0),(20,2,0)]
  int[] faceVertexCounts = [4,4]
  int[] faceVertexIndices = [0,1,2,3,4,5,6,7]
  def GeomSubset "Chosen" {
   uniform token elementType = "face"
   int[] indices = [0]
  }
 }
}`}));
 await page.goto('/?workspace=studio&viewer=three&render=beauty&file=/subset-focus.usda');await stageReady(page);
 await page.evaluate(()=>(window as any).usdStagePanel.selectPrim('/World/Panel/Chosen'));
 await page.keyboard.press('f');
 await expect.poll(()=>page.evaluate(()=>(window as any)._controls.target.x)).toBeCloseTo(1,3);
 const framed=await page.evaluate(async()=>{const w=window as any;return w.usdViewportInteraction.focus({instant:true});});
 expect(framed.bounds.min).toEqual([0,0,0]);expect(framed.bounds.max).toEqual([2,2,0]);
});
