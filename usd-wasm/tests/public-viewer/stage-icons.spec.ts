import {expect,test} from './test';
import {stageReady} from './workbench-menus';
for(const theme of ['light','dark'])test(`${theme}: Stage icons stay legible on hover and selection without checkbox chrome`,async({page},info)=>{
  await page.addInitScript(theme=>localStorage.setItem('needle-usd-theme',JSON.stringify(theme)),theme);
  await page.goto('/?viewer=three&file=/test-fixtures/coverage/lighting-mdl/studio-variants.usda');await stageReady(page);
  await page.locator('[data-prim-path="/World/Pedestal0"]').click();await page.locator('[data-prim-path="/World/Ring"]').hover();
  const hover=page.locator('[data-prim-path="/World/Ring"]');
  await expect(hover).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await expect(page.locator('.usd-prim-tree input[type=checkbox]')).toHaveCount(0);
  for(const name of ['Hide /World/Ring','Deactivate /World/Ring']){
    const action=page.getByRole('button',{name,exact:true});await expect(action).toBeVisible();await expect(action).toHaveAttribute('aria-pressed','true');await expect(action).toHaveAttribute('title',name);await expect(action.locator('svg')).toHaveAttribute('aria-hidden','true');
  }
  const result=await hover.evaluate(el=>{const row=el.parentElement!,selected=document.querySelector('[data-prim-path="/World/Pedestal0"]')!.parentElement!,canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d')!;function resolve(value:string){ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];}const style=getComputedStyle(row),s=getComputedStyle(selected);return{hover:resolve(style.backgroundColor),expectedHover:resolve(style.getPropertyValue('--usd-row-hover-background')),selected:resolve(s.backgroundColor),expectedSelected:resolve(s.getPropertyValue('--usd-row-selected-background'))};});
  expect(result.hover).toEqual(result.expectedHover);expect(result.selected).toEqual(result.expectedSelected);
  if(theme==='dark')expect(Math.max(...result.hover.slice(0,3))).toBeLessThan(80);
  await page.screenshot({path:info.outputPath(`${theme}-icons.png`)});
  // SVG children must not intercept branch disclosure clicks.
  const branch=page.locator('[data-prim-path="/World/Looks"]');await branch.locator('.usd-tree-disclosure svg').click();await expect(branch).toHaveAttribute('aria-expanded','true');
});
