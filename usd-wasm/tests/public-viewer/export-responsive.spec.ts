import {test, expect} from './test';
import {stageReady} from './workbench-menus';
import {readFile, writeFile} from 'node:fs/promises';
import {unzipSync} from 'three/addons/libs/fflate.module.js';

test('native packaging and ZIP compression leave frames, spinner and other controls responsive', async ({page}, info) => {
  const errors: string[] = []; page.on('pageerror', error=>errors.push(error.message));
  await page.goto('/?viewer=three&render=basic&file=/test-fixtures/api/examples.js%23hello-world'); await stageReady(page);
  await page.evaluate(async () => {
    const w=window as any, modulePath='/usd/bindings/index.js', hydraPath='/usd/create.three.js', uiPath='/usd/viewer/downloadButton.js';
    const USD=await(await import(modulePath)).getUsdModule(), {Group}=await import('three');
    w.usdHydra.setPlaying(false);
    const contents=new Uint8Array(32*1024*1024);
    for(let offset=0;offset<contents.length;offset+=65536)crypto.getRandomValues(contents.subarray(offset,offset+65536));
    const root=new TextEncoder().encode('#usda 1.0\ndef Sphere "Ball" {\n custom asset payload=@bulk.bin@\n}\n');
    const files=[Object.assign(new File([root],'scene.usda'),{path:'scene.usda'}),Object.assign(new File([contents],'bulk.bin'),{path:'bulk.bin'})];
    const handle=await(await import(hydraPath)).createThreeHydra({USD,scene:new Group(),files,autoPlay:false}); await handle.ready();
    w.exportHandle=handle;
    if(typeof handle.driver.ExportUsdzAsync!=='function')throw new Error('Test requires the threaded export binding');
    const host=document.createElement('div');host.style.cssText='position:fixed;left:12px;top:50px;z-index:300;background:var(--surface-panel);padding:4px';document.body.append(host);
    const probe=document.createElement('button');probe.id='export-probe';probe.textContent='Other control';host.append(probe);
    w.exportSource={handle,filename:'responsive.usda'}; w.exportMetrics={phase:'',frames:0,phaseFrames:{},maxGap:0,clicks:0,progress:[]};
    probe.onclick=()=>w.exportMetrics.clicks++;
    w.exportControl=(await import(uiPath)).mountDownloadButton({container:host,getSource:()=>w.exportSource,onProgress:value=>{w.exportMetrics.phase=value.phase;w.exportMetrics.progress.push(value);}});
    w.exportControl.element.id='export-responsive';
    let previous=0;
    const frame=(time:number)=>{const m=w.exportMetrics;if(m.running){if(previous)m.maxGap=Math.max(m.maxGap,time-previous);m.frames++;m.phaseFrames[m.phase]=(m.phaseFrames[m.phase]||0)+1;}previous=time;w.exportFrame=requestAnimationFrame(frame);};
    w.exportFrame=requestAnimationFrame(frame);
  });
  const button=page.locator('#export-responsive').getByRole('button',{name:'Download',exact:true});
  const summaries: unknown[]=[];
  for(const format of ['usdz','zip']){
    await page.evaluate(format=>{const w=window as any;w.exportControl.setFormat(format);Object.assign(w.exportMetrics,{running:true,phase:'',frames:0,phaseFrames:{},maxGap:0,progress:[]});},format);
    const downloaded=page.waitForEvent('download');await button.click();
    await expect(page.locator('#export-responsive .usd-download-spinner')).toBeVisible();
    if(format==='zip'){
      await expect.poll(()=>page.evaluate(()=>(window as any).exportMetrics.phase)).toBe('compressing');
      const before=await page.locator('#export-responsive .usd-download-spinner').evaluate(el=>getComputedStyle(el).transform);
      await page.locator('#export-probe').click();
      await page.waitForTimeout(60);
      const after=await page.locator('#export-responsive .usd-download-spinner').evaluate(el=>getComputedStyle(el).transform);
      expect(after).not.toBe(before);
      await button.screenshot({path:info.outputPath('compressing.png')});
    }
    const file=await downloaded;const bytes=new Uint8Array(await readFile((await file.path())!));
    const entries=unzipSync(bytes);expect(Object.values(entries).some(bytes=>bytes.length===32*1024*1024)).toBe(true);
    const metrics=await page.evaluate(()=>{const m=(window as any).exportMetrics;m.running=false;return m;});
    await writeFile(info.outputPath(`${format}-metrics.json`), JSON.stringify(metrics,null,2));
    expect(metrics.frames).toBeGreaterThan(2);
    expect(metrics.maxGap).toBeLessThan(250);
    expect(metrics.progress.some(value=>value.phase==='packaging')).toBe(true);
    expect(metrics.phaseFrames.packaging||0).toBeGreaterThan(0);
    expect(metrics.progress.some(value=>value.phase==='reading')).toBe(true);
    if(format==='zip'){expect(metrics.clicks).toBe(1);expect(metrics.phaseFrames.compressing).toBeGreaterThan(2);}
    summaries.push({format,...metrics});
  }
  // Cancel the new worker while it is compressing, then release the native stage.
  const downloads: string[]=[];page.on('download',file=>downloads.push(file.suggestedFilename()));
  await button.click();await expect.poll(()=>page.evaluate(()=>(window as any).exportMetrics.phase)).toBe('compressing');
  await page.evaluate(()=>{const w=window as any;w.exportSource=null;w.exportControl.refresh();});
  await expect(button).toHaveAttribute('aria-busy','false');expect(downloads).toEqual([]);
  await page.evaluate(async()=>{const w=window as any;cancelAnimationFrame(w.exportFrame);w.exportControl.dispose();await w.exportHandle.dispose();});
  await info.attach('responsiveness',{body:JSON.stringify(summaries,null,2),contentType:'application/json'});
  expect(errors).toEqual([]);
});
