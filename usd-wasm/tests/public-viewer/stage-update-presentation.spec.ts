import {test,expect} from './test';
import {stageReady} from './workbench-menus';

test('stage edits retain the complete viewport and stable hierarchy rows',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?workspace=studio&viewer=three&render=basic&file=/test-fixtures/coverage/core/analytic-primitives.usda');await stageReady(page);
  await page.evaluate(()=>{const w=window as any;w.usdHydra.setPlaying(false);w._controls.enableDamping=false;w.usdWorkbench.openPanel('stage');});
  const canvas=page.locator('canvas.usd-viewer-three-canvas');
  const before=await canvas.screenshot();
  const tree=page.getByRole('tree',{name:'Stage hierarchy'}),position=await tree.boundingBox();
  await page.evaluate(()=>{
    const w=window as any;w.oldRows=[...document.querySelectorAll('[data-prim-path]')];
    const gate=new Promise<void>(resolve=>w.releaseEdit=resolve);
    w.pendingEdit=w.usdStagePanel.edit(async(stage:any)=>{
      // Model an intermediate delegate update while native composition yields.
      w.usdRoot.visible=false;w.editStarted=true;await gate;w.usdRoot.visible=true;
      stage.DefinePrim('/World/EditProbe','Xform').delete();
    });
  });
  try {
  await page.waitForFunction(()=>(window as any).editStarted);
  expect(await page.evaluate(()=>(window as any).usdHydra.isUpdating)).toBe(true);
  await expect(page.locator('.usd-stage-status')).toContainText('Updating stage');
  expect((await tree.boundingBox())?.y).toBe(position?.y);
  await expect(tree.locator('[data-prim-path]').first()).toBeEnabled();
  await page.waitForTimeout(200);expect(await canvas.screenshot()).toEqual(before);
  } finally {
    await page.evaluate(async()=>{const w=window as any;w.releaseEdit?.();await w.pendingEdit;});
  }
  await expect(tree.locator('[data-prim-path="/World/EditProbe"]')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).oldRows.every((row:HTMLElement)=>row.isConnected))).toBe(true);
  expect(await page.evaluate(()=>(window as any).usdHydra.isUpdating)).toBe(false);
  await page.screenshot({path:info.outputPath('stage-after-update.png')});expect(errors).toEqual([]);
});
