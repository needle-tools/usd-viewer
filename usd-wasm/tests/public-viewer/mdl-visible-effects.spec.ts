import {test, expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {stageReady} from './workbench-menus';

test.use({viewport: {width: 960, height: 764}});
for (const viewer of ['three', 'needle']) for (const name of ['mdl-metal','mdl-clearcoat','mdl-color-texture','mdl-normal-texture','mdl-opacity-mask','mdl-gltf']) {
  test(`${viewer}: ${name} has a visible reversible material effect`, async ({page}, info) => {
    const errors: string[]=[];page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error' && /GPUValidationError|Destroyed texture/.test(message.text()))errors.push(message.text());});
    await page.goto(`/?viewer=${viewer}&render=beauty&background=light&environment=neutral&file=/test-fixtures/coverage/lighting-mdl/${name}.usda`);
    await stageReady(page);
    await page.evaluate(async()=>{
      const w=window as any;w.usdHydra.setPlaying(false);await w.usdHydra.materialsReady();
      for (const [label,value] of [['Workspace layout','viewport'],['Camera','/World/Camera']]) {
        const select=document.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
        if (!select) throw new Error('Missing '+label);
        select.value=value;select.dispatchEvent(new Event('change'));
      }
      w.usdWorkbench.viewport.dataset.mdlCapture='';
    });
    await page.mouse.move(0,0); await page.waitForTimeout(500);
    const viewport=page.locator('[data-mdl-capture]');
    const enabled=await viewport.screenshot({path:info.outputPath('enabled.png')});
    async function variant(value: string) {
      await page.evaluate(async value=>{
        const {setVariant}=await import('/usd/scene/index.js');
        await setVariant((window as any).usdHydra,'/World/Looks/MDL','effect',value);
        await (window as any).usdHydra.materialsReady();
      },value);
      await page.waitForTimeout(400);
    }
    await variant('disabled');
    const disabled=await viewport.screenshot({path:info.outputPath('disabled.png')});
    await variant('enabled');
    const restored=await viewport.screenshot({path:info.outputPath('restored.png')});
    const difference=await page.evaluate(async([a,b,c])=>{
      async function pixels(base64:string) {
        const image=await createImageBitmap(await(await fetch('data:image/png;base64,'+base64)).blob());
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const context=canvas.getContext('2d')!;context.drawImage(image,0,0);
        return context.getImageData(0,0,canvas.width,canvas.height).data;
      }
      const [on,off,again]=await Promise.all([a,b,c].map(pixels));let change=0,repeat=0,visible=0,count=0;
      // Score the central subject area; empty backdrop must not dilute a
      // clearcoat highlight or a local material effect. Native checks use it too.
      const bitmap=await createImageBitmap(await(await fetch('data:image/png;base64,'+a)).blob());
      for(let y=Math.floor(bitmap.height*.15);y<Math.floor(bitmap.height*.85);y++)for(let x=Math.floor(bitmap.width*.15);x<Math.floor(bitmap.width*.85);x++){
        const i=(y*bitmap.width+x)*4;let maximum=0;
        for(let j=0;j<3;j++){const delta=Math.abs(on[i+j]-off[i+j]);change+=delta;maximum=Math.max(maximum,delta);repeat+=Math.abs(on[i+j]-again[i+j]);}
        count++;if(maximum>15)visible++;
      }
      return {mean:change/(count*3*255),restored:repeat/(count*3*255),fraction:visible/count,roi:[.15,.15,.85,.85]};
    },[enabled.toString('base64'),disabled.toString('base64'),restored.toString('base64')]);
    await writeFile(info.outputPath('effect.json'),JSON.stringify(difference));
    expect(difference.mean).toBeGreaterThan(name==='mdl-normal-texture'?.012:.006);
    expect(difference.fraction).toBeGreaterThan(name==='mdl-normal-texture'?.07:.025);
    expect(difference.restored).toBeLessThan(difference.mean*.3);
    expect(errors).toEqual([]);
  });
}
