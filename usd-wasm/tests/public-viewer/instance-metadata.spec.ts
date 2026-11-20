import {test,expect} from './test';
import {stageReady} from './workbench-menus';

const source=`#usda 1.0
class Xform "Source" {
 def Cube "Mesh" (prepend apiSchemas=["MaterialBindingAPI"]) {
  rel material:binding=</Source/VisualMaterials/Mat>
 }
 def Scope "VisualMaterials" {
  def Material "Mat" {
   def Shader "Surface" {
    uniform token info:id="UsdPreviewSurface"
    color3f inputs:diffuseColor=(.2,.6,.8)
    token outputs:surface
   }
   token outputs:surface.connect=</Source/VisualMaterials/Mat/Surface.outputs:surface>
  }
 }
}
def Xform "World" {
 def Xform "Instance" (instanceable=true;prepend references=</Source>) {}
 def Scope "VisualMaterials" {}
}`;
const item=(page:any,path:string)=>page.locator(`[data-prim-path="${path}"]`);

test('instance material branches expand lazily, bindings navigate to them and schema metadata is a real list',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.context().route(url=>url.pathname==='/test-fixtures/instance-metadata.usda',r=>r.fulfill({contentType:'text/plain',body:source}));
 await page.goto('/?workspace=studio&viewer=three&render=basic&file=/test-fixtures/instance-metadata.usda');await stageReady(page);
 const instance=item(page,'/World/Instance');await expect(instance).toHaveAttribute('aria-expanded','false');
 await expect(item(page,'/World/Instance/Mesh')).toHaveCount(0);
 await instance.locator('.usd-tree-disclosure').click();await expect(item(page,'/World/Instance/VisualMaterials/Mat')).toBeVisible();
 const mesh=item(page,'/World/Instance/Mesh');await mesh.click();
 const row=page.locator('[data-property-key="metadata:apiSchemas"]');await expect(row.getByRole('list',{name:'apiSchemas',exact:true}).getByRole('listitem')).toHaveText(['MaterialBindingAPI']);
 await expect(row).not.toContainText('SdfTokenListOp');
 expect(await page.evaluate(async()=>{const w=window as any,{inspectPrimAsync}=await import('/usd/scene/index.js');return w.usdHydra.readStage(async(stage:any)=>Array.isArray((await inspectPrimAsync(stage,'/World/Instance/Mesh'))?.metadata.apiSchemas));})).toBe(true);
 await expect(mesh.locator('..').locator('[data-prim-action=activation]')).toBeDisabled();
 await instance.locator('.usd-tree-disclosure').click();await expect(mesh).toHaveCount(0);
 await page.getByRole('button',{name:'Follow /World/Instance/VisualMaterials/Mat',exact:true}).click();
 await expect(item(page,'/World/Instance/VisualMaterials/Mat')).toHaveAttribute('aria-selected','true');
 await page.screenshot({path:info.outputPath('instance-material-binding.png')});
 await instance.locator('.usd-tree-disclosure').click();await expect(mesh).toHaveCount(0);
 await instance.locator('.usd-tree-disclosure').click();await mesh.click();await page.screenshot({path:info.outputPath('schema-array.png')});
 expect(errors).toEqual([]);
});
