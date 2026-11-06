import {test, expect, type Page} from './test';
import {openAppMenu, stageReady, clearStage} from './workbench-menus';

const source = (animated: boolean) => `#usda 1.0
(
 upAxis = "Y"
 startTimeCode = 1
 endTimeCode = 48
)
def Xform "World" {
 def Cube "Cube" {
  double size = 1
  double3 xformOp:translate = (0, 0, 0)
  ${animated ? 'double3 xformOp:translate.timeSamples = {1:(0,0,0),48:(2,0,0)}' : ''}
  uniform token[] xformOpOrder = ["xformOp:translate"]
 }
}`;
async function load(page: Page, animated: boolean) {
  const previous = await page.evaluate(() => {
    const w = window as any; w.__previousTimelineStage = w.usdHydra?.driver;
    return !!w.__previousTimelineStage;
  });
  await page.locator('input[type=file]').setInputFiles({name: animated ? 'animated.usda' : 'static.usda', mimeType:'text/plain', buffer:Buffer.from(source(animated))});
  if(previous) await page.waitForFunction(() => {
    const w=window as any; return w.usdHydra?.driver && w.usdHydra.driver !== w.__previousTimelineStage;
  });
  await stageReady(page);
  await page.evaluate(() => (window as any).usdHydra.setPlaying(false));
}
const geometry = (page: Page) => page.evaluate(() => {
  const dock = (window as any).usdWorkbench.dock;
  return dock.toJSON();
});

for(const viewer of ['three', 'needle']) test(`${viewer}: file changes preserve chosen Timeline layout and closed state`, async ({page}, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({width:1440,height:960});
  await page.goto(`/?viewer=${viewer}`);
  await expect(page.locator('input[type=file]')).toBeEnabled();
  // Timeline is available even before a file is loaded. Opening it establishes
  // a user layout which first-load initialization must also leave intact.
  await openAppMenu(page,'window');
  await page.getByRole('checkbox',{name:'Show Timeline',exact:true}).check();
  await page.evaluate(() => {
    const dock=(window as any).usdWorkbench.dock;
    dock.addFloatingGroup(dock.getPanel('timeline'),{width:720,height:180,x:410,y:500});
  });
  await expect(page.locator('[data-panel=timeline]')).toContainText('No animation');
  const chosen = await geometry(page);
  for(const animated of [true,false,true,false]) {
    await load(page,animated);
    await expect.poll(() => geometry(page)).toEqual(chosen);
    if(animated) await expect(page.getByRole('slider',{name:'Time code',exact:true})).toBeVisible();
    else await expect(page.locator('[data-panel=timeline]')).toContainText('No animation');
  }
  await page.screenshot({path:info.outputPath('static-floating-timeline.png')});
  // Persistence restores the user's floating group before animation metadata,
  // including an empty or static stage.
  await page.waitForTimeout(200); await page.reload();
  await expect(page.locator('input[type=file]')).toBeEnabled();
  await expect.poll(() => geometry(page)).toEqual(chosen);
  await load(page,true); await expect.poll(() => geometry(page)).toEqual(chosen);
  await clearStage(page);
  await expect(page.locator('[data-panel=timeline]')).toContainText('No animation');
  await expect.poll(() => geometry(page)).toEqual(chosen);
  await page.getByRole('button',{name:'Close Timeline',exact:true}).click();
  const closed = await geometry(page);
  await load(page,true); await expect.poll(() => geometry(page)).toEqual(closed);
  await load(page,false); await expect.poll(() => geometry(page)).toEqual(closed);
  await load(page,true); await expect.poll(() => geometry(page)).toEqual(closed);
  await page.waitForTimeout(200); await page.reload();
  await expect(page.locator('input[type=file]')).toBeEnabled();
  await load(page,true); await expect.poll(() => geometry(page)).toEqual(closed);
  expect(errors).toEqual([]);
});
