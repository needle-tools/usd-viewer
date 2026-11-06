import {test,expect} from './test';
import {stageReady} from './workbench-menus';

test('large source compacts numeric data in a worker, preserves declarations, pages raw text and releases workers',async({page})=>{
 const errors:string[]=[],workers:any[]=[],closed:Promise<void>[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('worker',w=>{if(w.url().includes('viewer-code-data.worker')){workers.push(w);closed.push(w.waitForEvent('close'));}});
 await page.goto('/?workspace=studio&viewer=three&file=/test-fixtures/coverage/core/analytic-primitives.usda');await stageReady(page);
 const result=await page.evaluate(async()=>{
  const {mountCodePane}=await import('/viewer-code.js');
  const source=`#usda 1.0\ndef Mesh "Dense" {\npoint3f[] points = [${Array(150000).fill('(1, 2, 3)').join(', ')}]\nint[] faceVertexIndices = [${Array(600000).fill('0').join(', ')}]\n}\ndef Xform "After" {}\n`;
  const host=document.createElement('div');host.style.cssText='position:fixed;inset:50px;z-index:10000;background:var(--background-color)';document.body.append(host);
  const pane=mountCodePane(host,{stateKey:'large-test',isVisible:()=>true});(window as any).__largePane=pane;(window as any).__largeHost=host;(window as any).__largeOriginal=source;
  let ticks=0;const timer=setInterval(()=>ticks++,5);(window as any).__largeTimer=timer;(window as any).__largeTicks=()=>ticks;
  // The layer grammar also applies to ordinary file readers.
  pane.show({stage:(window as any).usdStage,handle:(window as any).usdHydra,getFiles:()=>[{path:'dense.usda',read:async()=>new Blob([source])}]});pane.select('file:dense.usda');
  return source.length;
 });
 const host=page.locator('.usd-code').last();await expect(host.locator('.usd-code-array-button').first()).toBeVisible();
 expect(result).toBeGreaterThan(1_000_000);expect(await host.locator('code').textContent()).toContain('After');
 expect((await host.locator('code').textContent())!.length).toBeLessThan(10000);
 await expect(host.getByRole('button',{name:'Open points array',exact:true})).toHaveAttribute('data-summary',/150,000/);
 // Worker-side value parsing is deferred until the user opens the table.
 await host.getByRole('button',{name:'Open points array',exact:true}).click();
 await expect(host.getByRole('region',{name:'points data'})).toBeVisible();
 expect(await host.locator('.usd-array-meta').textContent()).toContain('150,000');
 await host.getByRole('button',{name:'Close data',exact:true}).click();
 await host.getByRole('button',{name:'Expand arrays',exact:true}).click();
 await expect(host.getByRole('button',{name:'Next source page'})).toBeVisible();
 const first=await host.locator('code').textContent();expect(first!.length).toBeLessThanOrEqual(48000);
 await host.getByRole('button',{name:'Next source page'}).click();
 await expect.poll(()=>host.locator('code').textContent()).not.toBe(first);
 await host.getByRole('button',{name:'Compact arrays',exact:true}).click();
 await expect(host.locator('code')).toContainText('After');
 const data=await page.evaluate(()=>({same:(window as any).__largePane.byteLength===new TextEncoder().encode((window as any).__largeOriginal).length,ticks:(window as any).__largeTicks()}));
 expect(data.same).toBe(true);expect(data.ticks).toBeGreaterThan(5);expect(workers.length).toBeGreaterThan(0);
 await page.evaluate(()=>{(window as any).__largePane.dispose();(window as any).__largeHost.remove();clearInterval((window as any).__largeTimer);});await Promise.all(closed);
 expect(errors).toEqual([]);
});

test('byte-backed source preserves Unicode, quoted literals, complete copy data and bounded raw pages',async({page})=>{
 await page.goto('/?workspace=studio&viewer=three');await page.waitForFunction(()=>(window as any).__usdViewerUiReady);
 const result=await page.evaluate(async()=>{
  const {createSourceReader}=await import('/viewer-code-reader.js');const reader=createSourceReader();
  const rows=20000,original=`#usda 1.0\ndef Scope "世界" {\n string note = "literal [1, 2, 3]"\n point3f[] points = [${Array(rows).fill('(1, 2, 3)').join(', ')}]\n bool[] enabled = [${Array(rows).fill('1, 0').join(', ')}]\n int64[] exact = [9007199254740993]\n}\ndef Xform "After" {}\n`;
  const bytes=new TextEncoder().encode(original),size=bytes.length;
  try{
   const analysis=await reader.request('analyze',{bytes,language:'usda'},[bytes.buffer]);
   const array=analysis.arrays.find((a:any)=>a.name==='points'),bool=analysis.arrays.findIndex((a:any)=>a.name==='enabled');
   const values=await reader.request('array',{index:bool}),page=await reader.request('page',{start:48_000}),blob=await reader.request('blob');
   return {detached:bytes.byteLength===0,size,copy:await blob.text()===original,summary:array.count,path:array.property.primPath,quoted:analysis.text.includes('literal [1, 2, 3]'),after:[...analysis.locations.definitions.values()].includes('/After'),bool:[values[0],values[1],values.length],pageBytes:new TextEncoder().encode(page.text).length};
  }finally{reader.dispose();}
 });
 expect(result).toMatchObject({detached:true,copy:true,summary:20000,path:'/世界',quoted:true,after:true,bool:[true,false,40000]});expect(result.pageBytes).toBeLessThanOrEqual(48003);
});

test('byte-backed authored arrays apply, undo and redo through USD with conflict checks',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?workspace=studio&viewer=three&file=/test-fixtures/coverage/core/analytic-primitives.usda');await stageReady(page);
 await page.evaluate(async()=>{
  await (window as any).usdStagePanel.edit((stage:any)=>{
   const prim=stage.DefinePrim('/ArrayData','Scope'),attr=prim.CreateAttribute('weights','float[]',true);
   try{attr.Set(Array.from({length:150000},(_,i)=>i/16),NaN);}finally{attr.delete();prim.delete();}
  });
  (window as any).usdWorkbench.openPanel('code');
 });
 const code=page.locator('.usd-code');await expect(code.getByRole('button',{name:'Open weights array',exact:true})).toBeVisible();
 await code.getByRole('button',{name:'Open weights array',exact:true}).click();
 const cell=code.locator('.usd-array-table input').first();await expect(cell).toHaveValue('0');await cell.fill('42');await cell.blur();
 await code.getByRole('button',{name:'Apply',exact:true}).click();
 const authored=()=>page.evaluate(async()=>{const p=(window as any).usdStage.GetPrimAtPath('/ArrayData'),a=p.GetAttribute('weights');try{return (await a.Get(NaN))[0];}finally{a.delete();p.delete();}});
 await expect.poll(authored).toBe(42);await expect(code.getByRole('button',{name:'Undo array edit'})).toBeEnabled();
 await code.getByRole('button',{name:'Undo array edit'}).click();await expect.poll(authored).toBe(0);
 await code.getByRole('button',{name:'Redo array edit'}).click();await expect.poll(authored).toBe(42);expect(errors).toEqual([]);
});
