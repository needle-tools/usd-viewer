import {test,expect,type Page} from '@playwright/test';
import {stageReady} from './workbench-menus';

const fixture=`#usda 1.0
(startTimeCode=0;endTimeCode=2;upAxis="Y")
def Xform "World" {
 quatf xformOp:orient.timeSamples={0:(1,0,0,0),2:(0,0,1,0)}
 double3 xformOp:translate.timeSamples={0:(0,0,0),2:(2,0,0)}
 float size.timeSamples={0:1,2:3}
 def Mesh "Quad" {
  point3f[] points=[(-1,0,0),(1,0,0),(1,2,0),(-1,2,0)]
  int[] faceVertexCounts=[4]
  int[] faceVertexIndices=[0,1,2,3]
  custom int[] dense=[${Array.from({length:2048},(_,i)=>i).join(',')}]
 }
}`;
async function open(page:Page){
 await page.route('**/sampled-data.usda',route=>route.fulfill({contentType:'text/plain',body:fixture}));
 await page.goto('/?viewer=three&workspace=studio&render=beauty&file='+encodeURIComponent('/sampled-data.usda'));await stageReady(page);
}

test('sampled transforms and scalar values share typed tables and reversible USD edits',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
 await page.evaluate(()=>{(window as any).usdWorkbench.openPanel('code');(window as any).usdHydra.setPlaying(false);});
 const code=page.locator('.usd-code'),table=code.locator('.usd-array-editor');
 await code.getByRole('button',{name:'Open xformOp:orient array',exact:true}).click();
 await expect(table.getByRole('columnheader',{name:'W',exact:true})).toBeVisible();
 await code.getByRole('combobox',{name:'Sample time'}).selectOption('2');
 await expect(table.getByRole('textbox',{name:'Row 0 Y',exact:true})).toHaveValue('1');
 await table.getByRole('textbox',{name:'Row 0 W',exact:true}).fill('0.5');await table.getByRole('button',{name:'Apply',exact:true}).click();
 const orientation=()=>page.evaluate(async()=>{const p=(window as any).usdStage.GetPrimAtPath('/World'),a=p.GetAttribute('xformOp:orient');try{return await a.Get(2);}finally{a.delete();p.delete();}});
 await expect.poll(orientation).toEqual([0.5,0,1,0]);await code.getByRole('button',{name:'Undo array edit',exact:true}).click();await expect.poll(orientation).toEqual([0,0,1,0]);
 await code.getByRole('button',{name:'Open xformOp:translate array',exact:true}).click();
 await code.getByRole('combobox',{name:'Sample time'}).selectOption('2');
 await table.getByRole('textbox',{name:'Row 0 X',exact:true}).fill('4');await table.getByRole('button',{name:'Apply',exact:true}).click();
 const value=()=>page.evaluate(async()=>{const p=(window as any).usdStage.GetPrimAtPath('/World'),a=p.GetAttribute('xformOp:translate');try{return await a.Get(2);}finally{a.delete();p.delete();}});
 await expect.poll(value).toEqual([4,0,0]);
 await code.getByRole('button',{name:'Undo array edit',exact:true}).click();await expect.poll(value).toEqual([2,0,0]);
 await code.getByRole('button',{name:'Redo array edit',exact:true}).click();await expect.poll(value).toEqual([4,0,0]);
 await code.getByRole('button',{name:'Open size array',exact:true}).click();
 await code.getByRole('combobox',{name:'Sample time'}).selectOption('2');
 await table.getByRole('textbox',{name:'Row 0 Value',exact:true}).fill('5');await table.getByRole('button',{name:'Apply',exact:true}).click();
 const scalar=()=>page.evaluate(async()=>{const p=(window as any).usdStage.GetPrimAtPath('/World'),a=p.GetAttribute('size');try{return await a.Get(2);}finally{a.delete();p.delete();}});
 await expect.poll(scalar).toBe(5);await code.getByRole('button',{name:'Undo array edit',exact:true}).click();await expect.poll(scalar).toBe(3);
 expect(errors).toEqual([]);
});

test('Properties opens the shared typed sheet and reads large arrays in bounded pages',async({page},info)=>{
 await open(page);await page.evaluate(()=>{(window as any).usdStagePanel.selectPrim('/World/Quad');});
 const inspector=page.locator('.usd-property-inspector');
 await inspector.getByRole('button',{name:'Open faceVertexCounts array',exact:true}).click();
 const table=inspector.locator('.usd-array-editor');await expect(table.getByRole('cell',{name:'4',exact:true})).toBeVisible();
 await table.getByRole('button',{name:'Close data'}).click();
 await inspector.getByRole('button',{name:'Open points array',exact:true}).click();
 await expect(table.getByRole('columnheader',{name:'X',exact:true})).toBeVisible();await table.getByRole('button',{name:'Close data'}).click();
 await inspector.getByRole('button',{name:'Open dense array',exact:true}).click();
 await expect(table.locator('tbody tr')).toHaveCount(32);await expect(table.locator('.usd-array-position')).toHaveText('0–31 / 2,048');
 await table.getByRole('button',{name:'Next rows',exact:true}).click();await expect(table.locator('.usd-array-position')).toHaveText('32–63 / 2,048');
 await expect(table.locator('tbody tr').first().getByRole('cell')).toHaveText('32');
 await table.getByRole('spinbutton',{name:'Go to row'}).fill('2000');await table.getByRole('spinbutton',{name:'Go to row'}).press('Tab');
 await expect(table.locator('tbody tr').first().getByRole('cell')).toHaveText('1984');
 await inspector.screenshot({path:info.outputPath('properties-data-table.png')});
});

test('large sampled dictionaries stay compact and lazily decode complete sample data',async({page})=>{
 await page.goto('/?viewer=three&workspace=studio');await page.waitForFunction(()=>(window as any).__usdViewerUiReady);
 const result=await page.evaluate(async()=>{
  const {createSourceReader}=await import('/viewer-code-reader.js');const reader=createSourceReader();
  const source=`#usda 1.0\ndef Xform "World" {double3 xformOp:translate.timeSamples={${Array.from({length:30000},(_,i)=>`${i/2}:(${i},0,1)`).join(',')}}}\ndef Xform "After" {}`;
  try{const analysis=await reader.request('analyze',{source,language:'usda'}),at=analysis.arrays.findIndex((a:any)=>a.sampled),samples=await reader.request('samples',{index:at});
   const boolSource=`#usda 1.0\ndef Xform "World" {bool enabled.timeSamples={${Array.from({length:1000},(_,i)=>`${i}:${i%2}`).join(',')}}}`;
   await reader.request('analyze',{source:boolSource,language:'usda'});const flags=await reader.request('samples',{index:0});
   return{raw:analysis.rawOnly,text:analysis.text,count:analysis.arrays[at].sampleCount,first:samples[0],last:samples.at(-1),flags:[flags[0].value,flags[1].value,flags.at(-1).value]};
  }finally{reader.dispose();}
 });
 expect(result.raw).toBe(false);expect(result.text.length).toBeLessThan(1000);expect(result.text).toContain('After');expect(result.count).toBe(30000);
 expect(result.first).toEqual({time:0,value:[0,0,1]});expect(result.last).toEqual({time:14999.5,value:[29999,0,1]});
 expect(result.flags).toEqual([false,true,true]);
});
